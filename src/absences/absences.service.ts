import { Injectable, InternalServerErrorException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateAbsenceDto, UpdateAbsenceStatusDto } from './dto/absence.dtos';

@Injectable()
export class AbsencesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(userId: string, companyId: string, createAbsenceDto: CreateAbsenceDto) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('absences')
            .insert({
                user_id: userId,
                company_id: companyId,
                type: createAbsenceDto.type,
                start_date: createAbsenceDto.startDate,
                end_date: createAbsenceDto.endDate,
                reason: createAbsenceDto.reason,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async findAll(user: any) {
        const supabase = this.supabaseService.getClient();
        let query = supabase
            .from('absences')
            .select('*')
            .eq('company_id', user.companyId)
            .order('start_date', { ascending: false });

        if (user.role === 'employee') {
            query = query.eq('user_id', user.id);
        }

        const { data: absences, error } = await query;
        if (error) throw new InternalServerErrorException(error.message);

        // Fetch users manually to bypass "Could not find a relationship" Supabase error
        const { data: users } = await supabase
            .from('users')
            .select('id, first_name, last_name, role, manager_id')
            .eq('company_id', user.companyId);

        let mergedData = absences.map(a => {
            const currentU = users?.find(u => u.id === a.user_id);
            const reviewerU = users?.find(u => u.id === a.reviewed_by);
            return {
                ...a,
                user: currentU || null,
                reviewer: reviewerU || null
            };
        });

        // Apply manager filtering
        if (user.role === 'manager') {
            mergedData = mergedData.filter((a: any) => a.user_id === user.id || a.user?.manager_id === user.id);
        }

        return mergedData;
    }

    async updateStatus(id: string, user: any, updateDto: UpdateAbsenceStatusDto) {
        if (user.role === 'employee') {
            throw new ForbiddenException('Brak uprawnień do zmiany statusu');
        }

        const supabase = this.supabaseService.getClient();
        
        // Sprawdź czy użytkownik ma uprawnienia (np. czy to jego pracownik, jeśli jest managerem)
        const { data: absence, error: fetchError } = await supabase
            .from('absences')
            .select('*')
            .eq('id', id)
            .eq('company_id', user.companyId)
            .single();

        if (fetchError || !absence) {
            throw new NotFoundException('Nie znaleziono zgłoszenia');
        }

        const { data: absenceUser } = await supabase
            .from('users')
            .select('manager_id')
            .eq('id', absence.user_id)
            .single();

        if (user.role === 'manager' && absenceUser?.manager_id !== user.id && absence.user_id !== user.id) {
            throw new ForbiddenException('Możesz akceptować tylko wnioski swoich podwładnych');
        }

        const { data, error } = await supabase
            .from('absences')
            .update({
                status: updateDto.status,
                reviewed_by: user.id
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async remove(id: string, user: any) {
        const supabase = this.supabaseService.getClient();
        const { data: absence } = await supabase.from('absences').select('*').eq('id', id).single();
        
        if (!absence || (absence.user_id !== user.id && user.role === 'employee')) {
             throw new ForbiddenException('Nie możesz usunąć tego wniosku');
        }

        const { error } = await supabase.from('absences').delete().eq('id', id);
        if (error) throw new InternalServerErrorException(error.message);
        
        return { success: true };
    }
}
