import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}