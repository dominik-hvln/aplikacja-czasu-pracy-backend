-- Czy grafik ma generować zmiany w dni świąteczne.
-- FALSE (domyślnie) = dotychczasowe zachowanie: święta są pomijane.
-- TRUE = firma pracuje 365 dni w roku (hotele, gastronomia) i zmiany
--        mają być generowane również w święta.
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS schedule_on_holidays BOOLEAN NOT NULL DEFAULT FALSE;
