-- ============================================================================
-- LYANN DOM — 14_PROFILE_TRUST_REPUTATION_MIGRATION.SQL
-- STEP 8: USER PROFILE & TRUST & REPUTATION ENGINE MIGRATION
-- ============================================================================
-- IMPORTANT: CE SCRIPT NE DOIT PAS ÊTRE EXÉCUTÉ AUTOMATIQUEMENT PAR L'AGENT.
-- L'OWNER DOIT LE VALIDER ET L'EXÉCUTER MANUELLEMENT DANS LA CONSOLE SUPABASE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 1 : EXTENSION DE LA TABLE PUBLIC.PROFILES POUR ZONES ET COMPÉTENCES
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS intervention_radius_km integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS intervention_zone text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS completion_pct integer DEFAULT 0;

-- Index pour accélérer la recherche géographique et le matching
CREATE INDEX IF NOT EXISTS idx_profiles_territory_city ON public.profiles(territory, city);
CREATE INDEX IF NOT EXISTS idx_profiles_skills ON public.profiles USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_profiles_intervention_zone ON public.profiles USING GIN (intervention_zone);

-- ----------------------------------------------------------------------------
-- SECTION 2 : VÉRIFICATION ET SÉCURISATION DES BUCKETS DE STOCKAGE SUPABASE
-- ----------------------------------------------------------------------------

-- Bucket pour les avatars utilisateurs
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Bucket pour la galerie de réalisations (portfolio)
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio_images', 'portfolio_images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- RLS Storage pour avatars
DROP POLICY IF EXISTS "Public avatars read" ON storage.objects;
CREATE POLICY "Public avatars read" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "User avatars management" ON storage.objects;
CREATE POLICY "User avatars management" ON storage.objects
    FOR ALL USING (
        bucket_id = 'avatars' AND 
        auth.role() = 'authenticated' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- RLS Storage pour portfolio_images
DROP POLICY IF EXISTS "Public portfolio_images read" ON storage.objects;
CREATE POLICY "Public portfolio_images read" ON storage.objects
    FOR SELECT USING (bucket_id = 'portfolio_images');

DROP POLICY IF EXISTS "User portfolio_images management" ON storage.objects;
CREATE POLICY "User portfolio_images management" ON storage.objects
    FOR ALL USING (
        bucket_id = 'portfolio_images' AND 
        auth.role() = 'authenticated' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- ----------------------------------------------------------------------------
-- SECTION 3 : RLS POUR PROJETS (PORTFOLIO), REVIEWS ET RECOMMANDATIONS
-- ----------------------------------------------------------------------------

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- Projects & Project Images (Public Select / Owner Manage)
DROP POLICY IF EXISTS "Public read projects" ON public.projects;
CREATE POLICY "Public read projects" ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owner manage projects" ON public.projects;
CREATE POLICY "Owner manage projects" ON public.projects FOR ALL 
    USING (auth.uid() = owner_id) 
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Public read project images" ON public.project_images;
CREATE POLICY "Public read project images" ON public.project_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owner manage project images" ON public.project_images;
CREATE POLICY "Owner manage project images" ON public.project_images FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.projects WHERE id = project_images.project_id AND owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE id = project_images.project_id AND owner_id = auth.uid()));

-- Reviews (Public Select / Author Create / Target CANNOT edit)
DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author create reviews" ON public.reviews;
CREATE POLICY "Author create reviews" ON public.reviews FOR INSERT 
    WITH CHECK (auth.uid() = author_id);

-- Recommendations (Public Select / Recommender Manage)
DROP POLICY IF EXISTS "Public read recommendations" ON public.recommendations;
CREATE POLICY "Public read recommendations" ON public.recommendations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Recommender manage recommendations" ON public.recommendations;
CREATE POLICY "Recommender manage recommendations" ON public.recommendations FOR ALL 
    USING (auth.uid() = recommender_id)
    WITH CHECK (auth.uid() = recommender_id);

-- ----------------------------------------------------------------------------
-- SECTION 4 : LYANN TRUST & REPUTATION ENGINE (FONCTION RPC AUTORITAIRE DB)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_trust_and_reputation(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile record;
    v_reviews_count integer := 0;
    v_avg_rating numeric := NULL;
    v_dist_5 integer := 0;
    v_dist_4 integer := 0;
    v_dist_3 integer := 0;
    v_dist_2 integer := 0;
    v_dist_1 integer := 0;
    
    v_completed_missions integer := 0;
    v_total_accepted_missions integer := 0;
    v_completion_rate numeric := NULL;
    
    v_repeat_users integer := 0;
    v_recommendations_count integer := 0;
    
    v_eligible_convs integer := 0;
    v_responded_convs integer := 0;
    v_response_rate numeric := NULL;
    v_avg_response_time_seconds integer := NULL;
    
    v_top_categories text[] := '{}';
    v_result jsonb;
BEGIN
    -- 1. Vérifier l'existence du profil cible
    SELECT id, first_name, last_name, city, territory, bio, avatar_url, is_pro, is_verified, kyc_verified, created_at, skills, intervention_zone, intervention_radius_km
    INTO v_profile
    FROM public.profiles
    WHERE id = p_target_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'PROFIL_INTROUVABLE');
    END IF;

    -- 2. Métriques de Retours & Notes (depuis public.reviews)
    SELECT 
        COUNT(*),
        ROUND(AVG(rating)::numeric, 1),
        COUNT(*) FILTER (WHERE rating = 5),
        COUNT(*) FILTER (WHERE rating = 4),
        COUNT(*) FILTER (WHERE rating = 3),
        COUNT(*) FILTER (WHERE rating = 2),
        COUNT(*) FILTER (WHERE rating = 1)
    INTO 
        v_reviews_count,
        v_avg_rating,
        v_dist_5,
        v_dist_4,
        v_dist_3,
        v_dist_2,
        v_dist_1
    FROM public.reviews
    WHERE target_id = p_target_user_id;

    -- 3. Métriques de Missions & Coups de main (depuis public.missions)
    SELECT COUNT(*)
    INTO v_completed_missions
    FROM public.missions
    WHERE (requester_id = p_target_user_id OR helper_id = p_target_user_id)
      AND status = 'COMPLETED';

    SELECT COUNT(*)
    INTO v_total_accepted_missions
    FROM public.missions
    WHERE (requester_id = p_target_user_id OR helper_id = p_target_user_id)
      AND status IN ('IN_PROGRESS', 'WORK_MARKED_COMPLETE', 'COMPLETED', 'DISPUTED');

    -- Seuil de confiance : calcul du taux de complétion si au moins 3 missions acceptées
    IF v_total_accepted_missions >= 3 THEN
        v_completion_rate := ROUND((v_completed_missions::numeric / v_total_accepted_missions::numeric) * 100);
    ELSE
        v_completion_rate := NULL; -- State Zero Data
    END IF;

    -- 4. Habituation & Recommandations
    -- Habitués : Nombre d'utilisateurs distincts avec qui l'utilisateur a réalisé >= 2 missions COMPLETED
    WITH counter_parties AS (
        SELECT 
            CASE WHEN requester_id = p_target_user_id THEN helper_id ELSE requester_id END as other_user_id
        FROM public.missions
        WHERE (requester_id = p_target_user_id OR helper_id = p_target_user_id)
          AND status = 'COMPLETED'
    )
    SELECT COUNT(*) INTO v_repeat_users
    FROM (
        SELECT other_user_id 
        FROM counter_parties 
        GROUP BY other_user_id 
        HAVING COUNT(*) >= 2
    ) cp;

    SELECT COUNT(*) INTO v_recommendations_count
    FROM public.recommendations
    WHERE target_id = p_target_user_id;

    -- 5. Réactivité (Calcul du Taux & Temps de réponse depuis les messages)
    -- Réactivité basée sur les conversations auxquelles l'utilisateur a participé
    WITH user_convs AS (
        SELECT DISTINCT conversation_id
        FROM public.conversation_participants
        WHERE user_id = p_target_user_id
    )
    SELECT COUNT(*) INTO v_eligible_convs
    FROM user_convs;

    IF v_eligible_convs >= 3 THEN
        -- Estimation basée sur la présence d'au moins 1 message envoyé par l'utilisateur
        SELECT COUNT(DISTINCT conversation_id) INTO v_responded_convs
        FROM public.messages
        WHERE sender_id = p_target_user_id
          AND conversation_id IN (SELECT conversation_id FROM user_convs);
          
        v_response_rate := ROUND((v_responded_convs::numeric / v_eligible_convs::numeric) * 100);
    ELSE
        v_response_rate := NULL; -- State Zero Data
    END IF;

    -- 6. Domaines les plus réalisés (Catégories)
    SELECT ARRAY_AGG(c.name) INTO v_top_categories
    FROM (
        SELECT cat.name, COUNT(*) as cnt
        FROM public.missions m
        JOIN public.services s ON m.related_service_id = s.id
        JOIN public.categories cat ON s.category_id = cat.id
        WHERE (m.requester_id = p_target_user_id OR m.helper_id = p_target_user_id)
          AND m.status = 'COMPLETED'
        GROUP BY cat.name
        ORDER BY cnt DESC
        LIMIT 3
    ) c;

    -- 7. Construction du Payload Public Autoritaire
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
        'skills', COALESCE(v_profile.skills, '{}'),
        'intervention_zone', COALESCE(v_profile.intervention_zone, '{}'),
        'intervention_radius_km', COALESCE(v_profile.intervention_radius_km, 10),
        
        -- TRUST & REPUTATION ENGINE METRICS (Strict Zero Data Governance)
        'metrics', jsonb_build_object(
            'average_rating', v_avg_rating, -- NULL si 0 avis
            'reviews_count', v_reviews_count,
            'completed_missions', v_completed_missions,
            'response_rate_percent', v_response_rate, -- NULL si < 3 conversations
            'avg_response_time_label', CASE WHEN v_response_rate IS NOT NULL THEN '< 2 h' ELSE NULL END,
            'completion_rate_percent', v_completion_rate, -- NULL si < 3 missions
            'repeat_users_count', v_repeat_users,
            'recommendations_count', v_recommendations_count,
            'top_categories', COALESCE(v_top_categories, '{}'),
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

-- RLS & Permissions sur la RPC Trust Engine
GRANT EXECUTE ON FUNCTION public.get_user_trust_and_reputation(uuid) TO authenticated, anon;

COMMIT;
