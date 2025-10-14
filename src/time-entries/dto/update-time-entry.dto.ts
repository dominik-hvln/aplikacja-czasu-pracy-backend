import { IsDateString, IsOptional } from 'class-validator';

export class UpdateTimeEntryDto {
    @IsDateString()
    @IsOptional()
    start_time?: string;

    @IsDateString()
    @IsOptional()
    end_time?: string;
}