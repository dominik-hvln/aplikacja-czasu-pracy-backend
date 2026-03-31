import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { GenerateScheduleDto, UpdateScheduleDto, UpdateSettingsDto, CreateShiftRequestDto, UpdateShiftRequestStatusDto } from './dto/schedule.dtos';

@Controller('schedules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SchedulesController {
    constructor(private readonly schedulesService: SchedulesService) {}

    // --- Settings ---
    @Get('settings')
    @Roles(Role.Admin, Role.Manager)
    getSettings(@Req() req) {
        return this.schedulesService.getSettings(req.user.company_id);
    }

    @Put('settings')
    @Roles(Role.Admin, Role.Manager)
    updateSettings(@Req() req, @Body() updateDto: UpdateSettingsDto) {
        return this.schedulesService.updateSettings(req.user.company_id, updateDto);
    }

    // --- Schedules ---
    @Get()
    getSchedules(@Req() req, @Query('month') month: number, @Query('year') year: number) {
        return this.schedulesService.getSchedules({ 
            userId: req.user.id, 
            role: req.user.role, 
            companyId: req.user.company_id 
        }, month, year);
    }

    @Post('generate')
    @Roles(Role.Admin, Role.Manager)
    generateSchedule(@Req() req, @Body() generateDto: GenerateScheduleDto) {
        return this.schedulesService.generateSchedule(req.user.company_id, generateDto.month, generateDto.year);
    }

    @Put(':id')
    @Roles(Role.Admin, Role.Manager)
    updateSchedule(@Param('id') id: string, @Req() req, @Body() updateDto: UpdateScheduleDto) {
        return this.schedulesService.updateSchedule(id, req.user.company_id, updateDto);
    }

    @Delete(':id')
    @Roles(Role.Admin, Role.Manager)
    deleteSchedule(@Param('id') id: string, @Req() req) {
        return this.schedulesService.deleteSchedule(id, req.user.company_id);
    }

    // --- Shift Requests ---
    @Post('requests')
    createShiftRequest(@Req() req, @Body() createDto: CreateShiftRequestDto) {
        return this.schedulesService.createShiftRequest(req.user.id, req.user.company_id, createDto);
    }

    @Get('requests')
    getShiftRequests(@Req() req) {
        return this.schedulesService.getShiftRequests({ 
            userId: req.user.id, 
            role: req.user.role, 
            companyId: req.user.company_id 
        });
    }

    @Put('requests/:id/status')
    @Roles(Role.Admin, Role.Manager)
    updateShiftRequestStatus(@Param('id') id: string, @Req() req, @Body() updateDto: UpdateShiftRequestStatusDto) {
        return this.schedulesService.updateShiftRequestStatus(id, req.user.company_id, updateDto.status);
    }
}
