-- Staging only. Up to three optional announcement photos, stored as the
-- existing moderated media URLs. Announcement row policies stay unchanged.
-- The new storage policy lets an author delete only the files in their own folder.
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS media_urls text[];

COMMENT ON COLUMN public.requests.media_urls IS
    'Up to 3 optional request-photos-hold gateway URLs. Empty when the author added none.';

-- The owner can remove only the photos stored in their own hold folder.
-- Supabase refuses direct deletes from storage.objects, so the app uses the Storage API.
DROP TRIGGER IF EXISTS trg_lyann_delete_request_photos ON public.requests;
DROP FUNCTION IF EXISTS public.lyann_delete_request_photos();

DROP POLICY IF EXISTS "hold request photo owner delete" ON storage.objects;
CREATE POLICY "hold request photo owner delete"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'request-photos-hold'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );
