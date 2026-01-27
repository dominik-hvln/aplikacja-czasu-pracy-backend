import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from '../subscription/subscription.service';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
    private stripe: Stripe;

    constructor(
        private readonly configService: ConfigService,
        private readonly subscriptionService: SubscriptionService
    ) {
        const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
        if (!apiKey) {
            throw new Error('STRIPE_SECRET_KEY not defined');
        }
        this.stripe = new Stripe(apiKey, {
            apiVersion: '2025-12-15.clover',
        });
    }

    public getClient(): Stripe {
        return this.stripe;
    }

    // ... (rest of methods)

    private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, supabase: any) {
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;
        const metadata = session.metadata || {};

        const companyId = metadata.companyId;

        if (!companyId) {
            console.error('No companyId in session metadata');
            return;
        }

        // 1. Update Company with Stripe Customer ID
        await supabase
            .from('companies')
            .update({ stripe_customer_id: customerId })
            .eq('id', companyId);

        // 2. Create/Update Subscription
        const stripeSub = await this.stripe.subscriptions.retrieve(subscriptionId);
        const planId = metadata.planId;

        await supabase
            .from('subscriptions')
            .upsert({
                company_id: companyId,
                stripe_subscription_id: subscriptionId,
                status: stripeSub.status,
                current_period_start: new Date((stripeSub as any).current_period_start * 1000).toISOString(),
                current_period_end: new Date((stripeSub as any).current_period_end * 1000).toISOString(),
                plan_id: planId
            }, { onConflict: 'company_id' });

        // 3. Sync Modules from Plan to Company
        if (planId) {
            await this.subscriptionService.syncPlanModulesToCompany(companyId, planId);
            console.log(`Modules synced for company ${companyId} from plan ${planId}`);
        }

        console.log(`Subscription activated for company ${companyId}`);
    }

    async createProduct(name: string) {
        try {
            return await this.stripe.products.create({ name });
        } catch (error) {
            console.error('Stripe createProduct error:', error);
            throw new InternalServerErrorException('Failed to create Stripe product');
        }
    }

    async updateProduct(productId: string, name: string) {
        try {
            return await this.stripe.products.update(productId, { name });
        } catch (error) {
            console.error('Stripe updateProduct error:', error);
            throw new InternalServerErrorException('Failed to update Stripe product');
        }
    }

    async archiveProduct(productId: string) {
        try {
            return await this.stripe.products.update(productId, { active: false });
        } catch (error) {
            console.error('Stripe archiveProduct error:', error);
            throw new InternalServerErrorException('Failed to archive Stripe product');
        }
    }

    async createPrice(productId: string, amount: number, interval: 'month' | 'year', currency = 'pln') {
        try {
            return await this.stripe.prices.create({
                product: productId,
                unit_amount: Math.round(amount * 100), // Stripe expects cents
                currency,
                recurring: { interval },
            });
        } catch (error) {
            console.error('Stripe createPrice error:', error);
            throw new InternalServerErrorException('Failed to create Stripe price');
        }
    }

    async createCustomer(email: string, name: string) {
        try {
            const customer = await this.stripe.customers.create({
                email,
                name,
            });
            return customer;
        } catch (error) {
            console.error('Stripe createCustomer error:', error);
            throw new InternalServerErrorException('Failed to create Stripe customer');
        }
    }

    async createCheckoutSession(customerId: string, priceId: string, successUrl: string, cancelUrl: string, metadata: any = {}) {
        try {
            const session = await this.stripe.checkout.sessions.create({
                customer: customerId,
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: metadata
            });
            return { url: session.url };
        } catch (error) {
            console.error('Stripe createCheckoutSession error:', error);
            throw new InternalServerErrorException('Failed to create checkout session');
        }
    }

    async createBillingPortalSession(customerId: string, returnUrl: string) {
        try {
            const session = await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            });
            return { url: session.url };
        } catch (error) {
            console.error('Stripe createBillingPortalSession error:', error);
            throw new InternalServerErrorException('Failed to create billing portal session');
        }
    }

    async constructEventFromPayload(signature: string, payload: Buffer) {
        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
        if (!webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET not defined');
        }
        return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }

    async handleWebhookEvent(event: Stripe.Event, supabase: any) {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await this.handleCheckoutSessionCompleted(session, supabase);
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await this.handleInvoicePaymentSucceeded(invoice, supabase);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await this.handleSubscriptionDeleted(subscription, supabase);
                break;
            }
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    }


    private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice, supabase: any) {
        // subscription can be string or object. Cast to any to be safe or check type.
        const subscriptionId = (invoice as any).subscription as string;
        const stripeSub = await this.stripe.subscriptions.retrieve(subscriptionId);

        await supabase
            .from('subscriptions')
            .update({
                status: stripeSub.status,
                current_period_start: new Date((stripeSub as any).current_period_start * 1000).toISOString(),
                current_period_end: new Date((stripeSub as any).current_period_end * 1000).toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);

        console.log(`Subscription renewed for subscription ${subscriptionId}`);
    }

    private async handleSubscriptionDeleted(subscription: Stripe.Subscription, supabase: any) {
        await supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', subscription.id);

        console.log(`Subscription canceled: ${subscription.id}`);
    }
}
