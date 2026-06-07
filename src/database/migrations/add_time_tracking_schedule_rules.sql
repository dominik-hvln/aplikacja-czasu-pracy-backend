-- Scan cooldown per user
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_scan_at timestamptz;

-- Effective vs actual start time (schedule adjustment)
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS actual_start_time timestamptz;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS is_schedule_adjusted boolean DEFAULT false;

-- Schedule absence & replacement tracking
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS requires_replacement boolean DEFAULT false;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS generated_at timestamptz;

-- Absence approval timestamp
ALTER TABLE public.absences ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Track schedule generation batches per department/month
CREATE TABLE IF NOT EXISTS public.schedule_generations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
    month int NOT NULL,
    year int NOT NULL,
    generated_at timestamptz DEFAULT now(),
    UNIQUE(company_id, department_id, month, year)
);
