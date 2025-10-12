// src/supabase/supabase.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor(private readonly configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseKey = this.configService.get<string>(
            'SUPABASE_SERVICE_ROLE_KEY',
        );

        // ✅ TUTAJ JEST POPRAWKA
        // Sprawdzamy, czy zmienne środowiskowe zostały poprawnie wczytane.
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined');
        }

        // Po powyższym sprawdzeniu, TypeScript już wie, że supabaseUrl i supabaseKey
        // na 100% są typu 'string', więc błąd zniknie.
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    getClient() {
        return this.supabase;
    }
}