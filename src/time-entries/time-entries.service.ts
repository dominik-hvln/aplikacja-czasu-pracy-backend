import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class TimeEntriesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async handleScan(
        userId: string,
        companyId: string,
        qrCodeValue: string,
        location?: { latitude: number; longitude: number }
    ) {
        const supabase = this.supabaseService.getClient();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        const { data: qrCode, error: qrError } = await supabase
            .from('qr_codes').select('project_id').eq('code_value', qrCodeValue).single();
        if (qrError || !qrCode) {
            throw new NotFoundException('Nie znaleziono projektu dla tego kodu QR.');
        }
        const projectId = qrCode.project_id;

        const { data: lastEntry, error: lastEntryError } = await supabase
            .from('time_entries').select('*').eq('user_id', userId).is('end_time', null).single();

        if (lastEntryError && lastEntryError.code !== 'PGRST116') {
            throw new InternalServerErrorException(lastEntryError.message);
        }

        if (lastEntry) {
            // Zamykanie ostatniego wpisu (Clock-out)
            const { data: updatedEntry, error: updateError } = await supabase
                .from('time_entries')
                .update({ end_time: new Date().toISOString(), end_gps_location: gpsLocationString })
                .eq('id', lastEntry.id)
                .select().single();

            if (updateError) throw new InternalServerErrorException(updateError.message);
            return { status: 'clock_out', entry: updatedEntry };
        } else {
            // Otwieranie nowego wpisu (Clock-in)
            const { data: newEntry, error: insertError } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: projectId,
                    company_id: companyId,
                    start_time: new Date().toISOString(),
                    start_gps_location: gpsLocationString,
                })
                .select().single();

            if (insertError) throw new InternalServerErrorException(insertError.message);
            return { status: 'clock_in', entry: newEntry };
        }
    }
}