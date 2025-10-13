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

@Module({
    imports: [
        // Konfiguruje wczytywanie zmiennych środowiskowych z pliku .env
        // isGlobal: true sprawia, że są one dostępne w całej aplikacji
        ConfigModule.forRoot({ isGlobal: true }),
        SupabaseModule,
        AuthModule,
        ProjectsModule,
        SuperAdminModule,
        TimeEntriesModule,
        UsersModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}