import { Module, Global } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Global()
@Module({
    imports: [ConfigModule, SupabaseModule, SubscriptionModule],
    providers: [StripeService],
    controllers: [StripeController],
    exports: [StripeService],
})
export class StripeModule { }
