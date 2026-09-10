-- ============================================================================
-- LYANN — Migration 33: Financial RPC server-only hardening
-- Security boundary: only trusted server code (service_role) may FINALIZE
-- Stripe transfers/refunds or move authoritative financial state after an
-- external provider operation.
--
-- IMPORTANT:
-- - Does NOT enable Stripe Live.
-- - Does NOT execute Stripe operations.
-- - Safe to stage/review before applying to Supabase production.
-- - `prepare_milestone_release_secure` currently contains an auth.uid() guard
--   inherited from Migration 29. The current Node payment flow does not call
--   this RPC; keeping it service_role-only closes the client attack surface.
--   If it is reused by backend code later, its implementation must first be
--   refactored to use an explicit service-role/server assertion rather than a
--   requester auth.uid() requirement.
-- ============================================================================

BEGIN;

-- Final transfer preparation changes persistent transfer state and exposes
-- Connect routing data. It has no requester/provider ownership check, so it
-- must not remain browser/mobile executable.
REVOKE ALL ON FUNCTION public.prepare_milestone_release_secure(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_milestone_release_secure(uuid)
  TO service_role;

-- Final transfer success/failure callbacks are authoritative financial events.
-- A browser/mobile JWT must never be able to forge them.
REVOKE ALL ON FUNCTION public.confirm_milestone_transfer_secure(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_milestone_transfer_secure(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.fail_milestone_transfer_secure(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_milestone_transfer_secure(uuid, text)
  TO service_role;

-- Refund confirmation is authoritative. The requester may prepare/request a
-- refund through prepare_refund_secure(), but only trusted server code may
-- confirm Stripe IDs and mutate cumulative refund/reversal accounting.
REVOKE ALL ON FUNCTION public.confirm_refund_secure(
  uuid, bigint, bigint, bigint, bigint, bigint, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_refund_secure(
  uuid, bigint, bigint, bigint, bigint, bigint, text, text
) TO service_role;

-- Preserve requester-callable RPCs that already enforce auth.uid ownership.
-- Explicitly keep anon out.
REVOKE ALL ON FUNCTION public.create_milestone_payment_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milestone_payment_secure(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_refund_secure(uuid, bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_refund_secure(uuid, bigint, text)
  TO authenticated, service_role;

-- Fail the migration if the intended privilege boundary is not in place.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.prepare_milestone_release_secure(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.prepare_milestone_release_secure(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 33 failed: prepare_milestone_release_secure is still client-executable';
  END IF;

  IF has_function_privilege('anon', 'public.confirm_milestone_transfer_secure(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.confirm_milestone_transfer_secure(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 33 failed: confirm_milestone_transfer_secure is still client-executable';
  END IF;

  IF has_function_privilege('anon', 'public.fail_milestone_transfer_secure(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fail_milestone_transfer_secure(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 33 failed: fail_milestone_transfer_secure is still client-executable';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.confirm_refund_secure(uuid,bigint,bigint,bigint,bigint,bigint,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.confirm_refund_secure(uuid,bigint,bigint,bigint,bigint,bigint,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Migration 33 failed: confirm_refund_secure is still client-executable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.prepare_milestone_release_secure(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.confirm_milestone_transfer_secure(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fail_milestone_transfer_secure(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege(
       'service_role',
       'public.confirm_refund_secure(uuid,bigint,bigint,bigint,bigint,bigint,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Migration 33 failed: service_role lost required financial RPC access';
  END IF;
END $$;

COMMIT;
