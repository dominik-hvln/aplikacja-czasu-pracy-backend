import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('projects')
@UseGuards(AuthGuard('jwt'))
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) {}

    @Post()
    create(@Body() createProjectDto: CreateProjectDto, @Req() req) {
        const companyId = req.user.company_id;
        return this.projectsService.create(createProjectDto, companyId);
    }

    @Get()
    findAll(@Req() req) {
        const companyId = req.user.company_id;
        return this.projectsService.findAllForCompany(companyId);
    }

    @Post(':id/qr-code')
    @Roles(Role.Admin, Role.Manager) // Upewnij się, że masz import Roles i Role
    generateQrCode(@Param('id') projectId: string) {
        return this.projectsService.generateQrCode(projectId);
    }
}