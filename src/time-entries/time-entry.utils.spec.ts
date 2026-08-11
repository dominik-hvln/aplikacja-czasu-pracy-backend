import {
    combineDateAndTime,
    computeEffectiveStart,
    normalizeTimeStr,
    splitDayNightMinutes,
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

describe('splitDayNightMinutes', () => {
    // Warsaw 16:00 -> 24:00 (CEST = UTC+2)
    const at = (dateStr: string, time: string) => combineDateAndTime(dateStr, time);

    it('dzieli zmianę 16:00–24:00 na 6h dziennych i 2h nocnych (przykład klienta)', () => {
        const r = splitDayNightMinutes(at('2026-08-11', '16:00'), at('2026-08-12', '00:00'));
        expect(r.totalMinutes).toBe(480);
        expect(r.dayMinutes).toBe(360);
        expect(r.nightMinutes).toBe(120);
    });

    it('zmiana dzienna 08:00–16:00 nie ma godzin nocnych', () => {
        const r = splitDayNightMinutes(at('2026-08-11', '08:00'), at('2026-08-11', '16:00'));
        expect(r).toEqual({ totalMinutes: 480, dayMinutes: 480, nightMinutes: 0 });
    });

    it('nocka 22:00–06:00 jest w całości nocna', () => {
        const r = splitDayNightMinutes(at('2026-08-11', '22:00'), at('2026-08-12', '06:00'));
        expect(r).toEqual({ totalMinutes: 480, dayMinutes: 0, nightMinutes: 480 });
    });

    it('zmiana 20:00–08:00 przez północ: 4h dzienne (20-22 i 6-8), 8h nocne', () => {
        const r = splitDayNightMinutes(at('2026-08-11', '20:00'), at('2026-08-12', '08:00'));
        expect(r.totalMinutes).toBe(720);
        expect(r.nightMinutes).toBe(480);
        expect(r.dayMinutes).toBe(240);
    });

    it('zmiana dłuższa niż doba obejmuje dwa okna nocne', () => {
        const r = splitDayNightMinutes(at('2026-08-11', '12:00'), at('2026-08-13', '12:00'));
        expect(r.totalMinutes).toBe(2880);
        expect(r.nightMinutes).toBe(960); // 2 × 8h
        expect(r.dayMinutes).toBe(1920);
    });

    it('respektuje własne okno nocne firmy (21:00–07:00)', () => {
        const r = splitDayNightMinutes(
            at('2026-08-11', '16:00'),
            at('2026-08-12', '00:00'),
            '21:00',
            '07:00',
        );
        expect(r.nightMinutes).toBe(180);
        expect(r.dayMinutes).toBe(300);
    });

    it('obsługuje okno nocne bez przejścia przez północ (00:00–06:00)', () => {
        const r = splitDayNightMinutes(
            at('2026-08-11', '22:00'),
            at('2026-08-12', '06:00'),
            '00:00',
            '06:00',
        );
        expect(r.nightMinutes).toBe(360);
        expect(r.dayMinutes).toBe(120);
    });

    it('suma zawsze zgadza się z czasem trwania także przy zmianie czasu (CEST->CET)', () => {
        // W nocy 25/26.10.2026 cofamy zegary: 22:00 -> 06:00 trwa 9 godzin
        const start = at('2026-10-24', '22:00');
        const end = at('2026-10-25', '06:00');
        const r = splitDayNightMinutes(start, end);
        expect(r.totalMinutes).toBe(540);
        expect(r.dayMinutes + r.nightMinutes).toBe(r.totalMinutes);
        expect(r.nightMinutes).toBe(540);
    });

    it('zwraca zera dla wpisu bez czasu trwania', () => {
        const t = at('2026-08-11', '10:00');
        expect(splitDayNightMinutes(t, t)).toEqual({ totalMinutes: 0, dayMinutes: 0, nightMinutes: 0 });
    });

    it('zerowe okno nocne (start === koniec) nie generuje godzin nocnych', () => {
        const r = splitDayNightMinutes(
            at('2026-08-11', '22:00'),
            at('2026-08-12', '06:00'),
            '22:00',
            '22:00',
        );
        expect(r).toEqual({ totalMinutes: 480, dayMinutes: 480, nightMinutes: 0 });
    });
});
