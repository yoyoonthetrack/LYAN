-- Rollback of 49_push_delivery_queue.sql.
-- The function restore is NOT CERTIFIED and is not executed by this file.
--
-- Local history of public.lyann_notify_on_message():
--   39 creates in-app notifications on each message.
--   41 replaces that function with a body that returns the row and creates none.
--   49 replaces it again and skips some timeline events.
-- The database currently in production was not read. Restoring the body from 41
-- would suppress notifications if production still has the body from 39, or if
-- any later definition still sends them. This file therefore does not replace
-- lyann_notify_on_message.
--
-- What this file does certify: it removes only the push-queue objects created
-- by 49. It does not delete push_deliveries, notifications, messages or payments.
-- Do not run it until Yoann asks for it. Do not run it to "restore" notifications.

BEGIN;

DROP TRIGGER IF EXISTS trg_lyann_enqueue_push ON public.notifications;
DROP TRIGGER IF EXISTS trg_lyann_notify_quote_push ON public.quotes;
DROP TRIGGER IF EXISTS trg_lyann_notify_work_to_validate ON public.milestones;

DROP FUNCTION IF EXISTS public.lyann_claim_push_deliveries(text, integer);
DROP FUNCTION IF EXISTS public.lyann_notify_work_to_validate();
DROP FUNCTION IF EXISTS public.lyann_notify_quote_push();
DROP FUNCTION IF EXISTS public.lyann_enqueue_push_from_notification();

COMMIT;
