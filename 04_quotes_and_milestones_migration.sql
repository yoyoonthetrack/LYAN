-- ============================================================================
-- LYANN DOM — 04_QUOTES_AND_MILESTONES_MIGRATION.SQL (V3 SÉCURISÉE)
-- Migration autonome, idempotente et renforcée pour le système de devis et jalons :
-- INVITATION ACCEPTED → CRÉATION DEVIS (VERSIONNÉ + CONCURRENCE DB) → JALONS → ACCEPTATION CLIENT → MISSION (RATTACHÉE À INVITATION)
-- ============================================================================

-- 1. ADAPTATION DE LA TABLE PUBLIC.MISSIONS (LIAISON EXACTE MISSION ↔ INVITATION)
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS related_request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS request_invitation_id uuid REFERENCES public.request_invitations(id) ON DELETE SET NULL;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;

-- Index d'unicité partielle : une invitation ne peut produire qu'UNE SEULE mission active
CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_unique_active_invitation
ON public.missions(request_invitation_id)
WHERE request_invitation_id IS NOT NULL AND status != 'CANCELLED';


-- 2. EXTENSION ET ADAPTATION DE LA TABLE PUBLIC.QUOTES (COLONNES MANQUANTES ET INDEX D'UNICITÉ DB)
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.requests(id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS request_invitation_id uuid REFERENCES public.request_invitations(id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS quote_number text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS version int DEFAULT 1;

-- Nettoyage préventif et mise à jour de la contrainte de statuts sur public.quotes
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS check_quotes_status;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes ADD CONSTRAINT check_quotes_status
CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'));

-- Contrainte d'unicité sur numéro de devis
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_quote_number') THEN
        ALTER TABLE public.quotes ADD CONSTRAINT unique_quote_number UNIQUE (quote_number);
    END IF;
END $$;

-- CORRECTION V3 : Protections PostgreSQL au niveau DB contre la concurrence des devis
-- Index d'unicité : Un seul devis actif (SENT ou ACCEPTED) simultané par invitation
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_one_active_per_invitation
ON public.quotes(request_invitation_id)
WHERE status IN ('SENT', 'ACCEPTED');

-- Index d'unicité : Unicité de la version par invitation
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_invitation_version
ON public.quotes(request_invitation_id, version)
WHERE request_invitation_id IS NOT NULL;

-- Index d'optimisation
CREATE INDEX IF NOT EXISTS idx_quotes_request ON public.quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_invitation ON public.quotes(request_invitation_id);
CREATE INDEX IF NOT EXISTS idx_quotes_requester ON public.quotes(requester_id);
CREATE INDEX IF NOT EXISTS idx_quotes_provider ON public.quotes(provider_id);
CREATE INDEX IF NOT EXISTS idx_quotes_conversation ON public.quotes(conversation_id);


-- 3. CRÉATION DE LA TABLE PUBLIC.MILESTONES (JALONS DE PAIEMENT SÉCURISÉS)
CREATE TABLE IF NOT EXISTS public.milestones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    amount numeric NOT NULL CHECK (amount > 0),
    percentage numeric CHECK (percentage > 0 AND percentage <= 100),
    display_order int NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'CANCELLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index d'optimisation
CREATE INDEX IF NOT EXISTS idx_milestones_quote ON public.milestones(quote_id);


-- 4. VERROUILLAGE RLS ET POLITIQUES DE SÉCURITÉ SUR QUOTES ET MILESTONES
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- Suppression de toutes les anciennes politiques d'écriture directe pour les utilisateurs authentifiés
DROP POLICY IF EXISTS "Participants can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Involved parties can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Involved parties can create quotes" ON public.quotes;
DROP POLICY IF EXISTS "Involved parties can update quotes" ON public.quotes;

-- Seule la LECTURE est autorisée directement pour les participants du devis
CREATE POLICY "Participants can view quotes"
ON public.quotes FOR SELECT
USING (
    auth.uid() = requester_id OR auth.uid() = provider_id
);

-- Nettoyage et politiques RLS SELECT pour les jalons
DROP POLICY IF EXISTS "Participants can view milestones" ON public.milestones;

CREATE POLICY "Participants can view milestones"
ON public.milestones FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = milestones.quote_id
          AND (q.requester_id = auth.uid() OR q.provider_id = auth.uid())
    )
);

-- AUCUNE politique INSERT, UPDATE ou DELETE n'est créée pour les utilisateurs standards.
-- Toutes les mutations passent EXCLUSIVEMENT par les RPC SECURITY DEFINER ci-dessous.


-- 5. RPC 1 : CRÉATION DU DEVIS ET DE SES JALONS PAR LE PRESTATAIRE (LYANNEUR) WITH VERSIONING & DB CONCURRENCY CATCH
CREATE OR REPLACE FUNCTION public.create_request_quote(
    p_invitation_id uuid,
    p_description text DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL,
    p_milestones_json jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_inv_record record;
    v_req_status text;
    v_quote_id uuid;
    v_quote_num text;
    v_next_version int := 1;
    v_total_amount numeric := 0;
    v_calculated_sum numeric := 0;
    v_m_elem jsonb;
    v_m_title text;
    v_m_desc text;
    v_m_amount numeric;
    v_m_percent numeric;
    v_m_order int := 1;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Récupération de l'invitation
    SELECT * INTO v_inv_record FROM public.request_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Vérification : Seul le destinataire (Lyanneur) peut soumettre un devis
    IF v_inv_record.recipient_id != v_my_id THEN
        RAISE EXCEPTION 'Seul le Lyanneur invité peut créer un devis pour ce besoin' USING ERRCODE = '42501';
    END IF;

    -- Vérification : L'invitation doit obligatoirement être au statut ACCEPTED
    IF v_inv_record.status IS DISTINCT FROM 'ACCEPTED' THEN
        RAISE EXCEPTION
          'L''invitation doit être acceptée avant de pouvoir soumettre un devis (statut actuel: %)',
          COALESCE(v_inv_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- Vérification du statut de la demande liée (ne doit pas être CANCELLED / CLOSED)
    SELECT status INTO v_req_status FROM public.requests WHERE id = v_inv_record.request_id;
    IF v_req_status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION
          'La demande liée n''est plus ouverte (statut actuel: %)',
          COALESCE(v_req_status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- Empêcher plusieurs devis actifs (SENT ou ACCEPTED) simultanés pour la même invitation
    IF EXISTS (
        SELECT 1 FROM public.quotes
        WHERE request_invitation_id = p_invitation_id
          AND status IN ('SENT', 'ACCEPTED')
    ) THEN
        RAISE EXCEPTION
          'Un devis actif (SENT ou ACCEPTED) existe déjà pour cette invitation'
          USING ERRCODE = '40001';
    END IF;

    -- Calcul automatique du numéro de version SQL (MAX(version) + 1)
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.quotes
    WHERE request_invitation_id = p_invitation_id;

    -- Traitement et vérification des jalons
    IF jsonb_array_length(p_milestones_json) > 0 THEN
        FOR v_m_elem IN SELECT * FROM jsonb_array_elements(p_milestones_json) LOOP
            v_m_amount := (v_m_elem->>'amount')::numeric;
            IF v_m_amount IS NULL OR v_m_amount <= 0 THEN
                RAISE EXCEPTION 'Le montant d''un jalon doit être strictement supérieur à 0' USING ERRCODE = '22000';
            END IF;
            v_calculated_sum := v_calculated_sum + v_m_amount;
        END LOOP;
        v_total_amount := v_calculated_sum;
    ELSE
        RAISE EXCEPTION 'Un devis doit comporter au moins un jalon de prestation' USING ERRCODE = '22000';
    END IF;

    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant total du devis doit être supérieur à 0 €' USING ERRCODE = '22000';
    END IF;

    -- Génération d'un numéro de devis unique intégrant la version
    v_quote_num := 'DEV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)) || '-V' || v_next_version;

    -- CORRECTION V3 : Bloc d'insertion avec rattrapage d'erreur unique_violation pour les index DB
    BEGIN
        INSERT INTO public.quotes (
            request_id,
            request_invitation_id,
            conversation_id,
            requester_id,
            provider_id,
            quote_number,
            description,
            details,
            amount,
            total_amount,
            status,
            version,
            valid_until,
            created_at,
            updated_at
        ) VALUES (
            v_inv_record.request_id,
            p_invitation_id,
            v_inv_record.conversation_id,
            v_inv_record.requester_id,
            v_my_id,
            v_quote_num,
            p_description,
            p_description,
            v_total_amount,
            v_total_amount,
            'SENT',
            v_next_version,
            COALESCE(p_valid_until, now() + interval '30 days'),
            now(),
            now()
        )
        RETURNING id INTO v_quote_id;

        -- Insertion atomique des jalons
        FOR v_m_elem IN SELECT * FROM jsonb_array_elements(p_milestones_json) LOOP
            v_m_title := COALESCE(v_m_elem->>'title', 'Jalon ' || v_m_order);
            v_m_desc := v_m_elem->>'description';
            v_m_amount := (v_m_elem->>'amount')::numeric;
            v_m_percent := (v_m_elem->>'percentage')::numeric;

            INSERT INTO public.milestones (
                quote_id,
                title,
                description,
                amount,
                percentage,
                display_order,
                status,
                created_at,
                updated_at
            ) VALUES (
                v_quote_id,
                v_m_title,
                v_m_desc,
                v_m_amount,
                v_m_percent,
                v_m_order,
                'PENDING',
                now(),
                now()
            );

            v_m_order := v_m_order + 1;
        END LOOP;

    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION
          'Un devis actif (SENT/ACCEPTED) ou cette version existe déjà pour cette invitation'
          USING ERRCODE = '40001';
    END;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote_id,
        'quote_number', v_quote_num,
        'version', v_next_version,
        'total_amount', v_total_amount,
        'request_id', v_inv_record.request_id,
        'status', 'SENT'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_request_quote(uuid, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_request_quote(uuid, text, timestamptz, jsonb) TO authenticated, service_role;


-- 6. RPC 2 : ACCEPTATION DU DEVIS PAR LE DEMANDEUR (CLIENT) ET CRÉATION DE LA MISSION (RATTACHÉE À REQUEST_INVITATION_ID)
CREATE OR REPLACE FUNCTION public.accept_request_quote(
    p_quote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_quote_record record;
    v_req_status text;
    v_mission_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Vérification : Seul le demandeur (Client) peut accepter le devis
    IF v_quote_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul le demandeur de la prestation peut accepter ce devis' USING ERRCODE = '42501';
    END IF;

    -- Vérification : Seul un devis au statut SENT peut être accepté
    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION
          'Le devis ne peut plus être accepté (statut actuel: %)',
          COALESCE(v_quote_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- Vérification de l'expiration du devis (valid_until)
    IF v_quote_record.valid_until IS NOT NULL AND v_quote_record.valid_until < now() THEN
        RAISE EXCEPTION
          'Le devis a expiré (date limite: %)',
          v_quote_record.valid_until
          USING ERRCODE = '22000';
    END IF;

    -- Vérification du statut de la demande liée
    SELECT status INTO v_req_status FROM public.requests WHERE id = v_quote_record.request_id;
    IF v_req_status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION
          'La demande liée n''est plus ouverte (statut actuel: %)',
          COALESCE(v_req_status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- CORRECTION V3 : Vérification basée principalement sur request_invitation_id
    IF EXISTS (
        SELECT 1 FROM public.missions
        WHERE request_invitation_id = v_quote_record.request_invitation_id
          AND status != 'CANCELLED'
    ) THEN
        RAISE EXCEPTION
          'Une mission a déjà été créée et acceptée pour cette invitation'
          USING ERRCODE = '40001';
    END IF;

    -- Verrouillage du devis (statut ACCEPTED)
    UPDATE public.quotes
    SET status = 'ACCEPTED',
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible d''accepter le devis (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

    -- CORRECTION V3 : Création atomique de la mission liée avec request_invitation_id
    BEGIN
        INSERT INTO public.missions (
            requester_id,
            helper_id,
            related_request_id,
            request_invitation_id,
            status,
            total_amount,
            created_at,
            updated_at
        ) VALUES (
            v_quote_record.requester_id,
            v_quote_record.provider_id,
            v_quote_record.request_id,
            v_quote_record.request_invitation_id,
            'AGREED',
            v_quote_record.total_amount,
            now(),
            now()
        )
        RETURNING id INTO v_mission_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION
          'Une mission active a déjà été créée pour cette invitation'
          USING ERRCODE = '40001';
    END;

    -- Liaison de la mission sur le devis (REMARQUE: la conversation conserve son identité générale sans écrasement)
    UPDATE public.quotes SET mission_id = v_mission_id WHERE id = p_quote_id;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', p_quote_id,
        'mission_id', v_mission_id,
        'request_id', v_quote_record.request_id,
        'request_invitation_id', v_quote_record.request_invitation_id,
        'status', 'ACCEPTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_request_quote(uuid) TO authenticated, service_role;


-- 7. RPC 3 : REFUS DU DEVIS PAR LE DEMANDEUR (CLIENT)
CREATE OR REPLACE FUNCTION public.reject_request_quote(
    p_quote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_quote_record record;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Vérification : Seul le demandeur (Client) peut refuser le devis
    IF v_quote_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul le demandeur de la prestation peut refuser ce devis' USING ERRCODE = '42501';
    END IF;

    -- Vérification : Seul un devis au statut SENT peut être refusé
    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION
          'Le devis ne peut plus être refusé (statut actuel: %)',
          COALESCE(v_quote_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- Mise à jour atomique du statut du devis à REJECTED
    UPDATE public.quotes
    SET status = 'REJECTED',
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible de refuser le devis (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', p_quote_id,
        'status', 'REJECTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_request_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_request_quote(uuid) TO authenticated, service_role;


-- 8. PERMISSIONS DES TABLES (LECTURE SEULE POUR UTILISATEURS AUTHENTIFIÉS CONCERNÉS, ALL POUR SERVICE_ROLE)
REVOKE ALL ON public.quotes FROM PUBLIC;
GRANT SELECT ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

REVOKE ALL ON public.milestones FROM PUBLIC;
GRANT SELECT ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
