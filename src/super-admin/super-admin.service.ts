import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SuperAdminService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async getAllCompanies() {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('companies').select('*');
        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }
}