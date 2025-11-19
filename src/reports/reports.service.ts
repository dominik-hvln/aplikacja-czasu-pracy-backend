import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(userId: string, dto: CreateReportDto) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('reports')
            .insert({
                company_id: dto.companyId,
                template_id: dto.templateId,
                user_id: userId,
                // task_id: dto.taskId, // Odkomentuj, jeśli masz kolumnę task_id
                title: dto.title,
                answers: dto.answers,
            })
            .select()
            .single();

        if (error) throw new InternalServerErrorException(`Błąd zapisu raportu: ${error.message}`);
        return data;
    }

    async findAllByCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
        // Pobieramy raporty wraz z nazwą szablonu i autora (relacje)
        const { data, error } = await supabase
            .from('reports')
            .select(`
                *,
                report_templates (name),
                users (first_name, last_name)
            `)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async findOne(id: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('reports')
            .select(`*, report_templates(fields)`) // Pobieramy też definicję pól, żeby wiedzieć jak wyświetlić odpowiedzi
            .eq('id', id)
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}