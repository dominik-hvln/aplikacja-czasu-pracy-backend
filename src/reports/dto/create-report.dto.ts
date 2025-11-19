import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional, IsEmail } from 'class-validator';

export class CreateReportDto {
    @IsUUID()
    @IsNotEmpty()
    templateId: string;

    @IsUUID()
    @IsNotEmpty()
    companyId: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsObject()
    @IsNotEmpty()
    answers: Record<string, any>;

    @IsOptional()
    @IsEmail()
    clientEmail?: string; // ✅ Opcjonalny email do wysyłki PDF

    @IsUUID()
    @IsOptional()
    taskId?: string;
}