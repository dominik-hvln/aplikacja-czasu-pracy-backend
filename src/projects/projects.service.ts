import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(createProjectDto: CreateProjectDto, companyId: string) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('projects')
            .insert({ ...createProjectDto, company_id: companyId })
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async findAllForCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('company_id', companyId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }
}