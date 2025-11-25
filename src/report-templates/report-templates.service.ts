import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReportTemplateDto } from './dto/create-template.dto';

@Injectable()
export class ReportTemplatesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(dto: CreateReportTemplateDto) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('report_templates')
            .insert({
                company_id: dto.companyId,
                name: dto.name,
                description: dto.description,
                fields: dto.fields,
                layout: dto.layout || [], // ✅ ZAPISUJEMY LAYOUT
                style: dto.style || { primaryColor: '#000000', headerText: '' },
            })
            .select()
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async findAllByCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('report_templates')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async findOne(id: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('report_templates')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}