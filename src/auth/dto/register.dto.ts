// src/auth/dto/register.dto.ts
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
    @IsNotEmpty({ message: 'Adres e-mail jest wymagany.' })
    @IsEmail({}, { message: 'Proszę podać poprawny adres e-mail.' })
    email: string;

    @IsNotEmpty({ message: 'Hasło jest wymagane.' })
    @IsString()
    @MinLength(8, { message: 'Hasło musi mieć co najmniej 8 znaków.' })
    password: string;

    // ZMIANA PONIŻEJ
    @IsNotEmpty({ message: 'Imię jest wymagane.' })
    @IsString()
    firstName: string;

    @IsNotEmpty({ message: 'Nazwisko jest wymagane.' })
    @IsString()
    lastName: string;
    // KONIEC ZMIANY

    @IsNotEmpty({ message: 'Nazwa firmy jest wymagana.' })
    @IsString()
    companyName: string;
}