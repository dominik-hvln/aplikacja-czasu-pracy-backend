import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CompanySettingsService {
    constructor(private readonly supabaseService: SupabaseService) {}

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
