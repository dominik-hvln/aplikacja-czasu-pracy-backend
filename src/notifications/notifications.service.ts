import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async getNotifications(userId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async markAsRead(id: string, userId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id)
            .eq('user_id', userId)
            .eq('company_id', companyId);

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }
}
