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
        const { data: existingCode } = await supabase.from('qr_codes').select('code_value').eq('task_id', taskId).single();
        if (existingCode) return existingCode;
        const { data, error } = await supabase.from('qr_codes').insert({ task_id: taskId }).select('code_value').single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    // Zaktualizowana metoda - teraz używana tylko przez managerów
    async findAllForCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('tasks')
            .select('*, project:projects(name)')
            .eq('company_id', companyId);
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    // NOWA METODA - dla pracownika
    async findMyTasks(userId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();

        // Znajdź wszystkie taski przypisane do tego użytkownika
        const { data, error } = await supabase
            .from('task_assignments')
            .select(`
        task:tasks (
          id,
          name,
          description,
          project:projects ( name )
        )
      `)
            .eq('user_id', userId)
            .eq('company_id', companyId);

        if (error) throw new InternalServerErrorException(error.message);

        // Przekształć odpowiedź, aby była prostą listą zadań
        return data.map(item => item.task);
    }
}