import { IsNumber, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateProjectDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    address?: string;

    @IsNumber()
    @IsOptional()
    geo_latitude?: number;

    @IsNumber()
    @IsOptional()
    geo_longitude?: number;

    @IsInt()
    @IsOptional()
    geo_radius_meters?: number;
}