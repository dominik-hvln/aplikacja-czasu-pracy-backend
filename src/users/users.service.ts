import { Injectable, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(createUserDto: CreateUserDto, companyId: string) {
        const supabase = this.supabaseService.getClient();

        // Krok 1: Stwórz użytkownika w systemie Supabase Auth (jako admin)
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: createUserDto.email,
            password: createUserDto.password,
            email_confirm: true, // Od razu potwierdzamy e-mail
        });

        if (authError) {
            if (authError.message.includes('unique constraint')) {
                throw new ConflictException('Użytkownik o tym adresie e-mail już istnieje.');
            }
            throw new InternalServerErrorException(authError.message);
        }

        // Krok 2: Stwórz profil użytkownika w naszej tabeli `users`
        const { data: profileData, error: profileError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                company_id: companyId,
                first_name: createUserDto.firstName,
                last_name: createUserDto.lastName,
                role: createUserDto.role,
            })
            .select()
            .single();

        if (profileError) {
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw new InternalServerErrorException(profileError.message);
        }

        return profileData;
    }
}