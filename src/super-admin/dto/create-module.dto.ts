import { IsString, IsOptional } from 'class-validator';

export class CreateModuleDto {
    @IsString()
    code: string;

    @IsString()
    name: string;

    @IsString()
    @IsString()
    @IsOptional()
    description?: string;

    @IsOptional()
    is_active?: boolean;
}
