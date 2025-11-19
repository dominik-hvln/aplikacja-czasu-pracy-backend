import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompanyDto } from './dto/create-company.dto';

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
}