import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLocationQrCodeDto {
    @IsString()
    @IsNotEmpty({ message: 'Nazwa jest wymagana.' })
    name: string;
}