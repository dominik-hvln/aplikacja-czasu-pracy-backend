import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DashboardService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async getSummary(companyId: string) {
        const supabase = this.supabaseService.getClient();

        // Wykonujemy trzy zapytania zliczające równolegle
        const [projectsCount, tasksCount, usersCount] = await Promise.all([
            supabase
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId),
            supabase
                .from('tasks')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId),
            supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId),
        ]);

        if (projectsCount.error || tasksCount.error || usersCount.error) {
            console.error('Błąd pobierania podsumowania:', projectsCount.error || tasksCount.error || usersCount.error);
            throw new InternalServerErrorException('Nie udało się pobrać podsumowania.');
        }

        return {
            projects: projectsCount.count,
            tasks: tasksCount.count,
            employees: usersCount.count,
        };
    }
}