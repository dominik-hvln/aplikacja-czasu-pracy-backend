-- =====================================================================
-- Pora nocna (per firma) — podstawa podziału godzin w raporcie miesięcznym
-- ewidencji na godziny dzienne i nocne.
--   night_start - początek pory nocnej (domyślnie 22:00)
--   night_end   - koniec pory nocnej (domyślnie 06:00)
-- Domyślne widełki mieszczą się w Kodeksie pracy (8h między 21:00 a 07:00).
-- Bezpieczne do wielokrotnego uruchomienia.
-- =====================================================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS night_start time NOT NULL DEFAULT '22:00';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS night_end   time NOT NULL DEFAULT '06:00';
