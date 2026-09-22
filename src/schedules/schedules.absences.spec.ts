import { SchedulesService } from './schedules.service';
import { HolidaysService } from './holidays.service';

/**
 * Grafik a nieobecności i ustawienia firmy:
 *  - grafik dostaje nieobecności bez rodzaju i bez powodu,
 *  - wycofana nieobecność zwalnia dni w grafiku,
 *  - generator respektuje pracę w weekendy i święta.
 */

type Tables = Record<string, any>;

/** Łańcuchowalny mock Supabase, który zapisuje wykonane upserty i update’y. */
function makeSupabaseMock(tables: Tables) {
    const writes: { table: string; op: string; payload: any }[] = [];

    const build = (table: string) => {
        const data = tables[table] ?? [];
        const q: any = {};
        for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'neq', 'or', 'is', 'order']) {
            q[m] = () => q;
        }
        q.maybeSingle = async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null });
        q.single = q.maybeSingle;
        q.then = (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject);
        q.upsert = (payload: any) => {
            writes.push({ table, op: 'upsert', payload });
            return Promise.resolve({ error: null });
        };
        q.update = (payload: any) => {
            writes.push({ table, op: 'update', payload });
            return q;
        };
        return q;
    };

    return {
        writes,
        service: { getClient: () => ({ from: (table: string) => build(table) }) },
    };
}

const COMPANY_ID = 'company-1';

function makeService(tables: Tables) {
    const mock = makeSupabaseMock(tables);
    const service = new SchedulesService(mock.service as any, new HolidaysService());
    return { service, writes: mock.writes };
}

describe('getScheduleOverlay', () => {
    const tables = (): Tables => ({
        companies: [{ work_on_weekends: false, schedule_on_holidays: true }],
        users: [{ id: 'u1', first_name: 'Anna', last_name: 'Nowak' }],
        absences: [
            {
                user_id: 'u1',
                start_date: '2026-08-03',
                end_date: '2026-08-04',
                status: 'approved',
                type: 'l4',
                reason: 'grypa',
            },
            {
                user_id: 'u1',
                start_date: '2026-08-04',
                end_date: '2026-08-05',
                status: 'pending',
                type: 'urlop_wypoczynkowy',
                reason: 'wyjazd',
            },
        ],
    });

    const ctx = { userId: 'admin', role: 'admin', companyId: COMPANY_ID };

    it('nie ujawnia rodzaju ani powodu nieobecności', async () => {
        const { service } = makeService(tables());
        const result = await service.getScheduleOverlay(ctx, 8, 2026);

        for (const a of result.absences) {
            expect(Object.keys(a).sort()).toEqual(['date', 'first_name', 'last_name', 'pending', 'user_id']);
        }
        expect(JSON.stringify(result)).not.toMatch(/l4|grypa|wyjazd|urlop/);
    });

    it('rozwija nieobecność na dni, a zaakceptowana wygrywa z oczekującą', async () => {
        const { service } = makeService(tables());
        const result = await service.getScheduleOverlay(ctx, 8, 2026);
        const byDate = Object.fromEntries(result.absences.map((a: any) => [a.date, a.pending]));

        expect(byDate).toEqual({
            '2026-08-03': false,
            '2026-08-04': false, // oba wnioski — zaakceptowany ma pierwszeństwo
            '2026-08-05': true,
        });
    });

    it('zwraca ustawienia firmy dla weekendów i świąt', async () => {
        const { service } = makeService(tables());
        const result = await service.getScheduleOverlay(ctx, 8, 2026);

        expect(result.workOnWeekends).toBe(false);
        expect(result.workOnHolidays).toBe(true);
    });

    it('przycina nieobecność do granic miesiąca', async () => {
        const t = tables();
        t.absences = [
            { user_id: 'u1', start_date: '2026-07-30', end_date: '2026-08-02', status: 'approved', type: 'l4' },
        ];
        const { service } = makeService(t);
        const result = await service.getScheduleOverlay(ctx, 8, 2026);

        expect(result.absences.map((a: any) => a.date)).toEqual(['2026-08-01', '2026-08-02']);
    });
});

describe('revertAbsence', () => {
    it('przywraca zmiany, ale zostawia dni pokryte innym zaakceptowanym wnioskiem', async () => {
        const { service, writes } = makeService({
            schedules: [
                { id: 's1', date: '2026-08-03' },
                { id: 's2', date: '2026-08-04' },
                { id: 's3', date: '2026-08-05' },
            ],
            // Inny zaakceptowany wniosek na 5.08
            absences: [{ id: 'other', start_date: '2026-08-05', end_date: '2026-08-05' }],
        });

        const result = await service.revertAbsence(COMPANY_ID, {
            id: 'abs-1',
            user_id: 'u1',
            start_date: '2026-08-03',
            end_date: '2026-08-05',
        });

        expect(result.reverted).toBe(2);
        expect(writes).toEqual([
            { table: 'schedules', op: 'update', payload: { status: 'scheduled', requires_replacement: false } },
        ]);
    });

    it('nic nie zmienia, gdy w grafiku nie ma oznaczonych dni', async () => {
        const { service, writes } = makeService({ schedules: [], absences: [] });
        const result = await service.revertAbsence(COMPANY_ID, {
            id: 'abs-1',
            user_id: 'u1',
            start_date: '2026-08-03',
            end_date: '2026-08-05',
        });

        expect(result.reverted).toBe(0);
        expect(writes).toHaveLength(0);
    });
});

describe('generateSchedule — praca w weekendy i święta', () => {
    const everyDay = { is_working_day: true, shifts: [{ name: 'Rano', start_time: '06:00', end_time: '14:00' }] };

    const tables = (flags: { work_on_weekends: boolean; schedule_on_holidays: boolean }): Tables => ({
        companies: [flags],
        departments: [
            {
                schedule_settings: {
                    '0': everyDay, '1': everyDay, '2': everyDay, '3': everyDay,
                    '4': everyDay, '5': everyDay, '6': everyDay,
                },
            },
        ],
        users: [{ id: 'u1', role: 'employee' }],
        absences: [],
        shift_requests: [],
        schedules: [],
        company_holidays: [],
    });

    // Listopad 2026: 1.11 (niedziela) i 11.11 (środa) to święta ustawowe; 30 dni, 9 dni weekendowych.
    const generatedDates = async (flags: { work_on_weekends: boolean; schedule_on_holidays: boolean }) => {
        const { service, writes } = makeService(tables(flags));
        await service.generateSchedule(COMPANY_ID, 'dept-1', 11, 2026);
        const upsert = writes.find((w) => w.table === 'schedules' && w.op === 'upsert');
        return (upsert?.payload || []).map((s: any) => s.date as string);
    };

    it('bez weekendów i świąt: tylko dni powszednie poza świętami', async () => {
        const dates = await generatedDates({ work_on_weekends: false, schedule_on_holidays: false });

        expect(dates).not.toContain('2026-11-07'); // sobota
        expect(dates).not.toContain('2026-11-08'); // niedziela
        expect(dates).not.toContain('2026-11-11'); // święto w środę
        expect(dates).toHaveLength(30 - 9 - 1);
    });

    it('z weekendami, bez świąt: weekendy tak, święta nie', async () => {
        const dates = await generatedDates({ work_on_weekends: true, schedule_on_holidays: false });

        expect(dates).toContain('2026-11-07');
        expect(dates).not.toContain('2026-11-01'); // święto w niedzielę
        expect(dates).not.toContain('2026-11-11');
        expect(dates).toHaveLength(30 - 2);
    });

    it('z weekendami i świętami: każdy dzień miesiąca', async () => {
        const dates = await generatedDates({ work_on_weekends: true, schedule_on_holidays: true });

        expect(dates).toContain('2026-11-11');
        expect(dates).toHaveLength(30);
    });

    it('bez weekendów, ze świętami: święto w dzień powszedni ma zmianę', async () => {
        const dates = await generatedDates({ work_on_weekends: false, schedule_on_holidays: true });

        expect(dates).toContain('2026-11-11');
        expect(dates).not.toContain('2026-11-01'); // niedziela — firma nie pracuje w weekendy
        expect(dates).toHaveLength(30 - 9);
    });
});
