import { Module } from '@nestjs/common';
import { ReportTemplatesService } from './report-templates.service';
import { ReportTemplatesController } from './report-templates.controller';
import { SupabaseModule } from '../supabase/supabase.module'; //

@Module({
    imports: [SupabaseModule], // Importujemy, bo Service korzysta z SupabaseService
    controllers: [ReportTemplatesController],
    providers: [ReportTemplatesService],
    exports: [ReportTemplatesService], // Eksportujemy, jeśli inny moduł będzie go potrzebował
})
export class ReportTemplatesModule {}