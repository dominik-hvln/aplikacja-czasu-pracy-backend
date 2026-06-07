-- Migration: Add manual entry fields to time_entries
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS manual_comment TEXT;
