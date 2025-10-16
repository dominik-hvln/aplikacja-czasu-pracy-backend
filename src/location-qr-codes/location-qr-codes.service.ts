import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateLocationQrCodeDto } from './dto/create-location-qr-code.dto';

@Injectable()
export class LocationQrCodesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async create(createDto: CreateLocationQrCodeDto, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('location_qr_codes')
            .insert({
                name: createDto.name,
                company_id: companyId,
            })
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async findAllForCompany(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('location_qr_codes')
            .select('*')
            .eq('company_id', companyId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async remove(id: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('location_qr_codes')
            .delete()
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) {
            if (error.code === 'PGRST116') { // Błąd, gdy nic nie znaleziono do usunięcia
                throw new NotFoundException(`Nie znaleziono kodu o ID ${id} w Twojej firmie.`);
            }
            throw new InternalServerErrorException(error.message);
        }
        return { message: 'Kod lokalizacyjny został pomyślnie usunięty.' };
    }
}