// src/auth/auth.service.ts
import { Injectable, InternalServerErrorException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async register(registerDto: RegisterDto) {
        const supabase = this.supabaseService.getClient();

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: registerDto.email,
            password: registerDto.password,
        });

        if (authError) {
            if (authError.message.includes('User already registered')) {
                throw new ConflictException('Użytkownik o tym adresie e-mail już istnieje.');
            }
            throw new InternalServerErrorException(authError.message);
        }

        if (!authData.user) {
            throw new InternalServerErrorException('Nie udało się stworzyć użytkownika.');
        }

        try {
            const { data: companyData, error: companyError } = await supabase
                .from('companies')
                .insert({ name: registerDto.companyName })
                .select('id')
                .single();

            if (companyError) throw companyError;

            const { error: profileError } = await supabase.from('users').insert({
                id: authData.user.id,
                company_id: companyData.id,
                first_name: registerDto.firstName,
                last_name: registerDto.lastName,
                role: 'admin',
            });

            if (profileError) throw profileError;

        } catch (error) {
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw new InternalServerErrorException('Nie udało się w pełni skonfigurować konta. Spróbuj ponownie.');
        }

        return { message: 'Rejestracja pomyślna! Sprawdź swój e-mail, aby aktywować konto.' };
    }

    async login(loginDto: LoginDto) {
        const supabase = this.supabaseService.getClient();

        const { data, error: authError } = await supabase.auth.signInWithPassword({ // <-- Zmienna nazywa się 'data'
            email: loginDto.email,
            password: loginDto.password,
        });

        if (authError) {
            throw new UnauthorizedException('Niepoprawny adres e-mail lub hasło.');
        }

        // Upewniamy się, że dane istnieją
        if (!data.session || !data.user) {
            throw new InternalServerErrorException('Błąd podczas logowania.');
        }

        // ✅ POPRAWKA 1: Używamy 'data' zamiast 'sessionData'
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id) // <-- ZMIANA TUTAJ
            .single();

        if (profileError || !profile) {
            throw new InternalServerErrorException('Nie udało się pobrać profilu użytkownika.');
        }

        // ✅ POPRAWKA 2: Używamy 'data' zamiast 'sessionData'
        return { session: data.session, profile: profile }; // <-- ZMIANA TUTAJ
    }
}