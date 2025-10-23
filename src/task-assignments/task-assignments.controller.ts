import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { TaskAssignmentsService } from './task-assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';

@Controller('tasks/:taskId/assignments') // Grupujemy wszystkie endpointy pod zleceniem
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.Admin, Role.Manager)
export class TaskAssignmentsController {
    constructor(private readonly taskAssignmentsService: TaskAssignmentsService) {}

    // ✅ NOWY ENDPOINT: GET /tasks/:taskId/assignments
    @Get()
    findForTask(@Param('taskId') taskId: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.taskAssignmentsService.findAssignmentsForTask(taskId, companyId);
    }

    // ✅ ZAKTUALIZOWANY ENDPOINT: POST /tasks/:taskId/assignments
    @Post()
    assign(
        @Param('taskId') taskId: string,
        @Body() createAssignmentDto: CreateAssignmentDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.taskAssignmentsService.assign(taskId, createAssignmentDto.userId, companyId);
    }

    // ✅ ZAKTUALIZOWANY ENDPOINT: DELETE /tasks/:taskId/assignments
    // Przekazujemy ID pracownika w query param (np. ?userId=...)
    @Delete()
    unassign(
        @Param('taskId') taskId: string,
        @Query('userId') userId: string,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.taskAssignmentsService.unassign(taskId, userId, companyId);
    }
}