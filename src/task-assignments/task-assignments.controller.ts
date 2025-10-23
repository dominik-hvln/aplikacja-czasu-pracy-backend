import { Controller, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { TaskAssignmentsService } from './task-assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';

@Controller('tasks') // Będziemy zagnieżdżać endpointy w '/tasks'
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.Admin, Role.Manager)
export class TaskAssignmentsController {
    constructor(private readonly taskAssignmentsService: TaskAssignmentsService) {}

    @Post(':taskId/assign')
    assign(
        @Param('taskId') taskId: string,
        @Body() createAssignmentDto: CreateAssignmentDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.taskAssignmentsService.assign(taskId, createAssignmentDto.userId, companyId);
    }

    @Delete(':taskId/unassign')
    unassign(
        @Param('taskId') taskId: string,
        @Body() createAssignmentDto: CreateAssignmentDto,
        @Req() req,
    ) {
        const companyId = req.user.company_id;
        return this.taskAssignmentsService.unassign(taskId, createAssignmentDto.userId, companyId);
    }
}