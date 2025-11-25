import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import * as path from 'path';

@Injectable()
export class PdfService {
    private printer: PdfPrinter;

    constructor() {
        const fonts = {
            Roboto: {
                normal: path.join(__dirname, '../../fonts/Roboto-Regular.ttf'),
                bold: path.join(__dirname, '../../fonts/Roboto-Medium.ttf'),
                italics: path.join(__dirname, '../../fonts/Roboto-Regular.ttf'),
                bolditalics: path.join(__dirname, '../../fonts/Roboto-Medium.ttf'),
            },
        };
        this.printer = new PdfPrinter(fonts);
    }

    async generateReportPdf(report: any): Promise<Buffer> {
        const template = report.report_templates;
        const globalStyle = template.style || { primaryColor: '#000000' };
        const layout = template.layout as any[];
        const fieldsDefinition = template.fields as any[];
        const answers = report.answers || {};

        const fieldsMap = new Map(fieldsDefinition.map(f => [f.id, f]));

        // Rekurencyjna funkcja budująca layout
        const buildLayout = (rows: any[]): Content[] => {
            if (!rows || !Array.isArray(rows)) return [];

            return rows.map((row) => {
                const columns = row.columns.map((col: any) => {
                    return {
                        width: `${col.width}%`,
                        stack: col.items.map((item: any) => renderItem(item)),
                        margin: [5, 5, 5, 5]
                    };
                });

                return {
                    columns: columns,
                    columnGap: 10,
                    margin: [0, 5, 0, 5]
                };
            });
        };

        // Funkcja renderująca element
        const renderItem = (item: any): Content => {
            const style = item.style || {};

            // Tekst statyczny
            if (item.type === 'text') {
                return {
                    text: item.content || '',
                    bold: style.bold,
                    fontSize: style.fontSize || 10,
                    color: style.color || '#000000',
                    alignment: style.alignment || 'left',
                    margin: [0, 2, 0, 2]
                };
            }

            // Pole dynamiczne
            if (item.type === 'field' && item.fieldId) {
                const fieldDef = fieldsMap.get(item.fieldId);
                const value = answers[item.fieldId];
                const label = fieldDef ? fieldDef.label : 'Nieznane pole';

                // ✅ OBSŁUGA TABELI
                if (fieldDef?.type === 'table') {
                    const columns = fieldDef.columns || ['Kolumna 1'];
                    const rows = Array.isArray(value) ? value : []; // value to tablica wierszy z odpowiedzi

                    return {
                        stack: [
                            { text: label, fontSize: 10, bold: true, margin: [0, 0, 0, 5] },
                            {
                                table: {
                                    headerRows: 1,
                                    widths: Array(columns.length).fill('*'), // Automatyczna szerokość
                                    body: [
                                        // Nagłówek tabeli (szare tło)
                                        columns.map(colName => ({
                                            text: colName,
                                            bold: true,
                                            fillColor: '#f3f4f6',
                                            fontSize: 9
                                        })),
                                        // Wiersze z danymi (lub pusty wiersz jeśli brak danych)
                                        ...(rows.length > 0 ? rows.map(row => {
                                            return columns.map(colName => ({
                                                text: row[colName] || '-',
                                                fontSize: 9
                                            }));
                                        }) : [
                                            // Placeholder pustego wiersza
                                            columns.map(() => ({ text: '-', fontSize: 9, color: '#cccccc' }))
                                        ])
                                    ]
                                },
                                layout: 'lightHorizontalLines' // Styl linii w tabeli
                            }
                        ],
                        margin: [0, 10, 0, 10]
                    };
                }

                // Obsługa zwykłych pól
                let displayValue = value ? value.toString() : '-';
                if (fieldDef?.type === 'checkbox') displayValue = value ? 'TAK' : 'NIE';
                if (fieldDef?.type === 'photo') displayValue = value ? `[Zdjęcie: ${value}]` : 'Brak zdjęcia';

                return {
                    stack: [
                        { text: label, fontSize: 9, color: '#666666', bold: true },
                        {
                            text: displayValue,
                            fontSize: style.fontSize || 11,
                            color: style.color || '#000000',
                            bold: style.bold,
                            alignment: style.alignment || 'left'
                        }
                    ],
                    margin: [0, 5, 0, 10]
                };
            }

            return { text: '' };
        };

        const docDefinition: TDocumentDefinitions = {
            content: [
                {
                    text: globalStyle.headerText || template.name.toUpperCase(),
                    style: 'header',
                    alignment: 'right',
                    color: globalStyle.primaryColor,
                    margin: [0, 0, 0, 20],
                },
                {
                    text: report.title,
                    style: 'title',
                    margin: [0, 0, 0, 5],
                },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 2, lineColor: globalStyle.primaryColor }] },
                { text: '', margin: [0, 0, 0, 20] },

                ...buildLayout(layout), // ✅ Generowanie layoutu

                { text: '', margin: [0, 30, 0, 0] },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }] },
                {
                    text: globalStyle.footerText || `Wygenerowano automatycznie z systemu Kadromierz.`,
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
                footer: { fontSize: 9 },
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