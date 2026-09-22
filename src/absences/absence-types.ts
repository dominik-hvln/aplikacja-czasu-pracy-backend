/**
 * Rodzaje nieobecności i ich literki.
 *
 * Literki są używane WYŁĄCZNIE w ewidencji czasu pracy (dokument kadrowy).
 * Grafik i jego wydruki pokazują jeden wspólny znak nieobecności — bez rodzaju,
 * żeby współpracownicy nie widzieli, z jakiego powodu kogoś nie ma.
 */
export const ABSENCE_TYPES = [
    'urlop_wypoczynkowy',
    'urlop_na_zadanie',
    'l4',
    'urlop_okolicznosciowy',
    'opieka',
    'urlop_bezplatny',
    'inne',
] as const;

export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export type AbsenceCode = 'U' | 'NŻ' | 'L4' | 'UO' | 'OP' | 'UB' | 'I';

export const ABSENCE_TYPE_CODES: Record<AbsenceType, AbsenceCode> = {
    urlop_wypoczynkowy: 'U',
    urlop_na_zadanie: 'NŻ',
    l4: 'L4',
    urlop_okolicznosciowy: 'UO',
    opieka: 'OP',
    urlop_bezplatny: 'UB',
    inne: 'I',
};

/** Literka dla typu z bazy; nieznane/stare wartości trafiają do „innych”. */
export function absenceCodeFor(type: string | null | undefined): AbsenceCode {
    return (type && ABSENCE_TYPE_CODES[type as AbsenceType]) || 'I';
}
