import { Controller, Post, Get, Headers, Req, BadRequestException, Body, UseGuards } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import type { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';

@Controller('stripe')
export class StripeController {
    constructor(
        private readonly stripeService: StripeService,
        private readonly supabaseService: SupabaseService,
        private readonly subscriptionService: SubscriptionService
    ) { }

    @Get('plans')
    async getPlans() {
        const supabase = this.supabaseService.getAdminClient();

        const { data: plans, error } = await supabase
            .from('plans')
            .select('*')
            .eq('is_active', true)
            .order('price_monthly', { ascending: true });

        if (error) throw new BadRequestException(error.message);
        if (!plans || plans.length === 0) return [];

        // Dołącz realne funkcje (moduły) każdego planu
        const planIds = plans.map((p) => p.id);
        const [{ data: planModules }, { data: modules }] = await Promise.all([
            supabase.from('plan_modules').select('plan_id, module_code').in('plan_id', planIds),
            supabase.from('modules').select('code, name, description').eq('is_active', true),
        ]);

        const moduleByCode = new Map((modules || []).map((m) => [m.code, m]));

        return plans.map((plan) => ({
            ...plan,
            modules: (planModules || [])
                .filter((pm) => pm.plan_id === plan.id)
                .map((pm) => moduleByCode.get(pm.module_code))
                .filter(Boolean),
        }));
    }

    @Get('subscription')
    @UseGuards(AuthGuard('jwt'))
    async getSubscription(@Req() req: any) {
        const user = req.user;
        // Use SubscriptionService to get status
        return this.subscriptionService.getStatus(user.company_id);
    }

    @Post('webhook')
    async handleWebhook(@Headers('stripe-signature') signature: string, @Req() req: Request) {
        if (!signature) {
            throw new BadRequestException('Missing stripe-signature header');
        }

        try {
            const event = await this.stripeService.constructEventFromPayload(signature, (req as any).rawBody || req.body);

            const supabaseAdmin = this.supabaseService.getAdminClient();
            await this.stripeService.handleWebhookEvent(event, supabaseAdmin);

            return { received: true };
        } catch (err) {
            console.error(`Webhook Error: ${err.message}`);
            throw new BadRequestException(`Webhook Error: ${err.message}`);
        }
    }

    @Post('portal')
    @UseGuards(AuthGuard('jwt'))
    async createPortalSession(@Req() req: any, @Body() body: { returnUrl: string }) {
        const user = req.user;
        const supabase = this.supabaseService.getAdminClient();

        // Fetch company Stripe ID
        const { data: company } = await supabase.from('companies').select('stripe_customer_id').eq('id', user.company_id).single();

        if (!company?.stripe_customer_id) {
            throw new BadRequestException('Company does not have a Stripe Customer ID');
        }

        return this.stripeService.createBillingPortalSession(company.stripe_customer_id, body.returnUrl);
    }

    @Post('checkout')
    @UseGuards(AuthGuard('jwt'))
    async createCheckoutSession(@Body() body: { priceId: string, companyId: string, planId: string, successUrl: string, cancelUrl: string }) {
        if (!body.priceId || !body.companyId) {
            throw new BadRequestException('Missing priceId or companyId');
        }

        // Lookup customer ID or create one? 
        // For simplicity, we assume we might create a new customer on checkout if not exists, 
        // OR we should ideally look up the company and check if they have stripe_customer_id.
        // For this version (MVP Commercial), we will let Stripe handle guest customer if we don't pass one, 
        // BUT we need it for subscriptions.

        const supabase = this.supabaseService.getAdminClient();
        const { data: company } = await supabase
            .from('companies')
            .select('stripe_customer_id, name, legal_name, tax_id, billing_email, billing_street, billing_postal_code, billing_city')
            .eq('id', body.companyId)
            .single();

        let customerId = company?.stripe_customer_id;

        if (!customerId) {
            // Wymagamy uzupełnionych danych firmy przed płatnością kartą (faktura/Stripe customer)
            if (!company?.billing_email || !company?.tax_id) {
                throw new BadRequestException('Najpierw uzupełnij dane firmy (NIP i e-mail do faktur).');
            }

            const newCustomer = await this.stripeService.createCustomer(
                company.billing_email,
                company.legal_name || company.name || 'Firma',
                {
                    taxId: company.tax_id,
                    address: {
                        line1: company.billing_street,
                        postal_code: company.billing_postal_code,
                        city: company.billing_city,
                    },
                },
            );
            customerId = newCustomer.id;
            // Save to DB
            await supabase.from('companies').update({ stripe_customer_id: customerId }).eq('id', body.companyId);
        }

        return this.stripeService.createCheckoutSession(
            customerId,
            body.priceId,
            body.successUrl,
            body.cancelUrl,
            { companyId: body.companyId, planId: body.planId }
        );
    }

    @Post('verify-session')
    @UseGuards(AuthGuard('jwt'))
    async verifySession(@Body() body: { sessionId: string }) {
        if (!body.sessionId) throw new BadRequestException('Missing sessionId');

        const supabaseAdmin = this.supabaseService.getAdminClient();
        return this.stripeService.verifySession(body.sessionId, supabaseAdmin);
    }
}
