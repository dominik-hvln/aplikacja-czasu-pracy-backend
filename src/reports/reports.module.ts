import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PdfService } from './pdf.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [SupabaseModule, ConfigModule],
    controllers: [ReportsController],
    providers: [ReportsService, PdfService],
})
export class ReportsModule {}