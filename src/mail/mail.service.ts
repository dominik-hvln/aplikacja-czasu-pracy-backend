import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Współdzielona usługa wysyłki e-maili (SMTP / Nodemailer).
 * Korzysta z tej samej konfiguracji SMTP co reszta aplikacji.
 */
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private transporter: nodemailer.Transporter | null = null;

    constructor(private readonly config: ConfigService) {}

    private getTransporter() {
        if (!this.transporter) {
            const smtpUser = this.config.get<string>('SMTP_USER')?.trim();
            const smtpPass = this.config.get<string>('SMTP_PASS')?.trim();
            const smtpHost = this.config.get<string>('SMTP_HOST')?.trim() || '';
            const smtpPort = Number(this.config.get('SMTP_PORT')) || 587;
            const secure = smtpPort === 465 || this.config.get<string>('SMTP_SECURE')?.trim() === 'true';

            if (!smtpUser || !smtpPass) {
                this.logger.warn('Brak danych logowania SMTP — wysyłka e-maili może nie działać.');
            }

            this.transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure,
                auth: { user: smtpUser, pass: smtpPass },
            });
        }
        return this.transporter;
    }

    /** Wysyła e-mail. Zwraca true/false — nie rzuca, by nie blokować przepływu biznesowego. */
    async send(to: string, subject: string, html: string, text?: string): Promise<boolean> {
        const from = this.config.get<string>('MAIL_FROM') || '"Effixy" <no-reply@localhost>';
        try {
            const info = await this.getTransporter().sendMail({
                from,
                to,
                subject,
                html,
                text: text || html.replace(/<[^>]+>/g, ' '),
            });
            this.logger.log(`E-mail wysłany do ${to} (messageId: ${info.messageId})`);
            return true;
        } catch (e: any) {
            this.logger.error(`Błąd wysyłki e-maila do ${to}: ${e?.message}`);
            return false;
        }
    }
}
