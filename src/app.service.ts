// src/app.service.ts
import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service';

@Injectable()
export class AppService {
    // Wstrzykujemy SupabaseService przez konstruktor
    constructor(private readonly supabaseService: SupabaseService) {}

    // Zmieniamy metodę, aby była asynchroniczna i testowała połączenie
    async testSupabaseConnection(): Promise<any> {
        const supabase = this.supabaseService.getClient();

        // Wykonujemy proste zapytanie: "pobierz pierwszy wiersz z tabeli companies"
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Błąd połączenia z Supabase:', error);
            return {
                message: 'Błąd podczas połączenia z Supabase!',
                error: error.message,
            };
        }

        return { message: 'Połączenie z Supabase działa poprawnie! ✅', data: data };
    }
}