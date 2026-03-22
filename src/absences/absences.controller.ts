import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { CreateAbsenceDto, UpdateAbsenceStatusDto } from './dto/absence.dtos';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('absences')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AbsencesController {
    constructor(private readonly absencesService: AbsencesService) {}

    @Post()
    create(@Req() req, @Body() createDto: CreateAbsenceDto) {
        return this.absencesService.create(req.user.id, req.user.company_id, createDto);
    }

    @Get()
    findAll(@Req() req) {
        // req.user ma {id, role, company_id} 
        return this.absencesService.findAll({ id: req.user.id, role: req.user.role, companyId: req.user.company_id });
    }

    @Patch(':id/status')
    @Roles(Role.Admin, Role.Manager)
    updateStatus(
        @Param('id') id: string,
        @Req() req,
        @Body() updateDto: UpdateAbsenceStatusDto
    ) {
        return this.absencesService.updateStatus(id, { id: req.user.id, role: req.user.role, companyId: req.user.company_id }, updateDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.absencesService.remove(id, { id: req.user.id, role: req.user.role, companyId: req.user.company_id });
    }
}
