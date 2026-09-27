-- Chat attachments.
-- Private bucket chat-attachments. Object path is
-- {conversation_id}/{sender_id}/{uuid}.{ext}
-- messages.attachment_url stores that path, never a signed URL.
-- client_message_id makes a retry reuse the same row instead of inserting a second one.

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS attachment_type text,
    ADD COLUMN IF NOT EXISTS attachment_name text,
    ADD COLUMN IF NOT EXISTS attachment_size bigint,
    ADD COLUMN IF NOT EXISTS attachment_mime text,
    ADD COLUMN IF NOT EXISTS client_message_id text;

ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_attachment_type_check;
ALTER TABLE public.messages
    ADD CONSTRAINT messages_attachment_type_check
    CHECK (attachment_type IS NULL OR attachment_type IN ('photo', 'document'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sender_client_message
    ON public.messages (sender_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_id
    ON public.messages (conversation_id, created_at, id);

-- Read updates must not rewrite attachment metadata or the client id.
CREATE OR REPLACE FUNCTION public.protect_message_read_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
     OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
     OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name
     OR NEW.attachment_size IS DISTINCT FROM OLD.attachment_size
     OR NEW.attachment_mime IS DISTINCT FROM OLD.attachment_mime
     OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id THEN
    RAISE EXCEPTION 'messages update is limited to read receipts';
  END IF;
  IF OLD.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'sender cannot mark own message';
  END IF;
  IF NOT public.is_current_user_conversation_participant(OLD.conversation_id) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  NEW.is_read := true;
  RETURN NEW;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-attachments',
    'chat-attachments',
    false,
    20971520,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
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
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'odt', 'ods', 'odp'
    ) THEN
        RETURN false;
    END IF;
    RETURN public.is_current_user_conversation_participant(conv::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.chat_attachment_path_ok(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_attachment_path_ok(text, boolean) TO authenticated;

DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
CREATE POLICY "chat_attachments_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'chat-attachments' AND public.chat_attachment_path_ok(name, false));

DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
CREATE POLICY "chat_attachments_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'chat-attachments' AND public.chat_attachment_path_ok(name, true));

DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;
CREATE POLICY "chat_attachments_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'chat-attachments' AND public.chat_attachment_path_ok(name, true));
