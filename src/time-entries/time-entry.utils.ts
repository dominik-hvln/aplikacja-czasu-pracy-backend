import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const APP_TIMEZONE = 'Europe/Warsaw';

/** Domyślna pora nocna (Kodeks pracy: 8 godzin między 21:00 a 7:00). */
export const DEFAULT_NIGHT_START = '22:00';
export const DEFAULT_NIGHT_END = '06:00';

export const SCAN_COOLDOWN_MS = 2 * 60 * 1000;

export type ScanAction = 'clock_in' | 'clock_out' | 'switch_task';

export interface ResolvedQr {
    scanType: 'task' | 'location';
    scannedProjectId: string | null;
    scannedTaskId: string | null;
}

export function resolveScanAction(
    hasActiveEntry: boolean,
    lastEntryTaskId: string | null | undefined,
    scanType: 'task' | 'location',
    scannedTaskId: string | null,
): ScanAction {
    if (!hasActiveEntry) {
        return 'clock_in';
    }
    if (scanType === 'location') {
        return 'clock_out';
    }
    if (scanType === 'task' && lastEntryTaskId && lastEntryTaskId === scannedTaskId) {
        return 'clock_out';
    }
    return 'switch_task';
}

export function getScanConfirmCopy(action: ScanAction): { title: string; message: string } {
    switch (action) {
        case 'clock_in':
            return {
                title: 'Rozpocząć pracę?',
                message: 'Czy chcesz rozpocząć pracę?',
            };
        case 'clock_out':
            return {
                title: 'Zakończyć pracę?',
                message: 'Czy chcesz zakończyć pracę?',
            };
        case 'switch_task':
            return {
                title: 'Zmienić zlecenie?',
                message: 'Czy chcesz zakończyć bieżące zlecenie i rozpocząć nowe?',
            };
    }
}

export function getShiftDurationMinutes(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMins = sh * 60 + (sm || 0);
    let endMins = eh * 60 + (em || 0);
    if (endMins <= startMins) {
        endMins += 24 * 60;
    }
    return endMins - startMins;
}

/**
 * Dzieli przedział pracy na godziny dzienne i nocne.
 *
 * Okno nocne jest liczone wg czasu lokalnego (Europe/Warsaw), więc poprawnie
 * obsługuje zmianę czasu. Gdy okno przechodzi przez północ (np. 22:00–06:00),
 * dla każdego dnia D brany jest przedział [D nightStart, D+1 nightEnd).
 *
 * Gwarancja: dayMinutes + nightMinutes === totalMinutes (bez błędów zaokrągleń).
 */
export function splitDayNightMinutes(
    start: Date,
    end: Date,
    nightStart: string = DEFAULT_NIGHT_START,
    nightEnd: string = DEFAULT_NIGHT_END,
): { totalMinutes: number; dayMinutes: number; nightMinutes: number } {
    const totalMs = end.getTime() - start.getTime();
    if (!(totalMs > 0)) {
        return { totalMinutes: 0, dayMinutes: 0, nightMinutes: 0 };
    }

    const totalMinutes = Math.round(totalMs / 60000);

    const startNorm = normalizeTimeStr(nightStart);
    const endNorm = normalizeTimeStr(nightEnd);
    if (startNorm === endNorm) {
        // Zerowe okno nocne — całość liczymy jako dzienną.
        return { totalMinutes, dayMinutes: totalMinutes, nightMinutes: 0 };
    }

    const crossesMidnight = endNorm < startNorm;

    // Okno nocne dnia D może sięgać do D+1, więc zaczynamy dzień wcześniej.
    const firstDay = addDays(parseISO(formatInTimeZone(start, APP_TIMEZONE, 'yyyy-MM-dd')), -1);
    const lastDay = parseISO(formatInTimeZone(end, APP_TIMEZONE, 'yyyy-MM-dd'));

    let nightMs = 0;
    for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
        const dayStr = format(d, 'yyyy-MM-dd');
        const windowStart = combineDateAndTime(dayStr, startNorm);
        const windowEnd = crossesMidnight
            ? combineDateAndTime(format(addDays(d, 1), 'yyyy-MM-dd'), endNorm)
            : combineDateAndTime(dayStr, endNorm);

        const overlapStart = Math.max(start.getTime(), windowStart.getTime());
        const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());
        if (overlapEnd > overlapStart) {
            nightMs += overlapEnd - overlapStart;
        }
    }

    const nightMinutes = Math.min(totalMinutes, Math.round(nightMs / 60000));
    return { totalMinutes, dayMinutes: totalMinutes - nightMinutes, nightMinutes };
}

export function getAbsenceScheduleStatus(absenceType: string): 'on_leave' | 'sick_leave' {
    return absenceType === 'l4' ? 'sick_leave' : 'on_leave';
}

export function eventDateStr(isoTime: string): string {
    return formatInTimeZone(parseISO(isoTime), APP_TIMEZONE, 'yyyy-MM-dd');
}

/** Kalendarzowa data (YYYY-MM-DD) z parametru filtra — akceptuje ISO lub samą datę. */
export function extractDatePart(value?: string): string | undefined {
    if (!value) return undefined;
    return value.substring(0, 10);
}

/**
 * Zakres filtra ewidencji wyłącznie po start_time (miesiąc rozliczeniowy = dzień rozpoczęcia).
 * Granice dnia liczone w strefie Europe/Warsaw.
 */
export function buildStartTimeFilterRange(dateFrom?: string, dateTo?: string): {
    fromDate?: string;
    toDate?: string;
    fromIso?: string;
    toIso?: string;
} {
    const fromDate = extractDatePart(dateFrom);
    const toDate = extractDatePart(dateTo);

    return {
        fromDate,
        toDate,
        fromIso: fromDate
            ? fromZonedTime(`${fromDate}T00:00:00.000`, APP_TIMEZONE).toISOString()
            : undefined,
        toIso: toDate
            ? fromZonedTime(`${toDate}T23:59:59.999`, APP_TIMEZONE).toISOString()
            : undefined,
    };
}

/** Normalizuje TIME z bazy (np. "12:00" / "12:00:00") do HH:mm:ss. */
export function normalizeTimeStr(timeStr: string): string {
    const parts = timeStr.trim().split(':');
    const h = parts[0]?.padStart(2, '0') ?? '00';
    const m = parts[1]?.padStart(2, '0') ?? '00';
    const s = (parts[2] ?? '00').split('.')[0].padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/** Łączy datę kalendarzową i godzinę planu w Europe/Warsaw → Date UTC. */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
    const time = normalizeTimeStr(timeStr);
    return fromZonedTime(`${dateStr}T${time}`, APP_TIMEZONE);
}

/**
 * effective_start = scan < scheduled ? scheduled : actual (early = plan, late = actual)
 */
export function computeEffectiveStart(actualScan: Date, scheduledStart: Date | null): Date {
    if (!scheduledStart) return actualScan;
    return actualScan < scheduledStart ? scheduledStart : actualScan;
}
