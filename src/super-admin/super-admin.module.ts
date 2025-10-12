import { Module } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';
import { SupabaseModule } from '../supabase/supabase.module'; // <-- KROK 1: Importujemy

@Module({
    imports: [SupabaseModule], // <-- KROK 2: Dodajemy do tablicy imports
    controllers: [SuperAdminController],
    providers: [SuperAdminService],
})
export class SuperAdminModule {}