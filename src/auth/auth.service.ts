import { Injectable, InternalServerErrorException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly jwtService: JwtService,
    ) {}

    async register(registerDto: RegisterDto) {
        const supabase = this.supabaseService.getClient();

        // 1. Stwórz firmę
        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .insert({ name: registerDto.companyName })
            .select()
            .single();
        if (companyError) throw new InternalServerErrorException(companyError.message);

        // 2. Stwórz użytkownika (Supabase Auth)
        // Supabase automatycznie wyśle e-mail aktywacyjny
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: registerDto.email,
            password: registerDto.password,
        });

        if (authError) {
            await supabase.from('companies').delete().eq('id', companyData.id);
            if (authError.message.includes('User already registered')) {
                throw new ConflictException('Użytkownik o tym adresie e-mail już istnieje.');
            }
            throw new InternalServerErrorException(authError.message);
        }

        if (!authData || !authData.user) {
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException('Nie udało się utworzyć danych użytkownika.');
        }

        // 3. ✅ POPRAWIONA LOGIKA: AKTUALIZUJ (UPDATE) profil, który został
        // automatycznie stworzony przez trigger Supabase.
        // Dodajemy imię, nazwisko, rolę i ID firmy.
        const { error: profileError } = await supabase
            .from('users')
            .update({
                company_id: companyData.id,
                first_name: registerDto.firstName,
                last_name: registerDto.lastName,
                role: 'admin',
                email: registerDto.email, // Zapisujemy też e-mail
            })
            .eq('id', authData.user.id); // Znajdź wiersz po ID

        if (profileError) {
            // Jeśli aktualizacja profilu się nie uda, usuń wszystko
            await supabase.auth.admin.deleteUser(authData.user.id);
            await supabase.from('companies').delete().eq('id', companyData.id);
            throw new InternalServerErrorException(profileError.message);
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
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectTo,
        });
        if (error) throw new InternalServerErrorException(error.message);
        return { message: 'E-mail z linkiem do resetu hasła został wysłany.' };
    }

    async updateUserPassword(userId: string, newPassword: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.auth.admin.updateUserById(userId, {
            password: newPassword,
        });
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}