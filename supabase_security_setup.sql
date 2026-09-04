-- ============================================================================
-- LYANN DOM — PRODUCTION SUPABASE AUTH & ROW LEVEL SECURITY (RLS) SETUP (V3.1)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 : AUDIT PRÉ-MIGRATION ET DÉTECTION DES ANOMALIES DE DONNÉES
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count int := 0;
  v_orphan_part_user int := 0;
  v_orphan_part_conv int := 0;
  v_orphan_conv int := 0;
  v_orphan_msg_sender int := 0;
  v_orphan_msg_conv int := 0;
  v_invalid_role int := 0;
  v_invalid_account_type int := 0;
BEGIN
  -- 1. Doublons dans conversation_participants
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_participants') THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
      SELECT conversation_id, user_id, COUNT(*)
      FROM public.conversation_participants
      GROUP BY conversation_id, user_id
      HAVING COUNT(*) > 1
    ) c;

    -- 2. Participants orphelins
    SELECT COUNT(*) INTO v_orphan_part_user
    FROM public.conversation_participants cp
    LEFT JOIN public.profiles p ON cp.user_id = p.id
    WHERE p.id IS NULL;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') THEN
      SELECT COUNT(*) INTO v_orphan_part_conv
      FROM public.conversation_participants cp
      LEFT JOIN public.conversations c ON cp.conversation_id = c.id
      WHERE c.id IS NULL;
    END IF;
  END IF;

  -- 3. Conversations orphelines (0 participants)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') 
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_participants') THEN
    SELECT COUNT(*) INTO v_orphan_conv
    FROM public.conversations c
    LEFT JOIN public.conversation_participants cp ON c.id = cp.conversation_id
    WHERE cp.conversation_id IS NULL;
  END IF;

  -- 4. Messages orphelins
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    SELECT COUNT(*) INTO v_orphan_msg_sender
    FROM public.messages m
    LEFT JOIN public.profiles p ON m.sender_id = p.id
    WHERE m.sender_id IS NOT NULL AND p.id IS NULL;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') THEN
      SELECT COUNT(*) INTO v_orphan_msg_conv
      FROM public.messages m
      LEFT JOIN public.conversations c ON m.conversation_id = c.id
      WHERE m.conversation_id IS NOT NULL AND c.id IS NULL;
    END IF;
  END IF;

  -- 5. Incompatibilité des contraintes CHECK
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
      SELECT COUNT(*) INTO v_invalid_role
      FROM public.profiles
      WHERE role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT', 'FINANCE', 'MODERATION', 'EMPLOYEE', 'USER');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_type') THEN
      SELECT COUNT(*) INTO v_invalid_account_type
      FROM public.profiles
      WHERE account_type NOT IN ('real', 'seed', 'system');
    END IF;
  END IF;

  RAISE NOTICE '=== AUDIT PRÉ-MIGRATION LYANN V3.1 ===';
  RAISE NOTICE 'Doublons conversation_participants : %', v_dup_count;
  RAISE NOTICE 'Participants orphelins (User inexistant) : %', v_orphan_part_user;
  RAISE NOTICE 'Participants orphelins (Conversation inexistante) : %', v_orphan_part_conv;
  RAISE NOTICE 'Conversations orphelines (0 participants) : %', v_orphan_conv;
  RAISE NOTICE 'Messages avec sender_id inexistant : %', v_orphan_msg_sender;
  RAISE NOTICE 'Messages avec conversation_id inexistante : %', v_orphan_msg_conv;
  RAISE NOTICE 'Rôles non valides dans profiles : %', v_invalid_role;
  RAISE NOTICE 'Types de compte non valides dans profiles : %', v_invalid_account_type;

  IF v_dup_count > 0 OR v_orphan_part_user > 0 OR v_orphan_part_conv > 0 OR v_orphan_msg_sender > 0 OR v_orphan_msg_conv > 0 OR v_invalid_role > 0 OR v_invalid_account_type > 0 THEN
    RAISE WARNING 'ATTENTION : Des anomalies de données ont été détectées. Veuillez les traiter avant la pose des contraintes strictes.';
  ELSE
    RAISE NOTICE 'SUCCÈS : Aucune anomalie détectée. La structure initiale est compatible.';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- SECTION 2 : MIGRATION IDEMPOTENTE DES TABLES ET COLONNES EXISTANTES
-- ----------------------------------------------------------------------------

-- Table public.profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name text DEFAULT '',
ADD COLUMN IF NOT EXISTS last_name text DEFAULT '',
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS territory text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS kyc_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS professional_status text,
ADD COLUMN IF NOT EXISTS stripe_account_id text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'USER',
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'real',
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Contraintes check role et account_type
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

-- Table public.conversations
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS mission_id uuid,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Table public.conversation_participants
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversation_participants 
ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();

-- Table public.messages
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid,
    sender_id uuid,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS attachment_url text,
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


-- ----------------------------------------------------------------------------
-- SECTION 3 : CONTRAINTES DE CLÉS ÉTRANGÈRES & UNICITÉ (IDEMPOTENT)
-- ----------------------------------------------------------------------------
DO $$ 
BEGIN
    -- FK conversation_participants -> conversations
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cp_conversation') THEN
        ALTER TABLE public.conversation_participants 
        ADD CONSTRAINT fk_cp_conversation 
        FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
    END IF;

    -- FK conversation_participants -> profiles
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cp_user') THEN
        ALTER TABLE public.conversation_participants 
        ADD CONSTRAINT fk_cp_user 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    -- FK messages -> conversations
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_msg_conversation') THEN
        ALTER TABLE public.messages 
        ADD CONSTRAINT fk_msg_conversation 
        FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
    END IF;

    -- FK messages -> profiles
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_msg_sender') THEN
        ALTER TABLE public.messages 
        ADD CONSTRAINT fk_msg_sender 
        FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    -- Contrainte d'unicité (conversation_id, user_id)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_conversation_user') THEN
        ALTER TABLE public.conversation_participants 
        ADD CONSTRAINT unique_conversation_user 
        UNIQUE (conversation_id, user_id);
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- SECTION 4 : FONCTIONS HELPER ANTI-RÉCURSION RLS (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Helper 1: Vérifie si l'utilisateur connecté est Administrateur (Empêche la récursion sur profiles)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER')
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;

-- Helper 2: Vérifie si l'utilisateur connecté participe à une conversation
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


-- ----------------------------------------------------------------------------
-- SECTION 5 : SÉCURISATION ABSOLUE DES COLONNES ADMINISTRATIVES ET TRIGGER
-- ----------------------------------------------------------------------------

-- Interdiction totale de modifier role, account_type, is_verified, kyc_verified via UPDATE direct
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  IF (
    OLD.role IS DISTINCT FROM NEW.role OR 
    OLD.account_type IS DISTINCT FROM NEW.account_type OR 
    OLD.is_verified IS DISTINCT FROM NEW.is_verified OR
    OLD.kyc_verified IS DISTINCT FROM NEW.kyc_verified
  ) THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    -- Seuls SUPER_ADMIN et OWNER peuvent modifier directement la table via UPDATE
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Escalade de privilèges refusée : modification directe des colonnes administratives interdite. Utilisez la RPC administrative dédiée.'
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

-- RPC Administrative Sécurisée pour les modifications de rôles & statut
CREATE OR REPLACE FUNCTION public.admin_update_profile_role(
  p_target_user_id uuid,
  p_new_role text DEFAULT NULL,
  p_new_account_type text DEFAULT NULL,
  p_new_is_verified boolean DEFAULT NULL,
  p_new_kyc_verified boolean DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OWNER') THEN
    RAISE EXCEPTION 'Accès refusé : privilèges administratifs requis' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Profil utilisateur cible introuvable' USING ERRCODE = '23503';
  END IF;

  -- Si l'expéditeur est un simple ADMIN :
  IF v_caller_role = 'ADMIN' THEN
    IF p_new_role IN ('SUPER_ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Un administrateur ne peut pas attribuer le rôle OWNER ou SUPER_ADMIN' USING ERRCODE = '42501';
    END IF;

    IF v_target_role IN ('SUPER_ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Un administrateur ne peut pas modifier un profil OWNER ou SUPER_ADMIN' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles
  SET 
    role = COALESCE(p_new_role, role),
    account_type = COALESCE(p_new_account_type, account_type),
    is_verified = COALESCE(p_new_is_verified, is_verified),
    kyc_verified = COALESCE(p_new_kyc_verified, kyc_verified),
    updated_at = NOW()
  WHERE id = p_target_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_profile_role(uuid, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_profile_role(uuid, text, text, boolean, boolean) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- SECTION 6 : SÉCURISATION RLS DE PROFILES ET VUE PUBLIQUE
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all" 
ON public.profiles FOR SELECT 
USING (
    auth.uid() = id
    OR public.is_current_user_admin()
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
USING (public.is_current_user_admin());

-- Vue Publique Strictement Filtrée
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


-- ----------------------------------------------------------------------------
-- SECTION 7 : TRIGGER CRÉATION PROFIL À L'INSCRIPTION (DURCI)
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- SECTION 8 : FONCTION RPC ATOMIQUE DE CRÉATION DE CONVERSATION
-- ----------------------------------------------------------------------------
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
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  IF v_my_id = p_target_user_id THEN
    RAISE EXCEPTION 'Impossible de créer une conversation avec soi-même' USING ERRCODE = '22000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur destinataire introuvable' USING ERRCODE = '23503';
  END IF;

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


-- ----------------------------------------------------------------------------
-- SECTION 9 : SÉCURISATION RLS DE LA MESSAGERIE ET BACKFILL VÉRIFIÉ
-- ----------------------------------------------------------------------------

-- Backfill des participants historiques
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT DISTINCT conversation_id, sender_id 
FROM public.messages 
WHERE conversation_id IS NOT NULL AND sender_id IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Backfill vérifiant réellement la présence de requester_id et helper_id dans missions
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'missions'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'requester_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'helper_id'
    ) THEN
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

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policies conversation_participants
DROP POLICY IF EXISTS "Participants can view own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "Participants can view conversation participants" ON public.conversation_participants;
CREATE POLICY "Participants can view conversation participants" 
ON public.conversation_participants FOR SELECT 
USING (
    public.is_current_user_conversation_participant(conversation_id)
    OR public.is_current_user_admin()
);

DROP POLICY IF EXISTS "Authenticated users can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "No direct insert on participants for standard users" ON public.conversation_participants;
CREATE POLICY "No direct insert on participants for standard users" 
ON public.conversation_participants FOR INSERT 
WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Users can only leave conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can only leave their own conversations" ON public.conversation_participants;
CREATE POLICY "Users can only leave their own conversations" 
ON public.conversation_participants FOR DELETE 
USING (
    user_id = auth.uid() 
    OR public.is_current_user_admin()
);

-- Policies conversations
DROP POLICY IF EXISTS "Participants can view conversation" ON public.conversations;
CREATE POLICY "Participants can view conversation" 
ON public.conversations FOR SELECT 
USING (
    public.is_current_user_conversation_participant(id)
    OR public.is_current_user_admin()
);

DROP POLICY IF EXISTS "Authenticated users can create conversation" ON public.conversations;
DROP POLICY IF EXISTS "No direct insert on conversations for standard users" ON public.conversations;
CREATE POLICY "No direct insert on conversations for standard users" 
ON public.conversations FOR INSERT 
WITH CHECK (public.is_current_user_admin());

-- Policies messages
DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages" 
ON public.messages FOR SELECT 
USING (
    public.is_current_user_conversation_participant(conversation_id)
    OR public.is_current_user_admin()
);

DROP POLICY IF EXISTS "Participants can insert messages" ON public.messages;
CREATE POLICY "Participants can insert messages" 
ON public.messages FOR INSERT 
WITH CHECK (
    auth.uid() = sender_id 
    AND public.is_current_user_conversation_participant(conversation_id)
);
