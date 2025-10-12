import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
    @IsNotEmpty({ message: 'Adres e-mail jest wymagany.' })
    @IsEmail({}, { message: 'Proszę podać poprawny adres e-mail.' })
    email: string;

    @IsNotEmpty({ message: 'Hasło jest wymagane.' })
    @IsString()
    password: string;
}