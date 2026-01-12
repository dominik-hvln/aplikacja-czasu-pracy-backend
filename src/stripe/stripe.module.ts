import { Module, Global } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
    imports: [ConfigModule, SupabaseModule],
    providers: [StripeService],
    controllers: [StripeController],
    exports: [StripeService],
})
export class StripeModule { }
