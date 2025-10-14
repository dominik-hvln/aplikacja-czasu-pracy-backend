import {Controller, Post, Body, UseGuards, Req, Get, Query, Patch, Param, Delete} from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { AuthGuard } from '@nestjs/passport';
import {Role, Roles} from "../auth/roles.decorator";
import {UpdateTimeEntryDto} from "./dto/update-time-entry.dto";

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

    @Patch(':id')
    @Roles(Role.Admin, Role.Manager)
    update(
        @Param('id') entryId: string,
        @Body() updateTimeEntryDto: UpdateTimeEntryDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        const editorId = req.user.id;
        return this.timeEntriesService.update(entryId, companyId, updateTimeEntryDto, editorId);
    }

    @Delete(':id')
    @Roles(Role.Admin, Role.Manager)
    remove(@Param('id') entryId: string, @Req() req, @Body() body: { reason?: string }) {
        const companyId = req.user.company_id;
        const editorId = req.user.id;
        return this.timeEntriesService.remove(entryId, companyId, editorId, body?.reason);
    }

    @Get(':id/audit-logs')
    @Roles(Role.Admin, Role.Manager)
    getAuditLogs(@Param('id') entryId: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.timeEntriesService.getAuditLogs(entryId, companyId);
    }
}