import { Module } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { AbsencesController } from './absences.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
    imports: [SupabaseModule, SchedulesModule],
    controllers: [AbsencesController],
    providers: [AbsencesService],
})
export class AbsencesModule {}
