import { IsString, IsNotEmpty, IsArray, ValidateNested, IsEnum, IsBoolean, IsOptional, IsUUID, IsObject, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

// Typy pól, jakie pracownik będzie mógł uzupełnić
export enum ReportFieldType {
    TEXT = 'text',           // Krótki tekst
    TEXTAREA = 'textarea',   // Długi opis
    NUMBER = 'number',       // Liczba
    CHECKBOX = 'checkbox',   // Tak/Nie
    PHOTO = 'photo',         // Zdjęcie
    SECTION = 'section',     // Nagłówek sekcji
    SIGNATURE = 'signature', // Podpis
    TABLE = 'table',         // Tabela (Nowość)
}

// Definicja pojedynczego pola danych
export class ReportFieldDto {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsEnum(ReportFieldType)
    type: ReportFieldType;

    @IsString()
    @IsNotEmpty()
    label: string;

    @IsBoolean()
    @IsOptional()
    required?: boolean;

    @IsString()
    @IsOptional()
    placeholder?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    columns?: string[]; // Nazwy kolumn dla tabeli (np. ["Nazwa", "Ilość"])
}

// --- STRUKTURY LAYOUTU (SIATKA) ---

export enum LayoutElementType {
    FIELD = 'field', // Dynamiczne pole
    TEXT = 'text',   // Statyczny tekst
    IMAGE = 'image', // Statyczny obrazek
}

export class ElementStyleDto {
    @IsBoolean() @IsOptional() bold?: boolean;
    @IsNumber() @IsOptional() fontSize?: number;
    @IsString() @IsOptional() color?: string;
    @IsString() @IsOptional() alignment?: 'left' | 'center' | 'right';
    @IsString() @IsOptional() backgroundColor?: string;
}

// Pojedynczy element w siatce (Layout Item)
export class LayoutItemDto {
    @IsString()
    id: string;

    @IsEnum(LayoutElementType)
    type: LayoutElementType;

    @IsString() @IsOptional()
    fieldId?: string; // ID pola z listy fields (jeśli type === 'field')

    @IsString() @IsOptional()
    content?: string; // Treść tekstu (jeśli type === 'text')

    @IsObject() @IsOptional()
    style?: ElementStyleDto;
}

// Kolumna w siatce
export class LayoutColumnDto {
    @IsNumber()
    width: number; // Szerokość w procentach (np. 50)

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LayoutItemDto)
    items: LayoutItemDto[];
}

// Wiersz w siatce
export class LayoutRowDto {
    @IsString()
    id: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LayoutColumnDto)
    columns: LayoutColumnDto[];

    @IsObject() @IsOptional()
    style?: ElementStyleDto;
}

// --- STYLE GLOBALNE PDF ---

export class TemplateStyleDto {
    @IsString() @IsOptional() primaryColor?: string;
    @IsString() @IsOptional() headerText?: string;
    @IsString() @IsOptional() footerText?: string;
    @IsString() @IsOptional() logoUrl?: string;
}

// --- GŁÓWNE DTO TWORZENIA SZABLONU ---

export class CreateReportTemplateDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUUID()
    @IsNotEmpty()
    companyId: string;

    // 1. Definicja danych (co zbieramy)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportFieldDto)
    fields: ReportFieldDto[];

    // 2. Definicja wyglądu (jak układamy w PDF)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LayoutRowDto)
    layout: LayoutRowDto[];

    // 3. Style globalne (kolory, nagłówki)
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => TemplateStyleDto)
    style?: TemplateStyleDto;
}