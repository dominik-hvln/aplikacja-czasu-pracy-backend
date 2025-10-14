import {IsInt, IsNotEmpty, IsNumber, IsOptional, IsString} from 'class-validator';

export class CreateProjectDto {
    @IsString()
    @IsNotEmpty({ message: 'Nazwa projektu jest wymagana.' })
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    address?: string;

    @IsNumber() @IsOptional() geo_latitude?: number;
    @IsNumber() @IsOptional() geo_longitude?: number;
    @IsInt() @IsOptional() geo_radius_meters?: number;
}