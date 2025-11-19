import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { LocationQrCodesModule } from './location-qr-codes/location-qr-codes.module';
import { TaskAssignmentsModule } from './task-assignments/task-assignments.module';
import { ActivityModule } from './activity/activity.module';
import { DashboardModule } from './dashboard/dashboard.module';
import {ReportTemplatesModule} from "./report-templates/report-templates.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        SupabaseModule,
        AuthModule,
        ProjectsModule,
        SuperAdminModule,
        TimeEntriesModule,
        UsersModule,
        TasksModule,
        LocationQrCodesModule,
        TaskAssignmentsModule,
        ActivityModule,
        DashboardModule,
        ReportTemplatesModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}