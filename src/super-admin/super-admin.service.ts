import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateSystemUserDto } from './dto/create-user.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateModuleDto } from './dto/create-module.dto';

import { StripeService } from '../stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SuperAdminService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly stripeService: StripeService,
        private readonly config: ConfigService,
        private readonly mailService: MailService,
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
            .select('id, email, first_name, last_name, role, status, company_id, created_at, archived_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw new InternalServerErrorException(`Błąd pobierania użytkowników: ${error.message}`);
        }

        // Dołącz nazwę firmy
        const { data: companies } = await supabase.from('companies').select('id, name');
        const companyName = new Map((companies || []).map((c: any) => [c.id, c.name]));

        return (data || []).map((u: any) => ({
            ...u,
            company_name: u.company_id ? companyName.get(u.company_id) || null : null,
        }));
    }

    /** Edycja danych użytkownika z poziomu panelu super admina. */
    async updateUser(
        userId: string,
        dto: { firstName?: string; lastName?: string; role?: string; companyId?: string | null },
    ) {
        const admin = this.supabaseService.getAdminClient();

        const { data: user, error: fetchError } = await admin
            .from('users')
            .select('id, role, archived_at')
            .eq('id', userId)
            .maybeSingle();

        if (fetchError) throw new InternalServerErrorException(fetchError.message);
        if (!user) throw new NotFoundException('Nie znaleziono użytkownika.');

        if (user.archived_at) {
            throw new BadRequestException('Nie można edytować zarchiwizowanego pracownika.');
        }

        const updates: Record<string, any> = {};
        if (dto.firstName !== undefined) updates.first_name = dto.firstName;
        if (dto.lastName !== undefined) updates.last_name = dto.lastName;
        if (dto.role !== undefined) updates.role = dto.role;
        if (dto.companyId !== undefined) updates.company_id = dto.companyId;

        // Super admin działa globalnie i nie należy do żadnej firmy.
        if (updates.role === 'super_admin') {
            updates.company_id = null;
        } else if (updates.role && updates.role !== 'super_admin' && updates.company_id === undefined) {
            const { data: current } = await admin
                .from('users')
                .select('company_id')
                .eq('id', userId)
                .maybeSingle();
            if (!current?.company_id) {
                throw new BadRequestException(
                    'Użytkownik w roli innej niż super admin musi być przypisany do firmy.',
                );
            }
        }

        if (Object.keys(updates).length === 0) {
            throw new BadRequestException('Brak danych do zapisania.');
        }

        // Odebranie ostatniej roli super admina odcięłoby dostęp do panelu.
        if (user.role === 'super_admin' && updates.role && updates.role !== 'super_admin') {
            const { count, error: countError } = await admin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'super_admin')
                .is('archived_at', null);

            if (countError) throw new InternalServerErrorException(countError.message);
            if ((count || 0) <= 1) {
                throw new BadRequestException('Nie można odebrać roli jedynemu super adminowi.');
            }
        }

        const { data, error } = await admin
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select('id, email, first_name, last_name, role, company_id')
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    /** Przyrost firm w ostatnich `months` miesiącach — dane pod wykres na pulpicie. */
    async getCompanyGrowth(months = 12) {
        const supabase = this.supabaseService.getClient();

        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        start.setMonth(start.getMonth() - (months - 1));

        const { data, error } = await supabase
            .from('companies')
            .select('created_at')
            .gte('created_at', start.toISOString());

        if (error) throw new InternalServerErrorException(error.message);

        const buckets = new Map<string, number>();
        for (let i = 0; i < months; i++) {
            const d = new Date(start);
            d.setMonth(start.getMonth() + i);
            buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
        }

        for (const row of data || []) {
            const d = new Date(row.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        let running = 0;
        return [...buckets.entries()].map(([month, count]) => {
            running += count;
            return { month, count, cumulative: running };
        });
    }

    /**
     * Ostatnie logowania. Data ostatniego logowania żyje w auth.users, więc
     * czytamy ją przez Admin API i łączymy z profilami z public.users.
     */
    async getRecentLogins(limit = 8) {
        const admin = this.supabaseService.getAdminClient();

        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw new InternalServerErrorException(error.message);

        const signedIn = (data?.users || [])
            .filter((u: any) => u.last_sign_in_at)
            .sort(
                (a: any, b: any) =>
                    new Date(b.last_sign_in_at).getTime() - new Date(a.last_sign_in_at).getTime(),
            )
            .slice(0, limit);

        if (signedIn.length === 0) return [];

        const { data: profiles } = await admin
            .from('users')
            .select('id, first_name, last_name, role, company_id')
            .in('id', signedIn.map((u: any) => u.id));

        const { data: companies } = await admin.from('companies').select('id, name');
        const companyName = new Map((companies || []).map((c: any) => [c.id, c.name]));
        const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));

        return signedIn.map((u: any) => {
            const profile = profileById.get(u.id);
            return {
                id: u.id,
                email: u.email,
                last_sign_in_at: u.last_sign_in_at,
                first_name: profile?.first_name || null,
                last_name: profile?.last_name || null,
                role: profile?.role || null,
                company_name: profile?.company_id ? companyName.get(profile.company_id) || null : null,
            };
        });
    }

    /**
     * Historia logowań jednego konta.
     *
     * Uwaga na granicę tej funkcji: system rejestruje KONTO, nie człowieka.
     * Jeżeli kilka osób korzysta z jednego loginu, nie da się ich rozróżnić -
     * jedynym sygnałem współdzielenia są różne adresy IP i urządzenia,
     * dlatego zliczamy je osobno.
     */
    async getUserLoginHistory(userId: string, limit = 50) {
        const admin = this.supabaseService.getAdminClient();

        const { data: user, error: userError } = await admin
            .from('users')
            .select('id, email, first_name, last_name, company_id')
            .eq('id', userId)
            .maybeSingle();

        if (userError) throw new InternalServerErrorException(userError.message);
        if (!user) throw new NotFoundException('Nie znaleziono użytkownika.');

        const { data: events, error } = await admin
            .from('login_events')
            .select('id, created_at, ip_address, user_agent')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw new InternalServerErrorException(error.message);

        // last_sign_in_at z Auth działa od zawsze, nasza tabela dopiero od wdrożenia.
        let lastSignInAt: string | null = null;
        try {
            const { data: authUser } = await admin.auth.admin.getUserById(userId);
            lastSignInAt = (authUser?.user as any)?.last_sign_in_at || null;
        } catch {
            lastSignInAt = null;
        }

        const rows = events || [];
        const distinctIps = new Set(rows.map((e: any) => e.ip_address).filter(Boolean));
        const distinctAgents = new Set(rows.map((e: any) => e.user_agent).filter(Boolean));

        return {
            user: {
                id: user.id,
                email: user.email,
                name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
            },
            lastSignInAt,
            events: rows,
            summary: {
                total: rows.length,
                distinctIps: distinctIps.size,
                distinctDevices: distinctAgents.size,
            },
        };
    }

    /** Pracownicy firmy z podziałem na aktywnych i zarchiwizowanych. */
    async getCompanyUsers(companyId: string) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, role, status, archived_at, created_at')
            .eq('company_id', companyId)
            .order('archived_at', { ascending: true, nullsFirst: true })
            .order('last_name', { ascending: true });

        if (error) throw new InternalServerErrorException(error.message);

        const users = data || [];
        return {
            active: users.filter((u: any) => !u.archived_at),
            archived: users.filter((u: any) => u.archived_at),
        };
    }

    /** Aktywuje/dezaktywuje użytkownika (ban w Auth + status w profilu). */
    async setUserActive(userId: string, active: boolean) {
        const admin = this.supabaseService.getAdminClient();

        try {
            await admin.auth.admin.updateUserById(userId, {
                ban_duration: active ? 'none' : '876600h', // ~100 lat = trwała blokada
            });
        } catch (e: any) {
            throw new InternalServerErrorException(`Błąd zmiany statusu konta: ${e?.message}`);
        }

        const { error } = await admin
            .from('users')
            .update({ status: active ? 'active' : 'inactive' })
            .eq('id', userId);
        if (error) throw new InternalServerErrorException(error.message);

        return { message: active ? 'Użytkownik aktywowany' : 'Użytkownik dezaktywowany', active };
    }

    /** Wysyła e-mail z linkiem do resetu hasła dla wskazanego użytkownika. */
    async resetUserPassword(userId: string) {
        const admin = this.supabaseService.getAdminClient();
        const { data: user } = await admin.from('users').select('email').eq('id', userId).maybeSingle();
        if (!user?.email) throw new NotFoundException('Nie znaleziono użytkownika lub adresu e-mail.');

        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';
        const backendUrl = this.config.get<string>('BACKEND_URL')?.replace(/\/+$/, '') || 'http://localhost:4000';

        const { data: linkData, error } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: user.email,
            options: { redirectTo: `${appUrl}/auth/reset` },
        });
        if (error) throw new InternalServerErrorException(`Nie udało się wygenerować linku: ${error.message}`);

        let resetUrl = linkData?.properties?.action_link;
        if (resetUrl) {
            try {
                const token = new URL(resetUrl).searchParams.get('token');
                if (token) resetUrl = `${backendUrl}/auth/verify?token=${token}&type=recovery`;
            } catch { /* zostaw oryginalny link */ }
        }

        await this.mailService.send(
            user.email,
            'Reset hasła',
            `<p>Administrator zainicjował reset hasła do Twojego konta.</p>
             <p>Kliknij, aby ustawić nowe hasło:</p>
             <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>`,
        );

        return { message: `Wysłano link resetujący na ${user.email}` };
    }

    async getAllSubscriptions() {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*, companies(name, billing_type), plans(name, price_monthly)')
            .order('current_period_end', { ascending: true });

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    private readonly logger = new Logger(SuperAdminService.name);

    /**
     * Trwale usuwa firmę wraz ze wszystkimi pracownikami i danymi.
     * 1) usuwa konta logowania (Supabase Auth) — kasuje też wiersze public.users (kaskada),
     * 2) sprząta ewentualne pozostałe wiersze users,
     * 3) usuwa firmę — pozostałe dane firmowe znikają kaskadowo (ON DELETE CASCADE).
     */
    async deleteCompany(companyId: string) {
        const admin = this.supabaseService.getAdminClient();

        const { data: company, error: compErr } = await admin
            .from('companies')
            .select('id, name')
            .eq('id', companyId)
            .maybeSingle();
        if (compErr) throw new InternalServerErrorException(compErr.message);
        if (!company) throw new NotFoundException('Nie znaleziono firmy.');

        // 1. Pobierz pracowników firmy
        const { data: users, error: usersErr } = await admin
            .from('users')
            .select('id')
            .eq('company_id', companyId);
        if (usersErr) throw new InternalServerErrorException(usersErr.message);
        const userIds = (users || []).map((u: any) => u.id);

        // 2. Usuń konta Auth. Uwaga: od migracji add_user_archiving.sql nie ma już
        //    kaskady auth.users -> public.users, więc profile sprząta dopiero krok 3.
        const authErrors: string[] = [];
        for (const uid of userIds) {
            try {
                const { error } = await admin.auth.admin.deleteUser(uid);
                if (error && !/not\s*found/i.test(error.message)) {
                    authErrors.push(`${uid}: ${error.message}`);
                }
            } catch (e: any) {
                authErrors.push(`${uid}: ${e?.message || 'błąd usuwania konta'}`);
            }
        }
        if (authErrors.length > 0) {
            this.logger.warn(`Usuwanie firmy ${companyId}: błędy kont Auth: ${authErrors.join('; ')}`);
        }

        // 3. Usuń profile pracowników. Po zdjęciu kaskady to jest krok, który
        //    faktycznie kasuje wiersze w public.users - nie tylko zabezpieczenie.
        await admin.from('users').delete().eq('company_id', companyId);

        // 4. Usuń firmę (reszta danych firmowych znika kaskadowo)
        const { error: delErr } = await admin.from('companies').delete().eq('id', companyId);
        if (delErr) {
            throw new InternalServerErrorException(
                `Nie udało się usunąć firmy: ${delErr.message}. Sprawdź zależności (FK) bez ON DELETE CASCADE.`,
            );
        }

        return {
            message: `Usunięto firmę „${company.name}" oraz ${userIds.length} kont pracowników.`,
            deletedUsers: userIds.length,
            authErrors,
        };
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

    // --- APP SETTINGS ---

    async getAppSettings() {
        const supabase = this.supabaseService.getAdminClient();
        const { data, error } = await supabase.from('app_settings').select('key, value');
        if (error) throw new InternalServerErrorException(error.message);
        const settings: Record<string, string | null> = {};
        (data || []).forEach((row: any) => {
            settings[row.key] = row.value;
        });
        return settings;
    }

    async updateAppSetting(key: string, value: string | null) {
        const allowedKeys = [
            'finance_notification_email',
            'global_announcement',
            'bank_transfer_details',
            'default_trial_days',
        ];
        if (!allowedKeys.includes(key)) {
            throw new BadRequestException(`Nieobsługiwany klucz ustawienia: ${key}`);
        }

        const supabase = this.supabaseService.getAdminClient();
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key, value: value?.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw new InternalServerErrorException(error.message);
        return { key, value: value?.trim() || null };
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

    /**
     * Aktywuje subskrypcję opłacaną przelewem po zaksięgowaniu wpłaty.
     * Ustawia status 'active', odnawia okres i synchronizuje moduły z planu.
     */
    async activateTransferSubscription(companyId: string, periodDays = 30) {
        const supabase = this.supabaseService.getAdminClient();

        const { data: sub } = await supabase
            .from('subscriptions')
            .select('id, plan_id')
            .eq('company_id', companyId)
            .maybeSingle();

        if (!sub) {
            throw new BadRequestException('Firma nie ma subskrypcji do aktywacji.');
        }

        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + periodDays);

        const { error } = await supabase
            .from('subscriptions')
            .update({
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: periodEnd.toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

        if (error) throw new InternalServerErrorException(`Nie udała się aktywacja: ${error.message}`);

        if (sub.plan_id) {
            await this.syncPlanModulesToCompany(companyId, sub.plan_id);
        }

        return { message: 'Subskrypcja aktywowana (przelew zaksięgowany)' };
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

    // --- PLAN MODULES ---

    async getPlanModules(planId: string): Promise<string[]> {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('plan_modules')
            .select('module_code')
            .eq('plan_id', planId);

        if (error) throw new InternalServerErrorException(error.message);
        return data?.map(pm => pm.module_code) || [];
    }

    async setPlanModules(planId: string, moduleCodes: string[]) {
        const supabase = this.supabaseService.getAdminClient();

        // 1. Delete existing
        const { error: delError } = await supabase
            .from('plan_modules')
            .delete()
            .eq('plan_id', planId);

        if (delError) throw new InternalServerErrorException(delError.message);

        // 2. Insert new
        if (moduleCodes.length > 0) {
            const toInsert = moduleCodes.map(code => ({
                plan_id: planId,
                module_code: code
            }));

            const { error: insError } = await supabase
                .from('plan_modules')
                .insert(toInsert);

            if (insError) throw new InternalServerErrorException(insError.message);
        }

        return { message: 'Plan modules updated', modules: moduleCodes };
    }
}