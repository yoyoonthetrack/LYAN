-- ============================================================================
-- LYANN DOM — 28B_FIX_MILESTONE_COMPLETION_FIELDS.SQL
-- Hotfix Idempotent Minimal pour les colonnes de réalisation de jalon (Step 19)
-- ============================================================================

BEGIN;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS completion_comments text,
  ADD COLUMN IF NOT EXISTS deliverables jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMIT;
