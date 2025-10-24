import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ActivityService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async getActivityFeed(companyId: string) {
        const supabase = this.supabaseService.getClient();

        // Wywołujemy naszą nową funkcję z bazy danych
        const { data, error } = await supabase.rpc('get_company_activity_feed', {
            p_company_id: companyId,
        });

        if (error) {
            console.error('Błąd podczas wywoływania get_company_activity_feed:', error);
            throw new InternalServerErrorException(error.message);
        }

        return data;
    }
}