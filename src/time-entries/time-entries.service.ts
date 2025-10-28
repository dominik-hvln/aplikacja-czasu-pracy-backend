import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateTimeEntryDto } from "./dto/update-time-entry.dto";

@Injectable()
export class TimeEntriesService {
    constructor(private readonly supabaseService: SupabaseService) {}

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
        const R = 6371e3; const φ1 = (lat1 * Math.PI) / 180; const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180; const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
    }
    // --- Koniec metod pomocniczych ---

    /**
     * PRZEPISANA LOGIKA OBSŁUGI SKANOWANIA
     */
    async handleScan(
        userId: string,
        companyId: string,
        qrCodeValue: string,
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        const supabase = this.supabaseService.getClient();
        const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        let scannedProjectId: string | null = null;
        let scannedTaskId: string | null = null;
        let scanType: 'task' | 'location' = 'location';

        // 1) Czy to kod ZLECENIA?
        const { data: taskQrCode } = await supabase
            .from('qr_codes')
            .select('task:tasks(id, project_id)')
            .eq('code_value', qrCodeValue)
            .maybeSingle();

        if (taskQrCode && (taskQrCode as any).task) {
            scanType = 'task';
            scannedTaskId = (taskQrCode as any).task.id as string;
            scannedProjectId = (taskQrCode as any).task.project_id as string;
        } else {
            // 2) Czy to kod LOKALIZACJI (ogólny)?
            const { data: locationQr } = await supabase
                .from('location_qr_codes')
                .select('id')
                .eq('code_value', qrCodeValue)
                .maybeSingle();
            if (!locationQr) throw new NotFoundException('Nieprawidłowy kod QR.');
            scanType = 'location';
        }

        // 3) Ostatni aktywny wpis – bierz NAJŚWIEŻSZY (odporne na duplikaty)
        const { data: lastEntry } = await supabase
            .from('time_entries')
            .select('*')
            .eq('user_id', userId)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        // --- Mamy aktywny wpis?
        if (lastEntry) {
            // Zawsze najpierw go zamykamy
            const isOutsideOnClockOut = await this.getGeofenceStatus(lastEntry.project_id, location || null);
            const { data: closedEntry } = await supabase
                .from('time_entries')
                .update({
                    end_time: eventTime,
                    end_gps_location: gpsLocationString,
                    is_outside_geofence: lastEntry.is_outside_geofence || isOutsideOnClockOut,
                })
                .eq('id', lastEntry.id)
                .select('*, task:tasks(name)')
                .maybeSingle();

            // **Kluczowa zmiana**:
            // - skan "location" (ogólny) => zawsze KOŃCZY dzień (nie otwieramy nowego)
            if (scanType === 'location') {
                return { status: 'clock_out', entry: closedEntry };
            }

            // - skan tego samego taska => KOŃCZY zlecenie
            if (scanType === 'task' && lastEntry.task_id && lastEntry.task_id === scannedTaskId) {
                return { status: 'clock_out', entry: closedEntry };
            }

            // - w pozostałych przypadkach to ZMIANA -> otwieramy nowy wpis
            const isOutsideOnClockIn = await this.getGeofenceStatus(scannedProjectId, location || null);
            const { data: newEntry } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: scannedProjectId,
                    task_id: scannedTaskId,
                    company_id: companyId,
                    start_time: eventTime,
                    start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp,
                    is_outside_geofence: isOutsideOnClockIn,
                })
                .select('*, task:tasks(name)')
                .maybeSingle();

            return { status: 'clock_in', entry: newEntry };
        }

        // --- Brak aktywnego wpisu -> start pracy
        if (scanType === 'location') {
            // Start dnia „ogólnego”
            const { data: newEntry } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: null,
                    task_id: null,
                    company_id: companyId,
                    start_time: eventTime,
                    start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp,
                    is_outside_geofence: false,
                })
                .select('*, task:tasks(name)')
                .maybeSingle();
            return { status: 'clock_in', entry: newEntry };
        } else {
            // Start zlecenia
            const isOutsideOnClockIn = await this.getGeofenceStatus(scannedProjectId, location || null);
            const { data: newEntry } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: scannedProjectId,
                    task_id: scannedTaskId,
                    company_id: companyId,
                    start_time: eventTime,
                    start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp,
                    is_outside_geofence: isOutsideOnClockIn,
                })
                .select('*, task:tasks(name)')
                .maybeSingle();
            return { status: 'clock_in', entry: newEntry };
        }
    }

    /**
     * PRZEPISANA LOGIKA PRZEŁĄCZANIA Z LISTY
     */
    async switchTask(
        userId: string,
        companyId: string,
        taskId: string,
        location?: { latitude: number; longitude: number }
    ) {
        const supabase = this.supabaseService.getClient();
        const eventTime = new Date().toISOString();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        // 1) Odszukaj NAJŚWIEŻSZY otwarty wpis i zamknij
        const { data: lastEntry } = await supabase
            .from('time_entries')
            .select('*')
            .eq('user_id', userId)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastEntry) {
            const isOutsideOnClockOut = await this.getGeofenceStatus(lastEntry.project_id, location || null);
            await supabase
                .from('time_entries')
                .update({
                    end_time: eventTime,
                    end_gps_location: gpsLocationString,
                    is_outside_geofence: lastEntry.is_outside_geofence || isOutsideOnClockOut,
                })
                .eq('id', lastEntry.id);
        }

        // 2) Otwórz nowy wpis dla wybranego taska
        const { data: taskData } = await supabase
            .from('tasks')
            .select('project_id')
            .eq('id', taskId)
            .maybeSingle();
        if (!taskData) throw new NotFoundException('Nie znaleziono zlecenia.');

        const isOutside = await this.getGeofenceStatus(taskData.project_id, location || null);

        const { data: entry } = await supabase
            .from('time_entries')
            .insert({
                user_id: userId,
                project_id: taskData.project_id,
                task_id: taskId,
                company_id: companyId,
                start_time: eventTime,
                start_gps_location: gpsLocationString,
                is_outside_geofence: isOutside,
                is_offline_entry: false,
            })
            .select('*, task:tasks(name)')
            .maybeSingle();

        return { status: 'clock_in', entry };
    }

    // --- Pozostałe Metody (bez zmian) ---
    async findActiveForUser(userId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('time_entries')
            .select('*, task:tasks(name)')
            .eq('user_id', userId)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw new InternalServerErrorException(error.message);
        return data; // albo null
    }

    async findAllForCompany(companyId: string, filters: { dateFrom?: string; dateTo?: string; userId?: string }) {
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

    async update(entryId: string, companyId: string, updateTimeEntryDto: UpdateTimeEntryDto, editorId: string) {
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
}
