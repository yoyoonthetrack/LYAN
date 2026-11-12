-- LYANN Migration 95 — close the anonymous / member EXECUTE on three internal SECURITY DEFINER helpers.
-- PREPARED, NOT APPLIED. Staging only (tdktfbtqceldlaeqjtow). Needs its own authorization. Never Production without a separate, explicit decision.
-- Rollback: 95_internal_helper_rpc_lockdown_rollback.sql
--
-- Finding (Phase 3.2C-5, read-only audit + rolled-back probe on Staging):
--   lyann_insert_notification(uuid,text,text,text,text,text)
--   lyann_pair_conversation(uuid,uuid)
--   lyann_ensure_support_welcome(uuid)
-- are SECURITY DEFINER, have no identity check and are EXECUTE-able by anon and authenticated. Migrations 39/40 intended service_role only
-- (REVOKE ALL ... FROM PUBLIC; GRANT ... TO service_role), but REVOKE FROM PUBLIC does not remove the explicit grants that Supabase's default
-- privileges give to anon / authenticated on every new function in schema public. Consequences, reproduced inside a rolled-back transaction:
--   * a visitor can insert a notification with arbitrary title/body for ANY member id (member ids are public in public_profiles) and, for the
--     whitelisted types, enqueue a native push (trg_lyann_enqueue_push -> push_deliveries);
--   * a visitor (or any member) can create a conversation + participants between ANY two members, bypassing the block check
--     (refuse_blocked_new_participant returns early when auth.uid() IS NULL) and the product's own conversation rules, and can read back the id
--     of an existing conversation between two members;
--   * a visitor can create the support conversation + welcome message for any member.
-- Callers are unaffected: the only application callers are server-side (api/server.js, api/admin-operations.js) through the service-role client,
-- and the in-database callers (lyann_notify_*, lyann_open_support_conversation, lyann_send_welcome_message) are SECURITY DEFINER functions owned
-- by postgres, which keeps EXECUTE. No browser code calls these three functions.
--
-- Scope: exactly these three functions. No table, policy, view or data is touched.

BEGIN;

DO $pre$
BEGIN
    IF to_regprocedure('public.lyann_insert_notification(uuid,text,text,text,text,text)') IS NULL
       OR to_regprocedure('public.lyann_pair_conversation(uuid,uuid)') IS NULL
       OR to_regprocedure('public.lyann_ensure_support_welcome(uuid)') IS NULL THEN
        RAISE EXCEPTION 'migration 95: one of the three helper functions is missing (unexpected signature)';
    END IF;
END
$pre$;

REVOKE EXECUTE ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.lyann_pair_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lyann_pair_conversation(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.lyann_ensure_support_welcome(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lyann_ensure_support_welcome(uuid) TO service_role;

DO $post$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.lyann_insert_notification(uuid,text,text,text,text,text)',
        'public.lyann_pair_conversation(uuid,uuid)',
        'public.lyann_ensure_support_welcome(uuid)'] LOOP
        IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
            RAISE EXCEPTION 'migration 95: % is still executable by anon or authenticated', f;
        END IF;
        IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
            RAISE EXCEPTION 'migration 95: service_role lost EXECUTE on %', f;
        END IF;
    END LOOP;
END
$post$;

COMMIT;
