-- =====================================================================
-- Praca w weekendy (per firma) — różne branże, różne tryby pracy.
--   work_on_weekends - czy firma w ogóle pracuje w soboty/niedziele.
--                      Wyłączone: sob./nd. zawsze wolne, niezależnie od działów.
--                      Włączone: o dniach roboczych decydują ustawienia działu.
-- Pracę w święta obsługuje kolumna schedule_on_holidays
-- (add_schedule_on_holidays_to_companies.sql).
-- Bezpieczne do wielokrotnego uruchomienia.
-- =====================================================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_on_weekends boolean NOT NULL DEFAULT false;

-- Firmy, które już mają w którymś dziale sobotę lub niedzielę jako dzień roboczy,
-- dostają pracę w weekendy włączoną — inaczej grafik przestałby im generować te dni.
UPDATE companies c
SET work_on_weekends = true
WHERE EXISTS (
    SELECT 1
    FROM departments d
    WHERE d.company_id = c.id
      AND (
          (d.schedule_settings -> '6' ->> 'is_working_day')::boolean IS TRUE
          OR (d.schedule_settings -> '0' ->> 'is_working_day')::boolean IS TRUE
      )
);
