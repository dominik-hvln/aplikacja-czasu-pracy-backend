import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { AuthGuard } from '@nestjs/passport';

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
}