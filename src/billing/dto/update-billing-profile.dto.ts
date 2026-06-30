import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class UpdateBillingProfileDto {
    @IsString()
    @IsNotEmpty({ message: 'Nazwa firmy jest wymagana' })
    legal_name: string;

    @IsString()
    @Matches(/^\d{10}$/, { message: 'NIP musi składać się z 10 cyfr' })
    tax_id: string;

    @IsString()
    @IsNotEmpty({ message: 'Ulica i numer są wymagane' })
    billing_street: string;

    @IsString()
    @Matches(/^\d{2}-\d{3}$/, { message: 'Kod pocztowy musi być w formacie 00-000' })
    billing_postal_code: string;

    @IsString()
    @IsNotEmpty({ message: 'Miasto jest wymagane' })
    billing_city: string;

    @IsEmail({}, { message: 'Podaj poprawny adres e-mail do faktur' })
    billing_email: string;
}
