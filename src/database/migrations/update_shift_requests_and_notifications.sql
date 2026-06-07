-- Rename date to start_date in shift_requests
ALTER TABLE public.shift_requests RENAME COLUMN date TO start_date;

-- Add end_date optional column
ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS end_date date;

-- Update the uniqueness constraint for shift_requests since date is renamed
-- Previously: UNIQUE(user_id, date) -> now date is start_date. The unique constraint might need to be relaxed or changed to user_id, start_date. 
-- For a safe migration, we'll try dropping if it has a predictable name or just letting it be if renaming automatically modifies the constraint. In Postgres, renaming a column updates constraint references automatically.

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL, -- e.g., 'shift_request_approved', 'shift_request_rejected'
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);
