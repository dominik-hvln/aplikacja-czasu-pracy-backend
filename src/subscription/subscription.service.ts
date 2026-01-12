import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Checks if a company has an active subscription or is within trial period.
     */
    async isCompanyActive(companyId: string): Promise<boolean> {
        if (!companyId) return false;

        const supabase = this.supabaseService.getClient();

        // 1. Get subscription status
        const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select('status, trial_end, current_period_end')
            .eq('company_id', companyId)
            .single();

        if (error || !subscription) {
            // No subscription found -> Assuming not active
            return false;
        }

        // 2. Check status
        // valid statuses: active, trialing
        if (['active', 'trialing'].includes(subscription.status)) {
            return true;
        }

        // 3. Check past_due grace period (optional, strict for now)
        return false;
    }

    /**
     * Checks if a specific module is enabled for a company.
     * Logic: Check `company_modules` table.
     */
    async isModuleEnabled(companyId: string, moduleCode: string): Promise<boolean> {
        if (!companyId) return false;

        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('company_modules')
            .select('module_code')
            .eq('company_id', companyId)
            .eq('module_code', moduleCode)
            .single();

        if (error || !data) {
            return false;
        }

        return true;
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

        // Get modules for the plan
        const { data: planModules } = await supabase
            .from('plan_modules')
            .select('module_code')
            .eq('plan_id', planId);

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
