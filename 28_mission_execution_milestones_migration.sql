-- ============================================================================
-- LYANN DOM — 28_MISSION_EXECUTION_MILESTONES_MIGRATION.SQL (REVISED V2)
-- Migration pour le Moteur d'Exécution de Mission & Jalons (Step 19)
-- IMPORTANT : SEPARATES WORK VALIDATION ('VALIDATED') FROM FINANCIAL RELEASE ('RELEASED')
-- DO NOT EXECUTE AUTOMATICALLY — FOR MANUAL EXECUTION IN SUPABASE SQL EDITOR ONLY
-- ============================================================================

BEGIN;

-- 1. AJOUT DU STATUT CONTRACTUEL 'VALIDATED' DANS PUBLIC.MILESTONES
ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS milestones_status_check;
ALTER TABLE public.milestones 
  ADD CONSTRAINT milestones_status_check 
  CHECK (status IN ('PENDING', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED', 'CANCELLED'));


-- 2. RPC : OBTENIR LES DÉTAILS SÉCURISÉS D'UNE MISSION (RLS & RÔLE AUTHENTIFIÉ)
CREATE OR REPLACE FUNCTION public.get_mission_details_secure(
    p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_mission record;
    v_quote record;
    v_milestones jsonb;
    v_user_role text;
    v_total_milestones int := 0;
    v_completed_milestones int := 0;
    v_validated_milestones int := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Récupération de la mission
    SELECT * INTO v_mission FROM public.missions WHERE id = p_mission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Vérification des autorisations RLS (Demandeur ou Lyanneur uniquement)
    IF v_mission.requester_id = v_user_id THEN
        v_user_role := 'REQUESTER';
    ELSIF v_mission.helper_id = v_user_id THEN
        v_user_role := 'HELPER';
    ELSE
        RAISE EXCEPTION 'Accès refusé à cette mission' USING ERRCODE = '42501';
    END IF;

    -- Récupération du devis ACCEPTED canonique lié à l'invitation de cette mission
    SELECT * INTO v_quote FROM public.quotes 
    WHERE request_invitation_id = v_mission.request_invitation_id 
      AND status = 'ACCEPTED';

    IF NOT FOUND THEN
        SELECT * INTO v_quote FROM public.quotes 
        WHERE request_id = v_mission.related_request_id AND status = 'ACCEPTED' LIMIT 1;
    END IF;

    -- Récupération des jalons immuables du devis accepté
    IF v_quote.id IS NOT NULL THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'quote_id', m.quote_id,
                'title', m.title,
                'description', m.description,
                'amount', m.amount,
                'display_order', m.display_order,
                'status', m.status,
                'completion_comments', m.completion_comments,
                'deliverables', m.deliverables,
                'completed_at', m.completed_at
            ) ORDER BY m.display_order ASC
        ) INTO v_milestones
        FROM public.milestones m
        WHERE m.quote_id = v_quote.id;

        SELECT COUNT(*), 
               COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'VALIDATED', 'RELEASED')),
               COUNT(*) FILTER (WHERE status IN ('VALIDATED', 'RELEASED'))
        INTO v_total_milestones, v_completed_milestones, v_validated_milestones
        FROM public.milestones
        WHERE quote_id = v_quote.id;
    ELSE
        v_milestones := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_role', v_user_role,
        'mission', jsonb_build_object(
            'id', v_mission.id,
            'title', v_mission.title,
            'status', v_mission.status,
            'requester_id', v_mission.requester_id,
            'helper_id', v_mission.helper_id,
            'related_request_id', v_mission.related_request_id,
            'request_invitation_id', v_mission.request_invitation_id,
            'total_amount', v_mission.total_amount,
            'created_at', v_mission.created_at,
            'updated_at', v_mission.updated_at
        ),
        'quote', CASE WHEN v_quote.id IS NOT NULL THEN jsonb_build_object(
            'id', v_quote.id,
            'quote_number', v_quote.quote_number,
            'status', v_quote.status,
            'version', v_quote.version
        ) ELSE NULL END,
        'milestones', COALESCE(v_milestones, '[]'::jsonb),
        'stats', jsonb_build_object(
            'total', v_total_milestones,
            'completed', v_completed_milestones,
            'validated', v_validated_milestones
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_mission_details_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mission_details_secure(uuid) TO authenticated, service_role;


-- 3. RPC : DÉMARRAGE SÉCURISÉ D'UNE MISSION PAR LE LYANNEUR (HELPER)
CREATE OR REPLACE FUNCTION public.start_mission_secure(
    p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_mission record;
    v_conv_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Verrouillage de la mission pour sérialisation
    SELECT * INTO v_mission FROM public.missions WHERE id = p_mission_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Seul le Lyanneur (helper_id) peut démarrer la mission
    IF v_mission.helper_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le Lyanneur peut démarrer cette mission' USING ERRCODE = '42501';
    END IF;

    -- Idempotence : si déjà IN_PROGRESS, retourne succès sans créer d'événement dupliqué
    IF v_mission.status = 'IN_PROGRESS' THEN
        RETURN jsonb_build_object(
            'success', true,
            'mission_id', p_mission_id,
            'status', 'IN_PROGRESS',
            'already_started', true
        );
    END IF;

    IF v_mission.status IS DISTINCT FROM 'AGREED' THEN
        RAISE EXCEPTION 'La mission ne peut être démarrée que si son statut est AGREED (actuel: %)', v_mission.status USING ERRCODE = '22000';
    END IF;

    -- Passage du statut à IN_PROGRESS
    UPDATE public.missions
    SET status = 'IN_PROGRESS',
        updated_at = now()
    WHERE id = p_mission_id
      AND status = 'AGREED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrence lors du démarrage de la mission' USING ERRCODE = '40001';
    END IF;

    -- Journalisation de l'événement système dans public.messages
    SELECT conversation_id INTO v_conv_id FROM public.request_invitations WHERE id = v_mission.request_invitation_id;
    IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.messages (conversation_id, sender_id, content, created_at)
        VALUES (v_conv_id, v_user_id, jsonb_build_object(
            'type', 'system_card',
            'event_type', 'MISSION_STARTED',
            'mission_id', p_mission_id,
            'text', '🚀 La mission a été démarrée par l''intervenant.'
        )::text, now());
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'mission_id', p_mission_id,
        'status', 'IN_PROGRESS'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.start_mission_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_mission_secure(uuid) TO authenticated, service_role;


-- 4. RPC : MARQUER UN JALON COMME EFFECTUÉ PAR LE LYANNEUR (HELPER)
CREATE OR REPLACE FUNCTION public.mark_milestone_done_secure(
    p_milestone_id uuid,
    p_comments text DEFAULT NULL,
    p_deliverables jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_milestone record;
    v_quote record;
    v_mission record;
    v_conv_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Récupération et verrouillage du jalon
    SELECT * INTO v_milestone FROM public.milestones WHERE id = p_milestone_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Jalon introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Récupération du devis lié
    SELECT * INTO v_quote FROM public.quotes WHERE id = v_milestone.quote_id;
    IF NOT FOUND OR v_quote.status != 'ACCEPTED' THEN
        RAISE EXCEPTION 'Le devis associé n''est pas accepté ou introuvable' USING ERRCODE = '22000';
    END IF;

    -- Récupération de la mission liée
    SELECT * INTO v_mission FROM public.missions 
    WHERE request_invitation_id = v_quote.request_invitation_id AND status != 'CANCELLED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission associée introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Contrôle 1 : Seul le Lyanneur (helper_id) peut marquer le jalon comme réalisé
    IF v_mission.helper_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le Lyanneur peut déclarer ce jalon comme effectué' USING ERRCODE = '42501';
    END IF;

    -- Idempotence : si déjà COMPLETED, VALIDATED ou RELEASED
    IF v_milestone.status IN ('COMPLETED', 'VALIDATED', 'RELEASED') THEN
        RETURN jsonb_build_object(
            'success', true,
            'milestone_id', p_milestone_id,
            'status', v_milestone.status,
            'already_completed', true
        );
    END IF;

    -- La mission doit être en cours (IN_PROGRESS) ou acceptée (AGREED)
    IF v_mission.status NOT IN ('AGREED', 'IN_PROGRESS') THEN
        RAISE EXCEPTION 'La mission n''est pas dans un état actif (statut: %)', v_mission.status USING ERRCODE = '22000';
    END IF;

    -- Mise à jour du jalon à COMPLETED (déclaration de réalisation)
    UPDATE public.milestones
    SET status = 'COMPLETED',
        completion_comments = COALESCE(p_comments, completion_comments),
        deliverables = COALESCE(p_deliverables, deliverables),
        completed_at = now(),
        updated_at = now()
    WHERE id = p_milestone_id;

    -- Auto-passage de la mission à IN_PROGRESS si elle était encore à AGREED
    IF v_mission.status = 'AGREED' THEN
        UPDATE public.missions SET status = 'IN_PROGRESS', updated_at = now() WHERE id = v_mission.id;
    END IF;

    -- Journalisation de l'événement système dans public.messages
    SELECT conversation_id INTO v_conv_id FROM public.request_invitations WHERE id = v_mission.request_invitation_id;
    IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.messages (conversation_id, sender_id, content, created_at)
        VALUES (v_conv_id, v_user_id, jsonb_build_object(
            'type', 'system_card',
            'event_type', 'MILESTONE_COMPLETED',
            'milestone_id', p_milestone_id,
            'milestone_title', v_milestone.title,
            'text', format('✅ Jalon "%s" marqué comme effectué par l''intervenant.', v_milestone.title)
        )::text, now());
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'milestone_id', p_milestone_id,
        'mission_id', v_mission.id,
        'status', 'COMPLETED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_milestone_done_secure(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_milestone_done_secure(uuid, text, jsonb) TO authenticated, service_role;


-- 5. RPC : VALIDATION D'UN JALON PAR LE DEMANDEUR (REQUESTER) -> PASSE À 'VALIDATED' & AUTO-COMPLÉTION
CREATE OR REPLACE FUNCTION public.validate_milestone_secure(
    p_milestone_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_milestone record;
    v_quote record;
    v_mission record;
    v_unvalidated_count int;
    v_mission_completed boolean := false;
    v_conv_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Récupération et verrouillage du jalon
    SELECT * INTO v_milestone FROM public.milestones WHERE id = p_milestone_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Jalon introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Récupération du devis
    SELECT * INTO v_quote FROM public.quotes WHERE id = v_milestone.quote_id;
    IF NOT FOUND OR v_quote.status != 'ACCEPTED' THEN
        RAISE EXCEPTION 'Le devis associé n''est pas accepté ou introuvable' USING ERRCODE = '22000';
    END IF;

    -- Récupération de la mission
    SELECT * INTO v_mission FROM public.missions 
    WHERE request_invitation_id = v_quote.request_invitation_id AND status != 'CANCELLED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission associée introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Contrôle 1 : Seul le demandeur (requester_id) peut valider le jalon
    IF v_mission.requester_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le demandeur peut valider ce jalon' USING ERRCODE = '42501';
    END IF;

    -- Idempotence : si déjà VALIDATED ou RELEASED, retourne sans dupliquer l'événement
    IF v_milestone.status IN ('VALIDATED', 'RELEASED') THEN
        RETURN jsonb_build_object(
            'success', true,
            'milestone_id', p_milestone_id,
            'mission_id', v_mission.id,
            'status', v_milestone.status,
            'already_validated', true,
            'mission_completed', (v_mission.status = 'COMPLETED')
        );
    END IF;

    -- Contrôle statut : le jalon doit être COMPLETED (déclaré par l'intervenant)
    IF v_milestone.status IS DISTINCT FROM 'COMPLETED' THEN
        RAISE EXCEPTION 'Le jalon doit être marqué comme réalisé par l''intervenant avant d''être validé (statut actuel: %)', v_milestone.status USING ERRCODE = '22000';
    END IF;

    -- Validation contractuelle du jalon (passage à VALIDATED, JAMAIS RELEASED DANS STEP 19)
    UPDATE public.milestones
    SET status = 'VALIDATED',
        updated_at = now()
    WHERE id = p_milestone_id
      AND status = 'COMPLETED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrence lors de la validation du jalon' USING ERRCODE = '40001';
    END IF;

    -- Journalisation de l'événement système dans public.messages
    SELECT conversation_id INTO v_conv_id FROM public.request_invitations WHERE id = v_mission.request_invitation_id;
    IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.messages (conversation_id, sender_id, content, created_at)
        VALUES (v_conv_id, v_user_id, jsonb_build_object(
            'type', 'system_card',
            'event_type', 'MILESTONE_VALIDATED',
            'milestone_id', p_milestone_id,
            'milestone_title', v_milestone.title,
            'text', format('👍 Jalon "%s" validé par le demandeur.', v_milestone.title)
        )::text, now());
    END IF;

    -- Vérification si TOUS les jalons du devis accepté sont désormais au statut VALIDATED (ou RELEASED)
    SELECT COUNT(*) INTO v_unvalidated_count
    FROM public.milestones
    WHERE quote_id = v_quote.id
      AND status NOT IN ('VALIDATED', 'RELEASED');

    IF v_unvalidated_count = 0 THEN
        UPDATE public.missions
        SET status = 'COMPLETED',
            updated_at = now()
        WHERE id = v_mission.id;

        v_mission_completed := true;

        IF v_conv_id IS NOT NULL THEN
            INSERT INTO public.messages (conversation_id, sender_id, content, created_at)
            VALUES (v_conv_id, v_user_id, jsonb_build_object(
                'type', 'system_card',
                'event_type', 'MISSION_COMPLETED',
                'mission_id', v_mission.id,
                'text', '🎉 Tous les jalons ont été validés ! La mission est désormais TERMINÉE.'
            )::text, now());
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'milestone_id', p_milestone_id,
        'mission_id', v_mission.id,
        'status', 'VALIDATED',
        'mission_completed', v_mission_completed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_milestone_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_milestone_secure(uuid) TO authenticated, service_role;


-- 6. RPC : ANNULATION SÉCURISÉE D'UNE MISSION AVEC MOTIF OBLIGATOIRE
CREATE OR REPLACE FUNCTION public.cancel_mission_secure(
    p_mission_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_mission record;
    v_conv_id uuid;
    v_clean_reason text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    v_clean_reason := NULLIF(TRIM(p_reason), '');
    IF v_clean_reason IS NULL THEN
        RAISE EXCEPTION 'Un motif d''annulation est obligatoire' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_mission FROM public.missions WHERE id = p_mission_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_mission.requester_id != v_user_id AND v_mission.helper_id != v_user_id THEN
        RAISE EXCEPTION 'Seuls les participants à la mission peuvent demander l''annulation' USING ERRCODE = '42501';
    END IF;

    -- Règle Step 13/14 : Annulation directe autorisée uniquement si AGREED (avant démarrage)
    IF v_mission.status = 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'Une mission en cours ne peut pas être annulée unilatéralement. Veuillez utiliser la gestion des litiges.' USING ERRCODE = '22000';
    END IF;

    IF v_mission.status IN ('COMPLETED', 'CANCELLED', 'DISPUTED') THEN
        RAISE EXCEPTION 'La mission ne peut plus être annulée dans son état actuel (statut: %)', v_mission.status USING ERRCODE = '22000';
    END IF;

    UPDATE public.missions
    SET status = 'CANCELLED',
        updated_at = now()
    WHERE id = p_mission_id
      AND status = 'AGREED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrence lors de l''annulation' USING ERRCODE = '40001';
    END IF;

    -- Journalisation de l'événement système
    SELECT conversation_id INTO v_conv_id FROM public.request_invitations WHERE id = v_mission.request_invitation_id;
    IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.messages (conversation_id, sender_id, content, created_at)
        VALUES (v_conv_id, v_user_id, jsonb_build_object(
            'type', 'system_card',
            'event_type', 'MISSION_CANCELLED',
            'mission_id', p_mission_id,
            'reason', v_clean_reason,
            'text', format('❌ La mission a été annulée. Motif : %s', v_clean_reason)
        )::text, now());
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'mission_id', p_mission_id,
        'status', 'CANCELLED',
        'reason', v_clean_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_mission_secure(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_mission_secure(uuid, text) TO authenticated, service_role;

COMMIT;
