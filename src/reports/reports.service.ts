import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReportDto } from './dto/create-report.dto';
import { PdfService } from './pdf.service';
import { ConfigService } from '@nestjs/config';

import * as nodemailer from 'nodemailer';

@Injectable()
export class ReportsService {
    private transporter: nodemailer.Transporter;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly pdfService: PdfService,
        private readonly config: ConfigService,
    ) {
        this.transporter = nodemailer.createTransport({
            host: this.config.get<string>('SMTP_HOST'),
            port: this.config.get<number>('SMTP_PORT') || 587,
            secure: this.config.get<number>('SMTP_PORT') === 465,
            auth: {
                user: this.config.get<string>('SMTP_USER'),
                pass: this.config.get<string>('SMTP_PASS'),
            },
        });
    }

    // Metoda pomocnicza do wysyłki maila z raportem przez SMTP
    private async sendEmailWithAttachment(to: string, subject: string, text: string, pdfBuffer: Buffer, filename: string) {
        const fromHeader = this.config.get<string>('MAIL_FROM') || '"Aplikacja Czasu Pracy" <no-reply@localhost>';

        try {
            const info = await this.transporter.sendMail({
                from: fromHeader,
                to,
                subject,
                text,
                attachments: [
                    {
                        filename: filename,
                        content: pdfBuffer,
                    },
                ],
            });

            console.log(`✅ Mail z raportem wysłany do: ${to}. MessageId: ${info.messageId}`);
        } catch (error: any) {
            console.error('❌ Wyjątek przy wysyłce maila SMTP z raportem:', error.message);
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
                client_email: dto.clientEmail || null,
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
            // Uruchamiamy w tle (bez await), żeby nie blokować UI
            this.handlePdfProcess(report).catch(err => console.error('Błąd tła PDF:', err));
        }

        return report;
    }

    private async handlePdfProcess(report: any) {
        console.log(`📄 Generowanie PDF dla raportu ID: ${report.id}`);
        const pdfBuffer = await this.pdfService.generateReportPdf(report);

        await this.sendEmailWithAttachment(
            report.client_email,
            `Raport z wykonania zlecenia: ${report.title}`,
            `Dzień dobry,\n\nW załączniku przesyłamy raport z wykonanych prac.\n\nPozdrawiamy,\nZespół`,
            pdfBuffer,
            `Raport_${report.id.slice(0, 8)}.pdf`
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
            .select(`*, report_templates(fields, style, layout)`)
            .eq('id', id)
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
    async generatePdf(id: string) {
        const report = await this.findOne(id);
        if (!report) throw new NotFoundException('Raport nie istnieje');

        const pdfBuffer = await this.pdfService.generateReportPdf(report);
        const filename = `Raport_${report.id.slice(0, 8)}.pdf`;

        return { buffer: pdfBuffer, filename };
    }
}