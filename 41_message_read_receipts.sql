-- Existing rows were shown as already seen. Only messages that arrive after
-- this migration stay unread until the recipient opens the conversation.
UPDATE public.messages SET is_read = true WHERE is_read IS DISTINCT FROM true;

-- New messages stay on the Messages badge. They no longer create a bell notification.
CREATE OR REPLACE FUNCTION public.lyann_notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- Read receipts: a participant may mark someone else's message as read,
-- and nothing else on that row can change.

CREATE OR REPLACE FUNCTION public.protect_message_read_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
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

DROP TRIGGER IF EXISTS messages_protect_read_update ON public.messages;
CREATE TRIGGER messages_protect_read_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_message_read_update();

DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.messages;
CREATE POLICY "Recipients can mark messages read"
ON public.messages
FOR UPDATE
USING (
  sender_id IS DISTINCT FROM auth.uid()
  AND public.is_current_user_conversation_participant(conversation_id)
)
WITH CHECK (
  is_read = true
  AND sender_id IS DISTINCT FROM auth.uid()
  AND public.is_current_user_conversation_participant(conversation_id)
);

GRANT UPDATE (is_read) ON public.messages TO authenticated;
