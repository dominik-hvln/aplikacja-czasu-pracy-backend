import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import * as path from 'path'; // ✅ Importujemy path

@Injectable()
export class PdfService {
    private printer: PdfPrinter;

    constructor() {
        // ✅ Definiujemy ścieżki do prawdziwych plików czcionek
        const fonts = {
            Roboto: {
                normal: path.join(__dirname, '../../fonts/Roboto-Regular.ttf'),
                bold: path.join(__dirname, '../../fonts/Roboto-Medium.ttf'),
                italics: path.join(__dirname, '../../fonts/Roboto-Regular.ttf'), // Fallback
                bolditalics: path.join(__dirname, '../../fonts/Roboto-Medium.ttf'), // Fallback
            },
        };
        this.printer = new PdfPrinter(fonts);
    }

    async generateReportPdf(report: any): Promise<Buffer> {
        const template = report.report_templates;
        // Pobieramy rozszerzone style
        const style = template.style || {
            primaryColor: '#000000',
            headerText: 'RAPORT',
            logoUrl: '',
            footerText: ''
        };
        const fields = template.fields as any[];
        const answers = report.answers;

        // ✅ Przygotowanie Logo (jeśli jest URL)
        let headerContent: any = {
            text: style.headerText || template.name.toUpperCase(),
            style: 'header',
            alignment: 'right',
            color: style.primaryColor,
            margin: [0, 0, 0, 20],
        };

        // Jeśli user zdefiniował logo (na razie zakładamy publiczny URL lub base64,
        // pdfmake pobierze to jeśli jest direct link, ale bezpieczniej w node.js to pobrać wcześniej.
        // Dla uproszczenia MVP zostawmy tekst, ale przygotujmy miejsce w kodzie).

        const docDefinition: TDocumentDefinitions = {
            content: [
                headerContent,
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
                { text: '', margin: [0, 0, 0, 20] },

                // Pola formularza
                ...(fields.map((field) => {
                    const value = answers[field.id];

                    if (field.type === 'section') {
                        return {
                            text: field.label,
                            style: 'sectionHeader',
                            color: style.primaryColor,
                            margin: [0, 15, 0, 5],
                        };
                    }

                    let displayValue = value ? value.toString() : '-';
                    if (field.type === 'checkbox') displayValue = value ? 'TAK' : 'NIE';
                    if (field.type === 'photo') displayValue = value ? `[Zdjęcie]` : 'Brak zdjęcia';

                    return {
                        columns: [
                            { width: '35%', text: field.label, style: 'label' },
                            { width: '65%', text: displayValue, style: 'value' },
                        ],
                        margin: [0, 5, 0, 5],
                        columnGap: 10
                    };
                }) as any),

                // Stopka
                { text: '', margin: [0, 30, 0, 0] },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }] },
                {
                    // ✅ Używamy customowej stopki zdefiniowanej przez Admina
                    text: style.footerText || `Wygenerowano automatycznie z systemu Kadromierz.`,
                    style: 'footer',
                    margin: [0, 10, 0, 0],
                    alignment: 'center',
                    color: '#aaaaaa',
                    fontSize: 9,
                },
            ],
            styles: {
                header: { fontSize: 18, bold: true },
                title: { fontSize: 22, bold: true },
                subtitle: { fontSize: 10 },
                sectionHeader: { fontSize: 13, bold: true, decoration: 'underline' },
                label: { fontSize: 10, bold: true, color: '#444444' },
                value: { fontSize: 10 },
            },
            defaultStyle: {
                font: 'Roboto', // ✅ Używamy naszego fontu
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