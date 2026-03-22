import { Injectable, InternalServerErrorException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly subscriptionService: SubscriptionService
    ) { }

    async create(createUserDto: CreateUserDto, companyId: string) {
        // Check Limits
        const usersCount = await this.countForCompany(companyId);
        const canCreate = await this.subscriptionService.checkLimits(companyId, 'max_users', usersCount);

        if (!canCreate) {
            throw new ForbiddenException('Osiągnięto limit użytkowników dla Twojego planu.');
        }

        const supabase = this.supabaseService.getAdminClient();

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
                email: createUserDto.email,
                employment_type: createUserDto.employmentType,
                department_id: createUserDto.departmentId,
                team_id: createUserDto.teamId,
                fte_id: createUserDto.fteId,
                manager_id: createUserDto.managerId,
                employment_date: createUserDto.employmentDate,
                hourly_rate: createUserDto.hourlyRate,
                contract_end_date: createUserDto.contractEndDate,
                vacation_days_quota: createUserDto.vacationDaysQuota,
                phone_number: createUserDto.phoneNumber,
                emergency_contact: createUserDto.emergencyContact,
                status: createUserDto.status || 'active',
            })
            .select()
            .single();

        if (profileError) {
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw new InternalServerErrorException(profileError.message);
        }

        return profileData;
    }

    async countForCompany(companyId: string): Promise<number> {
        const supabase = this.supabaseService.getClient();
        const { count, error } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        if (error) return 0;
        return count || 0;
    }

    async findAllForCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('company_id', companyId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async update(id: string, updateUserDto: UpdateUserDto, companyId: string) {
        const supabase = this.supabaseService.getAdminClient();
        
        const updateData: any = {};
        if (updateUserDto.firstName !== undefined) updateData.first_name = updateUserDto.firstName;
        if (updateUserDto.lastName !== undefined) updateData.last_name = updateUserDto.lastName;
        if (updateUserDto.role !== undefined) updateData.role = updateUserDto.role;
        if (updateUserDto.employmentType !== undefined) updateData.employment_type = updateUserDto.employmentType;
        if (updateUserDto.departmentId !== undefined) updateData.department_id = updateUserDto.departmentId;
        if (updateUserDto.teamId !== undefined) updateData.team_id = updateUserDto.teamId;
        if (updateUserDto.fteId !== undefined) updateData.fte_id = updateUserDto.fteId;
        if (updateUserDto.managerId !== undefined) updateData.manager_id = updateUserDto.managerId;
        if (updateUserDto.employmentDate !== undefined) updateData.employment_date = updateUserDto.employmentDate;
        if (updateUserDto.contractEndDate !== undefined) updateData.contract_end_date = updateUserDto.contractEndDate;
        if (updateUserDto.vacationDaysQuota !== undefined) updateData.vacation_days_quota = updateUserDto.vacationDaysQuota;
        if (updateUserDto.phoneNumber !== undefined) updateData.phone_number = updateUserDto.phoneNumber;
        if (updateUserDto.emergencyContact !== undefined) updateData.emergency_contact = updateUserDto.emergencyContact;
        if (updateUserDto.status !== undefined) updateData.status = updateUserDto.status;
        if (updateUserDto.hourlyRate !== undefined) updateData.hourly_rate = updateUserDto.hourlyRate;

        // If password is provided, update auth user
        if (updateUserDto.password) {
             const { error: authError } = await supabase.auth.admin.updateUserById(id, { password: updateUserDto.password });
             if (authError) throw new InternalServerErrorException(authError.message);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) {
             throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async updateSelfProfile(id: string, updateUserDto: UpdateUserDto) {
        const supabase = this.supabaseService.getAdminClient();
        
        // Zwykły pracownik może edytować tylko wybrane dane
        const updateData: any = {};
        if (updateUserDto.phoneNumber !== undefined) updateData.phone_number = updateUserDto.phoneNumber;
        if (updateUserDto.emergencyContact !== undefined) updateData.emergency_contact = updateUserDto.emergencyContact;

        const { data, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
             throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async remove(id: string, companyId: string) {
        const supabase = this.supabaseService.getAdminClient();
        
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('id')
            .eq('id', id)
            .eq('company_id', companyId)
            .single();
            
        if (fetchError || !user) {
            throw new ForbiddenException('Nie znaleziono użytkownika lub brak uprawnień');
        }

        // Deletes the user completely. Ensure ON DELETE CASCADE is set on relations
        const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
        
        if (deleteError) {
            throw new InternalServerErrorException(deleteError.message);
        }

        return { success: true };
    }
}