-- Rollback of 50_chat_and_bokantaj_video.sql.
-- Do not run until Yoann asks for it.
-- Restores the chat attachment rules from 44_chat_attachments.sql:
-- photo and document only, 20 MB, and the path check without video extensions.
-- If a message already has attachment_type = 'video', this script stops and
-- changes nothing. It does not delete messages or storage objects.
-- The private chat-attachments bucket stays private.
-- This file does not replace block, accept, report or notification functions.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.messages WHERE attachment_type = 'video'
    ) THEN
        RAISE EXCEPTION 'Retour arrière interrompu : des messages vidéo existent. Aucun fichier et aucun message n''a été supprimé.';
    END IF;
END $$;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_attachment_type_check;
ALTER TABLE public.messages
    ADD CONSTRAINT messages_attachment_type_check
    CHECK (attachment_type IS NULL OR attachment_type IN ('photo', 'document'));

UPDATE storage.buckets
SET public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        'application/vnd.oasis.opendocument.text',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.presentation'
    ]
WHERE id = 'chat-attachments';

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
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'odt', 'ods', 'odp'
    ) THEN
        RETURN false;
    END IF;
    RETURN public.is_current_user_conversation_participant(conv::uuid);
END;
$$;

COMMIT;
