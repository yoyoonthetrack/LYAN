-- LYANN — preventive public-content moderation.
-- Do not apply to Supabase Production until explicitly authorized.
-- Does not change Stripe, does not make any bucket private, and does not
-- rewrite existing media URLs. Existing public rows stay visible.
-- A user write is stored as pending. The trigger never grants approved.
-- Only the service role may later mark a row approved or rejected.
-- If that server step is unavailable, the row stays pending and hidden.

BEGIN;

ALTER TABLE public.bokantaj_posts
    ADD COLUMN IF NOT EXISTS public_moderation_status text,
    ADD COLUMN IF NOT EXISTS content_pending text;
ALTER TABLE public.bokantaj_comments
    ADD COLUMN IF NOT EXISTS public_moderation_status text,
    ADD COLUMN IF NOT EXISTS content_pending text;
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS public_moderation_status text,
    ADD COLUMN IF NOT EXISTS title_pending text,
    ADD COLUMN IF NOT EXISTS description_pending text;
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS bio_pending text,
    ADD COLUMN IF NOT EXISTS bio_moderation_status text,
    ADD COLUMN IF NOT EXISTS avatar_pending text,
    ADD COLUMN IF NOT EXISTS avatar_moderation_status text;

UPDATE public.bokantaj_posts SET public_moderation_status = 'approved' WHERE public_moderation_status IS NULL;
UPDATE public.bokantaj_comments SET public_moderation_status = 'approved' WHERE public_moderation_status IS NULL;
UPDATE public.requests SET public_moderation_status = 'approved' WHERE public_moderation_status IS NULL;
UPDATE public.profiles SET bio_moderation_status = 'approved' WHERE bio_moderation_status IS NULL;
UPDATE public.profiles SET avatar_moderation_status = 'approved' WHERE avatar_moderation_status IS NULL;

ALTER TABLE public.bokantaj_posts ALTER COLUMN public_moderation_status SET DEFAULT 'pending';
ALTER TABLE public.bokantaj_comments ALTER COLUMN public_moderation_status SET DEFAULT 'pending';
ALTER TABLE public.requests ALTER COLUMN public_moderation_status SET DEFAULT 'pending';
ALTER TABLE public.profiles ALTER COLUMN bio_moderation_status SET DEFAULT 'approved';
ALTER TABLE public.profiles ALTER COLUMN avatar_moderation_status SET DEFAULT 'approved';

ALTER TABLE public.bokantaj_posts ALTER COLUMN public_moderation_status SET NOT NULL;
ALTER TABLE public.bokantaj_comments ALTER COLUMN public_moderation_status SET NOT NULL;
ALTER TABLE public.requests ALTER COLUMN public_moderation_status SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN bio_moderation_status SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN avatar_moderation_status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bokantaj_posts_public_moderation_status_check') THEN
        ALTER TABLE public.bokantaj_posts
            ADD CONSTRAINT bokantaj_posts_public_moderation_status_check
            CHECK (public_moderation_status IN ('approved', 'pending', 'rejected'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bokantaj_comments_public_moderation_status_check') THEN
        ALTER TABLE public.bokantaj_comments
            ADD CONSTRAINT bokantaj_comments_public_moderation_status_check
            CHECK (public_moderation_status IN ('approved', 'pending', 'rejected'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requests_public_moderation_status_check') THEN
        ALTER TABLE public.requests
            ADD CONSTRAINT requests_public_moderation_status_check
            CHECK (public_moderation_status IN ('approved', 'pending', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bokantaj_posts_public_moderation
    ON public.bokantaj_posts (public_moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_public_moderation
    ON public.requests (public_moderation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_control (
    singleton integer PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
    intake_open boolean NOT NULL DEFAULT true
);
INSERT INTO public.moderation_control (singleton, intake_open)
VALUES (1, true)
ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.moderation_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_control FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.content_moderation_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT content_moderation_queue_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);
ALTER TABLE public.content_moderation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_moderation_queue FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_public_intake_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce((SELECT intake_open FROM public.moderation_control WHERE singleton = 1), false);
$$;
REVOKE ALL ON FUNCTION public.lyann_public_intake_open() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.public_media_releases (
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    kind text NOT NULL DEFAULT 'image',
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (bucket_id, object_name),
    CONSTRAINT public_media_releases_status_check CHECK (status IN ('approved', 'pending', 'rejected')),
    CONSTRAINT public_media_releases_kind_check CHECK (kind IN ('image', 'video'))
);
ALTER TABLE public.public_media_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_media_releases FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR coalesce(auth.role(), '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.lyann_media_from_urls(p_urls text[])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_url text;
    v_rest text;
    v_bucket text;
    v_path text;
    v_items jsonb := '[]'::jsonb;
BEGIN
    IF p_urls IS NULL THEN RETURN '[]'::jsonb; END IF;
    FOREACH v_url IN ARRAY p_urls LOOP
        IF v_url ~ '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/[A-Za-z0-9_-]+/.+' THEN
            v_rest := regexp_replace(v_url, '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/', '');
            v_bucket := split_part(v_rest, '/', 1);
            v_path := substring(v_rest FROM length(v_bucket) + 2);
            IF v_bucket IN ('bokantaj-media', 'avatars', 'profile-images', 'request-photos')
               AND v_path <> '' AND position('..' IN v_path) = 0 THEN
                v_items := v_items || jsonb_build_array(jsonb_build_object('bucket', v_bucket, 'path', v_path));
            END IF;
        END IF;
    END LOOP;
    RETURN v_items;
END;
$$;

-- The database trigger never approves. pg_net would reply after commit, and a
-- synchronous HTTP call would place a secret in the database. A user write
-- stays pending until the service role applies the moderation decision.
CREATE OR REPLACE FUNCTION public.lyann_moderate_public_text(p_text text, p_media jsonb)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 'pending'::text;
$$;

REVOKE ALL ON FUNCTION public.lyann_moderate_public_text(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_media_from_urls(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_media_from_urls(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lyann_gateway_media_url(p_url text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_gateway text;
    v_rest text;
BEGIN
    v_gateway := nullif(current_setting('lyann.media_gateway', true), '');
    IF v_gateway IS NULL OR p_url IS NULL THEN
        RETURN p_url;
    END IF;
    IF p_url !~ '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/[A-Za-z0-9_-]+/.+' THEN
        RETURN p_url;
    END IF;
    v_rest := regexp_replace(p_url, '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/', '');
    RETURN rtrim(v_gateway, '/') || '/' || v_rest;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_gateway_media_url(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_bokantaj_post_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_decision text;
    v_media jsonb;
BEGIN
    IF TG_OP = 'INSERT' AND NOT public.lyann_is_service_role() AND NOT public.lyann_public_intake_open() THEN
        RAISE EXCEPTION 'Les nouvelles publications sont temporairement suspendues.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND public.lyann_is_service_role() THEN
        IF NEW.public_moderation_status = 'rejected' AND OLD.public_moderation_status = 'approved'
           AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
            NEW.content := OLD.content;
            NEW.media_urls := OLD.media_urls;
            NEW.public_moderation_status := 'approved';
        ELSIF NEW.public_moderation_status = 'approved' AND OLD.content_pending IS NOT NULL
           AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
            NEW.content := OLD.content_pending;
        END IF;
        NEW.content_pending := NULL;
        RETURN NEW;
    END IF;

    v_media := public.lyann_media_from_urls(NEW.media_urls);
    v_decision := public.lyann_moderate_public_text(NEW.content, v_media);
    IF v_decision = 'rejected' THEN
        RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'UPDATE' AND v_decision = 'pending' AND OLD.public_moderation_status = 'approved' THEN
        INSERT INTO public.content_moderation_queue (subject_type, subject_id, payload)
        VALUES ('post', OLD.id, jsonb_build_object('content', NEW.content, 'media_urls', NEW.media_urls));
        NEW.content := OLD.content;
        NEW.media_urls := OLD.media_urls;
        NEW.content_pending := NULL;
        NEW.public_moderation_status := 'approved';
        RETURN NEW;
    END IF;

    NEW.content_pending := NULL;
    NEW.public_moderation_status := CASE WHEN v_decision = 'approved' THEN 'approved' ELSE 'pending' END;
    IF NEW.media_urls IS NOT NULL THEN
        NEW.media_urls := ARRAY(SELECT public.lyann_gateway_media_url(url) FROM unnest(NEW.media_urls) AS url);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_bokantaj_comment_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_decision text;
    v_media jsonb;
BEGIN
    IF TG_OP = 'INSERT' AND NOT public.lyann_is_service_role() AND NOT public.lyann_public_intake_open() THEN
        RAISE EXCEPTION 'Les nouvelles publications sont temporairement suspendues.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND public.lyann_is_service_role() THEN
        IF NEW.public_moderation_status = 'rejected' AND OLD.public_moderation_status = 'approved'
           AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
            NEW.content := OLD.content;
            NEW.media_url := OLD.media_url;
            NEW.public_moderation_status := 'approved';
        ELSIF NEW.public_moderation_status = 'approved' AND OLD.content_pending IS NOT NULL
           AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
            NEW.content := OLD.content_pending;
        END IF;
        NEW.content_pending := NULL;
        RETURN NEW;
    END IF;

    v_media := public.lyann_media_from_urls(ARRAY[NEW.media_url]);
    v_decision := public.lyann_moderate_public_text(NEW.content, v_media);
    IF v_decision = 'rejected' THEN
        RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND v_decision = 'pending' AND OLD.public_moderation_status = 'approved' THEN
        INSERT INTO public.content_moderation_queue (subject_type, subject_id, payload)
        VALUES ('comment', OLD.id, jsonb_build_object('content', NEW.content, 'media_url', NEW.media_url));
        NEW.content := OLD.content;
        NEW.media_url := OLD.media_url;
        NEW.content_pending := NULL;
        NEW.public_moderation_status := 'approved';
        RETURN NEW;
    END IF;
    NEW.content_pending := NULL;
    NEW.public_moderation_status := CASE WHEN v_decision = 'approved' THEN 'approved' ELSE 'pending' END;
    NEW.media_url := public.lyann_gateway_media_url(NEW.media_url);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_request_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_decision text;
    v_text text;
BEGIN
    IF TG_OP = 'INSERT' AND NOT public.lyann_is_service_role() AND NOT public.lyann_public_intake_open() THEN
        RAISE EXCEPTION 'Les nouvelles publications sont temporairement suspendues.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND public.lyann_is_service_role() THEN
        IF NEW.public_moderation_status = 'rejected' AND OLD.public_moderation_status = 'approved'
           AND NEW.title IS NOT DISTINCT FROM OLD.title
           AND NEW.description IS NOT DISTINCT FROM OLD.description THEN
            NEW.title := OLD.title;
            NEW.description := OLD.description;
            NEW.public_moderation_status := 'approved';
        ELSIF NEW.public_moderation_status = 'approved'
           AND NEW.title IS NOT DISTINCT FROM OLD.title
           AND NEW.description IS NOT DISTINCT FROM OLD.description
           AND (OLD.title_pending IS NOT NULL OR OLD.description_pending IS NOT NULL) THEN
            NEW.title := coalesce(OLD.title_pending, OLD.title);
            NEW.description := coalesce(OLD.description_pending, OLD.description);
        END IF;
        NEW.title_pending := NULL;
        NEW.description_pending := NULL;
        RETURN NEW;
    END IF;

    v_text := btrim(coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
    v_decision := public.lyann_moderate_public_text(v_text, '[]'::jsonb);
    IF v_decision = 'rejected' THEN
        RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND v_decision = 'pending' AND OLD.public_moderation_status = 'approved' THEN
        INSERT INTO public.content_moderation_queue (subject_type, subject_id, payload)
        VALUES ('request', OLD.id, jsonb_build_object('title', NEW.title, 'description', NEW.description));
        NEW.title := OLD.title;
        NEW.description := OLD.description;
        NEW.title_pending := NULL;
        NEW.description_pending := NULL;
        NEW.public_moderation_status := 'approved';
        RETURN NEW;
    END IF;
    NEW.title_pending := NULL;
    NEW.description_pending := NULL;
    NEW.public_moderation_status := CASE WHEN v_decision = 'approved' THEN 'approved' ELSE 'pending' END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_public_text_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bio_decision text;
    v_avatar_decision text;
    v_media jsonb;
BEGIN
    IF TG_OP = 'INSERT'
       AND nullif(btrim(coalesce(NEW.bio, '')), '') IS NULL
       AND nullif(NEW.avatar_url, '') IS NULL THEN
        NEW.bio_moderation_status := 'approved';
        NEW.avatar_moderation_status := 'approved';
        RETURN NEW;
    END IF;
    IF NOT public.lyann_is_service_role() AND NOT public.lyann_public_intake_open() THEN
        IF TG_OP = 'INSERT' THEN
            RAISE EXCEPTION 'Les nouvelles publications sont temporairement suspendues.' USING ERRCODE = 'P0001';
        ELSIF NEW.bio IS DISTINCT FROM OLD.bio OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
            RAISE EXCEPTION 'Les nouvelles publications sont temporairement suspendues.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_bio_decision := public.lyann_moderate_public_text(NEW.bio, '[]'::jsonb);
        IF v_bio_decision = 'rejected' THEN
            RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
        ELSIF v_bio_decision = 'approved' THEN
            NEW.bio_pending := NULL;
            NEW.bio_moderation_status := 'approved';
        ELSE
            NEW.bio_pending := NULLIF(btrim(coalesce(NEW.bio, '')), '');
            NEW.bio := NULL;
            NEW.bio_moderation_status := 'pending';
        END IF;
        v_media := public.lyann_media_from_urls(ARRAY[NEW.avatar_url]);
        v_avatar_decision := public.lyann_moderate_public_text('', v_media);
        IF v_avatar_decision = 'rejected' THEN
            RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
        ELSIF v_avatar_decision = 'approved' THEN
            NEW.avatar_pending := NULL;
            NEW.avatar_url := public.lyann_gateway_media_url(NEW.avatar_url);
            NEW.avatar_moderation_status := 'approved';
        ELSE
            NEW.avatar_pending := NEW.avatar_url;
            NEW.avatar_url := NULL;
            NEW.avatar_moderation_status := 'pending';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND public.lyann_is_service_role()
       AND NEW.bio IS NOT DISTINCT FROM OLD.bio
       AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url THEN
        IF NEW.bio_moderation_status = 'approved' AND OLD.bio_pending IS NOT NULL THEN
            NEW.bio := OLD.bio_pending;
            NEW.bio_pending := NULL;
        ELSIF NEW.bio_moderation_status = 'rejected' THEN
            NEW.bio := OLD.bio;
            NEW.bio_pending := NULL;
            NEW.bio_moderation_status := 'approved';
        END IF;
        IF NEW.avatar_moderation_status = 'approved' AND OLD.avatar_pending IS NOT NULL THEN
            NEW.avatar_url := public.lyann_gateway_media_url(OLD.avatar_pending);
            NEW.avatar_pending := NULL;
        ELSIF NEW.avatar_moderation_status = 'rejected' THEN
            NEW.avatar_url := OLD.avatar_url;
            NEW.avatar_pending := NULL;
            NEW.avatar_moderation_status := 'approved';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.bio IS DISTINCT FROM OLD.bio THEN
        v_bio_decision := public.lyann_moderate_public_text(NEW.bio, '[]'::jsonb);
        IF v_bio_decision = 'rejected' THEN
            RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
        ELSIF TG_OP = 'UPDATE' AND v_bio_decision = 'pending' THEN
            NEW.bio_pending := NEW.bio;
            NEW.bio := OLD.bio;
            NEW.bio_moderation_status := 'pending';
        ELSE
            NEW.bio_pending := NULL;
            NEW.bio_moderation_status := CASE WHEN v_bio_decision = 'approved' THEN 'approved' ELSE 'pending' END;
        END IF;
    END IF;

    IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
        v_media := public.lyann_media_from_urls(ARRAY[NEW.avatar_url]);
        v_avatar_decision := public.lyann_moderate_public_text('', v_media);
        IF v_avatar_decision = 'rejected' THEN
            RAISE EXCEPTION 'Ce contenu ne peut pas être publié.' USING ERRCODE = 'P0001';
        ELSIF TG_OP = 'UPDATE' AND v_avatar_decision = 'pending' THEN
            NEW.avatar_pending := NEW.avatar_url;
            NEW.avatar_url := OLD.avatar_url;
            NEW.avatar_moderation_status := 'pending';
        ELSE
            NEW.avatar_pending := NULL;
            NEW.avatar_moderation_status := CASE WHEN v_avatar_decision = 'approved' THEN 'approved' ELSE 'pending' END;
            NEW.avatar_url := public.lyann_gateway_media_url(NEW.avatar_url);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bokantaj_post_moderation ON public.bokantaj_posts;
CREATE TRIGGER trg_enforce_bokantaj_post_moderation
    BEFORE INSERT OR UPDATE ON public.bokantaj_posts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_bokantaj_post_moderation();

DROP TRIGGER IF EXISTS trg_enforce_bokantaj_comment_moderation ON public.bokantaj_comments;
CREATE TRIGGER trg_enforce_bokantaj_comment_moderation
    BEFORE INSERT OR UPDATE ON public.bokantaj_comments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_bokantaj_comment_moderation();

DROP TRIGGER IF EXISTS trg_enforce_request_moderation ON public.requests;
CREATE TRIGGER trg_enforce_request_moderation
    BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.enforce_request_moderation();

DROP TRIGGER IF EXISTS trg_enforce_profile_public_text_moderation ON public.profiles;
CREATE TRIGGER trg_enforce_profile_public_text_moderation
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_public_text_moderation();

CREATE OR REPLACE FUNCTION public.record_public_media_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.bucket_id IN ('bokantaj-media', 'avatars', 'profile-images', 'request-photos', 'bokantaj-media-hold', 'avatars-hold', 'portfolio-images-hold', 'request-photos-hold') THEN
        INSERT INTO public.public_media_releases (bucket_id, object_name, status, kind)
        VALUES (
            NEW.bucket_id,
            NEW.name,
            'pending',
            CASE WHEN NEW.name ~* '\.(mp4|mov|webm|m4v)$' THEN 'video' ELSE 'image' END
        )
        ON CONFLICT (bucket_id, object_name) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_public_media_release ON storage.objects;
CREATE TRIGGER trg_record_public_media_release
    AFTER INSERT ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION public.record_public_media_release();

INSERT INTO public.public_media_releases (bucket_id, object_name, status, kind)
SELECT bucket_id,
       name,
       'approved',
       CASE WHEN name ~* '\.(mp4|mov|webm|m4v)$' THEN 'video' ELSE 'image' END
FROM storage.objects
WHERE bucket_id IN ('bokantaj-media', 'avatars', 'profile-images', 'request-photos')
ON CONFLICT (bucket_id, object_name) DO NOTHING;

-- Private messages are intentionally not sent to the classifier.
-- Reports, blocks, and their policies are left unchanged.

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
