import { Controller, Post, Body, UseGuards, Req, Param, Get } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('projects/:projectId/tasks') // Zagnieżdżony URL
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.Admin, Role.Manager)
export class TasksController {
    constructor(private readonly tasksService: TasksService) {}

    @Post()
    create(
        @Param('projectId') projectId: string,
        @Body() createTaskDto: CreateTaskDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.tasksService.create(createTaskDto, projectId, companyId);
    }

    @Get()
    findAll(@Param('projectId') projectId: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.tasksService.findAllForProject(projectId, companyId);
    }
}