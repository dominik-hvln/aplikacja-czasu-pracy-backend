import {
    Injectable,
    InternalServerErrorException,
    ConflictException,
    UnauthorizedException,
    Logger,
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
    private readonly logger = new Logger(AuthService.name);

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
            throw new InternalServerErrorException(
                `Resend error ${res.status}: ${body || 'brak treści'}`
            );
        }
        return body;
    }

    // === REJESTRACJA ===
    async register(registerDto: RegisterDto) {
        const supabase = this.supabaseService.getClient();
        const supabaseAdmin = this.supabaseService.getAdminClient();

        const { data: companyData, error: companyError } = await supabase
            .from('companies').insert({ name: registerDto.companyName }).select().single();

        if (companyError) {
            this.logger.error(`Błąd tworzenia firmy: ${JSON.stringify(companyError)}`);
            throw new InternalServerErrorException(`Błąd tworzenia firmy: ${companyError.message}`);
        }

        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        this.logger.log(`Generowanie linku rejestracyjnego dla: ${registerDto.email}`);
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
            this.logger.error(`Błąd generateLink: ${JSON.stringify(linkErr)}`);
            await supabase.from('companies').delete().eq('id', companyData.id);
            if (linkErr.message?.includes('User already registered')) {
                throw new ConflictException('Użytkownik o tym adresie e-mail już istnieje.');
            }
            throw new InternalServerErrorException(`Błąd rejestracji w Supabase: ${linkErr.message}`);
        }

        const userId = linkData?.user?.id;
        const confirmUrl = linkData?.properties?.action_link;
        if (!userId || !confirmUrl) {
            this.logger.error('Nie udało się wygenerować userId lub confirmUrl');
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException('Nie udało się wygenerować linku aktywacyjnego.');
        }

        const { error: profileError } = await supabaseAdmin
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
            this.logger.error(`Błąd tworzenia profilu users: ${JSON.stringify(profileError)}`);
            await supabaseAdmin.auth.admin.deleteUser(userId);
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException(`Błąd profilu: ${profileError.message}`);
        }

        try {
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
        } catch (emailErr: any) {
            this.logger.error(`Błąd wysyłki e-maila: ${emailErr.message}`);
        }

        return { message: 'Rejestracja udana. Sprawdź e-mail, aby aktywować konto.' };
    }

    // === LOGOWANIE ===
    async login(loginDto: LoginDto) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.auth.signInWithPassword({
            email: loginDto.email,
            password: loginDto.password,
        });

        if (error) {
            this.logger.warn(`Błąd logowania dla ${loginDto.email}: ${error.message} (status: ${error.status})`);
            if (error.message === 'Email not confirmed') {
                throw new UnauthorizedException('Konto nie zostało aktywowane. Sprawdź e-mail.');
            }
            throw new UnauthorizedException(`Błąd logowania: ${error.message}`);
        }

        const { data: profile, error: profileError } = await supabase
            .from('users').select('*').eq('id', data.user.id).single();
        if (profileError) throw new InternalServerErrorException(profileError.message);

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

    async forgotPassword(dto: ForgotPasswordDto) {
        const supabaseAdmin = this.supabaseService.getAdminClient();
        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        try {
            const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
                type: 'recovery',
                email: dto.email,
                options: { redirectTo: `${appUrl}/auth/reset` },
            });
            if (error) throw error;

            const resetUrl = linkData?.properties?.action_link;
            if (!resetUrl) {
                console.warn('[forgotPassword] Brak action_link w generateLink');
                return { message: 'Jeśli konto istnieje, wysłaliśmy instrukcje resetu haseł.' };
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
            console.warn('[forgotPassword] error:', e instanceof Error ? e.message : e);
        }
        return { message: 'Jeśli konto istnieje, wysłaliśmy instrukcje resetu hasła.' };
    }

    async resetPassword(dto: ResetPasswordDto) {
        const supabase = this.supabaseService.getClient();
        const supabaseAdmin = this.supabaseService.getAdminClient();

        const { data: userData, error: getUserErr } = await supabase.auth.getUser(dto.token);
        if (getUserErr || !userData?.user?.id) {
            throw new UnauthorizedException('Token jest nieprawidłowy lub wygasł.');
        }
        const userId = userData.user.id;

        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: dto.password,
        });
        if (updErr) {
            throw new InternalServerErrorException('Nie udało się zaktualizować hasła.');
        }

        return { message: 'Hasło zostało zaktualizowane. Możesz się zalogować.' };
    }

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
