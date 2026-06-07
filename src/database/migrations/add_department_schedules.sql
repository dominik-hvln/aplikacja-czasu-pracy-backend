-- Migrate schedule_settings from companies to departments if they exist, but generally just add the column
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS schedule_settings jsonb DEFAULT '{
  "1": { "is_working_day": true, "shifts": [] },
  "2": { "is_working_day": true, "shifts": [] },
  "3": { "is_working_day": true, "shifts": [] },
  "4": { "is_working_day": true, "shifts": [] },
  "5": { "is_working_day": true, "shifts": [] },
  "6": { "is_working_day": false, "shifts": [] },
  "0": { "is_working_day": false, "shifts": [] }
}'::jsonb;
