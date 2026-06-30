import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { MailService } from '../mail/mail.service';
import { UpdateBillingProfileDto } from './dto/update-billing-profile.dto';
import { CURRENT_TERMS_VERSION } from './terms.constant';

// Proste escapowanie HTML do treści e-maili
function esc(v: any): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Kolumny firmy istotne dla rozliczeń / onboardingu
const COMPANY_BILLING_COLUMNS =
    'id, name, legal_name, tax_id, billing_street, billing_postal_code, billing_city, ' +
    'billing_email, billing_type, billing_details_completed_at, stripe_customer_id, ' +
    'accepted_terms_version, terms_accepted_at, terms_accepted_by';

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly subscriptionService: SubscriptionService,
        private readonly mailService: MailService,
        private readonly config: ConfigService,
    ) {}

    /** Adres działu finansowego: z app_settings, a w razie braku z ENV. */
    private async getFinanceEmail(): Promise<string | null> {
        const { data } = await this.admin
            .from('app_settings')
            .select('value')
            .eq('key', 'finance_notification_email')
            .maybeSingle();
        const fromDb = data?.value?.trim();
        if (fromDb) return fromDb;
        return this.config.get<string>('FINANCE_NOTIFICATION_EMAIL')?.trim() || null;
    }

    private get admin() {
        return this.supabaseService.getAdminClient();
    }

    async getCompany(companyId: string) {
        const { data, error } = await this.admin
            .from('companies')
            .select(COMPANY_BILLING_COLUMNS)
            .eq('id', companyId)
            .maybeSingle();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    /** Zwraca profil rozliczeniowy firmy. */
    async getBillingProfile(companyId: string) {
        const company = await this.getCompany(companyId);
        if (!company) throw new BadRequestException('Nie znaleziono firmy');
        return company;
    }

    /** Czy dane firmy są kompletne (wszystkie wymagane pola). */
    static isCompanyDataComplete(company: any): boolean {
        if (!company) return false;
        return Boolean(
            company.legal_name &&
                company.tax_id &&
                company.billing_street &&
                company.billing_postal_code &&
                company.billing_city &&
                company.billing_email,
        );
    }

    /**
     * Wylicza stan onboardingu i akceptacji regulaminu dla danej roli.
     * Onboarding/regulamin dotyczą tylko admina i managera.
     */
    static computeFlags(company: any, role: string) {
        const isResponsible = role === 'admin' || role === 'manager';

        const companyDataComplete = BillingService.isCompanyDataComplete(company);
        const billingDecisionMade = Boolean(company?.billing_type);

        const needsOnboarding =
            isResponsible && !(companyDataComplete && billingDecisionMade);

        const needsTermsAcceptance =
            isResponsible && company?.accepted_terms_version !== CURRENT_TERMS_VERSION;

        return {
            needsOnboarding,
            needsTermsAcceptance,
            companyDataComplete,
            billingDecisionMade,
            currentTermsVersion: CURRENT_TERMS_VERSION,
        };
    }

    /** Zapisuje dane firmy do faktur. Oznacza komplet danych znacznikiem czasu. */
    async updateBillingProfile(companyId: string, dto: UpdateBillingProfileDto) {
        const { data, error } = await this.admin
            .from('companies')
            .update({
                legal_name: dto.legal_name.trim(),
                tax_id: dto.tax_id.trim(),
                billing_street: dto.billing_street.trim(),
                billing_postal_code: dto.billing_postal_code.trim(),
                billing_city: dto.billing_city.trim(),
                billing_email: dto.billing_email.trim(),
                billing_details_completed_at: new Date().toISOString(),
            })
            .eq('id', companyId)
            .select(COMPANY_BILLING_COLUMNS)
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    /**
     * Firma wybiera płatność przelewem. Dostęp przyznajemy od razu
     * (status pending_transfer), a dział finansowy kontaktuje się ws. wpłaty.
     * Super-admin aktywuje subskrypcję ręcznie po zaksięgowaniu wpłaty.
     */
    async selectTransfer(
        companyId: string,
        planId?: string,
        actor?: { email?: string; name?: string },
    ) {
        const company = await this.getCompany(companyId);
        if (!company) throw new BadRequestException('Nie znaleziono firmy');

        if (!BillingService.isCompanyDataComplete(company)) {
            throw new BadRequestException('Najpierw uzupełnij dane firmy.');
        }

        if (!planId) {
            throw new BadRequestException('Wybierz plan, dla którego chcesz rozliczać się przelewem.');
        }

        // Walidacja istnienia i aktywności planu
        const { data: plan } = await this.admin
            .from('plans')
            .select('id, name, is_active, price_monthly')
            .eq('id', planId)
            .maybeSingle();
        if (!plan || plan.is_active === false) {
            throw new BadRequestException('Wybrany plan nie istnieje lub jest nieaktywny.');
        }

        // 1. Oznacz wybór metody na firmie
        const { error: compErr } = await this.admin
            .from('companies')
            .update({ billing_type: 'transfer' })
            .eq('id', companyId);
        if (compErr) throw new InternalServerErrorException(compErr.message);

        // 2. Ustaw subskrypcję w stan pending_transfer (utwórz, jeśli brak)
        const { data: existing } = await this.admin
            .from('subscriptions')
            .select('id')
            .eq('company_id', companyId)
            .maybeSingle();

        if (existing) {
            const { error } = await this.admin
                .from('subscriptions')
                .update({
                    status: 'pending_transfer',
                    plan_id: planId,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
            if (error) throw new InternalServerErrorException(error.message);
        } else {
            const { error } = await this.admin.from('subscriptions').insert({
                company_id: companyId,
                status: 'pending_transfer',
                plan_id: planId,
                current_period_start: new Date().toISOString(),
            });
            if (error) throw new InternalServerErrorException(error.message);
        }

        // 3. Nadaj moduły wybranego planu (dostęp do funkcji od razu)
        await this.subscriptionService.syncPlanModulesToCompany(companyId, planId);

        // 4. Powiadom dział finansowy (best-effort — nie blokuje przepływu)
        await this.notifyFinanceTransfer(company, plan, actor);

        return {
            status: 'pending_transfer',
            message:
                'Dziękujemy! Wybrałeś płatność przelewem. W najbliższym czasie skontaktuje ' +
                'się z Wami nasz dział finansowy w celu ustalenia szczegółów płatności i wystawienia faktury.',
        };
    }

    private async notifyFinanceTransfer(
        company: any,
        plan: any,
        actor?: { email?: string; name?: string },
    ) {
        try {
            const to = await this.getFinanceEmail();
            if (!to) {
                this.logger.warn(
                    'Wybrano płatność przelewem, ale brak skonfigurowanego adresu działu finansowego (app_settings.finance_notification_email). Powiadomienie nie wysłane.',
                );
                return;
            }

            const address = [
                company.billing_street,
                [company.billing_postal_code, company.billing_city].filter(Boolean).join(' '),
            ]
                .filter(Boolean)
                .join(', ');

            const subject = `Nowy wybór płatności przelewem: ${company.legal_name || company.name}`;
            const html = `
                <h2>Nowa firma wybrała płatność przelewem</h2>
                <p>Skontaktuj się z klientem w celu ustalenia płatności i wystawienia faktury.</p>
                <table cellpadding="6" style="border-collapse:collapse">
                  <tr><td><strong>Firma (faktura)</strong></td><td>${esc(company.legal_name || company.name)}</td></tr>
                  <tr><td><strong>NIP</strong></td><td>${esc(company.tax_id)}</td></tr>
                  <tr><td><strong>Adres</strong></td><td>${esc(address)}</td></tr>
                  <tr><td><strong>E-mail do faktur</strong></td><td>${esc(company.billing_email)}</td></tr>
                  <tr><td><strong>Wybrany plan</strong></td><td>${esc(plan.name)} (${esc(String(plan.price_monthly))} PLN/mc)</td></tr>
                  <tr><td><strong>Wybrał(a)</strong></td><td>${esc(actor?.name || '')} ${esc(actor?.email || '')}</td></tr>
                  <tr><td><strong>ID firmy</strong></td><td>${esc(company.id)}</td></tr>
                </table>
            `;
            await this.mailService.send(to, subject, html);
        } catch (e: any) {
            this.logger.error(`Nie udało się powiadomić działu finansowego: ${e?.message}`);
        }
    }

    /** Zapisuje akceptację regulaminu przez admina/managera w imieniu firmy. */
    async acceptTerms(companyId: string, userId: string) {
        const { error } = await this.admin
            .from('companies')
            .update({
                accepted_terms_version: CURRENT_TERMS_VERSION,
                terms_accepted_at: new Date().toISOString(),
                terms_accepted_by: userId,
            })
            .eq('id', companyId);

        if (error) throw new InternalServerErrorException(error.message);

        // Log audytowy (best-effort)
        await this.admin.from('terms_acceptances').insert({
            company_id: companyId,
            user_id: userId,
            terms_version: CURRENT_TERMS_VERSION,
        });

        return { accepted_terms_version: CURRENT_TERMS_VERSION };
    }
}
