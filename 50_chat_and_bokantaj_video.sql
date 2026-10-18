-- Prepared locally. Do not apply until explicitly authorized.
-- Does not delete storage objects and does not change bokantaj-media.
-- The live bokantaj-media bucket is already public and already allows
-- video/mp4, video/quicktime and video/webm, including image/gif.
-- Chat attachments stay private. The existing storage policies are not
-- dropped or recreated. They already call chat_attachment_path_ok, so
-- they keep the same rules: a participant can read, only the sender can
-- upload or delete, and there is still no update policy.

BEGIN;

ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_attachment_type_check;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_attachment_type_check
    CHECK (attachment_type IS NULL OR attachment_type IN ('photo', 'video', 'document'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-attachments',
    'chat-attachments',
    false,
    52428800,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/vnd.oasis.opendocument.text',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.presentation'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.chat_attachment_path_ok(object_name text, require_sender boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, storage
AS $$
DECLARE
    parts text[];
    conv text;
    sender text;
    file text;
    ext text;
BEGIN
    parts := storage.foldername(object_name);
    IF parts IS NULL OR array_length(parts, 1) IS DISTINCT FROM 2 THEN
        RETURN false;
    END IF;
    conv := parts[1];
    sender := parts[2];
    file := storage.filename(object_name);
    ext := lower(storage.extension(object_name));
    IF conv !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;
    IF sender !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;
    IF require_sender AND sender IS DISTINCT FROM auth.uid()::text THEN
        RETURN false;
    END IF;
    IF file !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$' THEN
        RETURN false;
    END IF;
    IF ext NOT IN (
        'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif',
        'mp4', 'mov', 'webm', 'm4v',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'odt', 'ods', 'odp'
    ) THEN
        RETURN false;
    END IF;
    RETURN public.is_current_user_conversation_participant(conv::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.chat_attachment_path_ok(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_attachment_path_ok(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.chat_attachment_path_ok(text, boolean) TO authenticated;

COMMIT;
