-- Staging V2 storage buckets used by the live runtime.
-- Target: tdktfbtqceldlaeqjtow only. Do not apply to gzispjfoywklpqatjyop.
-- Does not change the previous 64 applied migrations.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bokantaj-media',
    'bokantaj-media',
    true,
    10485760,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
        'video/webm'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'request-photos',
    'request-photos',
    true,
    5242880,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read bokantaj-media" ON storage.objects;
DROP POLICY IF EXISTS "User insert own bokantaj-media" ON storage.objects;
DROP POLICY IF EXISTS "User update own bokantaj-media" ON storage.objects;
DROP POLICY IF EXISTS "User delete own bokantaj-media" ON storage.objects;
DROP POLICY IF EXISTS "Public read request-photos" ON storage.objects;
DROP POLICY IF EXISTS "User insert own request-photos" ON storage.objects;
DROP POLICY IF EXISTS "User update own request-photos" ON storage.objects;
DROP POLICY IF EXISTS "User delete own request-photos" ON storage.objects;

CREATE POLICY "Public read bokantaj-media" ON storage.objects
    FOR SELECT USING (bucket_id = 'bokantaj-media');

CREATE POLICY "User insert own bokantaj-media" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'bokantaj-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User update own bokantaj-media" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'bokantaj-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'bokantaj-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User delete own bokantaj-media" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'bokantaj-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Public read request-photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'request-photos');

CREATE POLICY "User insert own request-photos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'request-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User update own request-photos" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'request-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'request-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User delete own request-photos" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'request-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

COMMIT;
