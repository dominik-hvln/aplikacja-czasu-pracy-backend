import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
}