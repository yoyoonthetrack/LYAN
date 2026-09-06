-- ============================================================================
-- LYANN DOM — 14_PROFILE_TRUST_REPUTATION_MIGRATION.SQL (V3 HOTFIX)
-- STEP 8: USER PROFILE & TRUST & REPUTATION ENGINE MIGRATION
-- ============================================================================
-- IMPORTANT: CE SCRIPT NE DOIT PAS ÊTRE EXÉCUTÉ AUTOMATIQUEMENT PAR L'AGENT.
-- L'OWNER DOIT LE VALIDER ET L'EXÉCUTER MANUELLEMENT DANS LA CONSOLE SUPABASE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 1 : EXTENSION DE LA TABLE PUBLIC.PROFILES (SCHÉMA RÉEL SUPABASE)
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS intervention_radius_km integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS intervention_zone text[] DEFAULT '{}';

-- Index pour accélérer les requêtes géographiques
CREATE INDEX IF NOT EXISTS idx_profiles_territory_city ON public.profiles(territory, city);
CREATE INDEX IF NOT EXISTS idx_profiles_intervention_zone ON public.profiles USING GIN (intervention_zone);

-- ----------------------------------------------------------------------------
-- SECTION 2 : MODÈLE DÉDIÉ PORTFOLIO (PUBLIC.USER_PORTFOLIO_ITEMS)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_portfolio_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    title text DEFAULT '',
    caption text DEFAULT '',
    display_order integer DEFAULT 0,
    is_public boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read user_portfolio_items" ON public.user_portfolio_items;
CREATE POLICY "Public read user_portfolio_items" ON public.user_portfolio_items
    FOR SELECT USING (is_public = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "User manage own user_portfolio_items" ON public.user_portfolio_items;
CREATE POLICY "User manage own user_portfolio_items" ON public.user_portfolio_items
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_portfolio_items_user_id ON public.user_portfolio_items(user_id);

-- ----------------------------------------------------------------------------
-- SECTION 3 : BUCKETS ET POLITIQUES STORAGE (AVATARS ET PORTFOLIO)
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio_images', 'portfolio_images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Politiques RLS granulaires pour avatars
DROP POLICY IF EXISTS "Public avatars read" ON storage.objects;
DROP POLICY IF EXISTS "User avatars management" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "User insert own avatar" ON storage.objects;
DROP POLICY IF EXISTS "User update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "User delete own avatar" ON storage.objects;

CREATE POLICY "Public read avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "User insert own avatar" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'avatars' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User update own avatar" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'avatars' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    ) WITH CHECK (
        bucket_id = 'avatars' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User delete own avatar" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'avatars' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Politiques RLS granulaires pour portfolio_images
DROP POLICY IF EXISTS "Public portfolio_images read" ON storage.objects;
DROP POLICY IF EXISTS "User portfolio_images management" ON storage.objects;
DROP POLICY IF EXISTS "Public read portfolio_images" ON storage.objects;
DROP POLICY IF EXISTS "User insert own portfolio_image" ON storage.objects;
DROP POLICY IF EXISTS "User update own portfolio_image" ON storage.objects;
DROP POLICY IF EXISTS "User delete own portfolio_image" ON storage.objects;

CREATE POLICY "Public read portfolio_images" ON storage.objects
    FOR SELECT USING (bucket_id = 'portfolio_images');

CREATE POLICY "User insert own portfolio_image" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'portfolio_images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User update own portfolio_image" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'portfolio_images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    ) WITH CHECK (
        bucket_id = 'portfolio_images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User delete own portfolio_image" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'portfolio_images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- ----------------------------------------------------------------------------
-- SECTION 4 : POLITIQUES RLS REVIEWS ET RECOMMANDATIONS
-- ----------------------------------------------------------------------------

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author create reviews" ON public.reviews;
CREATE POLICY "Author create reviews" ON public.reviews FOR INSERT 
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Public read recommendations" ON public.recommendations;
CREATE POLICY "Public read recommendations" ON public.recommendations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Recommender manage recommendations" ON public.recommendations;
CREATE POLICY "Recommender manage recommendations" ON public.recommendations FOR ALL 
    USING (auth.uid() = recommender_id)
    WITH CHECK (auth.uid() = recommender_id);

-- ----------------------------------------------------------------------------
-- SECTION 5 : LYANN TRUST & REPUTATION ENGINE (RPC AUTORITAIRE V3 SCHÉMA RÉEL)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_trust_and_reputation(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile record;
    v_skills text[] := '{}';
    v_completion_pct integer := 20;
    
    v_reviews_count integer := 0;
    v_avg_rating numeric := NULL;
    v_dist_5 integer := 0;
    v_dist_4 integer := 0;
    v_dist_3 integer := 0;
    v_dist_2 integer := 0;
    v_dist_1 integer := 0;
    
    v_helper_completed_missions integer := 0;
    v_helper_total_accepted_missions integer := 0;
    v_completion_rate numeric := NULL;
    
    v_repeat_users integer := 0;
    v_recommendations_count integer := 0;
    
    v_eligible_convs integer := 0;
    v_responded_convs integer := 0;
    v_response_rate numeric := NULL;
    v_median_response_time_seconds integer := NULL;
    
    v_top_categories text[] := '{}';
    v_services_count integer := 0;
    v_result jsonb;
BEGIN
    -- 1. Récupération du profil cible
    SELECT id, first_name, last_name, city, territory, bio, avatar_url, is_pro, is_verified, kyc_verified, created_at, intervention_zone, intervention_radius_km
    INTO v_profile
    FROM public.profiles
    WHERE id = p_target_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'PROFIL_INTROUVABLE');
    END IF;

    -- 2. Récupération des services/compétences depuis public.services (schéma réel)
    SELECT COALESCE(ARRAY_AGG(DISTINCT title), '{}') INTO v_skills
    FROM public.services
    WHERE owner_id = p_target_user_id;

    SELECT COUNT(*) INTO v_services_count 
    FROM public.services 
    WHERE owner_id = p_target_user_id;

    -- 3. Calcul Autoritaire Backend du Profil Completion Pct
    v_completion_pct := 20; -- Inscription
    IF v_profile.avatar_url IS NOT NULL AND length(v_profile.avatar_url) > 0 THEN v_completion_pct := v_completion_pct + 20; END IF;
    IF v_profile.city IS NOT NULL AND length(v_profile.city) > 0 THEN v_completion_pct := v_completion_pct + 20; END IF;
    IF v_profile.bio IS NOT NULL AND length(v_profile.bio) >= 15 THEN v_completion_pct := v_completion_pct + 20; END IF;
    IF (v_services_count > 0 OR ARRAY_LENGTH(v_skills, 1) > 0) THEN v_completion_pct := v_completion_pct + 20; END IF;

    -- 4. Métriques de Retours & Notes (public.reviews)
    SELECT 
        COUNT(*),
        ROUND(AVG(rating)::numeric, 1),
        COUNT(*) FILTER (WHERE rating = 5),
        COUNT(*) FILTER (WHERE rating = 4),
        COUNT(*) FILTER (WHERE rating = 3),
        COUNT(*) FILTER (WHERE rating = 2),
        COUNT(*) FILTER (WHERE rating = 1)
    INTO 
        v_reviews_count, v_avg_rating, v_dist_5, v_dist_4, v_dist_3, v_dist_2, v_dist_1
    FROM public.reviews
    WHERE target_id = p_target_user_id;

    -- 5. Coups de main réalisés (HELPER ONLY)
    SELECT COUNT(*)
    INTO v_helper_completed_missions
    FROM public.missions
    WHERE helper_id = p_target_user_id AND status = 'COMPLETED';

    SELECT COUNT(*)
    INTO v_helper_total_accepted_missions
    FROM public.missions
    WHERE helper_id = p_target_user_id
      AND status IN ('IN_PROGRESS', 'WORK_MARKED_COMPLETE', 'COMPLETED', 'DISPUTED', 'CANCELLED');

    -- Taux de complétion public Lyanneur (Seuil minimal >= 3 missions acceptées comme helper)
    IF v_helper_total_accepted_missions >= 3 THEN
        v_completion_rate := ROUND((v_helper_completed_missions::numeric / v_helper_total_accepted_missions::numeric) * 100);
    ELSE
        v_completion_rate := NULL; -- Zero Data
    END IF;

    -- 6. Habitués (HELPER ONLY) : Demandeurs distincts ayant réalisé >= 2 missions COMPLETED avec target user comme helper
    SELECT COUNT(*) INTO v_repeat_users
    FROM (
        SELECT requester_id
        FROM public.missions
        WHERE helper_id = p_target_user_id AND status = 'COMPLETED'
        GROUP BY requester_id
        HAVING COUNT(*) >= 2
    ) ru;

    SELECT COUNT(*) INTO v_recommendations_count
    FROM public.recommendations
    WHERE target_id = p_target_user_id;

    -- 7. Domaines les plus réalisés comme Lyanneur (Jointure requests/services sur le schéma réel)
    SELECT COALESCE(ARRAY_AGG(c.category), '{}') INTO v_top_categories
    FROM (
        SELECT req.category, COUNT(*) as cnt
        FROM public.missions m
        JOIN public.requests req ON m.related_request_id = req.id
        WHERE m.helper_id = p_target_user_id
          AND m.status = 'COMPLETED'
          AND req.category IS NOT NULL
        GROUP BY req.category
        ORDER BY cnt DESC
        LIMIT 3
    ) c;

    IF ARRAY_LENGTH(v_top_categories, 1) IS NULL THEN
        SELECT COALESCE(ARRAY_AGG(s.category), '{}') INTO v_top_categories
        FROM (
            SELECT category, COUNT(*) as cnt
            FROM public.services
            WHERE owner_id = p_target_user_id
              AND category IS NOT NULL
            GROUP BY category
            ORDER BY cnt DESC
            LIMIT 3
        ) s;
    END IF;

    -- 8. Taux de Réponse Autoritaire & Médiane de Temps de Réponse
    WITH incoming_convs AS (
        SELECT DISTINCT m.conversation_id, MIN(m.created_at) as first_incoming_at
        FROM public.messages m
        JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
        WHERE cp.user_id = p_target_user_id
          AND m.sender_id != p_target_user_id
        GROUP BY m.conversation_id
    ),
    responded_convs AS (
        SELECT ic.conversation_id, MIN(rm.created_at) as first_response_at, ic.first_incoming_at
        FROM incoming_convs ic
        JOIN public.messages rm ON rm.conversation_id = ic.conversation_id
        WHERE rm.sender_id = p_target_user_id
          AND rm.created_at > ic.first_incoming_at
        GROUP BY ic.conversation_id, ic.first_incoming_at
    )
    SELECT 
        (SELECT COUNT(*) FROM incoming_convs),
        (SELECT COUNT(*) FROM responded_convs)
    INTO v_eligible_convs, v_responded_convs;

    IF v_eligible_convs >= 3 THEN
        v_response_rate := ROUND((v_responded_convs::numeric / v_eligible_convs::numeric) * 100);
    ELSE
        v_response_rate := NULL; -- Zero Data
    END IF;

    IF v_responded_convs >= 3 THEN
        WITH incoming_convs AS (
            SELECT DISTINCT m.conversation_id, MIN(m.created_at) as first_incoming_at
            FROM public.messages m
            JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE cp.user_id = p_target_user_id
              AND m.sender_id != p_target_user_id
            GROUP BY m.conversation_id
        ),
        response_durations AS (
            SELECT EXTRACT(EPOCH FROM (MIN(rm.created_at) - ic.first_incoming_at)) as duration_seconds
            FROM incoming_convs ic
            JOIN public.messages rm ON rm.conversation_id = ic.conversation_id
            WHERE rm.sender_id = p_target_user_id
              AND rm.created_at > ic.first_incoming_at
            GROUP BY ic.conversation_id, ic.first_incoming_at
        )
        SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds))::integer
        INTO v_median_response_time_seconds
        FROM response_durations;
    ELSE
        v_median_response_time_seconds := NULL; -- Zero Data
    END IF;

    -- 9. Payload Public Strict Whitelisted
    v_result := jsonb_build_object(
        'user_id', v_profile.id,
        'first_name', v_profile.first_name,
        'last_name_initial', CASE WHEN length(v_profile.last_name) > 0 THEN UPPER(SUBSTRING(v_profile.last_name FROM 1 FOR 1)) || '.' ELSE '' END,
        'display_name', TRIM(v_profile.first_name || ' ' || CASE WHEN length(v_profile.last_name) > 0 THEN UPPER(SUBSTRING(v_profile.last_name FROM 1 FOR 1)) || '.' ELSE '' END),
        'city', COALESCE(v_profile.city, 'Guadeloupe'),
        'territory', COALESCE(v_profile.territory, 'Guadeloupe (971)'),
        'bio', COALESCE(v_profile.bio, ''),
        'avatar_url', v_profile.avatar_url,
        'is_verified', COALESCE(v_profile.is_verified, false),
        'is_pro_verified', (COALESCE(v_profile.is_pro, false) AND COALESCE(v_profile.kyc_verified, false)),
        'member_since', TO_CHAR(v_profile.created_at, 'FMMonth YYYY'),
        'skills', COALESCE(v_skills, '{}'),
        'intervention_zone', COALESCE(v_profile.intervention_zone, '{}'),
        'intervention_radius_km', COALESCE(v_profile.intervention_radius_km, 10),
        'completion_pct', v_completion_pct,
        
        -- TRUST & REPUTATION ENGINE METRICS (PUBLIC WHITELIST)
        'metrics', jsonb_build_object(
            'average_rating', v_avg_rating, -- NULL si 0 avis
            'reviews_count', v_reviews_count,
            'completed_missions', v_helper_completed_missions, -- HELPER ONLY
            'response_rate_percent', v_response_rate, -- NULL si < 3 convs éligibles
            'median_response_time_seconds', v_median_response_time_seconds, -- NULL si < 3 réponses
            'completion_rate_percent', v_completion_rate, -- NULL si < 3 missions acceptées
            'repeat_users_count', v_repeat_users, -- HELPER ONLY
            'recommendations_count', v_recommendations_count,
            'top_categories', COALESCE(v_top_categories, '{}'), -- HELPER ONLY
            'rating_distribution', jsonb_build_object(
                'star_5', v_dist_5,
                'star_4', v_dist_4,
                'star_3', v_dist_3,
                'star_2', v_dist_2,
                'star_1', v_dist_1
            )
        )
    );

    RETURN v_result;
END;
$$;

-- Permissions d'exécution
GRANT EXECUTE ON FUNCTION public.get_user_trust_and_reputation(uuid) TO authenticated, anon;

COMMIT;
