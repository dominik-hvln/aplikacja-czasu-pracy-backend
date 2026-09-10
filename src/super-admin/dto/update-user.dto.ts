import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateSystemUserDto {
    @IsString()
    @IsOptional()
    firstName?: string;

    @IsString()
    @IsOptional()
    lastName?: string;

    @IsIn(['employee', 'manager', 'admin', 'super_admin'])
    @IsOptional()
    role?: string;

    /** null = odepnij od firmy (dotyczy super adminów). */
    @IsUUID()
    @IsOptional()
    companyId?: string | null;
}
