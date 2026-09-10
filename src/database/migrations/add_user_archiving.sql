-- ARCHIWIZACJA PRACOWNIKÓW (soft-delete)
--
-- Cel: pracownik, który zakończył współpracę, znika z list i traci możliwość
-- logowania, ale jego ewidencja czasu pracy zostaje w systemie. Kodeks pracy
-- wymaga przechowywania ewidencji czasu pracy, więc twarde kasowanie profilu
-- razem z wpisami nie jest dopuszczalne.
--
-- UWAGA: migracja zdejmuje klucz obcy public.users(id) -> auth.users(id).
-- Ten FK ma ON DELETE CASCADE, więc dopóki istnieje, usunięcie konta w Auth
-- kasuje również profil pracownika (a za nim, kaskadowo, jego dane).
-- Po zdjęciu FK usunięcie konta w Auth odcina logowanie, a profil zostaje.

BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS archived_by uuid;

COMMENT ON COLUMN public.users.archived_at IS
    'Data archiwizacji pracownika. NULL = pracownik aktywny.';
COMMENT ON COLUMN public.users.archived_by IS
    'Id administratora, który zarchiwizował pracownika.';

-- Zdjęcie kaskady z auth.users. Nazwa constraintu bywa różna w zależności od
-- tego, jak tabela powstała, więc szukamy go po relacji docelowej zamiast
-- zgadywać 'users_id_fkey'.
DO $$
DECLARE
    fk_name text;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND confrelid = 'auth.users'::regclass
      AND contype = 'f'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', fk_name);
        RAISE NOTICE 'Zdjęto klucz obcy % (public.users -> auth.users).', fk_name;
    ELSE
        RAISE NOTICE 'Brak klucza obcego public.users -> auth.users, nic do zdjęcia.';
    END IF;
END $$;

-- Listy pracowników filtrują po archived_at IS NULL.
CREATE INDEX IF NOT EXISTS users_company_active_idx
    ON public.users (company_id)
    WHERE archived_at IS NULL;

COMMIT;
