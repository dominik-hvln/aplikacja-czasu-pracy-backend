import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional } from 'class-validator';

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
    answers: Record<string, any>; // Klucz (ID Pola) -> Wartość (Odpowiedź)

    // Opcjonalnie ID zadania, jeśli podpinasz pod zlecenie
    @IsUUID()
    @IsOptional()
    taskId?: string;
}