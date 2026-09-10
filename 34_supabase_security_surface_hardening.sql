-- LYANN Migration 34 — Supabase exposed surface hardening
-- Mirrors production hardening applied 2026-09-11.
BEGIN;

-- Trigger/event-trigger helpers are implementation details, never public RPCs.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_agent_financial_isolation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_simplified_request_safety() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_pro_document_authoritative_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_pro_identity_authoritative_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_sensitive_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_sensitive_profile_columns_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_sensitive_profile_columns_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Admin/business SECURITY DEFINER RPCs must not be callable anonymously.
REVOKE ALL ON FUNCTION public.admin_update_profile_role(uuid,text,text,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_admin_permission(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;

DO $$ DECLARE r regprocedure; BEGIN
  FOREACH r IN ARRAY ARRAY[
    'public.accept_proposal_secure(uuid)'::regprocedure,
    'public.accept_request_invitation(uuid)'::regprocedure,
    'public.accept_request_quote(uuid)'::regprocedure,
    'public.cancel_mission_secure(uuid,text)'::regprocedure,
    'public.create_proposal_secure(uuid,text,integer,jsonb)'::regprocedure,
    'public.create_request_quote(uuid,text,timestamptz,jsonb)'::regprocedure,
    'public.decline_request_invitation(uuid)'::regprocedure,
    'public.get_conversation_proposals(uuid)'::regprocedure,
    'public.get_conversation_request_context_secure(uuid)'::regprocedure,
    'public.get_mission_details_secure(uuid)'::regprocedure,
    'public.get_or_create_conversation(uuid)'::regprocedure,
    'public.initiate_lyann_help_conversation(uuid)'::regprocedure,
    'public.is_current_user_conversation_participant(uuid)'::regprocedure,
    'public.mark_milestone_done_secure(uuid,text,jsonb)'::regprocedure,
    'public.reject_proposal_secure(uuid)'::regprocedure,
    'public.reject_request_quote(uuid)'::regprocedure,
    'public.send_request_invitations(uuid,uuid[])'::regprocedure,
    'public.start_mission_secure(uuid)'::regprocedure,
    'public.validate_milestone_secure(uuid)'::regprocedure,
    'public.withdraw_proposal_secure(uuid)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_update_profile_role(uuid,text,text,boolean,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;

-- Public profile view must obey invoker/RLS semantics rather than view-owner privileges.
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- Pin search paths on privileged functions flagged by Supabase advisor.
ALTER FUNCTION public.set_payments_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.has_admin_permission(uuid,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_audit_log_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_sensitive_agent_memory() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_simplified_request_safety() SET search_path = public, pg_temp;
ALTER FUNCTION public.protect_pro_identity_authoritative_fields() SET search_path = public, pg_temp;
ALTER FUNCTION public.protect_pro_document_authoritative_fields() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_pro_audit_append_only() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_public_profile_pro_status(uuid) SET search_path = public, pg_temp;

COMMIT;
