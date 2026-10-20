-- Incident rollback for 70_public_content_moderation.sql.
-- Pending and rejected rows stay hidden. Approved rows stay readable.
-- Storage buckets are not reopened and their public flag is not changed.
-- New public writes are paused until intake_open is set back to true
-- by a database operator. This file does not delete posts, comments,
-- requests, profiles, reports, blocks, or historical media.

BEGIN;

UPDATE public.moderation_control
   SET intake_open = false
 WHERE singleton = 1;

DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.bokantaj_posts;
CREATE POLICY "Posts are viewable by everyone"
ON public.bokantaj_posts FOR SELECT
USING (
    CASE
        WHEN public_moderation_status = 'approved' THEN true
        WHEN auth.uid() IS NOT NULL AND auth.uid() = author_id AND public_moderation_status IS DISTINCT FROM 'rejected' THEN true
        WHEN coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' THEN false
        ELSE public.is_current_user_admin()
    END
);

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.bokantaj_comments;
CREATE POLICY "Comments are viewable by everyone"
ON public.bokantaj_comments FOR SELECT
USING (
    CASE
        WHEN public_moderation_status = 'approved' THEN true
        WHEN auth.uid() IS NOT NULL AND auth.uid() = author_id AND public_moderation_status IS DISTINCT FROM 'rejected' THEN true
        WHEN coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' THEN false
        ELSE public.is_current_user_admin()
    END
);

DROP POLICY IF EXISTS "Requests are viewable by everyone" ON public.requests;
CREATE POLICY "Requests are viewable by everyone"
ON public.requests FOR SELECT
USING (
    CASE
        WHEN auth.uid() IS NOT NULL AND auth.uid() = requester_id AND public_moderation_status IS DISTINCT FROM 'rejected' THEN true
        WHEN public_moderation_status IS DISTINCT FROM 'approved' THEN
            CASE
                WHEN coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' THEN false
                ELSE public.is_current_user_admin()
            END
        ELSE true
    END
);

COMMIT;
