-- LYANN Moderation Center — Staging security follow-up for migration 73.
-- Run only on Supabase project tdktfbtqceldlaeqjtow until separately approved for Production.
-- The trigger still fires for authenticated writes; direct RPC EXECUTE is unnecessary.
BEGIN;

REVOKE ALL ON FUNCTION public.lyann_block_restricted_writes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_block_restricted_writes()
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_sanction_reviews_sanction_id
  ON public.sanction_reviews (sanction_id);
CREATE INDEX IF NOT EXISTS idx_sanction_reviews_user_id
  ON public.sanction_reviews (user_id);

COMMIT;
