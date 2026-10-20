-- Media cutover. Refuses to run.
-- Removing the exception below is a separate authorization: it makes the
-- public buckets private and rewrites stored Supabase URLs to
-- https://lyann.app/v1/media/... Existing in-app pictures keep working
-- through that gateway. A raw Supabase public URL copied earlier stops
-- opening. Do not run this against Production in the same step as migration 70.

BEGIN;

DO $$
BEGIN
    RAISE EXCEPTION 'Bascule des médias non autorisée.' USING ERRCODE = 'P0001';
END $$;

-- The transaction is aborted above. The statements below are the procedure
-- to enable only after the gateway is deployed and this exception is removed.
--
-- UPDATE public.bokantaj_posts
-- SET media_urls = (
--     SELECT array_agg(regexp_replace(url,
--         '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/([^/]+)/(.+)$',
--         'https://lyann.app/v1/media/\1/\2'))
--     FROM unnest(media_urls) AS url
-- )
-- WHERE media_urls IS NOT NULL;
--
-- UPDATE public.bokantaj_comments
-- SET media_url = regexp_replace(media_url,
--     '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/([^/]+)/(.+)$',
--     'https://lyann.app/v1/media/\1/\2')
-- WHERE media_url IS NOT NULL;
--
-- UPDATE public.profiles
-- SET avatar_url = regexp_replace(avatar_url,
--     '^https://[A-Za-z0-9-]+\.supabase\.co/storage/v1/object/public/([^/]+)/(.+)$',
--     'https://lyann.app/v1/media/\1/\2')
-- WHERE avatar_url LIKE '%/storage/v1/object/public/%';
--
-- UPDATE storage.buckets
-- SET public = false
-- WHERE id IN ('bokantaj-media', 'avatars', 'profile-images', 'request-photos');
--
-- DROP POLICY IF EXISTS "Public read bokantaj-media" ON storage.objects;
-- DROP POLICY IF EXISTS "Public read request-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
-- CREATE POLICY "Released media are readable"
-- ON storage.objects FOR SELECT
-- USING (
--     bucket_id IN ('bokantaj-media', 'avatars', 'profile-images', 'request-photos')
--     AND EXISTS (
--         SELECT 1 FROM public.public_media_releases release
--         WHERE release.bucket_id = storage.objects.bucket_id
--           AND release.object_name = storage.objects.name
--           AND release.status = 'approved'
--     )
-- );

COMMIT;
