-- 1. Create the new module for work schedules
INSERT INTO public.modules (code, name, description)
VALUES ('schedules', 'Grafik Pracy', 'Planowanie zmian pracowniczych i generowanie grafiku')
ON CONFLICT (code) DO NOTHING;

-- Assign 'schedules' module to 'pro' and 'enterprise' plans (example logic based on typical SaaS)
INSERT INTO public.plan_modules (plan_id, module_code)
SELECT id, 'schedules' FROM public.plans WHERE code IN ('pro', 'enterprise')
ON CONFLICT DO NOTHING;

-- 2. Add schedule_settings column to companies for storing daily shift definitions
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS schedule_settings jsonb DEFAULT '{
  "1": { "is_working_day": true, "shifts": [] },
  "2": { "is_working_day": true, "shifts": [] },
  "3": { "is_working_day": true, "shifts": [] },
  "4": { "is_working_day": true, "shifts": [] },
  "5": { "is_working_day": true, "shifts": [] },
  "6": { "is_working_day": false, "shifts": [] },
  "0": { "is_working_day": false, "shifts": [] }
}'::jsonb;

-- 3. Create schedules table to hold the assigned shifts
CREATE TABLE IF NOT EXISTS public.schedules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    date date NOT NULL,
    shift_name text NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    status text DEFAULT 'scheduled', -- 'scheduled', 'absent', 'replacement_needed'
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, date) -- A user can only have one shift per day
);

-- 4. Create shift requests table
CREATE TABLE IF NOT EXISTS public.shift_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    date date NOT NULL,
    requested_shift_name text NOT NULL,
    status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, date)
);
