-- TYP NIEOBECNOŚCI NA WIERSZU GRAFIKU
--
-- Dotąd grafik zapisywał tylko status on_leave / sick_leave, przez co urlop
-- wypoczynkowy, urlop na żądanie i "inne" wyglądały identycznie - jako "U".
-- Klienci potrzebują w grafiku i w PDF rozróżnienia (U / NŻ / L4 / I), więc
-- typ nieobecności musi przetrwać naniesienie na grafik.
--
-- Wartości odpowiadają typom z tabeli absences:
-- urlop_wypoczynkowy, urlop_na_zadanie, l4, inne. NULL = zwykła zmiana.

ALTER TABLE public.schedules
    ADD COLUMN IF NOT EXISTS absence_type text;

COMMENT ON COLUMN public.schedules.absence_type IS
    'Typ nieobecności z tabeli absences (urlop_wypoczynkowy, urlop_na_zadanie, l4, inne). NULL = zwykła zmiana.';
