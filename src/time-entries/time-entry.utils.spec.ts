import {
    combineDateAndTime,
    computeEffectiveStart,
    normalizeTimeStr,
} from './time-entry.utils';

describe('time-entry.utils timezone', () => {
    it('normalizeTimeStr handles HH:mm and HH:mm:ss', () => {
        expect(normalizeTimeStr('12:00')).toBe('12:00:00');
        expect(normalizeTimeStr('12:00:00')).toBe('12:00:00');
        expect(normalizeTimeStr('8:5')).toBe('08:05:00');
    });

    it('combineDateAndTime interprets schedule time as Europe/Warsaw (CEST = UTC+2)', () => {
        const scheduled = combineDateAndTime('2026-06-07', '12:00');
        expect(scheduled.toISOString()).toBe('2026-06-07T10:00:00.000Z');
    });

    it('combineDateAndTime interprets schedule time as Europe/Warsaw (CET = UTC+1)', () => {
        const scheduled = combineDateAndTime('2026-01-15', '12:00');
        expect(scheduled.toISOString()).toBe('2026-01-15T11:00:00.000Z');
    });

    it('scan at scheduled time does not shift start (CEST)', () => {
        const actual = new Date('2026-06-07T10:00:00.000Z'); // 12:00 Warsaw
        const scheduled = combineDateAndTime('2026-06-07', '12:00');
        const effective = computeEffectiveStart(actual, scheduled);
        expect(effective.toISOString()).toBe('2026-06-07T10:00:00.000Z');
    });

    it('early scan uses scheduled Warsaw time, not UTC wall clock', () => {
        const actual = new Date('2026-06-07T09:00:00.000Z'); // 11:00 Warsaw
        const scheduled = combineDateAndTime('2026-06-07', '12:00');
        const effective = computeEffectiveStart(actual, scheduled);
        expect(effective.toISOString()).toBe('2026-06-07T10:00:00.000Z'); // 12:00 Warsaw
    });
});
