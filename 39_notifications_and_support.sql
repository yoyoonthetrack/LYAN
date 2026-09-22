-- ============================================================================
-- LYANN — Migration 39: notifications in-app + conversation Aide LYANN
--
-- Préférences utilisateur (messages, besoins correspondants, Bokantaj).
-- Identité support réelle (auth.users + profiles), message de bienvenue
-- à l'inscription, matching compétences / besoin, notif Bokantaj.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Identité Aide LYANN (UUID fixe, jamais inventé côté client)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lyann_runtime_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

DO $$
DECLARE
    v_id uuid := 'a1e00000-1ea1-4000-8000-000000000001';
    v_instance uuid;
    v_existing uuid;
BEGIN
    SELECT id INTO v_existing FROM auth.users WHERE email = 'aide@lyann.app' LIMIT 1;
    IF v_existing IS NOT NULL THEN
        v_id := v_existing;
    END IF;

    SELECT id INTO v_instance FROM auth.instances LIMIT 1;
    IF v_instance IS NULL THEN
        v_instance := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change,
            email_change_token_new, recovery_token
        ) VALUES (
            v_instance,
            v_id,
            'authenticated',
            'authenticated',
            'aide@lyann.app',
            crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"first_name":"Aide","last_name":"LYANN","account_origin":"lyann_support"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    END IF;

    BEGIN
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
        ) VALUES (
            gen_random_uuid(),
            v_id,
            jsonb_build_object('sub', v_id::text, 'email', 'aide@lyann.app'),
            'email',
            now(), now(), now(),
            v_id::text
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    WHEN undefined_column THEN
        BEGIN
            INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
            VALUES (
                gen_random_uuid(), v_id,
                jsonb_build_object('sub', v_id::text, 'email', 'aide@lyann.app'),
                'email', now(), now(), now()
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    WHEN OTHERS THEN
        NULL;
    END;

    INSERT INTO public.profiles (
        id, email, first_name, last_name, role, account_type, is_verified, bio, created_at
    ) VALUES (
        v_id,
        'aide@lyann.app',
        'Aide',
        'LYANN',
        'USER',
        'real',
        true,
        'Équipe LYANN — écrivez-nous ici si vous avez besoin d''aide.',
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        first_name = 'Aide',
        last_name = 'LYANN',
        email = COALESCE(public.profiles.email, EXCLUDED.email),
        bio = COALESCE(public.profiles.bio, EXCLUDED.bio);

    INSERT INTO public.lyann_runtime_config (key, value)
    VALUES ('support_user_id', v_id::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.lyann_support_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NULLIF(value, '')::uuid
    FROM public.lyann_runtime_config
    WHERE key = 'support_user_id'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lyann_support_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_support_user_id() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Préférences + table notifications
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT jsonb_build_object(
        'messages', true,
        'matching_requests', true,
        'bokantaj', true
    );

UPDATE public.profiles
SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb)
    || jsonb_build_object(
        'messages', COALESCE((notification_prefs->>'messages')::boolean, true),
        'matching_requests', COALESCE((notification_prefs->>'matching_requests')::boolean, true),
        'bokantaj', COALESCE((notification_prefs->>'bokantaj')::boolean, true)
    )
WHERE notification_prefs IS NULL
   OR NOT (notification_prefs ? 'messages')
   OR NOT (notification_prefs ? 'matching_requests')
   OR NOT (notification_prefs ? 'bokantaj');

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    entity_type text,
    entity_id text,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotent
    ON public.notifications (user_id, type, entity_id)
    WHERE entity_id IS NOT NULL AND type <> 'NEW_MESSAGE';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
    ON public.notifications FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
    ON public.notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE OR REPLACE FUNCTION public.lyann_pref_enabled(p_user_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((p.notification_prefs->>p_key)::boolean, true)
    FROM public.profiles p
    WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.lyann_insert_notification(
    p_user_id uuid,
    p_type text,
    p_title text,
    p_body text,
    p_entity_type text DEFAULT NULL,
    p_entity_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id = public.lyann_support_user_id() THEN
        RETURN;
    END IF;
    IF p_type = 'NEW_MESSAGE' OR p_entity_id IS NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
        VALUES (p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id);
        RETURN;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
    SELECT p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = p_user_id
          AND n.type = p_type
          AND n.entity_id = p_entity_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Conversation support + bienvenue à l'inscription
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lyann_pair_conversation(p_user_a uuid, p_user_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_id uuid;
BEGIN
    IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
        RAISE EXCEPTION 'Participants de conversation invalides' USING ERRCODE = '22000';
    END IF;

    SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = p_user_a
      AND cp2.user_id = p_user_b
      AND (
        SELECT COUNT(*) FROM public.conversation_participants cp3
        WHERE cp3.conversation_id = cp1.conversation_id
      ) = 2
    LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
        RETURN v_conv_id;
    END IF;

    INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, p_user_a), (v_conv_id, p_user_b);
    RETURN v_conv_id;
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
    v_support uuid := public.lyann_support_user_id();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    IF v_support IS NULL THEN
        RAISE EXCEPTION 'Identité Aide LYANN indisponible' USING ERRCODE = 'P0002';
    END IF;
    RETURN public.lyann_pair_conversation(v_me, v_support);
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_pair_conversation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_pair_conversation(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.lyann_open_support_conversation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_open_support_conversation() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lyann_send_welcome_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_support uuid := public.lyann_support_user_id();
    v_conv uuid;
    v_first text;
BEGIN
    IF v_support IS NULL OR NEW.id = v_support THEN
        RETURN NEW;
    END IF;
    IF COALESCE(NEW.account_type, 'real') = 'seed' THEN
        RETURN NEW;
    END IF;

    v_conv := public.lyann_pair_conversation(NEW.id, v_support);
    v_first := NULLIF(btrim(COALESCE(NEW.first_name, '')), '');

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

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_send_welcome_message: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lyann_welcome_message ON public.profiles;
CREATE TRIGGER trg_lyann_welcome_message
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_send_welcome_message();

-- ----------------------------------------------------------------------------
-- 4. Notification à chaque message reçu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lyann_notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recipient uuid;
    v_preview text;
BEGIN
    v_preview := left(regexp_replace(COALESCE(NEW.content, ''), '\s+', ' ', 'g'), 140);
    IF v_preview IS NULL OR btrim(v_preview) = '' THEN
        v_preview := 'Nouveau message';
    END IF;

    FOR v_recipient IN
        SELECT cp.user_id
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = NEW.conversation_id
          AND cp.user_id IS DISTINCT FROM NEW.sender_id
          AND cp.user_id IS DISTINCT FROM public.lyann_support_user_id()
    LOOP
        IF public.lyann_pref_enabled(v_recipient, 'messages') THEN
            PERFORM public.lyann_insert_notification(
                v_recipient,
                'NEW_MESSAGE',
                'Nouveau message',
                v_preview,
                'conversation',
                COALESCE(NEW.sender_id::text, NEW.conversation_id::text)
            );
        END IF;
    END LOOP;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_notify_on_message: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lyann_notify_on_message ON public.messages;
CREATE TRIGGER trg_lyann_notify_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_notify_on_message();

-- ----------------------------------------------------------------------------
-- 5. Besoins correspondant aux compétences (taxonomie + titre de service)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lyann_notify_matching_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_haystack text;
    v_tax text := '';
    v_status text;
    rec record;
    v_notified int := 0;
BEGIN
    v_status := upper(COALESCE(to_jsonb(NEW)->>'status', 'OPEN'));
    IF v_status IN ('CANCELLED', 'CLOSED', 'COMPLETED', 'DONE') THEN
        RETURN NEW;
    END IF;

    v_haystack := lower(unaccent(concat_ws(' ',
        to_jsonb(NEW)->>'title',
        to_jsonb(NEW)->>'category',
        left(COALESCE(to_jsonb(NEW)->>'description', ''), 400)
    )));

    IF (to_jsonb(NEW)->>'taxonomy_id') IS NOT NULL THEN
        SELECT lower(unaccent(concat_ws(' ', t.universe, t.category, t.subcategory, array_to_string(t.synonyms, ' '))))
        INTO v_tax
        FROM public.lyann_taxonomy t
        WHERE t.id = (to_jsonb(NEW)->>'taxonomy_id')::uuid;
        v_haystack := v_haystack || ' ' || COALESCE(v_tax, '');
    END IF;

    IF length(btrim(v_haystack)) < 3 THEN
        RETURN NEW;
    END IF;

    FOR rec IN
        SELECT DISTINCT s.owner_id, COALESCE(s.title, to_jsonb(s)->>'category') AS skill_title
        FROM public.services s
        WHERE s.owner_id IS DISTINCT FROM NEW.requester_id
          AND s.owner_id IS DISTINCT FROM public.lyann_support_user_id()
          AND COALESCE((to_jsonb(s)->>'is_active')::boolean, (to_jsonb(s)->>'active')::boolean, true)
          AND length(COALESCE(s.title, '')) >= 3
          AND (
              v_haystack LIKE '%' || lower(unaccent(s.title)) || '%'
              OR lower(unaccent(s.title)) LIKE '%' || split_part(v_haystack, ' ', 1) || '%'
              OR similarity(lower(unaccent(s.title)), v_haystack) > 0.18
              OR (
                  COALESCE(to_jsonb(s)->>'category', '') <> ''
                  AND v_haystack LIKE '%' || lower(unaccent(to_jsonb(s)->>'category')) || '%'
              )
          )
        LIMIT 80
    LOOP
        IF v_notified >= 40 THEN
            EXIT;
        END IF;
        IF public.lyann_pref_enabled(rec.owner_id, 'matching_requests') THEN
            PERFORM public.lyann_insert_notification(
                rec.owner_id,
                'OPPORTUNITY',
                'Un besoin correspond à vos compétences',
                COALESCE(NULLIF(to_jsonb(NEW)->>'title', ''), 'Nouveau besoin') ||
                    CASE WHEN rec.skill_title IS NOT NULL THEN ' — proche de « ' || rec.skill_title || ' »' ELSE '' END,
                'request',
                NEW.id::text
            );
            v_notified := v_notified + 1;
        END IF;
    END LOOP;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_notify_matching_request: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lyann_notify_matching_request ON public.requests;
CREATE TRIGGER trg_lyann_notify_matching_request
    AFTER INSERT ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_notify_matching_request();

-- ----------------------------------------------------------------------------
-- 6. Publication Bokantaj (même territoire, préférence opt-in)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.bokantaj_posts') IS NULL THEN
        RETURN;
    END IF;

    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.lyann_notify_bokantaj_post()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
        rec record;
        v_preview text;
        v_notified int := 0;
        v_territory text;
    BEGIN
        v_preview := left(regexp_replace(COALESCE(NEW.content, ''), '\s+', ' ', 'g'), 140);
        IF v_preview IS NULL OR btrim(v_preview) = '' THEN
            v_preview := 'Nouvelle publication sur Bokantaj';
        END IF;
        v_territory := NULLIF(lower(btrim(COALESCE(NEW.territory, ''))), '');

        FOR rec IN
            SELECT p.id
            FROM public.profiles p
            WHERE p.id IS DISTINCT FROM NEW.author_id
              AND p.id IS DISTINCT FROM public.lyann_support_user_id()
              AND COALESCE(p.account_type, 'real') <> 'seed'
              AND (
                  v_territory IS NULL
                  OR NULLIF(lower(btrim(COALESCE(p.territory, ''))), '') IS NULL
                  OR lower(p.territory) = v_territory
              )
            LIMIT 80
        LOOP
            IF v_notified >= 40 THEN
                EXIT;
            END IF;
            IF public.lyann_pref_enabled(rec.id, 'bokantaj') THEN
                PERFORM public.lyann_insert_notification(
                    rec.id,
                    'BOKANTAJ',
                    'Nouveau lyann sur Bokantaj',
                    v_preview,
                    'post',
                    NEW.id::text
                );
                v_notified := v_notified + 1;
            END IF;
        END LOOP;
        RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'lyann_notify_bokantaj_post: %', SQLERRM;
        RETURN NEW;
    END;
    $body$;
    $fn$;

    DROP TRIGGER IF EXISTS trg_lyann_notify_bokantaj_post ON public.bokantaj_posts;
    CREATE TRIGGER trg_lyann_notify_bokantaj_post
        AFTER INSERT ON public.bokantaj_posts
        FOR EACH ROW
        EXECUTE FUNCTION public.lyann_notify_bokantaj_post();
END $$;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN
    NULL;
WHEN undefined_object THEN
    NULL;
END $$;

COMMIT;
