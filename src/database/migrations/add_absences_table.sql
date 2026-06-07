-- Create absences table for leave requests and sickness
CREATE TABLE IF NOT EXISTS public.absences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'urlop_wypoczynkowy', 'l4', 'urlop_na_zadanie', 'inne'
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reason text,
    reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Note: user_id references public.users(id), which we assume exists.
