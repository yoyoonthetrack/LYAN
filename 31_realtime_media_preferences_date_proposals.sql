-- LYANN shared production fixes: realtime chat, Bokantaj media, account preferences and date proposals.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bokantaj-media', 'bokantaj-media', true, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read Bokantaj media" ON storage.objects;
CREATE POLICY "Public can read Bokantaj media"
ON storage.objects FOR SELECT
USING (bucket_id = 'bokantaj-media');

DROP POLICY IF EXISTS "Users can upload own Bokantaj media" ON storage.objects;
CREATE POLICY "Users can upload own Bokantaj media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bokantaj-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update own Bokantaj media" ON storage.objects;
CREATE POLICY "Users can update own Bokantaj media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'bokantaj-media' AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'bokantaj-media' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own Bokantaj media" ON storage.objects;
CREATE POLICY "Users can delete own Bokantaj media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bokantaj-media' AND owner_id = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_messages boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  incognito boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own preferences" ON public.user_preferences;
CREATE POLICY "Users manage own preferences"
ON public.user_preferences FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.mission_date_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.requests(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mission_date_proposals_conversation_idx
  ON public.mission_date_proposals(conversation_id, created_at DESC);
ALTER TABLE public.mission_date_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conversation participants can view date proposals" ON public.mission_date_proposals;
CREATE POLICY "Conversation participants can view date proposals"
ON public.mission_date_proposals FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversation_participants cp
  WHERE cp.conversation_id = mission_date_proposals.conversation_id
    AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Conversation participants can create date proposals" ON public.mission_date_proposals;
CREATE POLICY "Conversation participants can create date proposals"
ON public.mission_date_proposals FOR INSERT TO authenticated
WITH CHECK (
  proposed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = mission_date_proposals.conversation_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Proposers can update own pending date proposals" ON public.mission_date_proposals;
CREATE POLICY "Proposers can update own pending date proposals"
ON public.mission_date_proposals FOR UPDATE TO authenticated
USING (proposed_by = auth.uid() AND status = 'PENDING')
WITH CHECK (proposed_by = auth.uid());
