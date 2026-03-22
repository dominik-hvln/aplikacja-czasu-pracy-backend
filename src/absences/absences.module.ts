import { Module } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { AbsencesController } from './absences.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    controllers: [AbsencesController],
    providers: [AbsencesService],
})
export class AbsencesModule {}
