import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('activity')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.Admin, Role.Manager) // Dostępne tylko dla managerów
export class ActivityController {
    constructor(private readonly activityService: ActivityService) {}

    @Get('feed')
    getActivityFeed(@Req() req) {
        const companyId = req.user.company_id;
        return this.activityService.getActivityFeed(companyId);
    }
}