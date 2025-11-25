import { Injectable } from '@nestjs/common';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import * as path from 'path';

// Używamy require, aby ominąć problemy z kompatybilnością modułów w TypeScript (błąd TS2497)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');

@Injectable()
export class PdfService {
    private printer: any;

    constructor() {
        // Definicja fontów z obsługą polskich znaków
        // Upewnij się, że pliki .ttf znajdują się w folderze backend/fonts/
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
        // Pobieramy style globalne lub ustawiamy domyślne
        const globalStyle = template.style || { primaryColor: '#000000', headerText: 'RAPORT' };

        const layout = template.layout as any[];         // Struktura wierszy/kolumn z Buildera
        const fieldsDefinition = template.fields as any[]; // Definicje pól (typy, etykiety)
        const answers = report.answers || {};            // Odpowiedzi użytkownika

        // Mapa pomocnicza do szybkiego wyszukiwania definicji pola po ID
        const fieldsMap = new Map(fieldsDefinition.map(f => [f.id, f]));

        // --- Funkcja rekurencyjna budująca układ strony (Grid) ---
        const buildLayout = (rows: any[]): Content[] => {
            if (!rows || !Array.isArray(rows)) return [];

            return rows.map((row) => {
                // Mapujemy kolumny z naszej struktury na strukturę pdfmake
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

        // --- Główna funkcja renderująca pojedynczy element (Pole lub Tekst) ---
        const renderItem = (item: any): Content => {
            const style = item.style || {};

            // 1. Tekst statyczny (dodany w Layout Builderze)
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

            // 2. Pole dynamiczne (wypełnione przez użytkownika)
            if (item.type === 'field' && item.fieldId) {
                const fieldDef = fieldsMap.get(item.fieldId);
                const value = answers[item.fieldId];
                const label = fieldDef ? fieldDef.label : 'Nieznane pole';

                // A. Obsługa Tabeli
                if (fieldDef?.type === 'table') {
                    const columns = fieldDef.columns || ['Kolumna 1'];
                    const rows = Array.isArray(value) ? value : [];

                    return {
                        stack: [
                            { text: label, fontSize: 10, bold: true, margin: [0, 0, 0, 5] },
                            {
                                table: {
                                    headerRows: 1,
                                    widths: Array(columns.length).fill('*'), // Auto szerokość
                                    body: [
                                        // Nagłówek tabeli
                                        columns.map((colName: string) => ({
                                            text: colName,
                                            bold: true,
                                            fillColor: '#f3f4f6',
                                            fontSize: 9
                                        })),
                                        // Wiersze z danymi
                                        ...(rows.length > 0
                                                ? rows.map((row: any) => columns.map((colName: string) => ({
                                                    text: row[colName] || '-',
                                                    fontSize: 9
                                                })))
                                                : [columns.map(() => ({ text: '-', fontSize: 9, color: '#cccccc' }))]
                                        )
                                    ]
                                },
                                layout: 'lightHorizontalLines'
                            }
                        ],
                        margin: [0, 10, 0, 10]
                    };
                }

                // B. Obsługa Podpisu (Obrazek Base64)
                if (fieldDef?.type === 'signature' && typeof value === 'string' && value.startsWith('data:image')) {
                    return {
                        stack: [
                            { text: label, fontSize: 9, color: '#666666', bold: true },
                            {
                                image: value, // pdfmake natywnie obsługuje dataURL
                                width: 150,   // Szerokość podpisu
                                margin: [0, 5, 0, 0]
                            }
                        ],
                        margin: [0, 5, 0, 10]
                    };
                }

                // C. Obsługa pozostałych pól (Tekst, Liczba, Checkbox)
                let displayValue = value ? value.toString() : '-';

                if (fieldDef?.type === 'checkbox') {
                    displayValue = value ? 'TAK' : 'NIE';
                }
                if (fieldDef?.type === 'photo') {
                    displayValue = value ? `[Załączone zdjęcie: ${value}]` : 'Brak zdjęcia';
                }
                if (fieldDef?.type === 'signature' && !value) {
                    displayValue = 'Brak podpisu';
                }

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

        // --- Definicja Dokumentu ---
        const docDefinition: TDocumentDefinitions = {
            content: [
                // 1. Nagłówek strony
                {
                    text: globalStyle.headerText || template.name.toUpperCase(),
                    style: 'header',
                    alignment: 'right',
                    color: globalStyle.primaryColor,
                    margin: [0, 0, 0, 20],
                },
                // 2. Tytuł raportu i Metadane
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
                // Linia oddzielająca
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 2, lineColor: globalStyle.primaryColor }] },
                { text: '', margin: [0, 0, 0, 20] },

                // 3. Dynamiczna zawartość (Layout z Buildera)
                ...buildLayout(layout),

                // 4. Stopka strony
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
                subtitle: { fontSize: 10 },
                sectionHeader: { fontSize: 13, bold: true, decoration: 'underline' },
                label: { fontSize: 10, bold: true, color: '#444444' },
                value: { fontSize: 10 },
                footer: { fontSize: 9 },
            },
            defaultStyle: {
                font: 'Roboto', // Kluczowe dla polskich znaków
            },
        };

        return new Promise((resolve, reject) => {
            const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
            const chunks: any[] = [];
            pdfDoc.on('data', (chunk: any) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', (err: any) => reject(err));
            pdfDoc.end();
        });
    }
}