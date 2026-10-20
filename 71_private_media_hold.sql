-- Private locations for new uploads. Historical public buckets stay public.
-- Apply on Staging only until a production deployment is authorized.
-- Does not rewrite existing media URLs and does not set any current bucket private.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('bokantaj-media-hold', 'bokantaj-media-hold', false),
    ('avatars-hold', 'avatars-hold', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "hold media owner read" ON storage.objects;
CREATE POLICY "hold media owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id IN ('bokantaj-media-hold', 'avatars-hold')
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "hold media owner insert" ON storage.objects;
CREATE POLICY "hold media owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id IN ('bokantaj-media-hold', 'avatars-hold')
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "hold media owner delete" ON storage.objects;
CREATE POLICY "hold media owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id IN ('bokantaj-media-hold', 'avatars-hold')
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE TABLE IF NOT EXISTS public.moderation_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    reason_code text,
    available_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    claimed_at timestamptz,
    finished_at timestamptz,
    CONSTRAINT moderation_jobs_subject_unique UNIQUE (subject_type, subject_id),
    CONSTRAINT moderation_jobs_status_check CHECK (status IN ('queued', 'running', 'retry', 'held', 'done')),
    CONSTRAINT moderation_jobs_type_check CHECK (subject_type IN ('post', 'comment', 'request', 'profile'))
);
ALTER TABLE public.moderation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_enqueue_moderation_job(p_type text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.moderation_jobs (subject_type, subject_id, status, attempts, available_at, reason_code, finished_at)
    VALUES (p_type, p_id, 'queued', 0, timezone('utc'::text, now()), NULL, NULL)
    ON CONFLICT (subject_type, subject_id) DO UPDATE
        SET status = 'queued',
            attempts = 0,
            available_at = timezone('utc'::text, now()),
            reason_code = NULL,
            claimed_at = NULL,
            finished_at = NULL
        WHERE public.moderation_jobs.status IS DISTINCT FROM 'running';
END;
$$;
REVOKE ALL ON FUNCTION public.lyann_enqueue_moderation_job(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_touch_post_moderation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.lyann_is_service_role() THEN
        RETURN NEW;
    END IF;
    IF NEW.public_moderation_status = 'pending'
       OR EXISTS (
            SELECT 1 FROM public.content_moderation_queue
            WHERE subject_type = 'post' AND subject_id = NEW.id AND status = 'pending'
       ) THEN
        PERFORM public.lyann_enqueue_moderation_job('post', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_touch_comment_moderation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.lyann_is_service_role() THEN
        RETURN NEW;
    END IF;
    IF NEW.public_moderation_status = 'pending'
       OR EXISTS (
            SELECT 1 FROM public.content_moderation_queue
            WHERE subject_type = 'comment' AND subject_id = NEW.id AND status = 'pending'
       ) THEN
        PERFORM public.lyann_enqueue_moderation_job('comment', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_touch_request_moderation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.lyann_is_service_role() THEN
        RETURN NEW;
    END IF;
    IF NEW.public_moderation_status = 'pending'
       OR EXISTS (
            SELECT 1 FROM public.content_moderation_queue
            WHERE subject_type = 'request' AND subject_id = NEW.id AND status = 'pending'
       ) THEN
        PERFORM public.lyann_enqueue_moderation_job('request', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_touch_profile_moderation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.lyann_is_service_role() THEN
        RETURN NEW;
    END IF;
    IF NEW.bio_moderation_status = 'pending' OR NEW.avatar_moderation_status = 'pending' THEN
        PERFORM public.lyann_enqueue_moderation_job('profile', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_post_moderation_job ON public.bokantaj_posts;
CREATE TRIGGER trg_touch_post_moderation_job
    AFTER INSERT OR UPDATE ON public.bokantaj_posts
    FOR EACH ROW EXECUTE FUNCTION public.lyann_touch_post_moderation_job();

DROP TRIGGER IF EXISTS trg_touch_comment_moderation_job ON public.bokantaj_comments;
CREATE TRIGGER trg_touch_comment_moderation_job
    AFTER INSERT OR UPDATE ON public.bokantaj_comments
    FOR EACH ROW EXECUTE FUNCTION public.lyann_touch_comment_moderation_job();

DROP TRIGGER IF EXISTS trg_touch_request_moderation_job ON public.requests;
CREATE TRIGGER trg_touch_request_moderation_job
    AFTER INSERT OR UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.lyann_touch_request_moderation_job();

DROP TRIGGER IF EXISTS trg_touch_profile_moderation_job ON public.profiles;
CREATE TRIGGER trg_touch_profile_moderation_job
    AFTER INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.lyann_touch_profile_moderation_job();

CREATE OR REPLACE FUNCTION public.claim_moderation_job()
RETURNS public.moderation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job public.moderation_jobs;
BEGIN
    IF NOT public.lyann_is_service_role() THEN
        RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_job
    FROM public.moderation_jobs
    WHERE status IN ('queued', 'retry')
      AND available_at <= timezone('utc'::text, now())
      AND attempts < max_attempts
    ORDER BY available_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    UPDATE public.moderation_jobs
       SET status = 'running',
           attempts = attempts + 1,
           claimed_at = timezone('utc'::text, now())
     WHERE id = v_job.id
     RETURNING * INTO v_job;
    RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_moderation_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_moderation_job() TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_stale_moderation_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_held integer;
    v_retry integer;
BEGIN
    IF NOT public.lyann_is_service_role() THEN
        RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.moderation_jobs
       SET status = 'held',
           reason_code = 'interrupted',
           claimed_at = NULL,
           finished_at = timezone('utc'::text, now())
     WHERE status = 'running'
       AND claimed_at < timezone('utc'::text, now()) - interval '5 minutes'
       AND attempts >= max_attempts;
    GET DIAGNOSTICS v_held = ROW_COUNT;
    UPDATE public.moderation_jobs
       SET status = 'retry',
           claimed_at = NULL,
           available_at = timezone('utc'::text, now())
     WHERE status = 'running'
       AND claimed_at < timezone('utc'::text, now()) - interval '5 minutes'
       AND attempts < max_attempts;
    GET DIAGNOSTICS v_retry = ROW_COUNT;
    RETURN v_held + v_retry;
END;
$$;
REVOKE ALL ON FUNCTION public.requeue_stale_moderation_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stale_moderation_jobs() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
