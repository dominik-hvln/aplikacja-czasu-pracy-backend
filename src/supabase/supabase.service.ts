import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
    private supabase: SupabaseClient;
    private supabaseAdmin: SupabaseClient;

    constructor(private readonly configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');

        // 1. Klient publiczny (do większości operacji)
        const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY must be defined');
        }
        this.supabase = createClient(supabaseUrl, supabaseKey);

        // 2. Klient admina (do zadań specjalnych)
        const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        if (!serviceRoleKey) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY must be defined');
        }
        this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    }

    /**
     * Zwraca standardowego klienta (z kluczem 'anon').
     */
    getClient(): SupabaseClient {
        return this.supabase;
    }

    /**
     * Zwraca klienta z uprawnieniami admina (z kluczem 'service_role').
     * Używaj tylko wtedy, gdy jest to absolutnie konieczne.
     */
    getAdminClient(): SupabaseClient {
        return this.supabaseAdmin;
    }
}