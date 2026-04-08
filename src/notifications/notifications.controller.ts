import { Controller, Get, Put, Param, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    getNotifications(@Req() req) {
        return this.notificationsService.getNotifications(req.user.id, req.user.company_id);
    }

    @Put(':id/read')
    markAsRead(@Param('id') id: string, @Req() req) {
        return this.notificationsService.markAsRead(id, req.user.id, req.user.company_id);
    }
}
