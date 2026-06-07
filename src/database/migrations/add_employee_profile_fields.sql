-- Create dictionary tables for company settings
CREATE TABLE IF NOT EXISTS public.departments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teams (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ftes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    name text NOT NULL, -- np. "1/1", "1/2"
    multiplier numeric(3, 2) NOT NULL, -- np. 1.00, 0.50
    created_at timestamptz DEFAULT now()
);

-- Extend users table with new fields
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS employment_type text,
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS fte_id uuid REFERENCES public.ftes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS employment_date date,
ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2),
ADD COLUMN IF NOT EXISTS contract_end_date date,
ADD COLUMN IF NOT EXISTS vacation_days_quota integer,
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS emergency_contact text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- NOTE: By default in Supabase, when `auth.users` row is deleted, the `public.users` row would normally be deleted if there is an ON DELETE CASCADE on the foreign key.
-- Let's ensure the foreign key to auth.users exists with ON DELETE CASCADE.
-- Assuming `public.users(id)` references `auth.users(id)`
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'users_id_fkey' AND confrelid = 'auth.users'::regclass
  ) THEN
    -- If standard constraint doesn't exist, we might not be able to dynamically ADD it easily here without knowing its exact name, 
    -- but usually Supabase creates it. The user will need to confirm `users` table id references `auth.users` ON DELETE CASCADE.
    NULL;
  END IF;
END $$;
