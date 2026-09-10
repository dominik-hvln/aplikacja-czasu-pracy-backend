import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
    DEFAULT_NIGHT_END,
    DEFAULT_NIGHT_START,
    normalizeTimeStr,
} from '../time-entries/time-entry.utils';

/** "22:00:00" / "22:00" -> "22:00" (format używany przez <input type="time">). */
function toHHmm(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    return normalizeTimeStr(value).substring(0, 5);
}

@Injectable()
export class CompanySettingsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    // WORK NORM SETTINGS (norma dobowa + święta)
    async getWorkSettings(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('companies')
            .select('daily_norm_hours, count_holidays_as_work, schedule_on_holidays, night_start, night_end')
            .eq('id', companyId)
            .maybeSingle();
        if (error) throw new InternalServerErrorException(error.message);
        return {
            daily_norm_hours: Number(data?.daily_norm_hours ?? 8),
            count_holidays_as_work: data?.count_holidays_as_work !== false,
            // Domyślnie false — grafik pomija święta (dotychczasowe zachowanie).
            // Firmy pracujące 365 dni w roku (hotele, gastronomia) włączają tę opcję.
            schedule_on_holidays: data?.schedule_on_holidays === true,
            night_start: toHHmm(data?.night_start, DEFAULT_NIGHT_START),
            night_end: toHHmm(data?.night_end, DEFAULT_NIGHT_END),
        };
    }

    async updateWorkSettings(
        companyId: string,
        dto: {
            daily_norm_hours?: number;
            count_holidays_as_work?: boolean;
            schedule_on_holidays?: boolean;
            night_start?: string;
            night_end?: string;
        },
    ) {
        const updates: any = {};
        if (dto.daily_norm_hours !== undefined) {
            const v = Number(dto.daily_norm_hours);
            if (isNaN(v) || v < 0 || v > 24) {
                throw new InternalServerErrorException('Norma dobowa musi być z zakresu 0–24 godzin.');
            }
            updates.daily_norm_hours = v;
        }
        if (dto.count_holidays_as_work !== undefined) {
            updates.count_holidays_as_work = Boolean(dto.count_holidays_as_work);
        }
        if (dto.schedule_on_holidays !== undefined) {
            updates.schedule_on_holidays = Boolean(dto.schedule_on_holidays);
        }

        const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
        for (const field of ['night_start', 'night_end'] as const) {
            const raw = dto[field];
            if (raw === undefined) continue;
            const value = toHHmm(raw, '');
            if (!timeRe.test(value)) {
                throw new BadRequestException('Pora nocna musi być w formacie GG:MM (np. 22:00).');
            }
            updates[field] = `${value}:00`;
        }

        const current = await this.getWorkSettings(companyId);
        const nextStart = updates.night_start ? updates.night_start.substring(0, 5) : current.night_start;
        const nextEnd = updates.night_end ? updates.night_end.substring(0, 5) : current.night_end;
        if (nextStart === nextEnd) {
            throw new BadRequestException('Początek i koniec pory nocnej nie mogą być takie same.');
        }

        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.from('companies').update(updates).eq('id', companyId);
        if (error) throw new InternalServerErrorException(error.message);
        return this.getWorkSettings(companyId);
    }

    // DEPARTMENTS
    async getDepartments(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('departments').select('*').eq('company_id', companyId).order('name');
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
    
    async createDepartment(companyId: string, name: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('departments').insert({ company_id: companyId, name }).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updateDepartment(companyId: string, id: string, name: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('departments').update({ name }).eq('id', id).eq('company_id', companyId).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async deleteDepartment(companyId: string, id: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.from('departments').delete().eq('id', id).eq('company_id', companyId);
        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    // TEAMS
    async getTeams(companyId: string, departmentId?: string) {
        const supabase = this.supabaseService.getClient();
        let query = supabase.from('teams').select(`*, departments!inner(company_id)`).eq('departments.company_id', companyId).order('name');
        if (departmentId) query = query.eq('department_id', departmentId);
        const { data, error } = await query;
        if (error) throw new InternalServerErrorException(error.message);
        return data.map((team: any) => ({
            id: team.id,
            name: team.name,
            department_id: team.department_id,
            created_at: team.created_at
        }));
    }

    async createTeam(companyId: string, departmentId: string, name: string) {
        const supabase = this.supabaseService.getClient();
        // Verify owner
        const { data: dept } = await supabase.from('departments').select('id').eq('id', departmentId).eq('company_id', companyId).single();
        if (!dept) throw new InternalServerErrorException('Invalid department');

        const { data, error } = await supabase.from('teams').insert({ department_id: departmentId, name }).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updateTeam(companyId: string, id: string, name: string, departmentId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('teams').update({ name, department_id: departmentId }).eq('id', id).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async deleteTeam(companyId: string, id: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.from('teams').delete().eq('id', id);
        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    // FTES
    async getFtes(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('ftes').select('*').eq('company_id', companyId).order('name');
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async createFte(companyId: string, name: string, multiplier: number) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('ftes').insert({ company_id: companyId, name, multiplier }).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updateFte(companyId: string, id: string, name: string, multiplier: number) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase.from('ftes').update({ name, multiplier }).eq('id', id).eq('company_id', companyId).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async deleteFte(companyId: string, id: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase.from('ftes').delete().eq('id', id).eq('company_id', companyId);
        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }
}
