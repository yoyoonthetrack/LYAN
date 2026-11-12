-- LYANN Migration 94 (v2) — visitors: lock the member-only detail reads at the database level.
-- PREPARED FOR STAGING ONLY (tdktfbtqceldlaeqjtow). NOT APPLIED: it changes RLS / grants and needs its own authorization. Never Production.
-- Rollback: 94_visitor_member_detail_lock_rollback.sql (restores the exact previous definitions).
-- Rehearsal: scripts/rehearse-migration-94.js runs this file + the rollback in ONE transaction that is always rolled back.
--
-- Why: since 3.2C-2 a Lyanneur profile and an annonce detail require an account. The gate in the web app (visitor-gate.js + the checks at the top
-- of openPublicMemberProfile / openLyannDetailModal) is a presentation layer: a visitor could still call the REST / RPC / Storage APIs directly.
-- A read-only audit of Staging (3.2C-3) showed that anon can read:
--   reviews                 -> comment, author_id, mission_id of every review      (policy "Public read reviews" USING (true))
--   user_portfolio_items    -> every public portfolio item                          (policy "Public read user_portfolio_items")
--   recommendations         -> who recommends whom                                  (policy "Public read recommendations" USING (true))
--   public_profiles.bio     -> the narrow view keeps the biography for everyone
--   get_user_trust_and_reputation(uuid)  SECURITY DEFINER, anon-executable -> returns bio, skills, intervention zone, response metrics
--   get_public_profile_pro_status(uuid)  SECURITY DEFINER, anon-executable -> business name, website, public address
--   storage.objects SELECT on portfolio_images and request-photos for role public -> anon could LIST every portfolio and annonce photo
-- What stays public on purpose: the public_profiles columns used by search, filters, cards and the map (name, avatar, territory, city, badges,
-- rating aggregate), services (offer catalogue used by search: see the residual note below), lyann_public_badges, taxonomy, avatars, and
-- /v1/explorer/requests (server projection: territory or exact commune only, no author id, 120-character excerpt).
--
-- Backward compatibility (older web builds and the TestFlight 15/16 apps read visitor lists with select('*')):
--   * public_profiles keeps every column. For the role anon only, `bio` is returned as NULL, so select('*') and filters keep working and no
--     biography can be read or searched (an ilike on bio matches nothing). A column-level REVOKE was rejected because it breaks select('*').
--   * reviews / portfolio / recommendations: the table privileges are kept. Visitors receive ZERO rows with HTTP 200 instead of an error, so an
--     older client shows an empty list instead of a broken page. The review aggregate (average_rating, reviews_count) keeps working: the
--     view is SECURITY DEFINER (owner postgres) and counts the reviews itself.
--   * public media URLs (/storage/v1/object/public/...) keep working for every bucket: only the LIST / metadata access is restricted.
--
-- Residual (not changed here, product decision): services.description / price columns remain readable by anon because visitor search matches
-- them and older clients read services with select('*'). They are the offer catalogue, not the member's private detail.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.reviews') IS NULL OR to_regclass('public.user_portfolio_items') IS NULL
       OR to_regclass('public.recommendations') IS NULL OR to_regclass('public.public_profiles') IS NULL THEN
        RAISE EXCEPTION 'migration 94: reviews, user_portfolio_items, recommendations or public_profiles missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'public_profiles'
                   AND column_name = 'bio' AND data_type = 'text') THEN
        RAISE EXCEPTION 'migration 94: public_profiles.bio (text) not found (unexpected view definition)';
    END IF;
    IF position('p.bio,' in pg_get_viewdef('public.public_profiles'::regclass, true)) = 0 THEN
        RAISE EXCEPTION 'migration 94: public_profiles definition changed since the audit (expected "p.bio,"); review before applying';
    END IF;
END
$pre$;

-- 1. reviews: members only. The author and mission identifiers are not public data.
DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Members read reviews" ON public.reviews;
CREATE POLICY "Members read reviews" ON public.reviews FOR SELECT TO authenticated USING (true);

-- 2. portfolio: members only (a member still reads their own private items through the existing owner policy).
DROP POLICY IF EXISTS "Public read user_portfolio_items" ON public.user_portfolio_items;
DROP POLICY IF EXISTS "Members read user_portfolio_items" ON public.user_portfolio_items;
CREATE POLICY "Members read user_portfolio_items" ON public.user_portfolio_items
    FOR SELECT TO authenticated USING (is_public = true OR auth.uid() = user_id);

-- 3. recommendations: members only (the recommender can still manage their own rows through "Recommender manage recommendations").
DROP POLICY IF EXISTS "Public read recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Members read recommendations" ON public.recommendations;
CREATE POLICY "Members read recommendations" ON public.recommendations FOR SELECT TO authenticated USING (true);

-- 4. public_profiles: same columns, same order, same types; the biography is withheld from the role anon only.
--    current_user is the invoking role (a view only changes the privilege check, not current_user). No JWT at all still means anon.
CREATE OR REPLACE VIEW public.public_profiles AS
 SELECT p.id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.territory,
    p.city,
    CASE WHEN current_user = 'anon' THEN NULL::text ELSE p.bio END AS bio,
    p.is_pro,
    p.professional_status,
    p.created_at,
    COALESCE(p.is_verified, false) AS is_verified,
    COALESCE(p.is_pro, false) AND COALESCE(p.kyc_verified, false) AS is_pro_verified,
    r.average_rating,
    COALESCE(r.reviews_count, 0::bigint) AS reviews_count
   FROM profiles p
     LEFT JOIN LATERAL ( SELECT round(avg(reviews.rating), 1) AS average_rating,
            count(*) AS reviews_count
           FROM reviews
          WHERE reviews.target_id = p.id AND reviews.rating IS NOT NULL) r ON true;

-- 5. SECURITY DEFINER detail RPCs: members only (they bypass RLS and return the biography / professional details).
--    No client code calls get_public_profile_pro_status; get_user_trust_and_reputation is only called by the profile (gated).
REVOKE EXECUTE ON FUNCTION public.get_user_trust_and_reputation(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_trust_and_reputation(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_public_profile_pro_status(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_public_profile_pro_status(uuid) TO authenticated, service_role;

-- 6. Storage: stop anonymous listing of portfolio and annonce photos. Public URLs of public buckets are NOT affected.
DROP POLICY IF EXISTS "Public read portfolio_images" ON storage.objects;
DROP POLICY IF EXISTS "Members read portfolio_images" ON storage.objects;
CREATE POLICY "Members read portfolio_images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'portfolio_images');
DROP POLICY IF EXISTS "Public read request-photos" ON storage.objects;
DROP POLICY IF EXISTS "Members read request-photos" ON storage.objects;
CREATE POLICY "Members read request-photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'request-photos');

-- 7. Post-conditions.
DO $post$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'Members read reviews' AND roles = '{authenticated}')
       OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND cmd IN ('SELECT', 'ALL') AND roles::text LIKE '%public%' AND policyname = 'Public read reviews') THEN
        RAISE EXCEPTION 'migration 94: reviews policy not in the expected state';
    END IF;
    IF has_function_privilege('anon', 'public.get_user_trust_and_reputation(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_public_profile_pro_status(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'migration 94: anon can still execute a detail RPC';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_user_trust_and_reputation(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.get_user_trust_and_reputation(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'migration 94: members lost the profile reputation RPC';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.reviews', 'SELECT') OR NOT has_table_privilege('authenticated', 'public.public_profiles', 'SELECT')
       OR NOT has_table_privilege('anon', 'public.public_profiles', 'SELECT') THEN
        RAISE EXCEPTION 'migration 94: a table privilege needed by the public listing is missing';
    END IF;
END
$post$;

COMMIT;
