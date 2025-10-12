import { Controller, Get, UseGuards } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('super-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SuperAdminController {
    constructor(private readonly superAdminService: SuperAdminService) {}

    @Get('companies')
    @Roles(Role.SuperAdmin) // <-- Ten endpoint wymaga roli SuperAdmin
    getAllCompanies() {
        return this.superAdminService.getAllCompanies();
    }
}