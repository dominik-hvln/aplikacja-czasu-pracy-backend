import { Controller, Get, Post, Body, UseGuards, Req, Param, Patch } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { ModuleGuard } from '../auth/module.guard';
import { RequiredModules } from '../auth/modules.decorator';

@Controller('projects')
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequiredModules('projects')
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) { }

    @Post()
    @Roles(Role.Admin, Role.Manager)
    create(@Body() createProjectDto: CreateProjectDto, @Req() req) {
        const companyId = req.user.company_id;
        return this.projectsService.create(createProjectDto, companyId);
    }

    @Get()
    @Roles(Role.Admin, Role.Manager)
    findAll(@Req() req) {
        const companyId = req.user.company_id;
        return this.projectsService.findAllForCompany(companyId);
    }

    @Get(':id')
    @Roles(Role.Admin, Role.Manager)
    findOne(@Param('id') id: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.projectsService.findOne(id, companyId);
    }

    @Patch(':id')
    @Roles(Role.Admin, Role.Manager)
    update(@Param('id') id: string, @Req() req, @Body() updateProjectDto: UpdateProjectDto) {
        const companyId = req.user.company_id;
        return this.projectsService.update(id, companyId, updateProjectDto);
    }

    @Post(':id/qr-code')
    @Roles(Role.Admin, Role.Manager)
    generateQrCode(@Param('id') projectId: string) {
        return this.projectsService.generateQrCode(projectId);
    }
}