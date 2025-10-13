import {Controller, Post, Body, UseGuards, Req, Get, Query} from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { AuthGuard } from '@nestjs/passport';
import {Role, Roles} from "../auth/roles.decorator";

@Controller('time-entries')
@UseGuards(AuthGuard('jwt'))
export class TimeEntriesController {
    constructor(private readonly timeEntriesService: TimeEntriesService) {}

    @Post('scan')
    handleScan(@Body() body: { qrCodeValue: string, location?: { latitude: number, longitude: number }, timestamp?: string }, @Req() req) {
        const userId = req.user.id;
        const companyId = req.user.company_id;
        return this.timeEntriesService.handleScan(userId, companyId, body.qrCodeValue, body.location, body.timestamp);
    }

    @Get()
    @Roles(Role.Admin, Role.Manager)
    findAll(
        @Req() req,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('userId') userId?: string,
    ) {
        const companyId = req.user.company_id;
        return this.timeEntriesService.findAllForCompany(companyId, {
            dateFrom,
            dateTo,
            userId,
        });
    }
}