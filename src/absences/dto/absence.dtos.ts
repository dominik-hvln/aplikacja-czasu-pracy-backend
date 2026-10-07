import { IsString, IsNotEmpty, IsDateString, IsOptional, IsIn } from 'class-validator';
import { ABSENCE_TYPES } from '../absence-types';

export class CreateAbsenceDto {
    @IsString()
    @IsIn(ABSENCE_TYPES, { message: 'Nieznany rodzaj nieobecności.' })
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
    @IsIn(['pending', 'approved', 'rejected'])
    status: 'pending' | 'approved' | 'rejected';
}

export class UpdateAbsenceDatesDto {
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;
}
