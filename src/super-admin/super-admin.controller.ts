import { Controller, Get, Post, Body, UseGuards, Param } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateSystemUserDto } from './dto/create-user.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { AssignPlanDto } from './dto/assign-plan.dto';
import { ToggleModuleDto } from './dto/toggle-module.dto';

@Controller('super-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SuperAdminController {
    constructor(private readonly superAdminService: SuperAdminService) { }

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

    @Post('companies')
    @Roles(Role.SuperAdmin)
    createCompany(@Body() createCompanyDto: CreateCompanyDto) {
        return this.superAdminService.createCompany(createCompanyDto);
    }

    @Post('users')
    @Roles(Role.SuperAdmin)
    createUser(@Body() createUserDto: CreateSystemUserDto) {
        return this.superAdminService.createUser(createUserDto);
    }

    // --- PLANS ---

    @Get('plans')
    @Roles(Role.SuperAdmin)
    getPlans() {
        return this.superAdminService.getPlans();
    }

    @Post('plans')
    @Roles(Role.SuperAdmin)
    createPlan(@Body() dto: CreatePlanDto) {
        return this.superAdminService.createPlan(dto);
    }

    // --- MODULES ---

    @Get('modules')
    @Roles(Role.SuperAdmin)
    getModules() {
        return this.superAdminService.getModules();
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
}