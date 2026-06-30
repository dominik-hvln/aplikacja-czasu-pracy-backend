import { Module } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
    imports: [SupabaseModule, SchedulesModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService]
})
export class TimeEntriesModule {}
