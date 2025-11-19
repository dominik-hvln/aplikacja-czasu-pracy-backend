import { IsString, IsNotEmpty, IsArray, ValidateNested, IsEnum, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

// Typy pól, jakie pracownik będzie mógł uzupełnić
export enum ReportFieldType {
    TEXT = 'text',           // Krótki tekst
    TEXTAREA = 'textarea',   // Długi opis
    NUMBER = 'number',       // Liczba (np. zużyte materiały)
    CHECKBOX = 'checkbox',   // Tak/Nie
    PHOTO = 'photo',         // Zdjęcie z telefonu
    SECTION = 'section',     // Nagłówek sekcji (do wyglądu)
    SIGNATURE = 'signature', // Podpis klienta
}

export class ReportFieldDto {
    @IsString()
    @IsNotEmpty()
    id: string; // Unikalne ID pola (np. "field_123"), potrzebne do DndKit

    @IsEnum(ReportFieldType)
    type: ReportFieldType;

    @IsString()
    @IsNotEmpty()
    label: string; // Np. "Opis usterki"

    @IsBoolean()
    @IsOptional()
    required?: boolean;

    @IsString()
    @IsOptional()
    placeholder?: string;
}

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

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportFieldDto)
    fields: ReportFieldDto[];
}