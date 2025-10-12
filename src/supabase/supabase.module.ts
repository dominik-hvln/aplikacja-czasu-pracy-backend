// src/supabase/supabase.module.ts
import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Module({
    providers: [SupabaseService],
    exports: [SupabaseService], // Eksportujemy serwis, by był dostępny w innych modułach
})
export class SupabaseModule {}