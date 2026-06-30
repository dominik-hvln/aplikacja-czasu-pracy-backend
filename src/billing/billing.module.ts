import { Module, Global } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
    imports: [SupabaseModule],
    providers: [BillingService],
    controllers: [BillingController],
    exports: [BillingService],
})
export class BillingModule {}
