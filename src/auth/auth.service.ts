import {
    Injectable,
    InternalServerErrorException,
    ConflictException,
    UnauthorizedException,
    Inject, // ⬅️ dodaj
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { randomUUID } from 'crypto'; // (opcjonalnie do resend)

@Injectable()
export class AuthService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        @Inject('MAILER') private readonly mailer: Transporter, // ⬅️ użyj stringowego tokena
    ) {}

    async register(registerDto: RegisterDto) {
        const supabase = this.supabaseService.getClient();
        const supabaseAdmin = this.supabaseService.getAdminClient();

        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .insert({ name: registerDto.companyName })
            .select()
            .single();
        if (companyError) throw new InternalServerErrorException(companyError.message);

        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: registerDto.email,
            password: registerDto.password,                 // wymagane
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

        const from = this.config.get<string>('MAIL_FROM') || 'no-reply@yourapp.local';
        try {
            await this.mailer.sendMail({
                from,
                to: registerDto.email,
                subject: 'Potwierdź swój adres e-mail',
                html: `
          <p>Cześć ${registerDto.firstName || ''},</p>
          <p>Dokończ rejestrację klikając w link poniżej:</p>
          <p><a href="${confirmUrl}" target="_blank" rel="noopener noreferrer">${confirmUrl}</a></p>
          <p>Jeśli to nie Ty, zignoruj tę wiadomość.</p>
        `,
                text: `Potwierdź rejestrację: ${confirmUrl}`,
            });
        } catch (mailErr) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
            await supabase.from('companies').delete().eq('id', companyData.id);
            const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
            throw new InternalServerErrorException(`Nie udało się wysłać maila aktywacyjnego: ${msg}`);
        }

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

    async resendVerification(email: string) {
        const supabaseAdmin = this.supabaseService.getAdminClient();
        const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '') || 'http://localhost:3000';

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email,
            password: randomUUID(), // tymczasowe hasło
            options: { redirectTo: `${appUrl}/auth/confirm` },
        });
        if (linkErr) throw new InternalServerErrorException(linkErr.message);

        const confirmUrl = linkData?.properties?.action_link;
        const from = this.config.get<string>('MAIL_FROM') || 'no-reply@yourapp.local';

        await this.mailer.sendMail({
            from,
            to: email,
            subject: 'Potwierdź swój adres e-mail (ponownie)',
            html: `<p>Kliknij, aby potwierdzić: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
            text: `Potwierdź rejestrację: ${confirmUrl}`,
        });

        return { message: 'Nowy link aktywacyjny został wysłany.' };
    }
}
