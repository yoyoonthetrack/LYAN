-- ============================================================================
-- LYANN — Migration 40: fil Aide LYANN = support, pas un besoin
--
-- Le message de bienvenue est aussi posé à l'ouverture du fil (comptes déjà
-- inscrits). Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lyann_ensure_support_welcome(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_support uuid := public.lyann_support_user_id();
    v_conv uuid;
    v_first text;
BEGIN
    IF p_user_id IS NULL OR v_support IS NULL OR p_user_id = v_support THEN
        RETURN NULL;
    END IF;

    v_conv := public.lyann_pair_conversation(p_user_id, v_support);

    SELECT NULLIF(btrim(COALESCE(first_name, '')), '')
    INTO v_first
    FROM public.profiles
    WHERE id = p_user_id;

    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT v_conv, v_support,
        CASE
            WHEN v_first IS NOT NULL THEN
                'Bienvenue dans la communauté LYANN, ' || v_first || ' ! Ici on s''entraide entre voisins. Si vous avez une question ou besoin d''aide, écrivez-nous dans cette conversation — l''équipe LYANN vous répond.'
            ELSE
                'Bienvenue dans la communauté LYANN ! Ici on s''entraide entre voisins. Si vous avez une question ou besoin d''aide, écrivez-nous dans cette conversation — l''équipe LYANN vous répond.'
        END
    WHERE NOT EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.conversation_id = v_conv AND m.sender_id = v_support
    );

    RETURN v_conv;
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_open_support_conversation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me uuid := auth.uid();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    RETURN public.lyann_ensure_support_welcome(v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_ensure_support_welcome(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_ensure_support_welcome(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.lyann_open_support_conversation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_open_support_conversation() TO authenticated, service_role;

UPDATE public.profiles
SET first_name = 'Support',
    last_name = 'LYANN',
    bio = 'Support LYANN — écrivez-nous ici si vous avez un problème.'
WHERE id = public.lyann_support_user_id();

ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
    NULL;
WHEN undefined_object THEN
    NULL;
END $$;

COMMIT;
