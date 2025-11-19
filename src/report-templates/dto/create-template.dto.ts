import { IsString, IsNotEmpty, IsArray, ValidateNested, IsEnum, IsBoolean, IsOptional, IsUUID, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReportFieldType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    NUMBER = 'number',
    CHECKBOX = 'checkbox',
    PHOTO = 'photo',
    SECTION = 'section',
    SIGNATURE = 'signature',
}

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
}

// ✅ Nowa klasa dla stylu
export class TemplateStyleDto {
    @IsString()
    @IsOptional()
    primaryColor?: string;

    @IsString()
    @IsOptional()
    headerText?: string;
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

    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => TemplateStyleDto)
    style?: TemplateStyleDto; // ✅ Dodane
}