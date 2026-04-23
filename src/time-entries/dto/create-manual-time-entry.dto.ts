import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateManualTimeEntryDto {
    @IsUUID()
    @IsNotEmpty()
    user_id: string;

    @IsDateString()
    @IsNotEmpty()
    start_time: string;

    @IsDateString()
    @IsNotEmpty()
    end_time: string;

    @IsString()
    @IsNotEmpty()
    manual_comment: string;

    @IsUUID()
    @IsOptional()
    project_id?: string;

    @IsUUID()
    @IsOptional()
    task_id?: string;
}
