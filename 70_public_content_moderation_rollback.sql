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
TO anon, authenticated
USING (public_moderation_status = 'approved');

DROP POLICY IF EXISTS "Authors can view their pending posts" ON public.bokantaj_posts;
CREATE POLICY "Authors can view their pending posts"
ON public.bokantaj_posts FOR SELECT
TO authenticated
USING (auth.uid() = author_id AND public_moderation_status IS DISTINCT FROM 'rejected');

DROP POLICY IF EXISTS "Admins can view posts under review" ON public.bokantaj_posts;
CREATE POLICY "Admins can view posts under review"
ON public.bokantaj_posts FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.bokantaj_comments;
CREATE POLICY "Comments are viewable by everyone"
ON public.bokantaj_comments FOR SELECT
TO anon, authenticated
USING (public_moderation_status = 'approved');

DROP POLICY IF EXISTS "Authors can view their pending comments" ON public.bokantaj_comments;
CREATE POLICY "Authors can view their pending comments"
ON public.bokantaj_comments FOR SELECT
TO authenticated
USING (auth.uid() = author_id AND public_moderation_status IS DISTINCT FROM 'rejected');

DROP POLICY IF EXISTS "Admins can view comments under review" ON public.bokantaj_comments;
CREATE POLICY "Admins can view comments under review"
ON public.bokantaj_comments FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Requests are viewable by everyone" ON public.requests;
DROP POLICY IF EXISTS "Requests visibility policy" ON public.requests;
CREATE POLICY "Requests are viewable by everyone"
ON public.requests FOR SELECT
TO anon, authenticated
USING (
    public_moderation_status = 'approved'
    AND (visibility = 'PUBLIC' OR requester_id = auth.uid() OR target_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Authors can view their pending requests" ON public.requests;
CREATE POLICY "Authors can view their pending requests"
ON public.requests FOR SELECT
TO authenticated
USING (auth.uid() = requester_id AND public_moderation_status IS DISTINCT FROM 'rejected');

DROP POLICY IF EXISTS "Admins can view requests under review" ON public.requests;
CREATE POLICY "Admins can view requests under review"
ON public.requests FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

COMMIT;
