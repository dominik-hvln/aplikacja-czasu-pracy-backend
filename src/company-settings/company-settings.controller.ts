import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('company-settings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CompanySettingsController {
  constructor(private readonly companySettingsService: CompanySettingsService) {}

  // DEPARTMENTS
  @Get('departments')
  @Roles(Role.Admin, Role.Manager, Role.Employee)
  getDepartments(@Req() req) {
    return this.companySettingsService.getDepartments(req.user.company_id);
  }

  @Post('departments')
  @Roles(Role.Admin)
  createDepartment(@Req() req, @Body() body: { name: string }) {
    return this.companySettingsService.createDepartment(req.user.company_id, body.name);
  }

  @Patch('departments/:id')
  @Roles(Role.Admin)
  updateDepartment(@Req() req, @Param('id') id: string, @Body() body: { name: string }) {
    return this.companySettingsService.updateDepartment(req.user.company_id, id, body.name);
  }

  @Delete('departments/:id')
  @Roles(Role.Admin)
  deleteDepartment(@Req() req, @Param('id') id: string) {
    return this.companySettingsService.deleteDepartment(req.user.company_id, id);
  }

  // TEAMS
  @Get('teams')
  @Roles(Role.Admin, Role.Manager, Role.Employee)
  getTeams(@Req() req) {
    return this.companySettingsService.getTeams(req.user.company_id);
  }

  @Post('teams')
  @Roles(Role.Admin)
  createTeam(@Req() req, @Body() body: { name: string, departmentId: string }) {
    return this.companySettingsService.createTeam(req.user.company_id, body.departmentId, body.name);
  }

  @Patch('teams/:id')
  @Roles(Role.Admin)
  updateTeam(@Req() req, @Param('id') id: string, @Body() body: { name: string, departmentId: string }) {
    return this.companySettingsService.updateTeam(req.user.company_id, id, body.name, body.departmentId);
  }

  @Delete('teams/:id')
  @Roles(Role.Admin)
  deleteTeam(@Req() req, @Param('id') id: string) {
    return this.companySettingsService.deleteTeam(req.user.company_id, id);
  }

  // FTES
  @Get('ftes')
  @Roles(Role.Admin, Role.Manager, Role.Employee)
  getFtes(@Req() req) {
    return this.companySettingsService.getFtes(req.user.company_id);
  }

  @Post('ftes')
  @Roles(Role.Admin)
  createFte(@Req() req, @Body() body: { name: string, multiplier: number }) {
    return this.companySettingsService.createFte(req.user.company_id, body.name, body.multiplier);
  }

  @Patch('ftes/:id')
  @Roles(Role.Admin)
  updateFte(@Req() req, @Param('id') id: string, @Body() body: { name: string, multiplier: number }) {
    return this.companySettingsService.updateFte(req.user.company_id, id, body.name, body.multiplier);
  }

  @Delete('ftes/:id')
  @Roles(Role.Admin)
  deleteFte(@Req() req, @Param('id') id: string) {
    return this.companySettingsService.deleteFte(req.user.company_id, id);
  }
}
