-- ============================================================================
-- LYANN — 08_MILESTONE_COMPLETION_MIGRATION.SQL (STEP 2A)
-- Extension de public.milestones pour le suivi de réalisation (Commentaires & Preuves)
-- ============================================================================

BEGIN;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS completion_comments text,
  ADD COLUMN IF NOT EXISTS deliverables jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMIT;
