-- Staging rollback for 73_moderation_center.sql.
-- Does not touch Production. Does not drop public content.

BEGIN;

DROP TRIGGER IF EXISTS trg_preserve_human_lock_posts ON public.bokantaj_posts;
DROP TRIGGER IF EXISTS trg_preserve_human_lock_comments ON public.bokantaj_comments;
DROP TRIGGER IF EXISTS trg_block_restricted_posts ON public.bokantaj_posts;
DROP TRIGGER IF EXISTS trg_block_restricted_posts_upd ON public.bokantaj_posts;
DROP TRIGGER IF EXISTS trg_block_restricted_comments ON public.bokantaj_comments;
DROP TRIGGER IF EXISTS trg_block_restricted_comments_upd ON public.bokantaj_comments;
DROP TRIGGER IF EXISTS trg_block_restricted_requests ON public.requests;
DROP TRIGGER IF EXISTS trg_block_restricted_requests_upd ON public.requests;
DROP TRIGGER IF EXISTS trg_block_restricted_messages ON public.messages;
DROP TRIGGER IF EXISTS trg_block_restricted_messages_upd ON public.messages;
DROP TRIGGER IF EXISTS trg_block_restricted_quotes ON public.quotes;
DROP TRIGGER IF EXISTS trg_block_restricted_proposals ON public.proposals;
DROP TRIGGER IF EXISTS trg_block_restricted_likes ON public.bokantaj_likes;
DROP TRIGGER IF EXISTS trg_block_restricted_user_reports ON public.user_reports;
DROP TRIGGER IF EXISTS trg_block_restricted_bok_reports ON public.bokantaj_reports;
DROP TRIGGER IF EXISTS trg_block_restricted_storage ON storage.objects;

DROP FUNCTION IF EXISTS public.lyann_block_restricted_writes();
DROP FUNCTION IF EXISTS public.lyann_preserve_human_moderation_lock();
DROP FUNCTION IF EXISTS public.lyann_account_is_restricted(uuid);

DROP TABLE IF EXISTS public.sanction_reviews;
DROP TABLE IF EXISTS public.account_sanctions;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_restriction_status_check;
DROP INDEX IF EXISTS idx_profiles_restriction;

-- Restore the previous service-role reject-reverts-to-approved behavior
-- from 70_public_content_moderation.sql. Re-apply that file's function
-- bodies if a full revert of hide behavior is required.

COMMIT;
