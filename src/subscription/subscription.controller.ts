import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionController {
    constructor(private readonly subscriptionService: SubscriptionService) { }

    @Get('status')
    async getStatus(@Request() req: any) {
        const user = req.user;
        const isActive = await this.subscriptionService.isCompanyActive(user.company_id);

        // Also fetch active modules
        // This logic could be expanded to return full subscription details
        return {
            active: isActive,
            companyId: user.company_id
        };
    }
}
