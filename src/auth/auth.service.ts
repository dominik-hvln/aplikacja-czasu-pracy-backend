import {
    Injectable,
    InternalServerErrorException,
    ConflictException,
    UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) { }

    // === WYSYŁKA MAILI przez RESEND (HTTPS) ===
    private async sendResendEmail(to: string, subject: string, html: string, text: string) {
        const apiKey = this.config.get<string>('RESEND_API_KEY');
        if (!apiKey) {
            throw new InternalServerErrorException('Brak RESEND_API_KEY w konfiguracji.');
        }
        const fromHeader = this.config.get<string>('MAIL_FROM') || 'onboarding@resend.dev';

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: fromHeader, to, subject, html, text }),
        });

        const body = await res.text().catch(() => '');
        if (!res.ok) {
            // 401 → zły/brak klucza; 422 → invalid_from lub niezweryfikowana domena
            throw new InternalServerErrorException(
                `Resend error ${res.status}: ${body || 'brak treści'}`
            );
        }
        return body;
    }

    // === REJESTRACJA (jak dotąd) ===
    async register(registerDto: RegisterDto) {
        const supabase = this.supabaseService.getClient();
        const supabaseAdmin = this.supabaseService.getAdminClient();

        const { data: companyData, error: companyError } = await supabase
            .from('companies').insert({ name: registerDto.companyName }).select().single();
        if (companyError) throw new InternalServerErrorException(companyError.message);

        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: registerDto.email,
            password: registerDto.password,
            options: {
                data: { first_name: registerDto.firstName, last_name: registerDto.lastName },
                redirectTo: `${appUrl}/auth/confirm`,
            },
        });
        if (linkErr) {
            await supabase.from('companies').delete().eq('id', companyData.id);
            if (linkErr.message?.includes('User already registered')) {
                throw new ConflictException('Użytkownik o tym adresie e-mail już istnieje.');
            }
            throw new InternalServerErrorException(linkErr.message);
        }

        const userId = linkData?.user?.id;
        const confirmUrl = linkData?.properties?.action_link;
        if (!userId || !confirmUrl) {
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException('Nie udało się wygenerować linku aktywacyjnego.');
        }

        // BEZPIECZNIE: upsert profilu (jeśli trigger nie zadziała)
        const supabaseAdminDb = this.supabaseService.getAdminClient();
        const { error: profileError } = await supabaseAdminDb
            .from('users')
            .upsert(
                {
                    id: userId,
                    company_id: companyData.id,
                    first_name: registerDto.firstName,
                    last_name: registerDto.lastName,
                    role: 'admin',
                    email: registerDto.email,
                },
                { onConflict: 'id' }
            );
        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException(profileError.message);
        }

        // Mail aktywacyjny przez Resend
        await this.sendResendEmail(
            registerDto.email,
            'Potwierdź swój adres e-mail',
            `
        <p>Cześć ${registerDto.firstName || ''},</p>
        <p>Dokończ rejestrację klikając w link poniżej:</p>
        <p><a href="${confirmUrl}" target="_blank" rel="noopener noreferrer">${confirmUrl}</a></p>
      `,
            `Potwierdź rejestrację: ${confirmUrl}`
        );

        return { message: 'Rejestracja udana. Sprawdź e-mail, aby aktywować konto.' };
    }

    // === LOGOWANIE (jak dotąd) ===
    async login(loginDto: LoginDto) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.auth.signInWithPassword({
            email: loginDto.email,
            password: loginDto.password,
        });

        if (error) {
            if (error.message === 'Email not confirmed') {
                throw new UnauthorizedException('Konto nie zostało aktywowane. Sprawdź e-mail.');
            }
            throw new UnauthorizedException('Nieprawidłowy e-mail lub hasło.');
        }

        const { data: profile, error: profileError } = await supabase
            .from('users').select('*').eq('id', data.user.id).single();
        if (profileError) throw new InternalServerErrorException(profileError.message);

        // Fetch enabled modules for company
        let modules: string[] = [];
        if (profile.company_id) {
            const { data: modData } = await supabase
                .from('company_modules')
                .select('module_code')
                .eq('company_id', profile.company_id);
            if (modData) {
                modules = modData.map(m => m.module_code);
            }
        }

        return { session: data.session, profile: { ...profile, modules } };
    }

    async getUserProfile(userId: string) {
        const supabase = this.supabaseService.getClient();

        const { data: profile, error: profileError } = await supabase
            .from('users').select('*').eq('id', userId).single();

        if (profileError || !profile) {
            throw new UnauthorizedException('Nie znaleziono użytkownika.');
        }

        let modules: string[] = [];
        if (profile.company_id) {
            const { data: modData } = await supabase
                .from('company_modules')
                .select('module_code')
                .eq('company_id', profile.company_id);

            if (modData) {
                modules = modData.map(m => m.module_code);
            }
        }

        return { ...profile, modules };
    }

    // === 1) „Zapomniałem hasło” — generujemy recovery link i wysyłamy mailem przez Resend ===
    async forgotPassword(dto: ForgotPasswordDto) {
        const supabaseAdmin = this.supabaseService.getAdminClient();
        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        // Nie zdradzamy, czy email istnieje — zawsze „OK”
        try {
            const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
                type: 'recovery',
                email: dto.email,
                options: { redirectTo: `${appUrl}/auth/reset` },
            });
            if (error) throw error;

            const resetUrl = linkData?.properties?.action_link;
            if (!resetUrl) {
                // „zjadamy” szczegóły, ale logujemy na serwerze
                console.warn('[forgotPassword] Brak action_link w generateLink');
                return { message: 'Jeśli konto istnieje, wysłaliśmy instrukcje resetu hasła.' };
            }

            await this.sendResendEmail(
                dto.email,
                'Reset hasła',
                `
          <p>Otrzymaliśmy prośbę o zresetowanie hasła.</p>
          <p>Kliknij w link, aby ustawić nowe hasło:</p>
          <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>
          <p>Jeśli to nie Ty, zignoruj tę wiadomość.</p>
        `,
                `Zresetuj hasło: ${resetUrl}`
            );
        } catch (e) {
            // nie zdradzamy szczegółów; zostawiamy ten sam komunikat
            console.warn('[forgotPassword] error:', e instanceof Error ? e.message : e);
        }
        return { message: 'Jeśli konto istnieje, wysłaliśmy instrukcje resetu hasła.' };
    }

    // === 2) Ustawienie nowego hasła po kliknięciu w link (token z URL) ===
    async resetPassword(dto: ResetPasswordDto) {
        const supabase = this.supabaseService.getClient();      // public client
        const supabaseAdmin = this.supabaseService.getAdminClient(); // admin

        // Z tokenu „recovery” pobierz usera (bez sesji)
        const { data: userData, error: getUserErr } = await supabase.auth.getUser(dto.token);
        if (getUserErr || !userData?.user?.id) {
            throw new UnauthorizedException('Token jest nieprawidłowy lub wygasł.');
        }
        const userId = userData.user.id;

        // Zmień hasło jako admin (bez logowania użytkownika)
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: dto.password,
        });
        if (updErr) {
            throw new InternalServerErrorException('Nie udało się zaktualizować hasła.');
        }

        return { message: 'Hasło zostało zaktualizowane. Możesz się zalogować.' };
    }

    // (opcjonalnie) Reset przez magic link + Resend (re-send)
    async resendVerification(email: string) {
        const supabaseAdmin = this.supabaseService.getAdminClient();
        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';
        const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: `${appUrl}/auth/confirm` },
        });
        if (error) throw new InternalServerErrorException(error.message);
        const confirmUrl = linkData?.properties?.action_link;
        if (confirmUrl) {
            await this.sendResendEmail(
                email,
                'Potwierdź adres e-mail',
                `<p>Kliknij, aby potwierdzić: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
                `Potwierdź: ${confirmUrl}`
            );
        }
        return { message: 'Jeśli konto istnieje, wysłaliśmy nowy link.' };
    }
}
