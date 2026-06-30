import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import {
    SCAN_COOLDOWN_MS,
    ResolvedQr,
    ScanAction,
    combineDateAndTime,
    computeEffectiveStart,
    eventDateStr,
    buildStartTimeFilterRange,
    getAbsenceScheduleStatus,
    getScanConfirmCopy,
    getShiftDurationMinutes,
    resolveScanAction,
} from './time-entry.utils';
import { differenceInMinutes, parseISO, eachDayOfInterval, getDay, format } from 'date-fns';
import { HolidaysService } from '../schedules/holidays.service';

@Injectable()
export class TimeEntriesService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly holidaysService: HolidaysService,
    ) {}

    // --- Geofencing ---
    private async getGeofenceStatus(
        projectId: string | null,
        location: { latitude: number; longitude: number } | null,
    ): Promise<boolean> {
        if (!location || !projectId) return false;
        const { data: projectData } = await this.supabaseService
            .getClient()
            .from('projects')
            .select('geo_latitude, geo_longitude, geo_radius_meters')
            .eq('id', projectId)
            .single();
        if (!projectData?.geo_latitude || !projectData.geo_longitude || !projectData.geo_radius_meters) {
            return false;
        }
        const distance = this._calculateDistance(
            location.latitude,
            location.longitude,
            Number(projectData.geo_latitude),
            Number(projectData.geo_longitude),
        );
        return distance > projectData.geo_radius_meters;
    }

    private _calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // --- Cooldown ---
    private async assertScanCooldown(userId: string): Promise<void> {
        const supabase = this.supabaseService.getClient();
        const { data: user } = await supabase.from('users').select('last_scan_at').eq('id', userId).maybeSingle();
        if (!user?.last_scan_at) return;

        const elapsed = Date.now() - new Date(user.last_scan_at).getTime();
        if (elapsed < SCAN_COOLDOWN_MS) {
            const remainingSec = Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000);
            const min = Math.floor(remainingSec / 60);
            const sec = remainingSec % 60;
            throw new HttpException(
                `Poczekaj ${min}:${sec.toString().padStart(2, '0')} przed kolejnym skanowaniem.`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    private async touchScanCooldown(userId: string): Promise<void> {
        const supabase = this.supabaseService.getClient();
        await supabase.from('users').update({ last_scan_at: new Date().toISOString() }).eq('id', userId);
    }

    // --- QR resolution ---
    private async resolveQrCode(qrCodeValue: string): Promise<ResolvedQr> {
        const supabase = this.supabaseService.getClient();

        const { data: taskQrCode } = await supabase
            .from('qr_codes')
            .select('task:tasks(id, project_id)')
            .eq('code_value', qrCodeValue)
            .maybeSingle();

        if (taskQrCode && (taskQrCode as any).task) {
            return {
                scanType: 'task',
                scannedTaskId: (taskQrCode as any).task.id as string,
                scannedProjectId: (taskQrCode as any).task.project_id as string,
            };
        }

        const { data: locationQr } = await supabase
            .from('location_qr_codes')
            .select('id')
            .eq('code_value', qrCodeValue)
            .maybeSingle();

        if (!locationQr) throw new NotFoundException('Nieprawidłowy kod QR.');

        return { scanType: 'location', scannedProjectId: null, scannedTaskId: null };
    }

    // --- Schedule-based start ---
    private async getScheduledStartForUser(userId: string, eventTimeIso: string): Promise<Date | null> {
        const supabase = this.supabaseService.getClient();
        const dateStr = eventDateStr(eventTimeIso);

        const { data: schedule } = await supabase
            .from('schedules')
            .select('start_time, end_time, status')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .maybeSingle();

        if (!schedule || schedule.status === 'holiday') return null;
        if (['on_leave', 'sick_leave', 'replacement_needed'].includes(schedule.status)) return null;

        return combineDateAndTime(dateStr, schedule.start_time);
    }

    private async buildClockInTimes(
        userId: string,
        eventTimeIso: string,
    ): Promise<{ start_time: string; actual_start_time: string; is_schedule_adjusted: boolean }> {
        const actual = parseISO(eventTimeIso);
        const scheduledStart = await this.getScheduledStartForUser(userId, eventTimeIso);
        const effective = computeEffectiveStart(actual, scheduledStart);
        const isAdjusted = scheduledStart !== null && effective.getTime() !== actual.getTime();

        return {
            start_time: effective.toISOString(),
            actual_start_time: actual.toISOString(),
            is_schedule_adjusted: isAdjusted,
        };
    }

    // --- Preview ---
    async previewScan(userId: string, qrCodeValue: string) {
        const resolved = await this.resolveQrCode(qrCodeValue);
        const supabase = this.supabaseService.getClient();

        const { data: lastEntry } = await supabase
            .from('time_entries')
            .select('id, task_id')
            .eq('user_id', userId)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        const action = resolveScanAction(
            !!lastEntry,
            lastEntry?.task_id,
            resolved.scanType,
            resolved.scannedTaskId,
        );

        const copy = getScanConfirmCopy(action);
        return { action, ...copy, scanType: resolved.scanType };
    }

    // --- Scan ---
    async handleScan(
        userId: string,
        companyId: string,
        qrCodeValue: string,
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        await this.assertScanCooldown(userId);

        const supabase = this.supabaseService.getClient();
        const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        const { scanType, scannedProjectId, scannedTaskId } = await this.resolveQrCode(qrCodeValue);

        const { data: lastEntry } = await supabase
            .from('time_entries')
            .select('*')
            .eq('user_id', userId)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        let result: { status: string; entry: any };

        if (lastEntry) {
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

            if (scanType === 'location') {
                result = { status: 'clock_out', entry: closedEntry };
            } else if (scanType === 'task' && lastEntry.task_id && lastEntry.task_id === scannedTaskId) {
                result = { status: 'clock_out', entry: closedEntry };
            } else {
                const clockInTimes = await this.buildClockInTimes(userId, eventTime);
                const isOutsideOnClockIn = await this.getGeofenceStatus(scannedProjectId, location || null);
                const { data: newEntry } = await supabase
                    .from('time_entries')
                    .insert({
                        user_id: userId,
                        project_id: scannedProjectId,
                        task_id: scannedTaskId,
                        company_id: companyId,
                        start_time: clockInTimes.start_time,
                        actual_start_time: clockInTimes.actual_start_time,
                        is_schedule_adjusted: clockInTimes.is_schedule_adjusted,
                        start_gps_location: gpsLocationString,
                        is_offline_entry: !!timestamp,
                        is_outside_geofence: isOutsideOnClockIn,
                    })
                    .select('*, task:tasks(name)')
                    .maybeSingle();

                result = { status: 'clock_in', entry: newEntry };
            }
        } else if (scanType === 'location') {
            const clockInTimes = await this.buildClockInTimes(userId, eventTime);
            const { data: newEntry } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: null,
                    task_id: null,
                    company_id: companyId,
                    start_time: clockInTimes.start_time,
                    actual_start_time: clockInTimes.actual_start_time,
                    is_schedule_adjusted: clockInTimes.is_schedule_adjusted,
                    start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp,
                    is_outside_geofence: false,
                })
                .select('*, task:tasks(name)')
                .maybeSingle();
            result = { status: 'clock_in', entry: newEntry };
        } else {
            const clockInTimes = await this.buildClockInTimes(userId, eventTime);
            const isOutsideOnClockIn = await this.getGeofenceStatus(scannedProjectId, location || null);
            const { data: newEntry } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: scannedProjectId,
                    task_id: scannedTaskId,
                    company_id: companyId,
                    start_time: clockInTimes.start_time,
                    actual_start_time: clockInTimes.actual_start_time,
                    is_schedule_adjusted: clockInTimes.is_schedule_adjusted,
                    start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp,
                    is_outside_geofence: isOutsideOnClockIn,
                })
                .select('*, task:tasks(name)')
                .maybeSingle();
            result = { status: 'clock_in', entry: newEntry };
        }

        await this.touchScanCooldown(userId);
        return result;
    }

    async switchTask(
        userId: string,
        companyId: string,
        taskId: string,
        location?: { latitude: number; longitude: number },
    ) {
        await this.assertScanCooldown(userId);

        const supabase = this.supabaseService.getClient();
        const eventTime = new Date().toISOString();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

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

        const { data: taskData } = await supabase
            .from('tasks')
            .select('project_id')
            .eq('id', taskId)
            .maybeSingle();
        if (!taskData) throw new NotFoundException('Nie znaleziono zlecenia.');

        const clockInTimes = await this.buildClockInTimes(userId, eventTime);
        const isOutside = await this.getGeofenceStatus(taskData.project_id, location || null);

        const { data: entry } = await supabase
            .from('time_entries')
            .insert({
                user_id: userId,
                project_id: taskData.project_id,
                task_id: taskId,
                company_id: companyId,
                start_time: clockInTimes.start_time,
                actual_start_time: clockInTimes.actual_start_time,
                is_schedule_adjusted: clockInTimes.is_schedule_adjusted,
                start_gps_location: gpsLocationString,
                is_outside_geofence: isOutside,
                is_offline_entry: false,
            })
            .select('*, task:tasks(name)')
            .maybeSingle();

        await this.touchScanCooldown(userId);
        return { status: 'clock_in', entry };
    }

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
        return data;
    }

    async findAllForCompany(
        companyId: string,
        filters: { dateFrom?: string; dateTo?: string; userId?: string },
    ) {
        const supabase = this.supabaseService.getClient();
        let query = supabase
            .from('time_entries')
            .select(`
                id, start_time, end_time, actual_start_time, is_schedule_adjusted,
                was_edited, is_outside_geofence, is_manual, manual_comment,
                user:users ( id, first_name, last_name ),
                project:projects ( name ),
                task:tasks ( name )
            `)
            .eq('company_id', companyId);

        // Miesiąc rozliczeniowy = wyłącznie start_time (nigdy end_time), granice dnia w Europe/Warsaw
        const { fromIso, toIso } = buildStartTimeFilterRange(filters.dateFrom, filters.dateTo);
        if (fromIso) query = query.gte('start_time', fromIso);
        if (toIso) query = query.lte('start_time', toIso);
        if (filters.userId) query = query.eq('user_id', filters.userId);

        const { data, error } = await query.order('start_time', { ascending: false });
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async getSummary(
        companyId: string,
        filters: { dateFrom?: string; dateTo?: string; userId?: string },
    ) {
        const entries = await this.findAllForCompany(companyId, filters);

        const timeEntryMinutes = (entries || []).reduce((total, entry: any) => {
            if (!entry.end_time) return total;
            const start = parseISO(entry.start_time);
            const end = parseISO(entry.end_time);
            const diff = differenceInMinutes(end, start);
            return total + (diff > 0 ? diff : 0);
        }, 0);

        const supabase = this.supabaseService.getClient();
        const { fromDate, toDate } = buildStartTimeFilterRange(filters.dateFrom, filters.dateTo);

        // 1) Nieobecności z grafiku (gdy istnieje wiersz on_leave/sick_leave) — liczone wg zmiany
        let scheduleQuery = supabase
            .from('schedules')
            .select('user_id, date, start_time, end_time, status')
            .eq('company_id', companyId)
            .in('status', ['on_leave', 'sick_leave']);

        if (filters.userId) scheduleQuery = scheduleQuery.eq('user_id', filters.userId);
        if (fromDate) scheduleQuery = scheduleQuery.gte('date', fromDate);
        if (toDate) scheduleQuery = scheduleQuery.lte('date', toDate);

        const { data: absenceSchedules, error } = await scheduleQuery;
        if (error) throw new InternalServerErrorException(error.message);

        const scheduleCovered = new Set<string>();
        const scheduleAbsenceMinutes = (absenceSchedules || []).reduce((total, s: any) => {
            scheduleCovered.add(`${s.user_id}|${s.date}`);
            return total + getShiftDurationMinutes(s.start_time, s.end_time);
        }, 0);

        // 2) Nieobecności bez grafiku + święta — wg dni roboczych i godzin zmian
        //    zdefiniowanych przez firmę (departments.schedule_settings), × etat (FTE).
        let normAbsenceMinutes = 0;
        let holidayMinutes = 0;

        if (fromDate && toDate) {
            const { data: company } = await supabase
                .from('companies')
                .select('daily_norm_hours, count_holidays_as_work')
                .eq('id', companyId)
                .maybeSingle();

            // Norma dobowa = fallback, gdy dzień jest roboczy, ale nie ma zdefiniowanych godzin zmiany.
            const fallbackMinutes = Math.round(Number(company?.daily_norm_hours ?? 8) * 60);
            const countHolidays = company?.count_holidays_as_work !== false;

            const targetUsers = await this.getTargetUsers(companyId, filters.userId);
            const deptSettings = await this.getDeptSettingsMap(
                [...new Set([...targetUsers.values()].map((u) => u.departmentId).filter(Boolean) as string[])],
            );
            const holidaySet = await this.getHolidaySet(companyId, fromDate, toDate);

            // Zbiór dni nieobecności: `${userId}|${dateStr}`
            let absQuery = supabase
                .from('absences')
                .select('user_id, start_date, end_date')
                .eq('company_id', companyId)
                .eq('status', 'approved')
                .lte('start_date', toDate)
                .gte('end_date', fromDate);
            if (filters.userId) absQuery = absQuery.eq('user_id', filters.userId);
            const { data: absences } = await absQuery;

            const absenceDays = new Set<string>();
            for (const a of absences || []) {
                const start = a.start_date < fromDate ? fromDate : a.start_date;
                const end = a.end_date > toDate ? toDate : a.end_date;
                if (start > end) continue;
                for (const d of eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })) {
                    absenceDays.add(`${a.user_id}|${format(d, 'yyyy-MM-dd')}`);
                }
            }

            const days = eachDayOfInterval({ start: parseISO(fromDate), end: parseISO(toDate) });

            for (const day of days) {
                const dow = getDay(day); // 0 = niedziela ... 6 = sobota
                const dateStr = format(day, 'yyyy-MM-dd');
                const isHoliday = holidaySet.has(dateStr);

                for (const [userId, u] of targetUsers) {
                    // Oczekiwane minuty dla pracownika w tym dniu wg ustawień jego działu
                    const expected = this.expectedMinutesForDay(deptSettings, u.departmentId, dow, fallbackMinutes);
                    if (expected <= 0) continue; // nie jest to dzień roboczy dla tego pracownika

                    const minutes = Math.round(expected * u.multiplier);

                    if (isHoliday) {
                        if (countHolidays) holidayMinutes += minutes;
                        continue; // święto ma pierwszeństwo, nie doliczamy nieobecności
                    }

                    if (scheduleCovered.has(`${userId}|${dateStr}`)) continue; // policzone z grafiku
                    if (absenceDays.has(`${userId}|${dateStr}`)) {
                        normAbsenceMinutes += minutes;
                    }
                }
            }
        }

        const absenceMinutes = scheduleAbsenceMinutes + normAbsenceMinutes;

        return {
            timeEntryMinutes,
            absenceMinutes,
            holidayMinutes,
            totalMinutes: timeEntryMinutes + absenceMinutes + holidayMinutes,
        };
    }

    /** Mapa user_id -> { mnożnik etatu (FTE), departmentId }. Dla userId: tylko ta osoba; inaczej: pracownicy firmy. */
    private async getTargetUsers(
        companyId: string,
        userId?: string,
    ): Promise<Map<string, { multiplier: number; departmentId: string | null }>> {
        const supabase = this.supabaseService.getClient();
        let q = supabase.from('users').select('id, fte_id, department_id, status').eq('company_id', companyId);
        if (userId) q = q.eq('id', userId);
        else q = q.eq('role', 'employee');

        const { data: users } = await q;
        const activeUsers = (users || []).filter(
            (u: any) => u.status !== 'terminated' && u.status !== 'inactive',
        );

        const fteIds = [...new Set(activeUsers.map((u: any) => u.fte_id).filter(Boolean))];
        const fteMap = new Map<string, number>();
        if (fteIds.length > 0) {
            const { data: ftes } = await supabase
                .from('ftes')
                .select('id, multiplier')
                .in('id', fteIds);
            (ftes || []).forEach((f: any) => fteMap.set(f.id, Number(f.multiplier) || 1));
        }

        const map = new Map<string, { multiplier: number; departmentId: string | null }>();
        activeUsers.forEach((u: any) => {
            map.set(u.id, {
                multiplier: u.fte_id && fteMap.has(u.fte_id) ? fteMap.get(u.fte_id)! : 1,
                departmentId: u.department_id || null,
            });
        });
        return map;
    }

    /** Mapa department_id -> schedule_settings (JSON wg dni tygodnia). */
    private async getDeptSettingsMap(departmentIds: string[]): Promise<Map<string, any>> {
        const map = new Map<string, any>();
        if (departmentIds.length === 0) return map;
        const supabase = this.supabaseService.getClient();
        const { data } = await supabase
            .from('departments')
            .select('id, schedule_settings')
            .in('id', departmentIds);
        (data || []).forEach((d: any) => {
            if (d.schedule_settings) map.set(d.id, d.schedule_settings);
        });
        return map;
    }

    /**
     * Oczekiwane minuty pracy pracownika w danym dniu tygodnia, wg ustawień jego działu:
     * - dzień nieroboczy -> 0,
     * - dzień roboczy z godzinami zmiany -> długość pierwszej zmiany,
     * - dzień roboczy bez zdefiniowanych godzin -> norma dobowa (fallback).
     * Brak ustawień działu -> fallback pn–pt wg normy dobowej.
     */
    private expectedMinutesForDay(
        deptSettings: Map<string, any>,
        departmentId: string | null,
        weekday: number,
        fallbackMinutes: number,
    ): number {
        const settings = departmentId ? deptSettings.get(departmentId) : null;
        if (settings) {
            const ds = settings[String(weekday)];
            if (!ds || !ds.is_working_day) return 0;
            if (Array.isArray(ds.shifts) && ds.shifts.length > 0) {
                const s = ds.shifts[0];
                if (s?.start_time && s?.end_time) {
                    return getShiftDurationMinutes(s.start_time, s.end_time);
                }
            }
            return fallbackMinutes; // dzień roboczy bez godzin zmiany
        }
        // Brak ustawień działu -> domyślnie pn–pt
        return weekday >= 1 && weekday <= 5 ? fallbackMinutes : 0;
    }

    /** Zbiór dat świąt (ustawowe PL + firmowe) w zakresie [fromDate, toDate]. */
    private async getHolidaySet(companyId: string, fromDate: string, toDate: string): Promise<Set<string>> {
        const set = new Set<string>();
        const fromYear = Number(fromDate.slice(0, 4));
        const toYear = Number(toDate.slice(0, 4));
        for (let y = fromYear; y <= toYear; y++) {
            this.holidaysService.getPolishPublicHolidays(y).forEach((h) => {
                if (h.date >= fromDate && h.date <= toDate) set.add(h.date);
            });
        }

        const supabase = this.supabaseService.getClient();
        const { data: companyHolidays } = await supabase
            .from('company_holidays')
            .select('date')
            .eq('company_id', companyId)
            .gte('date', fromDate)
            .lte('date', toDate);
        (companyHolidays || []).forEach((h: any) => set.add(h.date));

        return set;
    }

    async update(entryId: string, companyId: string, updateTimeEntryDto: UpdateTimeEntryDto, editorId: string) {
        const supabase = this.supabaseService.getClient();
        const { data: originalEntry, error: findError } = await supabase
            .from('time_entries')
            .select('*')
            .eq('id', entryId)
            .eq('company_id', companyId)
            .single();
        if (findError) throw new NotFoundException('Nie znaleziono wpisu.');
        await supabase.from('audit_logs').insert({
            editor_user_id: editorId,
            target_time_entry_id: entryId,
            previous_values: originalEntry,
            new_values: updateTimeEntryDto,
            change_reason: updateTimeEntryDto.change_reason || 'Ręczna korekta przez managera.',
        });
        const { change_reason, ...entryData } = updateTimeEntryDto;
        const { data: updatedEntry, error: updateError } = await supabase
            .from('time_entries')
            .update({ ...entryData, was_edited: true })
            .eq('id', entryId)
            .select()
            .single();
        if (updateError) throw new InternalServerErrorException(updateError.message);
        return updatedEntry;
    }

    async remove(entryId: string, companyId: string, editorId: string, reason?: string) {
        const supabase = this.supabaseService.getClient();
        const { data: entryToDelete, error: findError } = await supabase
            .from('time_entries')
            .select('*')
            .eq('id', entryId)
            .eq('company_id', companyId)
            .single();
        if (findError) throw new NotFoundException('Nie znaleziono wpisu do usunięcia.');
        await supabase.from('audit_logs').insert({
            editor_user_id: editorId,
            target_time_entry_id: entryId,
            previous_values: entryToDelete,
            new_values: { status: 'DELETED' },
            change_reason: reason || 'Usunięcie wpisu przez managera.',
        });
        const { error: deleteError } = await supabase.from('time_entries').delete().eq('id', entryId);
        if (deleteError) throw new InternalServerErrorException(deleteError.message);
        return { message: 'Wpis został pomyślnie usunięty.' };
    }

    async getAuditLogs(entryId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data: entry } = await supabase
            .from('time_entries')
            .select('id')
            .eq('id', entryId)
            .eq('company_id', companyId)
            .single();
        if (!entry) throw new NotFoundException('Nie znaleziono wpisu.');
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*, editor:users (first_name, last_name)')
            .eq('target_time_entry_id', entryId)
            .order('created_at', { ascending: false });
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async createManual(companyId: string, dto: any, editorId: string) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('time_entries')
            .insert({
                user_id: dto.user_id,
                company_id: companyId,
                project_id: dto.project_id || null,
                task_id: dto.task_id || null,
                start_time: dto.start_time,
                end_time: dto.end_time,
                actual_start_time: dto.start_time,
                is_manual: true,
                manual_comment: dto.manual_comment,
                was_edited: false,
                is_outside_geofence: false,
            })
            .select('*, user:users(first_name, last_name), project:projects(name), task:tasks(name)')
            .single();

        if (error) throw new InternalServerErrorException(error.message);

        await supabase.from('audit_logs').insert({
            editor_user_id: editorId,
            target_time_entry_id: data.id,
            previous_values: {},
            new_values: data,
            change_reason: `Ręczne dodanie wpisu: ${dto.manual_comment}`,
        });

        return data;
    }
}
