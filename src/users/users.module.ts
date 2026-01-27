import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [SupabaseModule, SubscriptionModule],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule { }
