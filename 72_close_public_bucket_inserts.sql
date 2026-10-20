-- Staging transition: new files cannot enter the historical public buckets.
-- Existing public reads stay in place. Private hold buckets receive new uploads.
-- Do not apply to Production until explicitly authorized.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('portfolio-images-hold', 'portfolio-images-hold', false),
    ('request-photos-hold', 'request-photos-hold', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
DECLARE
    policy_row record;
BEGIN
    FOR policy_row IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND cmd IN ('INSERT', 'UPDATE')
          AND (coalesce(qual, '') || coalesce(with_check, '')) ~
              'bokantaj-media''|''avatars''|''portfolio_images''|''request-photos''|''profile-images'''
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_row.policyname);
    END LOOP;
END $$;

DROP POLICY IF EXISTS "hold portfolio owner read" ON storage.objects;
CREATE POLICY "hold portfolio owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'portfolio-images-hold'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
DROP POLICY IF EXISTS "hold portfolio owner insert" ON storage.objects;
CREATE POLICY "hold portfolio owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'portfolio-images-hold'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
DROP POLICY IF EXISTS "hold request photo owner read" ON storage.objects;
CREATE POLICY "hold request photo owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'request-photos-hold'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
DROP POLICY IF EXISTS "hold request photo owner insert" ON storage.objects;
CREATE POLICY "hold request photo owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'request-photos-hold'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE OR REPLACE FUNCTION public.lyann_refuse_new_public_media()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.bucket_id IN ('bokantaj-media', 'avatars', 'portfolio_images', 'request-photos', 'profile-images') THEN
        RAISE EXCEPTION 'Les nouveaux fichiers passent par un espace privé avant validation.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refuse_new_public_media ON storage.objects;
CREATE TRIGGER trg_refuse_new_public_media
    BEFORE INSERT ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION public.lyann_refuse_new_public_media();

CREATE OR REPLACE FUNCTION public.record_public_media_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.bucket_id IN (
        'bokantaj-media', 'avatars', 'profile-images', 'request-photos',
        'bokantaj-media-hold', 'avatars-hold', 'portfolio-images-hold', 'request-photos-hold'
    ) THEN
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

ALTER TABLE public.moderation_jobs DROP CONSTRAINT IF EXISTS moderation_jobs_type_check;
ALTER TABLE public.moderation_jobs
    ADD CONSTRAINT moderation_jobs_type_check
    CHECK (subject_type IN ('post', 'comment', 'request', 'profile', 'portfolio'));

CREATE OR REPLACE FUNCTION public.lyann_touch_portfolio_moderation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.image_url IS DISTINCT FROM OLD.image_url THEN
        PERFORM public.lyann_enqueue_moderation_job('portfolio', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_portfolio_moderation_job ON public.user_portfolio_items;
CREATE TRIGGER trg_touch_portfolio_moderation_job
    AFTER INSERT OR UPDATE OF image_url ON public.user_portfolio_items
    FOR EACH ROW EXECUTE FUNCTION public.lyann_touch_portfolio_moderation_job();

COMMIT;
