-- Rollback of migration 95 — restores the captured ACL (postgres, anon, authenticated, service_role; no PUBLIC). Staging only.
BEGIN;
GRANT EXECUTE ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lyann_pair_conversation(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lyann_ensure_support_welcome(uuid) TO anon, authenticated, service_role;
COMMIT;
