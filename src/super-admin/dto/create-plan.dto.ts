import { IsString, IsNumber, IsBoolean, IsOptional, IsJSON } from 'class-validator';

export class CreatePlanDto {
    @IsString()
    code: string;

    @IsString()
    name: string;

    @IsNumber()
    price_monthly: number;

    @IsNumber()
    price_yearly: number;

    @IsOptional()
    limits?: any; // JSONB

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
