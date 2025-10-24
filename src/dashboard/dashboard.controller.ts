import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.Admin, Role.Manager)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) {}

    @Get('summary')
    getSummary(@Req() req) {
        const companyId = req.user.company_id;
        return this.dashboardService.getSummary(companyId);
    }
}