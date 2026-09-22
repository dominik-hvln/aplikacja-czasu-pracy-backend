import { TimeEntriesService } from './time-entries.service';
import { combineDateAndTime } from './time-entry.utils';

/**
 * Rdzeń raportu miesięcznego: podział dzień/noc, literki nieobecności i — przede
 * wszystkim — zgodność sum (godziny dzienne + nocne + doliczone = razem).
 */

type Tables = Record<string, any>;

/** Minimalny, łańcuchowalny mock query buildera Supabase. */
function makeSupabaseMock(tables: Tables) {
    const build = (table: string) => {
        const data = tables[table] ?? [];
        const q: any = {};
        for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'neq']) {
            q[m] = () => q;
        }
        q.maybeSingle = async () => ({
            data: Array.isArray(data) ? (data[0] ?? null) : data,
            error: null,
        });
        q.single = q.maybeSingle;
        q.then = (resolve: any, reject: any) =>
            Promise.resolve({ data, error: null }).then(resolve, reject);
        return q;
    };

    return { getClient: () => ({ from: (table: string) => build(table) }) };
}

const COMPANY_ID = 'company-1';
const USER_ID = 'user-1';

const baseTables = (): Tables => ({
    companies: [
        {
            daily_norm_hours: 8,
            count_holidays_as_work: true,
            night_start: '22:00:00',
            night_end: '06:00:00',
        },
    ],
    users: [
        {
            id: USER_ID,
            fte_id: null,
            department_id: null,
            status: 'active',
            first_name: 'Anna',
            last_name: 'Nowak',
        },
    ],
    ftes: [],
    departments: [],
    company_holidays: [],
    schedules: [],
    absences: [],
    time_entries: [],
});

/** Wpis ewidencji w czasie lokalnym Europe/Warsaw. */
function entry(date: string, from: string, toDate: string, to: string) {
    return {
        id: `${date}-${from}`,
        start_time: combineDateAndTime(date, from).toISOString(),
        end_time: combineDateAndTime(toDate, to).toISOString(),
        user: { id: USER_ID, first_name: 'Anna', last_name: 'Nowak' },
        project: null,
        task: null,
    };
}

function makeService(tables: Tables) {
    const holidays = { getPolishPublicHolidays: () => [] } as any;
    return new TimeEntriesService(makeSupabaseMock(tables) as any, holidays);
}

async function report(tables: Tables) {
    const service = makeService(tables);
    const result = await service.getMonthlyReport(COMPANY_ID, { year: 2026, month: 8 });
    return { result, row: result.rows[0] };
}

describe('getMonthlyReport', () => {
    it('rozbija zmianę 16:00–24:00 na 6h dziennych i 2h nocnych, suma 8h', async () => {
        const tables = baseTables();
        // 2026-08-04 = wtorek
        tables.time_entries = [entry('2026-08-04', '16:00', '2026-08-05', '00:00')];

        const { row } = await report(tables);
        const cell = row.cells['2026-08-04'];

        expect(cell.dayMinutes).toBe(360);
        expect(cell.nightMinutes).toBe(120);
        expect(cell.code).toBeNull();
        expect(row.totals.workedMinutes).toBe(480);
    });

    it('przypisuje zmianę przez północ w całości do dnia rozpoczęcia', async () => {
        const tables = baseTables();
        tables.time_entries = [entry('2026-08-04', '22:00', '2026-08-05', '06:00')];

        const { row } = await report(tables);

        expect(row.cells['2026-08-04']).toMatchObject({ dayMinutes: 0, nightMinutes: 480 });
        expect(row.cells['2026-08-05']).toBeUndefined();
        expect(row.totals.nightMinutes).toBe(480);
    });

    it('oznacza urlop literką U i dolicza jego godziny do sumy miesiąca', async () => {
        const tables = baseTables();
        tables.time_entries = [entry('2026-08-04', '08:00', '2026-08-04', '16:00')];
        // 2026-08-06 = czwartek
        tables.absences = [
            {
                user_id: USER_ID,
                start_date: '2026-08-06',
                end_date: '2026-08-06',
                type: 'urlop_wypoczynkowy',
            },
        ];

        const { row } = await report(tables);

        expect(row.cells['2026-08-06']).toMatchObject({ code: 'U', absenceMinutes: 480 });
        expect(row.totals.vacationDays).toBe(1);
        expect(row.totals.workedMinutes).toBe(480);
        expect(row.totals.absenceMinutes).toBe(480);
        expect(row.totals.totalMinutes).toBe(960); // 8h pracy + 8h urlopu
    });

    it('rozróżnia L4, urlop na żądanie i inną nieobecność', async () => {
        const tables = baseTables();
        tables.absences = [
            { user_id: USER_ID, start_date: '2026-08-03', end_date: '2026-08-03', type: 'l4' },
            { user_id: USER_ID, start_date: '2026-08-04', end_date: '2026-08-04', type: 'urlop_na_zadanie' },
            { user_id: USER_ID, start_date: '2026-08-05', end_date: '2026-08-05', type: 'inne' },
        ];

        const { row } = await report(tables);

        expect(row.cells['2026-08-03'].code).toBe('L4');
        expect(row.cells['2026-08-04'].code).toBe('NŻ');
        expect(row.cells['2026-08-05'].code).toBe('I');
        expect(row.totals.sickDays).toBe(1);
        expect(row.totals.vacationDays).toBe(1); // urlop na żądanie liczy się jako urlop
        expect(row.totals.otherAbsenceDays).toBe(1);
    });

    it('nie liczy weekendów do dni urlopu ani do godzin', async () => {
        const tables = baseTables();
        // 2026-08-07 (pt) – 2026-08-10 (pn): weekend 08–09 wypada w środku
        tables.absences = [
            {
                user_id: USER_ID,
                start_date: '2026-08-07',
                end_date: '2026-08-10',
                type: 'urlop_wypoczynkowy',
            },
        ];

        const { row } = await report(tables);

        expect(row.cells['2026-08-08']).toBeUndefined(); // sobota
        expect(row.cells['2026-08-09']).toBeUndefined(); // niedziela
        expect(row.totals.vacationDays).toBe(2); // tylko piątek i poniedziałek
        expect(row.totals.absenceMinutes).toBe(960);
    });

    it('nie liczy dnia podwójnie, gdy pracownik pracował mimo zgłoszonej nieobecności', async () => {
        const tables = baseTables();
        tables.time_entries = [entry('2026-08-04', '08:00', '2026-08-04', '16:00')];
        tables.absences = [
            {
                user_id: USER_ID,
                start_date: '2026-08-04',
                end_date: '2026-08-04',
                type: 'urlop_wypoczynkowy',
            },
        ];

        const { row } = await report(tables);

        expect(row.cells['2026-08-04'].code).toBeNull();
        expect(row.totals.absenceMinutes).toBe(0);
        expect(row.totals.totalMinutes).toBe(480);
    });

    it('oznacza święto literką ŚW i dolicza godziny, gdy firma tak ustawiła', async () => {
        const tables = baseTables();
        tables.company_holidays = [{ date: '2026-08-05' }]; // środa

        const { row } = await report(tables);

        expect(row.cells['2026-08-05']).toMatchObject({ code: 'ŚW', absenceMinutes: 480 });
        expect(row.totals.holidayMinutes).toBe(480);
        expect(row.totals.holidayDays).toBe(1);
    });

    it('święto ma pierwszeństwo przed urlopem (dzień nie zjada puli urlopowej)', async () => {
        const tables = baseTables();
        tables.company_holidays = [{ date: '2026-08-05' }];
        tables.absences = [
            {
                user_id: USER_ID,
                start_date: '2026-08-05',
                end_date: '2026-08-05',
                type: 'urlop_wypoczynkowy',
            },
        ];

        const { row } = await report(tables);

        expect(row.cells['2026-08-05'].code).toBe('ŚW');
        expect(row.totals.vacationDays).toBe(0);
        expect(row.totals.totalMinutes).toBe(480); // liczone raz
    });

    it('suma miesiąca zawsze równa się sumie godzin dziennych, nocnych i doliczonych', async () => {
        const tables = baseTables();
        tables.time_entries = [
            entry('2026-08-03', '08:00', '2026-08-03', '16:00'), // 8h dzienne
            entry('2026-08-04', '16:00', '2026-08-05', '00:00'), // 6h + 2h nocne
            entry('2026-08-06', '22:00', '2026-08-07', '06:00'), // 8h nocne
        ];
        tables.absences = [
            { user_id: USER_ID, start_date: '2026-08-10', end_date: '2026-08-11', type: 'l4' },
        ];
        tables.company_holidays = [{ date: '2026-08-12' }];

        const { row } = await report(tables);
        const t = row.totals;

        const sumOfCells = Object.values(row.cells).reduce(
            (acc: number, c: any) => acc + c.dayMinutes + c.nightMinutes + c.absenceMinutes,
            0,
        );

        expect(t.workedMinutes).toBe(t.dayMinutes + t.nightMinutes);
        expect(t.totalMinutes).toBe(t.workedMinutes + t.absenceMinutes + t.holidayMinutes);
        expect(t.totalMinutes).toBe(sumOfCells);
        expect(t.dayMinutes).toBe(840); // 8h + 6h
        expect(t.nightMinutes).toBe(600); // 2h + 8h
        expect(t.absenceMinutes).toBe(960); // 2 dni L4
        expect(t.holidayMinutes).toBe(480);
    });

    it('zwraca komplet dni miesiąca i ustawioną porę nocną', async () => {
        const { result } = await report(baseTables());

        expect(result.days).toHaveLength(31);
        expect(result.days[0]).toMatchObject({ date: '2026-08-01', isWeekend: true });
        expect(result.nightStart).toBe('22:00');
        expect(result.nightEnd).toBe('06:00');
    });

    it('nowe rodzaje nieobecności mają własne literki i liczą się do sumy (także bezpłatny)', async () => {
        const tables = baseTables();
        tables.absences = [
            { user_id: USER_ID, start_date: '2026-08-03', end_date: '2026-08-03', type: 'urlop_okolicznosciowy' },
            { user_id: USER_ID, start_date: '2026-08-04', end_date: '2026-08-04', type: 'opieka' },
            { user_id: USER_ID, start_date: '2026-08-05', end_date: '2026-08-05', type: 'urlop_bezplatny' },
        ];

        const { row } = await report(tables);

        expect(row.cells['2026-08-03'].code).toBe('UO');
        expect(row.cells['2026-08-04'].code).toBe('OP');
        expect(row.cells['2026-08-05'].code).toBe('UB');
        expect(row.totals.otherAbsenceDays).toBe(3);
        expect(row.totals.vacationDays).toBe(0); // pula urlopu wypoczynkowego = tylko U i NŻ
        expect(row.totals.absenceMinutes).toBe(3 * 480);
    });

    describe('ustawienia firmy: praca w weekendy', () => {
        // Dział z sobotą jako dniem roboczym (6h), niedziela wolna.
        const withSaturdayDept = (workOnWeekends: boolean) => {
            const tables = baseTables();
            tables.companies[0].work_on_weekends = workOnWeekends;
            tables.users[0].department_id = 'dept-1';
            const weekday = { is_working_day: true, shifts: [{ start_time: '08:00', end_time: '16:00' }] };
            tables.departments = [
                {
                    id: 'dept-1',
                    schedule_settings: {
                        '1': weekday, '2': weekday, '3': weekday, '4': weekday, '5': weekday,
                        '6': { is_working_day: true, shifts: [{ start_time: '08:00', end_time: '14:00' }] },
                        '0': { is_working_day: false, shifts: [] },
                    },
                },
            ];
            // 2026-08-07 (pt) – 2026-08-08 (sob)
            tables.absences = [
                { user_id: USER_ID, start_date: '2026-08-07', end_date: '2026-08-08', type: 'urlop_wypoczynkowy' },
            ];
            return tables;
        };

        it('włączona: sobota robocza w dziale liczy się jako dzień urlopu', async () => {
            const { row } = await report(withSaturdayDept(true));

            expect(row.cells['2026-08-08']).toMatchObject({ code: 'U', absenceMinutes: 360 });
            expect(row.totals.vacationDays).toBe(2);
            expect(row.totals.absenceMinutes).toBe(480 + 360);
        });

        it('wyłączona: sobota jest wolna, nawet jeśli dział ma ją jako roboczą', async () => {
            const { row } = await report(withSaturdayDept(false));

            expect(row.cells['2026-08-08']).toBeUndefined();
            expect(row.totals.vacationDays).toBe(1);
            expect(row.totals.absenceMinutes).toBe(480);
        });
    });

    describe('ustawienia firmy: praca w święta', () => {
        it('włączona: święto nie jest automatycznie doliczane, liczy się tylko praca', async () => {
            const tables = baseTables();
            tables.companies[0].schedule_on_holidays = true;
            tables.company_holidays = [{ date: '2026-08-05' }];
            tables.time_entries = [entry('2026-08-05', '08:00', '2026-08-05', '14:00')];

            const { row } = await report(tables);

            expect(row.cells['2026-08-05']).toMatchObject({ dayMinutes: 360, code: null });
            expect(row.totals.holidayMinutes).toBe(0);
            expect(row.totals.holidayDays).toBe(0);
            expect(row.totals.totalMinutes).toBe(360);
        });

        it('włączona: urlop w święto zużywa dzień urlopu jak w zwykły dzień pracy', async () => {
            const tables = baseTables();
            tables.companies[0].schedule_on_holidays = true;
            tables.company_holidays = [{ date: '2026-08-05' }];
            tables.absences = [
                { user_id: USER_ID, start_date: '2026-08-05', end_date: '2026-08-05', type: 'urlop_wypoczynkowy' },
            ];

            const { row } = await report(tables);

            expect(row.cells['2026-08-05'].code).toBe('U');
            expect(row.totals.vacationDays).toBe(1);
        });
    });

    it('odrzuca nieprawidłowy miesiąc', async () => {
        const service = makeService(baseTables());
        await expect(
            service.getMonthlyReport(COMPANY_ID, { year: 2026, month: 13 }),
        ).rejects.toThrow('Nieprawidłowy miesiąc (1–12).');
    });
});
