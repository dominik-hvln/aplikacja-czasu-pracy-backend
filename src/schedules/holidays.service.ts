import { Injectable } from '@nestjs/common';
import { addDays, format } from 'date-fns';

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
}

@Injectable()
export class HolidaysService {
    
    // Calculates Easter Sunday using Meeus/Jones/Butcher algorithm
    private getEasterSunday(year: number): Date {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        
        return new Date(year, month - 1, day);
    }

    getPolishPublicHolidays(year: number): Holiday[] {
        const easterSunday = this.getEasterSunday(year);
        const easterMonday = addDays(easterSunday, 1);
        const pentecostSunday = addDays(easterSunday, 49); // Zielone Świątki
        const corpusChristi = addDays(easterSunday, 60); // Boże Ciało

        const holidays: Holiday[] = [
            { date: `${year}-01-01`, name: 'Nowy Rok' },
            { date: `${year}-01-06`, name: 'Święto Trzech Króli' },
            { date: format(easterSunday, 'yyyy-MM-dd'), name: 'Wielkanoc' },
            { date: format(easterMonday, 'yyyy-MM-dd'), name: 'Poniedziałek Wielkanocny' },
            { date: `${year}-05-01`, name: 'Święto Pracy' },
            { date: `${year}-05-03`, name: 'Święto Konstytucji 3 Maja' },
            { date: format(pentecostSunday, 'yyyy-MM-dd'), name: 'Zielone Świątki' },
            { date: format(corpusChristi, 'yyyy-MM-dd'), name: 'Boże Ciało' },
            { date: `${year}-08-15`, name: 'Wniebowzięcie NMP' },
            { date: `${year}-11-01`, name: 'Wszystkich Świętych' },
            { date: `${year}-11-11`, name: 'Narodowe Święto Niepodległości' },
            { date: `${year}-12-25`, name: 'Boże Narodzenie (pierwszy dzień)' },
            { date: `${year}-12-26`, name: 'Boże Narodzenie (drugi dzień)' }
        ];

        return holidays.sort((a, b) => a.date.localeCompare(b.date));
    }

    getPolishPublicHolidaysForMonth(year: number, month: number): Holiday[] {
        const allHolidays = this.getPolishPublicHolidays(year);
        const prefix = `${year}-${month.toString().padStart(2, '0')}`;
        return allHolidays.filter(h => h.date.startsWith(prefix));
    }
}
