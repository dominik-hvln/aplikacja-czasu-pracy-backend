import { Controller, Get, Post, Body, UseGuards, Query, Put, Delete, Param } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateSystemUserDto } from './dto/create-user.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { AssignPlanDto } from './dto/assign-plan.dto';
import { ToggleModuleDto } from './dto/toggle-module.dto';

@Controller('super-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SuperAdminController {
    constructor(private readonly superAdminService: SuperAdminService) { }

    @Get('stats')
    @Roles(Role.SuperAdmin)
    getStats() {
        return this.superAdminService.getStats();
    }

    @Get('companies')
    @Roles(Role.SuperAdmin)
    getAllCompanies() {
        return this.superAdminService.getAllCompanies();
    }

    @Get('companies/:id')
    @Roles(Role.SuperAdmin)
    getCompany(@Param('id') id: string) {
        return this.superAdminService.getCompany(id);
    }

    @Get('users')
    @Roles(Role.SuperAdmin)
    getAllUsers() {
        return this.superAdminService.getAllUsers();
    }

    @Post('users/:id/status')
    @Roles(Role.SuperAdmin)
    setUserActive(@Param('id') id: string, @Body() body: { active: boolean }) {
        return this.superAdminService.setUserActive(id, body.active);
    }

    @Post('users/:id/reset-password')
    @Roles(Role.SuperAdmin)
    resetUserPassword(@Param('id') id: string) {
        return this.superAdminService.resetUserPassword(id);
    }

    @Get('subscriptions')
    @Roles(Role.SuperAdmin)
    getAllSubscriptions() {
        return this.superAdminService.getAllSubscriptions();
    }

    @Post('companies')
    @Roles(Role.SuperAdmin)
    createCompany(@Body() createCompanyDto: CreateCompanyDto) {
        return this.superAdminService.createCompany(createCompanyDto);
    }

    @Delete('companies/:id')
    @Roles(Role.SuperAdmin)
    deleteCompany(@Param('id') id: string) {
        return this.superAdminService.deleteCompany(id);
    }

    @Post('users')
    @Roles(Role.SuperAdmin)
    createUser(@Body() createUserDto: CreateSystemUserDto) {
        return this.superAdminService.createUser(createUserDto);
    }

    // --- APP SETTINGS ---

    @Get('settings')
    @Roles(Role.SuperAdmin)
    getSettings() {
        return this.superAdminService.getAppSettings();
    }

    @Put('settings')
    @Roles(Role.SuperAdmin)
    updateSetting(@Body() body: { key: string; value: string | null }) {
        return this.superAdminService.updateAppSetting(body.key, body.value);
    }

    // --- PLANS ---

    @Get('plans')
    @Roles(Role.SuperAdmin)
    getPlans() {
        return this.superAdminService.getPlans();
    }

    @Post('plans')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(Role.SuperAdmin)
    async createPlan(@Body() dto: CreatePlanDto) {
        return this.superAdminService.createPlan(dto);
    }

    @Put('plans/:id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(Role.SuperAdmin)
    async updatePlan(@Param('id') id: string, @Body() dto: Partial<CreatePlanDto>) {
        return this.superAdminService.updatePlan(id, dto);
    }

    @Delete('plans/:id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(Role.SuperAdmin)
    async deletePlan(@Param('id') id: string) {
        return this.superAdminService.deletePlan(id);
    }

    // --- MODULES ---

    @Get('modules')
    @UseGuards(AuthGuard('jwt'))
    async getModules() {
        return this.superAdminService.getModules();
    }

    @Post('modules')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(Role.SuperAdmin)
    async createModule(@Body() dto: CreateModuleDto) {
        return this.superAdminService.createModule(dto);
    }

    @Put('modules/:code')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(Role.SuperAdmin)
    async updateModule(@Param('code') code: string, @Body() dto: Partial<CreateModuleDto>) {
        return this.superAdminService.updateModule(code, dto);
    }

    @Delete('modules/:code')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(Role.SuperAdmin)
    async deleteModule(@Param('code') code: string) {
        return this.superAdminService.deleteModule(code);
    }

    // --- ASSIGNMENTS ---

    @Post('companies/:id/plan')
    @Roles(Role.SuperAdmin)
    assignPlan(@Param('id') id: string, @Body() dto: AssignPlanDto) {
        return this.superAdminService.assignPlanToCompany(id, dto.planId);
    }

    @Post('companies/:id/module')
    @Roles(Role.SuperAdmin)
    toggleModule(@Param('id') id: string, @Body() dto: ToggleModuleDto) {
        return this.superAdminService.toggleModuleForCompany(id, dto.moduleCode, dto.isEnabled);
    }

    @Post('companies/:id/activate-transfer')
    @Roles(Role.SuperAdmin)
    activateTransfer(@Param('id') id: string, @Body() body: { periodDays?: number }) {
        return this.superAdminService.activateTransferSubscription(id, body?.periodDays);
    }

    // --- PLAN MODULES ---

    @Get('plans/:id/modules')
    @Roles(Role.SuperAdmin)
    getPlanModules(@Param('id') id: string) {
        return this.superAdminService.getPlanModules(id);
    }

    @Put('plans/:id/modules')
    @Roles(Role.SuperAdmin)
    setPlanModules(@Param('id') id: string, @Body() dto: { moduleCodes: string[] }) {
        return this.superAdminService.setPlanModules(id, dto.moduleCodes);
    }
}