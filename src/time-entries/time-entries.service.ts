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
        const supabase = this.supabaseService.getClient();

        // Krok 1: Sprawdź, czy to jest kod QR specyficzny dla zlecenia (taska).
        const { data: taskQrCode } = await this.supabaseService.getClient()
            .from('qr_codes').select('task:tasks(id, project_id)').eq('code_value', qrCodeValue).single();

        if (taskQrCode && taskQrCode.task) {
            // === SCENARIUSZ 1: Zeskanowano kod zlecenia (taska). ===
            return this.handleTaskScan(userId, companyId, (taskQrCode.task as any), location, timestamp);
        }

        // Krok 2: Jeśli nie, sprawdź, czy to kod ogólny/lokalizacyjny.
        const { data: locationQrCode } = await this.supabaseService.getClient()
            .from('location_qr_codes').select('id').eq('code_value', qrCodeValue).single();

        if (locationQrCode) {
            // === SCENARIUSZ 2: Zeskanowano kod ogólny. ===
            return this.handleLocationScan(userId, companyId, location, timestamp);
        }

        throw new NotFoundException('Zeskanowany kod QR jest nieprawidłowy lub nieaktywny.');
    }

    /**
     * Metoda pomocnicza obsługująca logikę dla skanów ZLECEŃ (tasków).
     */
    private async handleTaskScan(
        userId: string,
        companyId: string,
        task: { id: string, project_id: string },
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        const supabase = this.supabaseService.getClient();
        try {
            const taskId = task.id;
            const projectId = task.project_id;

            // ✅ POPRAWKA 1: Przekazujemy `location || null`
            const isOutsideOnClockIn = await this.getGeofenceStatus(projectId, location || null);

            const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
            const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

            const { data: lastEntry, error: lastEntryError } = await supabase.from('time_entries').select('*').eq('user_id', userId).is('end_time', null).single();

            if (lastEntryError && lastEntryError.code !== 'PGRST116') {
                throw new InternalServerErrorException(lastEntryError.message);
            }

            if (lastEntry) { // Użytkownik ma aktywny wpis
                // ✅ POPRAWKA 2: Przekazujemy `location || null`
                const isOutsideOnClockOut = await this.getGeofenceStatus(lastEntry.project_id, location || null);
                const { data: closedEntry, error: closeError } = await supabase.from('time_entries').update({
                    end_time: eventTime, end_gps_location: gpsLocationString,
                    is_outside_geofence: lastEntry.is_outside_geofence || isOutsideOnClockOut,
                }).eq('id', lastEntry.id).select().single();

                if (closeError) throw new InternalServerErrorException(closeError.message);

                if (lastEntry.task_id === taskId) {
                    return { status: 'clock_out', entry: closedEntry };
                } else {
                    const { data: newEntry, error: insertError } = await supabase.from('time_entries').insert({
                        user_id: userId, project_id: projectId, task_id: taskId, company_id: companyId,
                        start_time: eventTime, start_gps_location: gpsLocationString,
                        is_offline_entry: !!timestamp, is_outside_geofence: isOutsideOnClockIn,
                    }).select().single();
                    if (insertError) throw new InternalServerErrorException(insertError.message);
                    return { status: 'clock_in', entry: newEntry };
                }
            } else { // Użytkownik nie ma aktywnego wpisu
                const { data: newEntry, error: insertError } = await supabase.from('time_entries').insert({
                    user_id: userId, project_id: projectId, task_id: taskId, company_id: companyId,
                    start_time: eventTime, start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp, is_outside_geofence: isOutsideOnClockIn,
                }).select().single();
                if (insertError) throw new InternalServerErrorException(insertError.message);
                return { status: 'clock_in', entry: newEntry };
            }
        } catch (error) {
            console.error('Błąd w handleTaskScan:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    /**
     * Metoda pomocnicza dla skanów OGÓLNYCH/lokalizacyjnych.
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
            const { data: closedEntry, error: closeError } = await supabase.from('time_entries').update({
                end_time: eventTime, end_gps_location: gpsLocationString,
            }).eq('id', lastEntry.id).select().single();
            if (closeError) throw new InternalServerErrorException(closeError.message);
            return { status: 'clock_out', entry: closedEntry };
        } else { // Użytkownik rozpoczyna ogólny dzień pracy
            const { data: newEntry, error: insertError } = await supabase.from('time_entries').insert({
                user_id: userId, company_id: companyId,
                start_time: eventTime, start_gps_location: gpsLocationString,
                is_offline_entry: !!timestamp,
                project_id: null, task_id: null,
            }).select().single();
            if (insertError) throw new InternalServerErrorException(insertError.message);
            return { status: 'clock_in', entry: newEntry };
        }
    }

    // --- Metody pomocnicze (Geofencing) ---
    private async getGeofenceStatus(projectId: string | null, location: { latitude: number, longitude: number } | null): Promise<boolean> {
        if (!location || !projectId) return false;
        const { data: projectData } = await this.supabaseService.getClient()
            .from('projects').select('geo_latitude, geo_longitude, geo_radius_meters').eq('id', projectId).single();
        if (!projectData?.geo_latitude || !projectData.geo_longitude || !projectData.geo_radius_meters) {
            return false;
        }
        const distance = this._calculateDistance(location.latitude, location.longitude, Number(projectData.geo_latitude), Number(projectData.geo_longitude));
        return distance > projectData.geo_radius_meters;
    }

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

    // --- Pozostałe metody (bez zmian) ---
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
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        const { data: lastEntry } = await supabase
            .from('time_entries').select('*').eq('user_id', userId).is('end_time', null).single();

        if (lastEntry) {
            await supabase.from('time_entries').update({
                end_time: eventTime,
                end_gps_location: gpsLocationString,
            }).eq('id', lastEntry.id);
        }

        const { data: taskData } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
        if (!taskData) throw new NotFoundException('Nie znaleziono zlecenia.');

        // ✅ POPRAWKA 3: Przekazujemy `location || null`
        const isOutside = await this.getGeofenceStatus(taskData.project_id, location || null);

        const { data: newEntry } = await supabase.from('time_entries').insert({
            user_id: userId, project_id: taskData.project_id, task_id: taskId, company_id: companyId,
            start_time: eventTime, start_gps_location: gpsLocationString,
            is_outside_geofence: isOutside,
            is_offline_entry: false
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
        if (error && error.code === 'PGRST116') return null;
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}