import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateTimeEntryDto } from "./dto/update-time-entry.dto";

@Injectable()
export class TimeEntriesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Główna funkcja "dyspozytor", która decyduje, jak obsłużyć skan.
     */
    async handleScan(
        userId: string,
        companyId: string,
        qrCodeValue: string,
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        // Krok 1: Sprawdź, czy to jest kod QR specyficzny dla zlecenia (taska).
        const { data: taskQrCode } = await this.supabaseService.getClient()
            .from('qr_codes').select('task:tasks(id, project_id)').eq('code_value', qrCodeValue).single();

        if (taskQrCode && taskQrCode.task) {
            // SCENARIUSZ 1: Zeskanowano kod zlecenia (taska). Uruchamiamy starą logikę.
            return this.handleTaskScan(userId, companyId, qrCodeValue, location, timestamp);
        }

        // Krok 2: Jeśli nie, sprawdź, czy to kod ogólny/lokalizacyjny.
        const { data: locationQrCode } = await this.supabaseService.getClient()
            .from('location_qr_codes').select('id').eq('code_value', qrCodeValue).single();

        if (locationQrCode) {
            // SCENARIUSZ 2: Zeskanowano kod ogólny. Uruchamiamy nową logikę.
            return this.handleLocationScan(userId, companyId, location, timestamp);
        }

        // Krok 3: Jeśli kod nie pasuje do niczego.
        throw new NotFoundException('Zeskanowany kod QR jest nieprawidłowy lub nieaktywny.');
    }

    /**
     * Metoda pomocnicza obsługująca logikę dla skanów ZLECEŃ (tasków).
     * To jest Twoja istniejąca, działająca logika.
     */
    private async handleTaskScan(
        userId: string,
        companyId: string,
        qrCodeValue: string,
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        const supabase = this.supabaseService.getClient();
        try {
            const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
            const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

            const { data: qrCodeData, error: qrError } = await supabase
                .from('qr_codes').select('task_id').eq('code_value', qrCodeValue).single();
            if (qrError || !qrCodeData?.task_id) {
                throw new NotFoundException(`Nie znaleziono aktywnego zlecenia dla zeskanowanego kodu QR.`);
            }
            const taskId = qrCodeData.task_id;

            const { data: taskData, error: taskError } = await supabase
                .from('tasks').select('id, project_id').eq('id', taskId).single();
            if (taskError || !taskData?.project_id) {
                throw new NotFoundException(`Szczegóły zlecenia o ID ${taskId} nie mogły zostać odnalezione.`);
            }
            const projectId = taskData.project_id;

            const { data: projectData, error: projectError } = await supabase
                .from('projects').select('geo_latitude, geo_longitude, geo_radius_meters').eq('id', projectId).single();
            if (projectError) {
                throw new NotFoundException(`Projekt powiązany ze zleceniem nie został znaleziony.`);
            }

            let isOutsideGeofence = false;
            if (location && projectData.geo_latitude && projectData.geo_longitude && projectData.geo_radius_meters) {
                const distance = this._calculateDistance(location.latitude, location.longitude, Number(projectData.geo_latitude), Number(projectData.geo_longitude));
                if (distance > projectData.geo_radius_meters) {
                    isOutsideGeofence = true;
                }
            }

            const { data: lastEntry, error: lastEntryError } = await supabase
                .from('time_entries').select('*').eq('user_id', userId).is('end_time', null).single();
            if (lastEntryError && lastEntryError.code !== 'PGRST116') {
                throw new InternalServerErrorException(lastEntryError.message);
            }

            if (lastEntry) {
                const { data: closedEntry, error: closeError } = await supabase.from('time_entries').update({
                    end_time: eventTime,
                    end_gps_location: gpsLocationString,
                    is_outside_geofence: lastEntry.is_outside_geofence || isOutsideGeofence,
                }).eq('id', lastEntry.id).select().single();
                if (closeError) throw new InternalServerErrorException(closeError.message);

                if (lastEntry.task_id === taskId) {
                    return { status: 'clock_out', entry: closedEntry };
                } else {
                    const { data: newEntry, error: insertError } = await supabase.from('time_entries').insert({
                        user_id: userId, project_id: projectId, task_id: taskId, company_id: companyId,
                        start_time: eventTime, start_gps_location: gpsLocationString,
                        is_offline_entry: !!timestamp, is_outside_geofence: isOutsideGeofence,
                    }).select().single();
                    if (insertError) throw new InternalServerErrorException(insertError.message);
                    return { status: 'job_change', closedEntry: closedEntry, newEntry: newEntry };
                }
            } else {
                const { data: newEntry, error: insertError } = await supabase.from('time_entries').insert({
                    user_id: userId, project_id: projectId, task_id: taskId, company_id: companyId,
                    start_time: eventTime, start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp, is_outside_geofence: isOutsideGeofence,
                }).select().single();
                if (insertError) throw new InternalServerErrorException(insertError.message);
                return { status: 'clock_in', entry: newEntry };
            }
        } catch (error) {
            console.error('Błąd w handleTaskScan:', error.message);
            throw error;
        }
    }

    /**
     * NOWA metoda pomocnicza, obsługująca logikę dla skanów OGÓLNYCH/lokalizacyjnych.
     */
    private async handleLocationScan(
        userId: string,
        companyId: string,
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        const supabase = this.supabaseService.getClient();
        const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        const { data: lastEntry } = await supabase.from('time_entries').select('*').eq('user_id', userId).is('end_time', null).single();

        if (lastEntry) { // Użytkownik kończy dzień pracy
            const { data: closedEntry } = await supabase.from('time_entries').update({
                end_time: eventTime,
                end_gps_location: gpsLocationString,
            }).eq('id', lastEntry.id).select().single();
            return { status: 'general_clock_out', entry: closedEntry };
        } else { // Użytkownik rozpoczyna ogólny dzień pracy
            const { data: newEntry } = await supabase.from('time_entries').insert({
                user_id: userId, company_id: companyId,
                start_time: eventTime, start_gps_location: gpsLocationString,
                is_offline_entry: !!timestamp,
                project_id: null,
                task_id: null,
            }).select().single();
            return { status: 'general_clock_in', entry: newEntry };
        }
    }

    // --- Reszta metod pozostaje bez zmian ---

    private _calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async findAllForCompany(
        companyId: string,
        filters: { dateFrom?: string; dateTo?: string; userId?: string },
    ) {
        const supabase = this.supabaseService.getClient();
        let query = supabase.from('time_entries').select(`
                id, start_time, end_time, was_edited, is_outside_geofence,
                user:users ( first_name, last_name ),
                project:projects ( name ),
                task:tasks ( name )
            `).eq('company_id', companyId);
        if (filters.dateFrom) query = query.gte('start_time', filters.dateFrom);
        if (filters.dateTo) query = query.lte('start_time', filters.dateTo);
        if (filters.userId) query = query.eq('user_id', filters.userId);
        const { data, error } = await query.order('start_time', { ascending: false });
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async update(
        entryId: string,
        companyId: string,
        updateTimeEntryDto: UpdateTimeEntryDto,
        editorId: string,
    ) {
        const supabase = this.supabaseService.getClient();
        const { data: originalEntry, error: findError } = await supabase
            .from('time_entries').select('*').eq('id', entryId).eq('company_id', companyId).single();
        if (findError) throw new NotFoundException('Nie znaleziono wpisu.');
        await supabase.from('audit_logs').insert({
            editor_user_id: editorId, target_time_entry_id: entryId,
            previous_values: originalEntry, new_values: updateTimeEntryDto,
            change_reason: updateTimeEntryDto.change_reason || 'Ręczna korekta przez managera.',
        });
        const { change_reason, ...entryData } = updateTimeEntryDto;
        const { data: updatedEntry, error: updateError } = await supabase
            .from('time_entries').update({ ...entryData, was_edited: true }).eq('id', entryId).select().single();
        if (updateError) throw new InternalServerErrorException(updateError.message);
        return updatedEntry;
    }

    async remove(entryId: string, companyId: string, editorId: string, reason?: string) {
        const supabase = this.supabaseService.getClient();
        const { data: entryToDelete, error: findError } = await supabase
            .from('time_entries').select('*').eq('id', entryId).eq('company_id', companyId).single();
        if (findError) throw new NotFoundException('Nie znaleziono wpisu do usunięcia.');
        await supabase.from('audit_logs').insert({
            editor_user_id: editorId, target_time_entry_id: entryId,
            previous_values: entryToDelete, new_values: { status: 'DELETED' },
            change_reason: reason || 'Usunięcie wpisu przez managera.',
        });
        const { error: deleteError } = await supabase.from('time_entries').delete().eq('id', entryId);
        if (deleteError) throw new InternalServerErrorException(deleteError.message);
        return { message: 'Wpis został pomyślnie usunięty.' };
    }

    async getAuditLogs(entryId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data: entry } = await supabase.from('time_entries').select('id').eq('id', entryId).eq('company_id', companyId).single();
        if (!entry) throw new NotFoundException('Nie znaleziono wpisu.');
        const { data, error } = await supabase
            .from('audit_logs').select('*, editor:users (first_name, last_name)')
            .eq('target_time_entry_id', entryId).order('created_at', { ascending: false });
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async switchTask(
        userId: string,
        companyId: string,
        taskId: string,
        location?: { latitude: number; longitude: number }
    ) {
        const supabase = this.supabaseService.getClient();
        const eventTime = new Date().toISOString();
        // ✅ Używamy przekazanej lokalizacji
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        const { data: lastEntry } = await supabase
            .from('time_entries').select('*').eq('user_id', userId).is('end_time', null).single();

        if (lastEntry) {
            await supabase.from('time_entries').update({
                end_time: eventTime,
                end_gps_location: gpsLocationString, // ✅ Zapisujemy GPS przy zamknięciu starego wpisu
            }).eq('id', lastEntry.id);
        }

        const { data: taskData } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
        if (!taskData) throw new NotFoundException('Nie znaleziono zlecenia.');

        const { data: newEntry } = await supabase.from('time_entries').insert({
            user_id: userId, project_id: taskData.project_id, task_id: taskId, company_id: companyId,
            start_time: eventTime, start_gps_location: gpsLocationString // ✅ Zapisujemy GPS przy otwarciu nowego wpisu
        }).select().single();

        return { status: 'job_switch_success', newEntry };
    }

    async findActiveForUser(userId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('time_entries')
            .select('*, task:tasks(name)')
            .eq('user_id', userId)
            .is('end_time', null)
            .single();

        // To nie jest błąd, po prostu nie ma aktywnego wpisu
        if (error && error.code === 'PGRST116') {
            return null;
        }
        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }
}