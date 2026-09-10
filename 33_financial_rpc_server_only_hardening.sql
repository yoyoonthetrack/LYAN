-- ============================================================================
-- LYANN — Migration 33: Financial RPC server-only hardening
-- Security boundary: only trusted server code (service_role) may FINALIZE
-- Stripe transfers/refunds or move financial state after external confirmation.
-- IMPORTANT: does not enable Stripe Live or execute Stripe operations.
-- ============================================================================
BEGIN;

REVOKE ALL ON FUNCTION public.prepare_milestone_release_secure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_milestone_release_secure(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_milestone_transfer_secure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_milestone_transfer_secure(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.fail_milestone_transfer_secure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_milestone_transfer_secure(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_refund_secure(uuid, bigint, bigint, bigint, bigint, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_refund_secure(uuid, bigint, bigint, bigint, bigint, bigint, text, text) TO service_role;

-- Requester-facing preparation RPCs retain their existing auth.uid ownership checks.
REVOKE ALL ON FUNCTION public.create_milestone_payment_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milestone_payment_secure(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_refund_secure(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_refund_secure(uuid, bigint, text) TO authenticated, service_role;

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
  IF has_function_privilege('anon', 'public.confirm_refund_secure(uuid,bigint,bigint,bigint,bigint,bigint,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.confirm_refund_secure(uuid,bigint,bigint,bigint,bigint,bigint,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 33 failed: confirm_refund_secure is still client-executable';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.prepare_milestone_release_secure(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.confirm_milestone_transfer_secure(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fail_milestone_transfer_secure(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.confirm_refund_secure(uuid,bigint,bigint,bigint,bigint,bigint,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 33 failed: service_role lost required financial RPC access';
  END IF;
END $$;

COMMIT;
