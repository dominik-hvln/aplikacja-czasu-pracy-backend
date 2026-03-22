// src/users/dto/create-user.dto.ts
import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional, IsUUID, IsNumber, IsDateString } from 'class-validator';

import { Role } from '../../auth/roles.decorator';

export class CreateUserDto {
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

    @IsString()
    @IsOptional()
    employmentType?: string;

    @IsUUID()
    @IsOptional()
    departmentId?: string;

    @IsUUID()
    @IsOptional()
    teamId?: string;

    @IsUUID()
    @IsOptional()
    fteId?: string;

    @IsUUID()
    @IsOptional()
    managerId?: string;

    @IsDateString()
    @IsOptional()
    employmentDate?: string;

    @IsNumber()
    @IsOptional()
    hourlyRate?: number;

    @IsDateString()
    @IsOptional()
    contractEndDate?: string;

    @IsNumber()
    @IsOptional()
    vacationDaysQuota?: number;

    @IsString()
    @IsOptional()
    phoneNumber?: string;

    @IsString()
    @IsOptional()
    emergencyContact?: string;

    @IsString()
    @IsOptional()
    status?: string;
}