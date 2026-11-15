-- Rollback for 99 on Staging. Does not delete messages, notifications, quotes or payments.
-- Re-apply 55_payment_failed_notification.sql and 59_revise_sent_quote_p0001.sql
-- afterwards if the previous function bodies must be restored exactly.
-- Dropping the cap triggers is what re-opens amounts above the ceiling.

BEGIN;

DROP TRIGGER IF EXISTS trg_lyann_guard_quote_cap ON public.quotes;
DROP TRIGGER IF EXISTS trg_lyann_guard_milestone_sum ON public.milestones;
DROP TRIGGER IF EXISTS trg_lyann_skip_legacy_system_card ON public.messages;

DROP FUNCTION IF EXISTS public.withdraw_sent_quote(uuid);
DROP FUNCTION IF EXISTS public.propose_quote_amendment(uuid, text, jsonb, int);
DROP FUNCTION IF EXISTS public.accept_quote_amendment(uuid);
DROP FUNCTION IF EXISTS public.lyann_skip_legacy_system_card();
DROP FUNCTION IF EXISTS public.lyann_assert_prestation_cap(numeric);
DROP FUNCTION IF EXISTS public.lyann_mission_prestation_cap_eur();
DROP FUNCTION IF EXISTS public.lyann_mission_cap_eur();
DROP FUNCTION IF EXISTS public.lyann_guard_quote_cap();
DROP FUNCTION IF EXISTS public.lyann_guard_milestone_sum();

COMMIT;
