import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateSystemUserDto } from './dto/create-user.dto';

@Injectable()
export class SuperAdminService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async getAllCompanies() {
        const supabase = this.supabaseService.getClient();
        // Pobieramy wszystkie firmy
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false }); // Najnowsze na górze

        if (error) {
            throw new InternalServerErrorException(`Błąd pobierania firm: ${error.message}`);
        }
        return data;
    }

    async getAllUsers() {
        const supabase = this.supabaseService.getClient();
        // Pobieramy userów. Skoro email jest w tabeli, po prostu go wybieramy.
        // Jeśli masz relację w bazie, możemy też pobrać nazwę firmy: .select('*, companies(name)')
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            throw new InternalServerErrorException(`Błąd pobierania użytkowników: ${error.message}`);
        }
        return data;
    }

    async createCompany(createCompanyDto: CreateCompanyDto) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('companies')
            .insert({ name: createCompanyDto.name })
            .select()
            .single(); // Zwracamy od razu utworzony obiekt

        if (error) {
            throw new InternalServerErrorException(`Błąd tworzenia firmy: ${error.message}`);
        }
        return data;
    }

    async createUser(dto: CreateSystemUserDto) {
        const supabase = this.supabaseService.getClient();
        const adminClient = this.supabaseService.getAdminClient(); // Wymaga Service Role Key

        // 1. Tworzymy użytkownika w Supabase Auth (baza logowania)
        const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
            email: dto.email,
            password: dto.password,
            email_confirm: true, // Od razu potwierdzamy email
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

        // 2. Wstawiamy profil do tabeli public.users
        const { error: dbError } = await supabase
            .from('users')
            .insert({
                id: authUser.user.id, // To samo ID co w Auth!
                email: dto.email,
                first_name: dto.firstName,
                last_name: dto.lastName,
                role: dto.role,
                company_id: dto.companyId || null, // Przypisanie do firmy
            });

        if (dbError) {
            // Opcjonalnie: Tutaj moglibyśmy usunąć konto z Auth, żeby nie śmiecić, ale na start wystarczy rzucić błąd
            console.error('Błąd DB:', dbError);
            throw new InternalServerErrorException(`Użytkownik Auth utworzony, ale błąd profilu: ${dbError.message}`);
        }

        return { message: 'Użytkownik utworzony pomyślnie', userId: authUser.user.id };
    }
}