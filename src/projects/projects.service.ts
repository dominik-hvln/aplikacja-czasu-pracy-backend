import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

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

    async findOne(id: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .eq('company_id', companyId)
            .single();
        if (error) throw new NotFoundException(`Project with ID ${id} not found.`);
        return data;
    }

    async update(id: string, companyId: string, updateProjectDto: UpdateProjectDto) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('projects')
            .update(updateProjectDto)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .single();
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async generateQrCode(projectId: string) {
        const supabase = this.supabaseService.getClient();
        const { data: existingCode, error: findError } = await supabase
            .from('qr_codes')
            .select('code_value')
            .eq('project_id', projectId)
            .single();

        if (existingCode) {
            return existingCode;
        }

        if (findError && findError.code !== 'PGRST116') {
            throw new InternalServerErrorException(findError.message);
        }

        const { data, error } = await supabase
            .from('qr_codes')
            .insert({ project_id: projectId })
            .select('code_value')
            .single();

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }
}