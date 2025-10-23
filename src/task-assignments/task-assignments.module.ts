import { Module } from '@nestjs/common';
import { TaskAssignmentsService } from './task-assignments.service';
import { TaskAssignmentsController } from './task-assignments.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule], // Dodaj ten import
    controllers: [TaskAssignmentsController],
    providers: [TaskAssignmentsService],
})
export class TaskAssignmentsModule {}