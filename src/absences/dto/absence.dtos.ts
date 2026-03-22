import { IsString, IsNotEmpty, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateAbsenceDto {
    @IsString()
    @IsNotEmpty()
    type: string;

    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsString()
    @IsOptional()
    reason?: string;
}

export class UpdateAbsenceStatusDto {
    @IsString()
    @IsNotEmpty()
    status: 'pending' | 'approved' | 'rejected';
}
