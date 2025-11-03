import {
    Injectable,
    InternalServerErrorException,
    ConflictException,
    UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AuthService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        private readonly http: HttpService, // ← Resend przez HTTP
    ) {}

    private async sendActivationEmailResend(to: string, firstName: string, confirmUrl: string) {
        const apiKey = this.config.get<string>('RESEND_API_KEY');
        if (!apiKey) {
            // jawnie pokaż brak klucza zamiast laconicznego 500
            throw new InternalServerErrorException({
                provider: 'resend',
                reason: 'missing_api_key',
                hint: 'Ustaw RESEND_API_KEY w env backendu.',
            });
        }

        // Uwaga: Resend wymaga poprawnego from. Bez własnej domeny użyj:
        // MAIL_FROM=onboarding@resend.dev (działa testowo)
        const fromHeader = this.config.get<string>('MAIL_FROM') || 'onboarding@resend.dev';

        const payload = {
            from: fromHeader,             // np. "onboarding@resend.dev" lub "Nazwa <no-reply@twoja.pl>"
            to,                           // pojedynczy email lub tablica
            subject: 'Potwierdź swój adres e-mail',
            html: `
      <p>Cześć ${firstName || ''},</p>
      <p>Dokończ rejestrację klikając w link poniżej:</p>
      <p><a href="${confirmUrl}" target="_blank" rel="noopener noreferrer">${confirmUrl}</a></p>
    `,
            text: `Potwierdź rejestrację: ${confirmUrl}`,
        };

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const text = await res.text().catch(() => '');
        // Log do serwera, żebyś miał ślad w Renderze
        console.log('[RESEND] status:', res.status, 'body:', text);

        if (!res.ok) {
            // Zwróć do klienta precyzyjny powód (na czas debugowania)
            // Najczęstsze:
            // 401 → zły/brak klucza
            // 422 → invalid_from_address / domain not verified / zabronione adresy testowe
            throw new InternalServerErrorException({
                provider: 'resend',
                status: res.status,
                body: (() => { try { return JSON.parse(text); } catch { return text; } })(),
                hint:
                    res.status === 401
                        ? 'Sprawdź RESEND_API_KEY.'
                        : res.status === 422
                            ? 'Sprawdź MAIL_FROM (użyj onboarding@resend.dev) i adres docelowy (nie używaj @example.com / @test.com).'
                            : 'Sprawdź logi powyżej.',
            });
        }

        const data = (() => { try { return JSON.parse(text); } catch { return {}; } })();
        if (!data?.id) {
            throw new InternalServerErrorException({
                provider: 'resend',
                reason: 'missing_message_id',
                raw: text,
            });
        }
        return data;
    }


    async register(registerDto: RegisterDto) {
        const supabase = this.supabaseService.getClient();
        const supabaseAdmin = this.supabaseService.getAdminClient();

        // 1) Firma
        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .insert({ name: registerDto.companyName })
            .select()
            .single();
        if (companyError) throw new InternalServerErrorException(companyError.message);

        // 2) Link aktywacyjny od Supabase (nie wysyła maila)
        const appUrl =
            this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: registerDto.email,
            password: registerDto.password, // wymagane
            options: {
                data: {
                    first_name: registerDto.firstName,
                    last_name: registerDto.lastName,
                },
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

        // 3) Profil (ADMIN, omijamy RLS)
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .update({
                company_id: companyData.id,
                first_name: registerDto.firstName,
                last_name: registerDto.lastName,
                role: 'admin',
                email: registerDto.email,
            })
            .eq('id', userId);
        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException(profileError.message);
        }

        // 4) Wysyłka maila przez Resend (HTTP)
        await this.sendActivationEmailResend(registerDto.email, registerDto.firstName, confirmUrl);

        return { message: 'Rejestracja udana. Sprawdź e-mail, aby aktywować konto.' };
    }

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
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();
        if (profileError) throw new InternalServerErrorException(profileError.message);

        return { session: data.session, profile };
    }

    async sendPasswordResetEmail(email: string, redirectTo: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw new InternalServerErrorException(error.message);
        return { message: 'E-mail z linkiem do resetu hasła został wysłany.' };
    }

    async updateUserPassword(userId: string, newPassword: string) {
        const supabaseAdmin = this.supabaseService.getAdminClient();
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
        if (error) {
            console.error('Błąd aktualizacji hasła:', error);
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    // (opcjonalnie) ponowna wysyłka – również Resend
    async resendVerification(email: string) {
        const supabaseAdmin = this.supabaseService.getAdminClient();
        const appUrl =
            this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        // wygeneruj świeży link (bez hasła – dla już istniejącego usera użyjemy magic linka)
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: `${appUrl}/auth/confirm` },
        });
        if (linkErr) throw new InternalServerErrorException(linkErr.message);

        const confirmUrl = linkData?.properties?.action_link;
        if (!confirmUrl) throw new InternalServerErrorException('Nie udało się wygenerować linku.');

        await this.sendActivationEmailResend(email, '', confirmUrl);
        return { message: 'Nowy link aktywacyjny został wysłany.' };
    }
}
