import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateSystemUserDto } from './dto/create-user.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateModuleDto } from './dto/create-module.dto';

import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class SuperAdminService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly stripeService: StripeService
    ) { }

    async getAllCompanies() {
        const supabase = this.supabaseService.getClient();
        // Pobieramy wszystkie firmy
        const { data, error } = await supabase
            .from('companies')
            .select('*, subscriptions(*)') // Include subscription
            .order('created_at', { ascending: false });

        if (error) {
            throw new InternalServerErrorException(`Błąd pobierania firm: ${error.message}`);
        }
        return data;
    }

    async getStats() {
        const supabase = this.supabaseService.getClient();

        // 1. Total Companies
        const { count: companiesCount, error: countError } = await supabase
            .from('companies')
            .select('*', { count: 'exact', head: true });

        // 2. New Companies (this month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: newCompaniesCount } = await supabase
            .from('companies')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfMonth.toISOString());

        // 3. Active Subscriptions & MRR
        const { data: activeSubs, error: subsError } = await supabase
            .from('subscriptions')
            .select('plan_id, plans(price_monthly)')
            .in('status', ['active', 'trialing']);

        if (countError || subsError) {
            throw new InternalServerErrorException('Failed to fetch stats');
        }

        const totalMrr = activeSubs?.reduce((acc, sub: any) => {
            return acc + (sub.plans?.price_monthly || 0);
        }, 0) || 0;

        return {
            totalCompanies: companiesCount || 0,
            newCompanies: newCompaniesCount || 0,
            activeSubscriptions: activeSubs?.length || 0,
            mrr: totalMrr
        };
    }

    async getCompany(id: string) {
        const supabase = this.supabaseService.getClient();

        // 1. Company info + Subscription
        const { data: company, error } = await supabase
            .from('companies')
            .select('*, subscriptions(*)')
            .eq('id', id)
            .single();

        if (error || !company) {
            throw new InternalServerErrorException(`Nie znaleziono firmy: ${error?.message}`);
        }

        // 2. Active Modules
        const { data: modules } = await supabase
            .from('company_modules')
            .select('module_code')
            .eq('company_id', id);

        return {
            ...company,
            modules: modules?.map(m => m.module_code) || []
        };
    }

    async getAllUsers() {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            throw new InternalServerErrorException(`Błąd pobierania użytkowników: ${error.message}`);
        }
        return data;
    }

    async createCompany(createCompanyDto: CreateCompanyDto) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('companies')
            .insert({ name: createCompanyDto.name })
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(`Błąd tworzenia firmy: ${error.message}`);
        }
        return data;
    }

    async createUser(dto: CreateSystemUserDto) {
        const supabase = this.supabaseService.getClient();
        const adminClient = this.supabaseService.getAdminClient();

        const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
            email: dto.email,
            password: dto.password,
            email_confirm: true,
            user_metadata: {
                first_name: dto.firstName,
                last_name: dto.lastName,
            },
        });

        if (authError) {
            throw new BadRequestException(`Błąd Auth: ${authError.message}`);
        }

        if (!authUser.user) {
            throw new InternalServerErrorException('Nie udało się utworzyć użytkownika Auth');
        }

        const { error: dbError } = await supabase
            .from('users')
            .insert({
                id: authUser.user.id,
                email: dto.email,
                first_name: dto.firstName,
                last_name: dto.lastName,
                role: dto.role,
                company_id: dto.companyId || null,
            });

        if (dbError) {
            console.error('Błąd DB:', dbError);
            throw new InternalServerErrorException(`Użytkownik Auth utworzony, ale błąd profilu: ${dbError.message}`);
        }

        return { message: 'Użytkownik utworzony pomyślnie', userId: authUser.user.id };
    }

    // --- PLANS ---

    async getPlans() {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .order('price_monthly', { ascending: true });

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async createPlan(dto: CreatePlanDto) {
        const supabase = this.supabaseService.getClient();

        // 1. Create or Get Stripe Product
        let stripeProductId: string | null = null;
        let stripePriceIdMonthly: string | null = null;
        let stripePriceIdYearly: string | null = null;

        try {
            const product = await this.stripeService.createProduct(dto.name);
            stripeProductId = product.id;

            // 2. Create Prices
            if (dto.price_monthly > 0) {
                const priceMonthly = await this.stripeService.createPrice(stripeProductId, dto.price_monthly, 'month');
                stripePriceIdMonthly = priceMonthly.id;
            }

            if (dto.price_yearly > 0) {
                const priceYearly = await this.stripeService.createPrice(stripeProductId, dto.price_yearly, 'year');
                stripePriceIdYearly = priceYearly.id;
            }

        } catch (err) {
            console.error('Stripe Sync Error during Plan Create:', err);
            // Optionally throw or proceed (if we want to allow manual sync later, but for now better to fail if automation is key)
            throw new InternalServerErrorException('Failed to sync plan with Stripe');
        }

        const { data, error } = await supabase
            .from('plans')
            .insert({
                code: dto.code,
                name: dto.name,
                price_monthly: dto.price_monthly,
                price_yearly: dto.price_yearly,
                limits: dto.limits || {},
                is_active: dto.is_active ?? true,
                stripe_product_id: stripeProductId,
                stripe_price_id_monthly: stripePriceIdMonthly,
                stripe_price_id_yearly: stripePriceIdYearly
            })
            .select()
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updatePlan(id: string, dto: Partial<CreatePlanDto>) {
        const supabase = this.supabaseService.getClient();

        // Fetch existing plan
        const { data: existingPlan } = await supabase.from('plans').select('*').eq('id', id).maybeSingle();
        if (!existingPlan) throw new BadRequestException('Plan not found');

        const updates: any = { ...dto };

        // --- STRIPE SYNC ---
        // Ensure Stripe Product exists
        let stripeProductId = existingPlan.stripe_product_id;

        if (!stripeProductId) {
            // If plan doesn't have a Stripe Product (e.g. legacy 'basic'), create one now
            try {
                const product = await this.stripeService.createProduct(updates.name || existingPlan.name);
                stripeProductId = product.id;
                updates.stripe_product_id = stripeProductId;
                console.log(`Created missing Stripe Product for plan ${id}: ${stripeProductId}`);
            } catch (e) {
                console.error('Failed to create missing Stripe Product', e);
            }
        } else if (dto.name && dto.name !== existingPlan.name) {
            // Update name if changed
            await this.stripeService.updateProduct(stripeProductId, dto.name);
        }

        // Ensure Prices (Create new price if amount changed OR if price ID is missing)
        if (stripeProductId) {
            // Monthly
            if (
                (dto.price_monthly !== undefined && dto.price_monthly !== existingPlan.price_monthly) ||
                (!existingPlan.stripe_price_id_monthly && ((dto.price_monthly ?? 0) > 0 || existingPlan.price_monthly > 0))
            ) {
                const amount = dto.price_monthly ?? existingPlan.price_monthly;
                if (amount > 0) {
                    const price = await this.stripeService.createPrice(stripeProductId, amount, 'month');
                    updates.stripe_price_id_monthly = price.id;
                }
            }

            // Yearly
            if (
                (dto.price_yearly !== undefined && dto.price_yearly !== existingPlan.price_yearly) ||
                (!existingPlan.stripe_price_id_yearly && ((dto.price_yearly ?? 0) > 0 || existingPlan.price_yearly > 0))
            ) {
                const amount = dto.price_yearly ?? existingPlan.price_yearly;
                if (amount > 0) {
                    const price = await this.stripeService.createPrice(stripeProductId, amount, 'year');
                    updates.stripe_price_id_yearly = price.id;
                }
            }
        }
        // -------------------

        const { data, error } = await supabase
            .from('plans')
            .update(updates)
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async deletePlan(id: string) { // Soft delete + Archive in Stripe
        const supabase = this.supabaseService.getClient();

        const { data: plan } = await supabase.from('plans').select('stripe_product_id').eq('id', id).single();

        if (plan?.stripe_product_id) {
            await this.stripeService.archiveProduct(plan.stripe_product_id);
        }

        // Soft delete
        const { error } = await supabase
            .from('plans')
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw new InternalServerErrorException(error.message);
        return { message: 'Plan deactivated and archived in Stripe' };
    }

    // --- MODULES ---

    async getModules() {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('modules')
            .select('*');

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async createModule(dto: CreateModuleDto) { // using any or import generic DTO, ideally CreateModuleDto
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('modules').insert(dto).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updateModule(code: string, dto: Partial<CreateModuleDto>) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('modules').update(dto).eq('code', code).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async deleteModule(code: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.from('modules').delete().eq('code', code);
        if (error) throw new InternalServerErrorException(error.message);
        return { message: 'Module deleted' };
    }

    // --- SUBSCRIPTION MANAGEMENT ---

    async assignPlanToCompany(companyId: string, planId: string) {
        const supabase = this.supabaseService.getAdminClient();

        // 1. Update subscription (create or update)
        const { data: sub } = await supabase.from('subscriptions').select('id').eq('company_id', companyId).maybeSingle();

        let error;
        if (sub) {
            const { error: updError } = await supabase
                .from('subscriptions')
                .update({
                    plan_id: planId,
                    status: 'active', // Admin override -> active
                    updated_at: new Date().toISOString()
                })
                .eq('id', sub.id);
            error = updError;
        } else {
            const { error: insError } = await supabase
                .from('subscriptions')
                .insert({
                    company_id: companyId,
                    plan_id: planId,
                    status: 'active',
                    current_period_start: new Date().toISOString()
                });
            error = insError;
        }

        if (error) throw new InternalServerErrorException(`Nie udała się zmiana planu: ${error.message}`);

        await this.syncPlanModulesToCompany(companyId, planId);

        return { message: 'Plan assigned successfully' };
    }

    async toggleModuleForCompany(companyId: string, moduleCode: string, isEnabled: boolean) {
        const supabase = this.supabaseService.getAdminClient();

        if (isEnabled) {
            const { error } = await supabase
                .from('company_modules')
                .upsert({ company_id: companyId, module_code: moduleCode }, { onConflict: 'company_id, module_code' });
            if (error) throw new InternalServerErrorException(error.message);
        } else {
            const { error } = await supabase
                .from('company_modules')
                .delete()
                .eq('company_id', companyId)
                .eq('module_code', moduleCode);
            if (error) throw new InternalServerErrorException(error.message);
        }

        return { message: `Module ${moduleCode} ${isEnabled ? 'enabled' : 'disabled'} for company` };
    }

    private async syncPlanModulesToCompany(companyId: string, planId: string) {
        const supabase = this.supabaseService.getAdminClient();

        await supabase.from('company_modules').delete().eq('company_id', companyId);

        const { data: planModules } = await supabase
            .from('plan_modules')
            .select('module_code')
            .eq('plan_id', planId);

        if (!planModules || planModules.length === 0) return;

        const modulesToInsert = planModules.map(pm => ({
            company_id: companyId,
            module_code: pm.module_code
        }));

        await supabase.from('company_modules').insert(modulesToInsert);
    }
}