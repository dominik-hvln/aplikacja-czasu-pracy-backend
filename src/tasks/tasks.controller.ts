import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('tasks') // Zmieniamy główny kontroler na '/tasks'
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TasksController {
    constructor(private readonly tasksService: TasksService) {}

    // Endpoint do pobierania wszystkich tasków w firmie (dla aplikacji mobilnej)
    @Get()
    @Roles(Role.Employee, Role.Manager, Role.Admin) // Dostępny dla wszystkich zalogowanych
    findAllForCompany(@Req() req) {
        const companyId = req.user.company_id;
        return this.tasksService.findAllForCompany(companyId);
    }

    // Pozostałe endpointy z zagnieżdżonym URL
    @Post('/in-project/:projectId') // Zmieniamy ścieżkę, aby uniknąć konfliktu
    @Roles(Role.Admin, Role.Manager)
    create(
        @Param('projectId') projectId: string,
        @Body() createTaskDto: CreateTaskDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.tasksService.create(createTaskDto, projectId, companyId);
    }

    @Get('/in-project/:projectId') // Zmieniamy ścieżkę
    @Roles(Role.Admin, Role.Manager)
    findAllInProject(@Param('projectId') projectId: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.tasksService.findAllForProject(projectId, companyId);
    }

    @Post('/in-project/:projectId/:taskId/qr-code') // Zmieniamy ścieżkę
    @Roles(Role.Admin, Role.Manager)
    generateQrCode(@Param('taskId') taskId: string) {
        return this.tasksService.generateQrCode(taskId);
    }
}