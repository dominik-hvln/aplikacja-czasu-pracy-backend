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
            .select(`
                *,
                user:users!absences_user_id_fkey ( id, first_name, last_name, role, manager_id ),
                reviewer:users!absences_reviewed_by_fkey ( id, first_name, last_name )
            `)
            .eq('company_id', user.companyId)
            .order('start_date', { ascending: false });

        if (user.role === 'employee') {
            // Employee sees only their own
            query = query.eq('user_id', user.id);
        } else if (user.role === 'manager') {
            // Manager sees their own AND their reports
            // Supabase requires building an OR query
            // e.g. user_id=eq.{user.id},users.manager_id=eq.{user.id} - but foreign table filtering in OR is tricky.
            // We can fetch all and filter in memory, or use a view, or raw SQL.
            // A simpler approach for now: fetch all for company, then filter in memory for simplicity 
            // since managers likely only see their department/team anyway.
            const { data, error } = await query;
            if (error) throw new InternalServerErrorException(error.message);

            return data.filter((a: any) => a.user_id === user.id || a.user?.manager_id === user.id);
        }

        const { data, error } = await query;
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updateStatus(id: string, user: any, updateDto: UpdateAbsenceStatusDto) {
        if (user.role === 'employee') {
            throw new ForbiddenException('Brak uprawnień do zmiany statusu');
        }

        const supabase = this.supabaseService.getClient();
        
        // Sprawdź czy użytkownik ma uprawnienia (np. czy to jego pracownik, jeśli jest managerem)
        const { data: absence, error: fetchError } = await supabase
            .from('absences')
            .select('*, user:users!absences_user_id_fkey(manager_id)')
            .eq('id', id)
            .eq('company_id', user.companyId)
            .single();

        if (fetchError || !absence) {
            throw new NotFoundException('Nie znaleziono zgłoszenia');
        }

        if (user.role === 'manager' && absence.user?.manager_id !== user.id && absence.user_id !== user.id) {
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
