import { Module } from '@nestjs/common';
import { LocationQrCodesController } from './location-qr-codes.controller';
import { LocationQrCodesService } from './location-qr-codes.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
  controllers: [LocationQrCodesController],
  providers: [LocationQrCodesService]
})
export class LocationQrCodesModule {}
