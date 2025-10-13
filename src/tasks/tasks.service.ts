import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TasksService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(createTaskDto: CreateTaskDto, projectId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('tasks')
            .insert({ ...createTaskDto, project_id: projectId, company_id: companyId })
            .select()
            .single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}