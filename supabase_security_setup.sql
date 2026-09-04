-- ============================================================================
-- LYANN DOM — PRODUCTION SUPABASE AUTH & ROW LEVEL SECURITY (RLS) SETUP (V2)
-- ============================================================================

-- 1. ADD ROLE & ACCOUNT TYPE TO PROFILES TABLE
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'USER',
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'real',
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

-- Create constraint for roles and account types
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_profile_role') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT check_profile_role 
        CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT', 'FINANCE', 'MODERATION', 'EMPLOYEE', 'USER'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_account_type') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT check_account_type 
        CHECK (account_type IN ('real', 'seed', 'system'));
    END IF;
END $$;

-- 2. ENABLE ROW LEVEL SECURITY (RLS) ON PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. PRIVILEGE ESCALATION PROTECTION TRIGGER ON PROFILES
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block modification of sensitive admin columns unless caller is an active ADMIN/OWNER
  IF (
    OLD.role IS DISTINCT FROM NEW.role OR 
    OLD.account_type IS DISTINCT FROM NEW.account_type OR 
    OLD.is_verified IS DISTINCT FROM NEW.is_verified
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER')
    ) THEN
      RAISE EXCEPTION 'Escalade de privilèges refusée : modification réservée aux administrateurs'
      USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_sensitive_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER tr_protect_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- 4. PROFILES RLS POLICIES & PUBLIC VIEW (PRIVACY ISOLATION)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all" 
ON public.profiles FOR SELECT 
USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;
CREATE POLICY "Admins have full access to profiles" 
ON public.profiles FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER')
    )
);

-- Create Secure Public Profile View (Exposes only safe public fields)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id,
    first_name,
    last_name,
    avatar_url,
    territory,
    city,
    bio,
    is_pro,
    professional_status,
    created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

-- 5. AUTOMATIC PROFILE CREATION TRIGGER ON SIGNUP (HARDENED)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, account_type, is_verified, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    'USER',
    'real',
    false,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================================
-- 6. MESSAGING ARCHITECTURE & CONVERSATION PARTICIPANTS RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at timestamptz DEFAULT now(),
    CONSTRAINT unique_conversation_user UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Backfill existing participants from historical messages & missions without deleting data
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT DISTINCT conversation_id, sender_id 
FROM public.messages 
WHERE conversation_id IS NOT NULL AND sender_id IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'missions') THEN
        INSERT INTO public.conversation_participants (conversation_id, user_id)
        SELECT c.id, m.requester_id
        FROM public.conversations c
        JOIN public.missions m ON c.mission_id = m.id
        WHERE m.requester_id IS NOT NULL
        ON CONFLICT (conversation_id, user_id) DO NOTHING;

        INSERT INTO public.conversation_participants (conversation_id, user_id)
        SELECT c.id, m.helper_id
        FROM public.conversations c
        JOIN public.missions m ON c.mission_id = m.id
        WHERE m.helper_id IS NOT NULL
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
END $$;

-- Enable RLS on all messaging tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 6.1 HARDENED HELPER FUNCTION (Checks CURRENT AUTH USER ONLY, no user_id param from client)
CREATE OR REPLACE FUNCTION public.is_current_user_conversation_participant(
  _conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_conversation_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_conversation_participant(uuid) TO authenticated, service_role;

-- 6.2 ATOMIC & SECURE CONVERSATION CREATION RPC (Bypasses manual client INSERTs)
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_target_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id uuid;
  v_conv_id uuid;
BEGIN
  -- Extract authenticated caller ID from session
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  -- Prevent self-conversation
  IF v_my_id = p_target_user_id THEN
    RAISE EXCEPTION 'Impossible de créer une conversation avec soi-même' USING ERRCODE = '22000';
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur destinataire introuvable' USING ERRCODE = '23503';
  END IF;

  -- Search for existing 2-party conversation between auth.uid() and target user
  SELECT cp1.conversation_id INTO v_conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_my_id
    AND cp2.user_id = p_target_user_id
    AND (
      SELECT COUNT(*) 
      FROM public.conversation_participants cp3 
      WHERE cp3.conversation_id = cp1.conversation_id
    ) = 2
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Create new conversation and insert exact two participants
  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES 
    (v_conv_id, v_my_id),
    (v_conv_id, p_target_user_id);

  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated, service_role;

-- 6.3 RLS POLICIES FOR conversation_participants
DROP POLICY IF EXISTS "Participants can view own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "Participants can view conversation participants" ON public.conversation_participants;
CREATE POLICY "Participants can view conversation participants" 
ON public.conversation_participants FOR SELECT 
USING (
    public.is_current_user_conversation_participant(conversation_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Authenticated users can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "No direct insert on participants for standard users" ON public.conversation_participants;
CREATE POLICY "No direct insert on participants for standard users" 
ON public.conversation_participants FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

-- NO UPDATE POLICY DEFINED ON conversation_participants (DENIED BY DEFAULT)

DROP POLICY IF EXISTS "Users can only leave conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can only leave their own conversations" ON public.conversation_participants;
CREATE POLICY "Users can only leave their own conversations" 
ON public.conversation_participants FOR DELETE 
USING (
    user_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

-- 6.4 RLS POLICIES FOR conversations
DROP POLICY IF EXISTS "Participants can view conversation" ON public.conversations;
CREATE POLICY "Participants can view conversation" 
ON public.conversations FOR SELECT 
USING (
    public.is_current_user_conversation_participant(id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Authenticated users can create conversation" ON public.conversations;
DROP POLICY IF EXISTS "No direct insert on conversations for standard users" ON public.conversations;
CREATE POLICY "No direct insert on conversations for standard users" 
ON public.conversations FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

-- 6.5 RLS POLICIES FOR messages
DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages" 
ON public.messages FOR SELECT 
USING (
    public.is_current_user_conversation_participant(conversation_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Participants can insert messages" ON public.messages;
CREATE POLICY "Participants can insert messages" 
ON public.messages FOR INSERT 
WITH CHECK (
    auth.uid() = sender_id 
    AND public.is_current_user_conversation_participant(conversation_id)
);
