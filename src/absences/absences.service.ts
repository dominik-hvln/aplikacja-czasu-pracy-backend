import { Injectable, InternalServerErrorException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateAbsenceDto, UpdateAbsenceStatusDto, UpdateAbsenceDatesDto } from './dto/absence.dtos';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class AbsencesService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly schedulesService: SchedulesService,
    ) {}

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

        const { data: changes } = await supabase
            .from('absence_date_changes')
            .select('*')
            .eq('company_id', user.companyId)
            .order('created_at', { ascending: true });

        let mergedData = absences.map(a => {
            const currentU = users?.find(u => u.id === a.user_id);
            const reviewerU = users?.find(u => u.id === a.reviewed_by);
            return {
                ...a,
                user: currentU || null,
                reviewer: reviewerU || null,
                date_changes: (changes || [])
                    .filter(c => c.absence_id === a.id)
                    .map(c => ({ ...c, changer: users?.find(u => u.id === c.changed_by) || null })),
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

        const reviewedAt = new Date().toISOString();
        const { data, error } = await supabase
            .from('absences')
            .update({
                status: updateDto.status,
                reviewed_by: user.id,
                reviewed_at: updateDto.status === 'approved' ? reviewedAt : null,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new InternalServerErrorException(error.message);

        if (updateDto.status === 'approved') {
            await this.schedulesService.applyApprovedAbsence(user.companyId, {
                user_id: data.user_id,
                type: data.type,
                start_date: data.start_date,
                end_date: data.end_date,
                reviewed_at: reviewedAt,
            });
        } else if (absence.status === 'approved') {
            // Wycofanie wcześniej zaakceptowanego wniosku — grafik wraca do zaplanowanych zmian.
            await this.schedulesService.revertAbsence(user.companyId, data);
        }

        return data;
    }

    /** Admin ręcznie zmienia termin zaakceptowanego urlopu; grafik jest przeliczany na nowy zakres. */
    async updateDates(id: string, companyId: string, adminId: string, dto: UpdateAbsenceDatesDto) {
        if (dto.endDate < dto.startDate) {
            throw new BadRequestException('Data końcowa nie może być przed początkową.');
        }

        const supabase = this.supabaseService.getClient();
        const { data: absence } = await supabase
            .from('absences')
            .select('*')
            .eq('id', id)
            .eq('company_id', companyId)
            .maybeSingle();

        if (!absence) throw new NotFoundException('Nie znaleziono zgłoszenia');
        if (absence.status !== 'approved') {
            throw new BadRequestException('Termin można zmienić tylko w zaakceptowanym wniosku');
        }

        const { data, error } = await supabase
            .from('absences')
            .update({ start_date: dto.startDate, end_date: dto.endDate })
            .eq('id', id)
            .select()
            .single();
        if (error) throw new InternalServerErrorException(error.message);

        const { error: logError } = await supabase.from('absence_date_changes').insert({
            absence_id: id,
            company_id: companyId,
            changed_by: adminId,
            old_start_date: absence.start_date,
            old_end_date: absence.end_date,
            new_start_date: dto.startDate,
            new_end_date: dto.endDate,
        });
        if (logError) throw new InternalServerErrorException(logError.message);

        // Stary zakres wraca do „zaplanowana", nowy zostaje oznaczony jako nieobecność.
        await this.schedulesService.revertAbsence(companyId, absence);
        await this.schedulesService.applyApprovedAbsence(companyId, {
            user_id: data.user_id,
            type: data.type,
            start_date: data.start_date,
            end_date: data.end_date,
            reviewed_at: data.reviewed_at,
        });

        return data;
    }

    async remove(id: string, user: any) {
        const supabase = this.supabaseService.getClient();
        const { data: absence } = await supabase
            .from('absences')
            .select('*')
            .eq('id', id)
            .eq('company_id', user.companyId)
            .maybeSingle();

        if (!absence) {
            throw new NotFoundException('Nie znaleziono zgłoszenia');
        }

        if (user.role === 'employee') {
            // Pracownik może wycofać tylko własny, jeszcze nierozpatrzony wniosek.
            if (absence.user_id !== user.id || absence.status !== 'pending') {
                throw new ForbiddenException('Możesz anulować tylko własny wniosek oczekujący na akceptację');
            }
        }

        const { error } = await supabase
            .from('absences')
            .delete()
            .eq('id', id)
            .eq('company_id', user.companyId);
        if (error) throw new InternalServerErrorException(error.message);

        // Zaakceptowany wniosek zdążył już oznaczyć pozycje grafiku jako urlop -
        // po jego usunięciu muszą wrócić do zwykłej zmiany.
        if (absence.status === 'approved') {
            await this.schedulesService.revertAbsence(user.companyId, absence);
        }

        return { success: true };
    }
}
