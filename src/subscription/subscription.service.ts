import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { isAfter } from 'date-fns';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    get supabase() {
        // Use Admin Client to bypass RLS, as this service is called by authenticated controllers
        // or background processes that need full access.
        return this.supabaseService.getAdminClient();
    }

    /**
     * Checks if a company has an active subscription or is within trial period.
     */
    async isCompanyActive(companyId: string): Promise<boolean> {
        if (!companyId) return false;

        const { data: sub } = await this.supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('company_id', companyId)
            .maybeSingle();

        if (!sub) return false; // No subscription = inactive

        // Check status
        if (sub.status === 'active' || sub.status === 'trialing') {
            return true;
        }

        // Check expiration
        if (sub.status === 'canceled' && sub.current_period_end) {
            return isAfter(new Date(sub.current_period_end), new Date());
        }

        return false;
    }

    async getStatus(companyId: string) {
        const { data, error } = await this.supabase.from('subscriptions')
            .select('*, plans(*)')
            .eq('company_id', companyId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw new Error(error.message);
        }

        if (!data) {
            return { status: 'none', plan: null };
        }

        return data;
    }

    /**
     * Checks if a specific module is enabled for a company.
     * Logic: Check `company_modules` table.
     */
    async isModuleEnabled(companyId: string, moduleCode: string): Promise<boolean> {
        if (!companyId) return false;

        const { data, error } = await this.supabase
            .from('company_modules')
            .select('module_code')
            .eq('company_id', companyId)
            .eq('module_code', moduleCode)
            .maybeSingle();

        if (error || !data) {
            return false;
        }

        return true;
    }

    async checkLimits(companyId: string, limitKey: string, currentUsage: number): Promise<boolean> {
        const { status, plans: plan } = await this.getStatus(companyId);

        if (status !== 'active' && status !== 'trialing') return false;
        if (!plan) return false;

        const limits = plan.limits || {};
        const limit = limits[limitKey];

        if (limit === undefined) return true; // No limit defined = unlimited
        if (limit === -1) return true; // Explicit unlimited

        return currentUsage < limit;
    }

    async getBasicPlanId() {
        // Safe check for basic plan
        const { data: plan } = await this.supabase
            .from('plans')
            .select('id')
            .eq('code', 'basic')
            .maybeSingle();

        return plan?.id || null;
    }

    /**
     * Creates a default trial subscription for a new company.
     * To be called when a company is created.
     */
    async createTrialSubscription(companyId: string) {
        const supabase = this.supabaseService.getAdminClient(); // Admin rights needed
        const trialDays = 14;
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);

        // 1. Assign 'basic' plan by default (or fetching from DB if needed)
        // For MVP we assume 'basic' exists or we just create a trialing sub without a plan initially?
        // Better to assign a default plan code 'basic'.

        // Fetch 'basic' plan id
        const { data: plan } = await supabase.from('plans').select('id').eq('code', 'basic').single();

        if (!plan) {
            this.logger.error('Default plan "basic" not found. Cannot create trial.');
            return;
        }

        // 2. Create subscription
        const { error } = await supabase.from('subscriptions').insert({
            company_id: companyId,
            plan_id: plan.id,
            status: 'trialing',
            trial_end: trialEnd.toISOString(),
            current_period_start: new Date().toISOString(),
            current_period_end: trialEnd.toISOString(),
        });

        if (error) {
            this.logger.error(`Failed to create trial subscription for company ${companyId}: ${error.message}`);
            throw error;
        }

        // 3. Link default modules from plan to company_modules
        // Call helper to sync modules
        await this.syncPlanModulesToCompany(companyId, plan.id);
    }

    async syncPlanModulesToCompany(companyId: string, planId: string) {
        const supabase = this.supabaseService.getAdminClient();

        this.logger.log(`Syncing modules for company ${companyId} and plan ${planId}`);

        // Get modules for the plan
        const { data: planModules, error: pmError } = await supabase
            .from('plan_modules')
            .select('module_code')
            .eq('plan_id', planId);

        if (pmError) {
            this.logger.error(`Error fetching plan_modules: ${pmError.message}`);
            return;
        }

        this.logger.log(`Found ${planModules?.length} modules for plan ${planId}: ${planModules?.map(m => m.module_code).join(', ')}`);

        if (!planModules || planModules.length === 0) return;

        // Prepare insert data
        const modulesToInsert = planModules.map(pm => ({
            company_id: companyId,
            module_code: pm.module_code
        }));

        // Upsert company_modules
        const { error } = await supabase
            .from('company_modules')
            .upsert(modulesToInsert, { onConflict: 'company_id, module_code' });

        if (error) {
            this.logger.error(`Failed to sync modules for company ${companyId}: ${error.message}`);
        }
    }
}
