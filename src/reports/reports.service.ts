import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReportDto } from './dto/create-report.dto';
import { PdfService } from './pdf.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReportsService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly pdfService: PdfService,
        private readonly config: ConfigService, // Do pobrania kluczy Resend
    ) {}

    // Metoda pomocnicza do wysyłki maila (kopia logiki z auth.service.ts, żeby nie psuć Auth)
    private async sendEmailWithAttachment(to: string, subject: string, text: string, pdfBuffer: Buffer, filename: string) {
        const apiKey = this.config.get<string>('RESEND_API_KEY');
        if (!apiKey) {
            console.warn('Brak RESEND_API_KEY. Nie wysłano maila.');
            return;
        }
        const fromHeader = this.config.get<string>('MAIL_FROM') || 'onboarding@resend.dev';

        // Konwersja Buffer na tablicę bajtów dla JSON
        const contentArray = Array.from(pdfBuffer);

        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: fromHeader,
                    to,
                    subject,
                    text,
                    attachments: [
                        {
                            filename: filename,
                            content: contentArray, // Resend API przyjmuje buffer array w JSON
                        },
                    ],
                }),
            });

            if (!res.ok) {
                const errBody = await res.text();
                console.error(`Błąd wysyłki Resend: ${res.status} - ${errBody}`);
            } else {
                console.log(`Mail wysłany do: ${to}`);
            }
        } catch (e) {
            console.error('Wyjątek przy wysyłce maila:', e);
        }
    }

    async create(userId: string, dto: CreateReportDto) {
        const supabase = this.supabaseService.getClient();

        // 1. Zapisz raport w bazie
        const { data: report, error } = await supabase
            .from('reports')
            .insert({
                company_id: dto.companyId,
                template_id: dto.templateId,
                user_id: userId,
                title: dto.title,
                answers: dto.answers,
                client_email: dto.clientEmail || null, // Zapisujemy email klienta
            })
            .select(`
                *,
                report_templates (*),
                users (first_name, last_name)
            `)
            .single();

        if (error) throw new InternalServerErrorException(`Błąd zapisu raportu: ${error.message}`);

        // 2. Wygeneruj PDF i wyślij (jeśli podano email)
        if (report.client_email) {
            // Nie czekamy (no await), żeby user dostał szybką odpowiedź w UI
            this.handlePdfProcess(report).catch(err => console.error('Błąd tła PDF:', err));
        }

        return report;
    }

    private async handlePdfProcess(report: any) {
        console.log(`Generowanie PDF dla raportu ID: ${report.id}`);
        const pdfBuffer = await this.pdfService.generateReportPdf(report);

        await this.sendEmailWithAttachment(
            report.client_email,
            `Raport z wykonania zlecenia: ${report.title}`,
            `Dzień dobry,\n\nW załączniku przesyłamy raport z wykonanych prac.\n\nPozdrawiamy,\nZespół`,
            pdfBuffer,
            `Raport_${report.id.slice(0,8)}.pdf`
        );
    }

    async findAllByCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
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
            .select(`*, report_templates(fields, style)`) // Pobieramy też styl
            .eq('id', id)
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}