-- ============================================================================
-- LYANN DOM — PRODUCTION SUPABASE AUTH & ROW LEVEL SECURITY (RLS) SETUP
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

-- 2. ENABLE ROW LEVEL SECURITY (RLS) ON ALL CORE TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. PROFILES POLICIES

-- Public Read: Anyone can view public profile details (first_name, avatar_url, territory, bio, services, ratings)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

-- User Self Update: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- User Insert: Handled by system trigger or authenticated user signup
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Admin Full Access: Admins can view/update/delete any profile
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

-- 4. AUTOMATIC PROFILE CREATION TRIGGER ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, account_type, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    'USER',
    'real',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================================
-- 5. MESSAGING ARCHITECTURE & CONVERSATION PARTICIPANTS RLS
-- ============================================================================

-- Ensure Tables Exist
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at timestamptz DEFAULT now(),
    UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Backfill existing participants from messages without deleting data
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT DISTINCT conversation_id, sender_id 
FROM public.messages 
WHERE conversation_id IS NOT NULL AND sender_id IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER Helper Function (Prevents RLS Recursion)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.conversation_participants 
    WHERE conversation_id = _conversation_id 
      AND user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- POLICIES FOR conversation_participants
DROP POLICY IF EXISTS "Participants can view own participation" ON public.conversation_participants;
CREATE POLICY "Participants can view own participation" 
ON public.conversation_participants FOR SELECT 
USING (
    user_id = auth.uid() 
    OR public.is_conversation_participant(conversation_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Authenticated users can insert participants" ON public.conversation_participants;
CREATE POLICY "Authenticated users can insert participants" 
ON public.conversation_participants FOR INSERT 
WITH CHECK (
    user_id = auth.uid() 
    OR public.is_conversation_participant(conversation_id, auth.uid())
    OR auth.role() = 'authenticated'
);

-- POLICIES FOR conversations
DROP POLICY IF EXISTS "Participants can view conversation" ON public.conversations;
CREATE POLICY "Participants can view conversation" 
ON public.conversations FOR SELECT 
USING (
    public.is_conversation_participant(id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Authenticated users can create conversation" ON public.conversations;
CREATE POLICY "Authenticated users can create conversation" 
ON public.conversations FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- POLICIES FOR messages
DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages" 
ON public.messages FOR SELECT 
USING (
    public.is_conversation_participant(conversation_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Participants can insert messages" ON public.messages;
CREATE POLICY "Participants can insert messages" 
ON public.messages FOR INSERT 
WITH CHECK (
    auth.uid() = sender_id 
    AND public.is_conversation_participant(conversation_id, auth.uid())
);
