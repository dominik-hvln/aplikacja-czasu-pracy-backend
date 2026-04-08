import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { GenerateScheduleDto, UpdateScheduleDto, UpdateSettingsDto, CreateShiftRequestDto, UpdateShiftRequestStatusDto, CreateScheduleDto } from './dto/schedule.dtos';

@Controller('schedules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SchedulesController {
    constructor(private readonly schedulesService: SchedulesService) {}

    // --- Settings ---
    @Get('settings')
    @Roles(Role.Admin, Role.Manager)
    getSettings(@Req() req, @Query('departmentId') departmentId: string) {
        if (!departmentId) return null;
        return this.schedulesService.getSettings(req.user.company_id, departmentId);
    }

    @Put('settings')
    @Roles(Role.Admin, Role.Manager)
    updateSettings(@Req() req, @Query('departmentId') departmentId: string, @Body() updateDto: UpdateSettingsDto) {
        if (!departmentId) throw new Error("Department ID required");
        return this.schedulesService.updateSettings(req.user.company_id, departmentId, updateDto);
    }

    // --- Schedules ---
    @Get()
    getSchedules(@Req() req, @Query('month') month: number, @Query('year') year: number, @Query('departmentId') departmentId?: string) {
        return this.schedulesService.getSchedules({ 
            userId: req.user.id, 
            role: req.user.role, 
            companyId: req.user.company_id 
        }, month, year, departmentId);
    }

    @Post()
    @Roles(Role.Admin, Role.Manager)
    createSchedule(@Req() req, @Body() createDto: CreateScheduleDto) {
        return this.schedulesService.createSchedule(req.user.company_id, createDto);
    }

    @Post('generate')
    @Roles(Role.Admin, Role.Manager)
    generateSchedule(@Req() req, @Body() generateDto: GenerateScheduleDto) {
        return this.schedulesService.generateSchedule(req.user.company_id, generateDto.department_id, generateDto.month, generateDto.year);
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

    // --- Holidays ---
    @Get('holidays')
    getHolidays(@Req() req, @Query('departmentId') departmentId: string, @Query('month') month: number, @Query('year') year: number) {
        return this.schedulesService.getMergedHolidays(req.user.company_id, departmentId, year, month);
    }

    @Post('company-holidays')
    @Roles(Role.Admin, Role.Manager)
    createCompanyHoliday(@Req() req, @Body() payload: { department_id?: string, date: string, name: string }) {
        return this.schedulesService.createCompanyHoliday(req.user.company_id, payload);
    }

    @Delete('company-holidays/:id')
    @Roles(Role.Admin, Role.Manager)
    deleteCompanyHoliday(@Req() req, @Param('id') id: string) {
        return this.schedulesService.deleteCompanyHoliday(req.user.company_id, id);
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
