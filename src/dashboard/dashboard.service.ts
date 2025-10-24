import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DashboardService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async getSummary(companyId: string) {
        const supabase = this.supabaseService.getClient();

        // Wykonujemy wszystkie zapytania równolegle dla maksymalnej wydajności
        const [projectsCount, tasksCount, usersCount, recentTasks] = await Promise.all([
            // Zliczanie projektów
            supabase
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId),
            // Zliczanie zleceń
            supabase
                .from('tasks')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId),
            // Zliczanie użytkowników
            supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId),
            // Pobieranie 3 ostatnich zleceń
            supabase
                .from('tasks')
                .select('id, name, created_at, project:projects ( name )')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(3),
        ]);

        // Sprawdzamy błędy
        const errors = [projectsCount.error, tasksCount.error, usersCount.error, recentTasks.error].filter(Boolean);
        if (errors.length > 0) {
            console.error('Błąd pobierania podsumowania dashboardu:', errors);
            throw new InternalServerErrorException('Nie udało się pobrać podsumowania.');
        }

        return {
            projects: projectsCount.count,
            tasks: tasksCount.count,
            employees: usersCount.count,
            recentTasks: recentTasks.data, // Dodajemy ostatnie zlecenia do odpowiedzi
        };
    }
}