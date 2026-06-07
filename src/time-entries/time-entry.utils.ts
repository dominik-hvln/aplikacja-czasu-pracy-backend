import { format, parseISO } from 'date-fns';

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

export function getAbsenceScheduleStatus(absenceType: string): 'on_leave' | 'sick_leave' {
    return absenceType === 'l4' ? 'sick_leave' : 'on_leave';
}

export function eventDateStr(isoTime: string): string {
    return format(parseISO(isoTime), 'yyyy-MM-dd');
}

export function combineDateAndTime(dateStr: string, timeStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const timeParts = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, timeParts[0], timeParts[1] || 0, 0, 0);
}

/**
 * effective_start = scan < scheduled ? scheduled : actual (early = plan, late = actual)
 */
export function computeEffectiveStart(actualScan: Date, scheduledStart: Date | null): Date {
    if (!scheduledStart) return actualScan;
    return actualScan < scheduledStart ? scheduledStart : actualScan;
}
