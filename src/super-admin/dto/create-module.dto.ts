import { IsString, IsOptional } from 'class-validator';

export class CreateModuleDto {
    @IsString()
    code: string;

    @IsString()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;
}
