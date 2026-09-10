-- HISTORIA LOGOWAŃ
--
-- Supabase Auth przechowuje wyłącznie last_sign_in_at, czyli jeden znacznik
-- czasu - nie da się z niego odtworzyć historii ani rozpoznać, z ilu różnych
-- miejsc korzystano z konta. Ta tabela zapisuje każde udane logowanie.
--
-- Świadomie bez klucza obcego do users: to zapis audytowy i ma przetrwać
-- archiwizację czy usunięcie pracownika, dlatego e-mail zapisujemy migawkowo.

CREATE TABLE IF NOT EXISTS public.login_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    company_id  uuid,
    email       text,
    ip_address  text,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_events_user_idx
    ON public.login_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS login_events_company_idx
    ON public.login_events (company_id, created_at DESC);

COMMENT ON TABLE public.login_events IS
    'Historia udanych logowań. Adres IP i user agent to dane osobowe - obejmuje je pkt 2 polityki prywatności (dane techniczne).';
