import { IsString, IsNotEmpty, IsDateString, IsOptional, ValidateNested, IsArray, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class ShiftDefinitionDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    start_time: string; // e.g., '06:00'

    @IsString()
    @IsNotEmpty()
    end_time: string; // e.g., '14:00'
}

export class DaySettingsDto {
    @IsBoolean()
    is_working_day: boolean;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ShiftDefinitionDto)
    shifts: ShiftDefinitionDto[];
}

export class UpdateSettingsDto {
    @ValidateNested()
    @Type(() => DaySettingsDto)
    '1': DaySettingsDto; // Monday

    @ValidateNested()
    @Type(() => DaySettingsDto)
    '2': DaySettingsDto; // Tuesday

    @ValidateNested()
    @Type(() => DaySettingsDto)
    '3': DaySettingsDto;

    @ValidateNested()
    @Type(() => DaySettingsDto)
    '4': DaySettingsDto;

    @ValidateNested()
    @Type(() => DaySettingsDto)
    '5': DaySettingsDto;

    @ValidateNested()
    @Type(() => DaySettingsDto)
    '6': DaySettingsDto; // Saturday

    @ValidateNested()
    @Type(() => DaySettingsDto)
    '0': DaySettingsDto; // Sunday
}

export class GenerateScheduleDto {
    @IsInt()
    @Min(1)
    @Max(12)
    month: number;

    @IsInt()
    @Min(2020)
    year: number;
}

export class UpdateScheduleDto {
    @IsString()
    @IsOptional()
    user_id?: string;

    @IsString()
    @IsNotEmpty()
    shift_name: string;

    @IsString()
    @IsNotEmpty()
    start_time: string;

    @IsString()
    @IsNotEmpty()
    end_time: string;

    @IsString()
    @IsOptional()
    status?: string; // 'scheduled', 'absent', 'replacement_needed'
}

export class CreateShiftRequestDto {
    @IsDateString()
    date: string;

    @IsString()
    @IsNotEmpty()
    requested_shift_name: string;
}

export class UpdateShiftRequestStatusDto {
    @IsString()
    @IsNotEmpty()
    status: 'approved' | 'rejected';
}
