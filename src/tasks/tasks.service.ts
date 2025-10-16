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

    async findAllForProject(projectId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', projectId)
            .eq('company_id', companyId);
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async generateQrCode(taskId: string) {
        const supabase = this.supabaseService.getClient();
        // Sprawdzamy, czy kod już istnieje
        const { data: existingCode } = await supabase
            .from('qr_codes').select('code_value').eq('task_id', taskId).single();

        if (existingCode) return existingCode;

        // Jeśli nie, tworzymy nowy
        const { data, error } = await supabase
            .from('qr_codes').insert({ task_id: taskId }).select('code_value').single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async findAllForCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('tasks')
            .select('*, project:projects(name)') // Pobieramy od razu nazwę projektu
            .eq('company_id', companyId);
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}