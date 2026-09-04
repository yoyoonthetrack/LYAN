-- ============================================================================
-- LYANN DOM — 02_SECURITY_MIGRATION.SQL (V3.3 FINAL PRE-DEPLOYMENT MIGRATION)
-- Exécuter ce script SEULEMENT après validation de 01_preflight_audit.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 : MIGRATION IDEMPOTENTE DES TABLES ET COLONNES EXISTANTES
-- ----------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS mission_id uuid,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversation_participants 
ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();

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
-- SECTION 2 : CONTRAINTES DE CLÉS ÉTRANGÈRES & UNICITÉ (IDEMPOTENT)
-- ----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cp_conversation') THEN
        ALTER TABLE public.conversation_participants 
        ADD CONSTRAINT fk_cp_conversation 
        FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cp_user') THEN
        ALTER TABLE public.conversation_participants 
        ADD CONSTRAINT fk_cp_user 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_msg_conversation') THEN
        ALTER TABLE public.messages 
        ADD CONSTRAINT fk_msg_conversation 
        FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_msg_sender') THEN
        ALTER TABLE public.messages 
        ADD CONSTRAINT fk_msg_sender 
        FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_conversation_user') THEN
        ALTER TABLE public.conversation_participants 
        ADD CONSTRAINT unique_conversation_user 
        UNIQUE (conversation_id, user_id);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 3 : FONCTIONS HELPER ANTI-RÉCURSION RLS (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

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
-- SECTION 4 : VERROUILLAGE SÉCURISÉ DES COLONNES ADMINISTRATIVES ET BANCAIRES
-- ----------------------------------------------------------------------------

-- Trigger : Interdit la modification de stripe_account_id sauf par service_role, et réserve role/account_type/is_verified/kyc_verified à SUPER_ADMIN/OWNER
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_is_service_role boolean;
BEGIN
  -- Détecter si la requête provient directement du service_role (backend / webhooks)
  v_is_service_role := (
    auth.role() = 'service_role' OR 
    current_setting('request.jwt.claim.role', true) = 'service_role'
  );

  -- 1. VERROUILLAGE ABSOLU DE stripe_account_id : RESERVÉ EXCLUSIVEMENT AU BACKEND service_role
  IF (OLD.stripe_account_id IS DISTINCT FROM NEW.stripe_account_id) THEN
    IF NOT v_is_service_role THEN
      RAISE EXCEPTION 'Escalade de privilèges refusée : la modification de stripe_account_id est strictement réservée au backend (service_role)'
      USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. VERROUILLAGE DES CHAMPS ADMINISTRATIFS : RESERVÉS À SUPER_ADMIN, OWNER OU service_role
  IF (
    OLD.role IS DISTINCT FROM NEW.role OR 
    OLD.account_type IS DISTINCT FROM NEW.account_type OR 
    OLD.is_verified IS DISTINCT FROM NEW.is_verified OR
    OLD.kyc_verified IS DISTINCT FROM NEW.kyc_verified
  ) THEN
    IF NOT v_is_service_role THEN
      SELECT role INTO v_caller_role
      FROM public.profiles
      WHERE id = auth.uid();

      IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'OWNER') THEN
        RAISE EXCEPTION 'Escalade de privilèges refusée : seuls SUPER_ADMIN et OWNER peuvent modifier les attributs administratifs'
        USING ERRCODE = '42501';
      END IF;
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

-- RPC Administrative Sécurisée : STRICTEMENT RÉSERVÉE À SUPER_ADMIN ET OWNER
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
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'OWNER') THEN
    RAISE EXCEPTION 'Accès refusé : seuls les rôles SUPER_ADMIN et OWNER peuvent modifier les attributs administratifs' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Profil utilisateur cible introuvable' USING ERRCODE = '23503';
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
-- SECTION 5 : SÉCURISATION RLS DE PROFILES ET VUE PUBLIQUE (V3.3 STRICTE)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Suppression de toute permission globale ALL sur profiles pour les admins
DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;

-- Read: Un utilisateur voit son profil, les admins voient les profils pour le back-office
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all" 
ON public.profiles FOR SELECT 
USING (
    auth.uid() = id
    OR public.is_current_user_admin()
);

-- Update: Un utilisateur ne peut modifier QUE sa propre ligne (filtré par le trigger pour les champs sensibles)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Insert: Utilisateur insère son propre profil lors du signup
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Delete: AUCUNE policy DELETE pour les utilisateurs ou admins standard (DENY BY DEFAULT)
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

-- Vue Publique Filtrée pour la consultation publique des membres
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
-- SECTION 6 : TRIGGER CRÉATION PROFIL À L'INSCRIPTION
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
-- SECTION 7 : FONCTION RPC ATOMIQUE DE CRÉATION DE CONVERSATION
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
-- SECTION 8 : SÉCURISATION RLS DE LA MESSAGERIE ET BACKFILL VÉRIFIÉ (V3.2 CONSERVÉE)
-- ----------------------------------------------------------------------------

INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT DISTINCT conversation_id, sender_id 
FROM public.messages 
WHERE conversation_id IS NOT NULL AND sender_id IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

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

-- ----------------------------------------------------------------------------
-- SECTION 9 : SÉCURISATION RLS DE LA TABLE REQUESTS (BESOIN D'UN COUP DE MAIN)
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requests are viewable by everyone" ON public.requests;
DROP POLICY IF EXISTS "Users can create requests" ON public.requests;
DROP POLICY IF EXISTS "Authenticated users can insert own requests" ON public.requests;
DROP POLICY IF EXISTS "Users can update own requests" ON public.requests;
DROP POLICY IF EXISTS "Users can delete own requests" ON public.requests;

CREATE POLICY "Requests are viewable by everyone" 
ON public.requests FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert own requests" 
ON public.requests FOR INSERT 
WITH CHECK (
    auth.role() = 'authenticated' AND (requester_id = auth.uid() OR requester_id IS NULL)
);

CREATE POLICY "Users can update own requests" 
ON public.requests FOR UPDATE 
USING (
    auth.uid() = requester_id OR public.is_current_user_admin()
);

CREATE POLICY "Users can delete own requests" 
ON public.requests FOR DELETE 
USING (
    auth.uid() = requester_id OR public.is_current_user_admin()
);

-- ----------------------------------------------------------------------------
-- SECTION 10 : WORKFLOW DES INVITATIONS DE DEMANDES (MATCHING -> SELECTION -> INVITATION)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.request_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    sent_at timestamptz NOT NULL DEFAULT now(),
    viewed_at timestamptz,
    responded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_request_recipient UNIQUE(request_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_request_invitations_request ON public.request_invitations(request_id);
CREATE INDEX IF NOT EXISTS idx_request_invitations_recipient ON public.request_invitations(recipient_id);
CREATE INDEX IF NOT EXISTS idx_request_invitations_requester ON public.request_invitations(requester_id);

ALTER TABLE public.request_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Participants can view request invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Requesters can insert invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Requesters can insert request invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Involved users can update invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Participants can update request invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Requesters or admin can delete invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Requesters can delete request invitations" ON public.request_invitations;

CREATE POLICY "Participants can view request invitations" 
ON public.request_invitations FOR SELECT 
USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id
);

-- RPC 1: send_request_invitations
CREATE OR REPLACE FUNCTION public.send_request_invitations(
    p_request_id uuid,
    p_recipient_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_req_record record;
    v_recipient_id uuid;
    v_inserted_count int := 0;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_req_record FROM public.requests WHERE id = p_request_id;
    IF v_req_record.id IS NULL THEN
        RAISE EXCEPTION 'Demande introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_req_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul l''auteur de la demande peut envoyer des invitations' USING ERRCODE = '42501';
    END IF;

    IF v_req_record.status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION
          'La demande n''est plus ouverte aux invitations (statut actuel: %)',
          COALESCE(v_req_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    IF ARRAY_LENGTH(p_recipient_ids, 1) IS NULL OR ARRAY_LENGTH(p_recipient_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'inserted_count', 0);
    END IF;

    FOREACH v_recipient_id IN ARRAY p_recipient_ids LOOP
        IF v_recipient_id = v_my_id THEN
            CONTINUE;
        END IF;

        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_recipient_id) THEN
            INSERT INTO public.request_invitations (request_id, requester_id, recipient_id, status)
            VALUES (p_request_id, v_my_id, v_recipient_id, 'PENDING')
            ON CONFLICT (request_id, recipient_id) DO NOTHING;

            IF FOUND THEN
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'inserted_count', v_inserted_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.send_request_invitations(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_request_invitations(uuid, uuid[]) TO authenticated, service_role;

-- RPC 2: accept_request_invitation
CREATE OR REPLACE FUNCTION public.accept_request_invitation(
    p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_inv_record record;
    v_conv_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv_record FROM public.request_invitations WHERE id = p_invitation_id;
    IF v_inv_record.id IS NULL THEN
        RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_inv_record.recipient_id != v_my_id THEN
        RAISE EXCEPTION 'Action non autorisée sur cette invitation' USING ERRCODE = '42501';
    END IF;

    IF v_inv_record.status NOT IN ('PENDING', 'VIEWED') THEN
        RAISE EXCEPTION 'L''invitation ne peut plus être acceptée (statut actuel: %)', v_inv_record.status USING ERRCODE = '22000';
    END IF;

    v_conv_id := public.get_or_create_conversation(v_inv_record.requester_id);

    UPDATE public.request_invitations
    SET status = 'ACCEPTED',
        conversation_id = v_conv_id,
        responded_at = now(),
        updated_at = now()
    WHERE id = p_invitation_id
      AND recipient_id = v_my_id
      AND status IN ('PENDING', 'VIEWED');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible d''accepter l''invitation (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'conversation_id', v_conv_id,
        'request_id', v_inv_record.request_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_request_invitation(uuid) TO authenticated, service_role;

-- RPC 3: decline_request_invitation
CREATE OR REPLACE FUNCTION public.decline_request_invitation(
    p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_inv_record record;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv_record FROM public.request_invitations WHERE id = p_invitation_id;
    IF v_inv_record.id IS NULL THEN
        RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_inv_record.recipient_id != v_my_id THEN
        RAISE EXCEPTION 'Action non autorisée sur cette invitation' USING ERRCODE = '42501';
    END IF;

    IF v_inv_record.status NOT IN ('PENDING', 'VIEWED') THEN
        RAISE EXCEPTION 'L''invitation ne peut plus être déclinée (statut actuel: %)', v_inv_record.status USING ERRCODE = '22000';
    END IF;

    UPDATE public.request_invitations
    SET status = 'DECLINED',
        responded_at = now(),
        updated_at = now()
    WHERE id = p_invitation_id
      AND recipient_id = v_my_id
      AND status IN ('PENDING', 'VIEWED');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible de décliner l''invitation (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'status', 'DECLINED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_request_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_request_invitation(uuid) TO authenticated, service_role;

REVOKE ALL ON public.request_invitations FROM PUBLIC;
GRANT SELECT ON public.request_invitations TO authenticated;
GRANT ALL ON public.request_invitations TO service_role;
```

Description: Update 02_security_migration.sql to V3.3 removing full admin access policy and protecting stripe_account_id
Overwrite: true
TargetFile: /Users/mac/Documents/Documents - mac MacBook Pro/YOYOTest/TEST PLUS POUSSE/lyan-landing/02_security_migration.sql
