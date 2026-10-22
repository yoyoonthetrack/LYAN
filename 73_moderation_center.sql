-- LYANN — Moderation Center V1.
-- Staging only (tdktfbtqceldlaeqjtow). Do not apply to Production.
-- Adds a human lock so an IA worker cannot re-approve a manual hide,
-- account sanctions that actually restrict writes, and write blockers
-- for posts, comments, requests and messages.

BEGIN;

ALTER TABLE public.bokantaj_posts
    ADD COLUMN IF NOT EXISTS human_moderation_lock boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS human_decision text,
    ADD COLUMN IF NOT EXISTS previous_public_status text;

ALTER TABLE public.bokantaj_comments
    ADD COLUMN IF NOT EXISTS human_moderation_lock boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS human_decision text,
    ADD COLUMN IF NOT EXISTS previous_public_status text;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS restriction_status text NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS restricted_until timestamptz,
    ADD COLUMN IF NOT EXISTS restriction_reason text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_restriction_status_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_restriction_status_check
            CHECK (restriction_status IN ('none', 'warned', 'suspended', 'banned'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_restriction
    ON public.profiles (restriction_status, restricted_until);

CREATE TABLE IF NOT EXISTS public.account_sanctions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    kind text NOT NULL,
    duration_hours integer,
    starts_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    ends_at timestamptz,
    reason text NOT NULL,
    actor_id uuid,
    active boolean NOT NULL DEFAULT true,
    lifted_at timestamptz,
    lifted_by uuid,
    lift_reason text,
    open_missions integer,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT account_sanctions_kind_check CHECK (kind IN ('warning', 'suspend', 'ban', 'lift'))
);

CREATE INDEX IF NOT EXISTS idx_account_sanctions_user
    ON public.account_sanctions (user_id, created_at DESC);

ALTER TABLE public.account_sanctions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_sanctions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.sanction_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sanction_id uuid NOT NULL REFERENCES public.account_sanctions(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    note text NOT NULL,
    status text NOT NULL DEFAULT 'OPEN',
    reviewer_id uuid,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT sanction_reviews_status_check CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED'))
);

ALTER TABLE public.sanction_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sanction_reviews FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_account_is_restricted(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    row public.profiles%ROWTYPE;
BEGIN
    IF uid IS NULL THEN
        RETURN false;
    END IF;
    SELECT * INTO row FROM public.profiles WHERE id = uid;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    IF row.restriction_status = 'banned' THEN
        RETURN true;
    END IF;
    IF row.restriction_status = 'suspended' THEN
        IF row.restricted_until IS NULL OR row.restricted_until > timezone('utc'::text, now()) THEN
            RETURN true;
        END IF;
    END IF;
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_account_is_restricted(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_account_is_restricted(uuid) TO service_role;

-- Fail closed: user-owned RLS UPDATE must never let someone clear their own ban
-- or remove a human moderation lock on a post/comment.
CREATE OR REPLACE FUNCTION public.lyann_guard_sensitive_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.lyann_is_service_role() THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'profiles' THEN
        IF NEW.restriction_status IS DISTINCT FROM OLD.restriction_status
           OR NEW.restricted_until IS DISTINCT FROM OLD.restricted_until
           OR NEW.restriction_reason IS DISTINCT FROM OLD.restriction_reason THEN
            RAISE EXCEPTION 'Seul le centre de moderation peut modifier une sanction.'
                USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME IN ('bokantaj_posts', 'bokantaj_comments') THEN
        IF OLD.human_moderation_lock IS TRUE
           OR NEW.human_moderation_lock IS DISTINCT FROM OLD.human_moderation_lock
           OR NEW.human_decision IS DISTINCT FROM OLD.human_decision
           OR NEW.previous_public_status IS DISTINCT FROM OLD.previous_public_status THEN
            RAISE EXCEPTION 'Modification du verrou de moderation interdite.'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mod_fields_profiles ON public.profiles;
CREATE TRIGGER trg_guard_mod_fields_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.lyann_guard_sensitive_moderation_fields();
DROP TRIGGER IF EXISTS trg_guard_mod_fields_posts ON public.bokantaj_posts;
CREATE TRIGGER trg_guard_mod_fields_posts
    BEFORE UPDATE ON public.bokantaj_posts
    FOR EACH ROW EXECUTE FUNCTION public.lyann_guard_sensitive_moderation_fields();
DROP TRIGGER IF EXISTS trg_guard_mod_fields_comments ON public.bokantaj_comments;
CREATE TRIGGER trg_guard_mod_fields_comments
    BEFORE UPDATE ON public.bokantaj_comments
    FOR EACH ROW EXECUTE FUNCTION public.lyann_guard_sensitive_moderation_fields();

CREATE OR REPLACE FUNCTION public.lyann_block_restricted_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid uuid;
BEGIN
    IF public.lyann_is_service_role() THEN
        RETURN NEW;
    END IF;
    uid := auth.uid();
    IF uid IS NULL THEN
        RETURN NEW;
    END IF;
    IF public.lyann_account_is_restricted(uid) THEN
        RAISE EXCEPTION 'Compte restreint.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_restricted_posts ON public.bokantaj_posts;
CREATE TRIGGER trg_block_restricted_posts
    BEFORE INSERT ON public.bokantaj_posts
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_comments ON public.bokantaj_comments;
CREATE TRIGGER trg_block_restricted_comments
    BEFORE INSERT ON public.bokantaj_comments
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_requests ON public.requests;
CREATE TRIGGER trg_block_restricted_requests
    BEFORE INSERT ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_messages ON public.messages;
CREATE TRIGGER trg_block_restricted_messages
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_posts_upd ON public.bokantaj_posts;
CREATE TRIGGER trg_block_restricted_posts_upd
    BEFORE UPDATE ON public.bokantaj_posts
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_comments_upd ON public.bokantaj_comments;
CREATE TRIGGER trg_block_restricted_comments_upd
    BEFORE UPDATE ON public.bokantaj_comments
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_requests_upd ON public.requests;
CREATE TRIGGER trg_block_restricted_requests_upd
    BEFORE UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DROP TRIGGER IF EXISTS trg_block_restricted_messages_upd ON public.messages;
CREATE TRIGGER trg_block_restricted_messages_upd
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();

DO $$
BEGIN
    IF to_regclass('public.quotes') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_block_restricted_quotes ON public.quotes;
        CREATE TRIGGER trg_block_restricted_quotes
            BEFORE INSERT OR UPDATE ON public.quotes
            FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();
    END IF;
    IF to_regclass('public.proposals') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_block_restricted_proposals ON public.proposals;
        CREATE TRIGGER trg_block_restricted_proposals
            BEFORE INSERT OR UPDATE ON public.proposals
            FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();
    END IF;
    IF to_regclass('public.bokantaj_likes') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_block_restricted_likes ON public.bokantaj_likes;
        CREATE TRIGGER trg_block_restricted_likes
            BEFORE INSERT ON public.bokantaj_likes
            FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();
    END IF;
    IF to_regclass('public.user_reports') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_block_restricted_user_reports ON public.user_reports;
        CREATE TRIGGER trg_block_restricted_user_reports
            BEFORE INSERT ON public.user_reports
            FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();
    END IF;
    IF to_regclass('public.bokantaj_reports') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_block_restricted_bok_reports ON public.bokantaj_reports;
        CREATE TRIGGER trg_block_restricted_bok_reports
            BEFORE INSERT ON public.bokantaj_reports
            FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lyann_preserve_human_moderation_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.human_moderation_lock IS TRUE
       AND NEW.human_moderation_lock IS TRUE
       AND NEW.public_moderation_status IS DISTINCT FROM OLD.public_moderation_status
       AND NEW.public_moderation_status = 'approved' THEN
        NEW.public_moderation_status := OLD.public_moderation_status;
    END IF;
    RETURN NEW;
END;
$$;

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
        IF NEW.human_moderation_lock IS TRUE THEN
            NEW.content_pending := NULL;
            RETURN NEW;
        END IF;
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
        IF NEW.human_moderation_lock IS TRUE THEN
            NEW.content_pending := NULL;
            RETURN NEW;
        END IF;
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

DROP TRIGGER IF EXISTS trg_preserve_human_lock_posts ON public.bokantaj_posts;
CREATE TRIGGER trg_preserve_human_lock_posts
    BEFORE UPDATE ON public.bokantaj_posts
    FOR EACH ROW EXECUTE FUNCTION public.lyann_preserve_human_moderation_lock();

DROP TRIGGER IF EXISTS trg_preserve_human_lock_comments ON public.bokantaj_comments;
CREATE TRIGGER trg_preserve_human_lock_comments
    BEFORE UPDATE ON public.bokantaj_comments
    FOR EACH ROW EXECUTE FUNCTION public.lyann_preserve_human_moderation_lock();

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_block_restricted_storage ON storage.objects;
        CREATE TRIGGER trg_block_restricted_storage
            BEFORE INSERT OR UPDATE ON storage.objects
            FOR EACH ROW EXECUTE FUNCTION public.lyann_block_restricted_writes();
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'storage trigger skipped';
END $$;

COMMIT;
