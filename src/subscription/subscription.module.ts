import { Module, Global } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
    imports: [SupabaseModule],
    providers: [SubscriptionService],
    controllers: [SubscriptionController],
    exports: [SubscriptionService],
})
export class SubscriptionModule { }
