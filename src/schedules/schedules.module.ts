import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    controllers: [SchedulesController],
    providers: [SchedulesService],
    exports: [SchedulesService]
})
export class SchedulesModule {}
