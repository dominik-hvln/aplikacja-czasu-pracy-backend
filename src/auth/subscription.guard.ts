import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionService } from '../subscription/subscription.service';
import { Role } from './roles.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
    constructor(private readonly subscriptionService: SubscriptionService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            return false; // Authentication handled by AuthGuard, but safety check
        }

        // 1. Super Admin bypasses subscription checks
        if (user.role && user.role === Role.SuperAdmin) {
            return true;
        }

        // 2. Check if company is active
        const companyId = user.company_id;
        if (!companyId) {
            // User without company (shouldn't happen for employees)
            return false;
        }

        const isActive = await this.subscriptionService.isCompanyActive(companyId);

        if (!isActive) {
            throw new ForbiddenException('Twoja subskrypcja wygasła lub konto jest nieaktywne.');
        }

        return true;
    }
}
