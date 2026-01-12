import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { ModuleGuard } from '../auth/module.guard';
import { RequiredModules } from '../auth/modules.decorator';

@Controller('tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequiredModules('tasks')
export class TasksController {
    constructor(private readonly tasksService: TasksService) { }

    // Endpoint dla managera/admina - pobiera WSZYSTKIE taski
    @Get()
    @Roles(Role.Admin, Role.Manager)
    findAllForCompany(@Req() req) {
        const companyId = req.user.company_id;
        return this.tasksService.findAllForCompany(companyId);
    }

    // NOWY Endpoint dla pracownika - pobiera TYLKO PRZYPISANE taski
    @Get('my')
    @Roles(Role.Employee, Role.Admin, Role.Manager)
    findMyTasks(@Req() req) {
        const { id: userId, company_id: companyId } = req.user;
        return this.tasksService.findMyTasks(userId, companyId);
    }

    // Endpointy do zarządzania wewnątrz projektu
    @Post('/in-project/:projectId')
    @Roles(Role.Admin, Role.Manager)
    create(
        @Param('projectId') projectId: string,
        @Body() createTaskDto: CreateTaskDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.tasksService.create(createTaskDto, projectId, companyId);
    }

    @Get('/in-project/:projectId')
    @Roles(Role.Admin, Role.Manager)
    findAllInProject(@Param('projectId') projectId: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.tasksService.findAllForProject(projectId, companyId);
    }

    @Post('/in-project/:projectId/:taskId/qr-code')
    @Roles(Role.Admin, Role.Manager)
    generateQrCode(@Param('taskId') taskId: string) {
        return this.tasksService.generateQrCode(taskId);
    }
}