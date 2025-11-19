import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Role } from '../../auth/roles.decorator';

export class CreateSystemUserDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @MinLength(8)
    password: string;

    @IsString()
    @IsNotEmpty()
    firstName: string;

    @IsString()
    @IsNotEmpty()
    lastName: string;

    @IsEnum(Role)
    @IsNotEmpty()
    role: Role;

    @IsUUID()
    @IsOptional() // SuperAdmin może nie mieć firmy
    companyId?: string;
}