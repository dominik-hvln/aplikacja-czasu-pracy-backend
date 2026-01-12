import { Module, Global } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

@Global() // Make it global so Guards can use it easily without imports in every module
@Module({
    providers: [SubscriptionService],
    controllers: [SubscriptionController],
    exports: [SubscriptionService],
})
export class SubscriptionModule { }
