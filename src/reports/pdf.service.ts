import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Injectable()
export class PdfService {
    private printer: PdfPrinter;

    constructor() {
        // Definiujemy fonty
        const fonts = {
            Roboto: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique',
            },
        };
        this.printer = new PdfPrinter(fonts);
    }

    async generateReportPdf(report: any): Promise<Buffer> {
        const template = report.report_templates;
        const style = template.style || { primaryColor: '#000000', headerText: 'RAPORT' };
        const fields = template.fields as any[];
        const answers = report.answers;

        // Budujemy treść PDF
        const docDefinition: TDocumentDefinitions = {
            content: [
                // Nagłówek
                {
                    text: style.headerText || template.name.toUpperCase(),
                    style: 'header',
                    alignment: 'right',
                    color: style.primaryColor,
                    margin: [0, 0, 0, 20],
                },
                // Tytuł i Data
                {
                    text: report.title,
                    style: 'title',
                    margin: [0, 0, 0, 5],
                },
                {
                    text: `Data: ${new Date(report.created_at).toLocaleDateString('pl-PL')} | Autor: ${report.users?.first_name || ''} ${report.users?.last_name || ''}`,
                    style: 'subtitle',
                    color: '#666666',
                    margin: [0, 0, 0, 20],
                },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 2, lineColor: style.primaryColor }] },
                { text: '', margin: [0, 0, 0, 20] }, // Odstęp

                // ✅ Rzutujemy mapowanie na 'any', żeby uspokoić TypeScript w kwestii typów pdfmake
                ...(fields.map((field) => {
                    const value = answers[field.id];

                    // Obsługa sekcji
                    if (field.type === 'section') {
                        return {
                            text: field.label,
                            style: 'sectionHeader',
                            color: style.primaryColor,
                            margin: [0, 15, 0, 5],
                        };
                    }

                    // Obsługa zwykłych pól
                    let displayValue = value ? value.toString() : '-';
                    if (field.type === 'checkbox') displayValue = value ? 'TAK' : 'NIE';
                    if (field.type === 'photo') displayValue = value ? `[Zdjęcie: ${value}]` : 'Brak zdjęcia';

                    return {
                        columns: [
                            { width: '40%', text: field.label, style: 'label' },
                            { width: '60%', text: displayValue, style: 'value' },
                        ],
                        margin: [0, 5, 0, 5],
                    };
                }) as any),

                // Stopka z autorem
                { text: '', margin: [0, 30, 0, 0] },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }] },
                {
                    text: `Wygenerowano automatycznie z systemu Kadromierz.`,
                    style: 'footer',
                    margin: [0, 10, 0, 0],
                    alignment: 'center',
                    color: '#aaaaaa',
                    fontSize: 9,
                },
            ],
            styles: {
                header: { fontSize: 16, bold: true },
                title: { fontSize: 20, bold: true },
                subtitle: { fontSize: 10 },
                sectionHeader: { fontSize: 13, bold: true, decoration: 'underline' },
                label: { fontSize: 10, bold: true, color: '#444444' },
                value: { fontSize: 10 },
            },
            defaultStyle: {
                font: 'Roboto',
            },
        };

        return new Promise((resolve, reject) => {
            const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
            const chunks: any[] = [];
            pdfDoc.on('data', (chunk) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', (err) => reject(err));
            pdfDoc.end();
        });
    }
}