-- Controlled deactivation of 51_quote_modifications_and_safety.sql.
-- Do not run until Yoann asks for it.
-- Turns off quote revision for signed-in members by revoking EXECUTE.
-- Does not replace get_or_create_conversation. The block on a new conversation
-- stays in place.
-- Does not replace or drop is_blocked_between.
-- Does not drop submit_user_report, so report rate limits stay enforced.
-- Does not delete quote_revisions, user_reports, conversations or messages.

BEGIN;

DROP TRIGGER IF EXISTS trg_refuse_blocked_new_participant ON public.conversation_participants;
REVOKE EXECUTE ON FUNCTION public.revise_sent_quote(uuid, text, timestamptz, jsonb, int) FROM PUBLIC, anon, authenticated;

COMMIT;
