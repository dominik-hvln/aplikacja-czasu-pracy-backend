import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class TaskAssignmentsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async assign(taskId: string, userId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('task_assignments')
            .insert({
                task_id: taskId,
                user_id: userId,
                company_id: companyId,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return { message: 'Pracownik jest już przypisany do tego zlecenia.' };
            }
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async unassign(taskId: string, userId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('task_assignments')
            .delete()
            .eq('task_id', taskId)
            .eq('user_id', userId)
            .eq('company_id', companyId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return { message: 'Pracownik został pomyślnie odpięty od zlecenia.' };
    }

    // ✅ NOWA METODA
    async findAssignmentsForTask(taskId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();

        // Pobieramy listę przypisań wraz z danymi użytkowników
        const { data, error } = await supabase
            .from('task_assignments')
            .select(`
        id,
        user:users ( id, first_name, last_name, email )
      `)
            .eq('task_id', taskId)
            .eq('company_id', companyId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        // Zwracamy listę przypisanych użytkowników
        return data.map(item => ({
            assignment_id: item.id, // ID samego przypisania (do usunięcia)
            ...item.user
        }));
    }
}