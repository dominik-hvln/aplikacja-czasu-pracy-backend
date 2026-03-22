import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CompanySettingsService } from './company-settings.service';
import { CompanySettingsController } from './company-settings.controller';

@Module({
  imports: [SupabaseModule],
  providers: [CompanySettingsService],
  controllers: [CompanySettingsController]
})
export class CompanySettingsModule {}
