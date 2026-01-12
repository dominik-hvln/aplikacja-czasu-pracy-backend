import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
    imports: [SupabaseModule, SubscriptionModule],
    controllers: [ProjectsController],
    providers: [ProjectsService],
})
export class ProjectsModule { }