-- Isolated QA only. schema.sql created a legacy disputes table without
-- milestone_id / payment_id. Migration 11 uses CREATE TABLE IF NOT EXISTS
-- and then indexes those columns.
-- Never run against gzispjfoywklpqatjyop.

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES public.milestones(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS resolution_type text,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
