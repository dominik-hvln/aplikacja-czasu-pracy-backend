import { IsNotEmpty, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
    @IsNotEmpty()
    latitude: number;

    @IsNotEmpty()
    longitude: number;
}

export class SwitchTaskDto {
    @IsUUID()
    @IsNotEmpty()
    taskId: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => LocationDto)
    location?: LocationDto;
}