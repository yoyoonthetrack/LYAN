-- LYANN Migration 94 — visitors: lock the member-only detail reads at the database level (reviews, portfolio, biography).
-- PREPARED FOR STAGING ONLY (tdktfbtqceldlaeqjtow). NOT APPLIED: it changes RLS / grants and needs its own authorization. Never Production.
-- Rollback: 94_visitor_member_detail_lock_rollback.sql.
--
-- Why: since 3.2C-2 a Lyanneur profile and an annonce detail require an account. The gate in the web app (visitor-gate.js + the checks at the top of
-- openPublicMemberProfile / openLyannDetailModal) is a presentation layer: a visitor could still call the REST API directly. A read-only audit of
-- Staging (anon key, GET only) showed that anon can read:
--   reviews            -> comment, author_id, mission_id of every review   (policy "Public read reviews" USING (true))
--   user_portfolio_items -> every public portfolio item                    (policy "Public read user_portfolio_items")
--   public_profiles    -> bio (the narrow view keeps it for everyone)
-- What stays public on purpose: the public_profiles columns used by search, filters, cards and the map (name, avatar, territory, city, badges, rating
-- aggregate), services titles, and /v1/explorer/requests (server projection, territory or exact commune only, no author id).
-- The review aggregate (average_rating, reviews_count) keeps working: the view is SECURITY DEFINER and counts reviews itself.
--
-- BEFORE applying: ship the web build that reads visitor lists with explicit columns (explorer-repository.js, PUBLIC_LIST_COLUMNS). A bare select('*')
-- on public_profiles by anon would fail once bio is not grantable.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.reviews') IS NULL OR to_regclass('public.user_portfolio_items') IS NULL OR to_regclass('public.public_profiles') IS NULL THEN
        RAISE EXCEPTION 'migration 94: reviews, user_portfolio_items or public_profiles missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'public_profiles' AND column_name = 'bio') THEN
        RAISE EXCEPTION 'migration 94: public_profiles.bio not found (unexpected view definition)';
    END IF;
END
$pre$;

-- 1. reviews: members only. The author and mission identifiers are not public data.
DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Members read reviews" ON public.reviews;
CREATE POLICY "Members read reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.reviews FROM anon;

-- 2. portfolio: members only (a member still reads their own private items through the existing owner policy).
DROP POLICY IF EXISTS "Public read user_portfolio_items" ON public.user_portfolio_items;
DROP POLICY IF EXISTS "Members read user_portfolio_items" ON public.user_portfolio_items;
CREATE POLICY "Members read user_portfolio_items" ON public.user_portfolio_items
    FOR SELECT TO authenticated USING (is_public = true OR auth.uid() = user_id);
REVOKE SELECT ON public.user_portfolio_items FROM anon;

-- 3. public_profiles: visitors keep every column except bio (column-level grant, computed from the live view).
DO $cols$
DECLARE
    v_cols text;
BEGIN
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'public_profiles' AND column_name <> 'bio';
    EXECUTE 'REVOKE SELECT ON public.public_profiles FROM anon';
    EXECUTE format('GRANT SELECT (%s) ON public.public_profiles TO anon', v_cols);
END
$cols$;

-- 4. Post-conditions: anon no longer reads the three detail sources; members and service_role are unchanged.
DO $post$
BEGIN
    IF has_table_privilege('anon', 'public.reviews', 'SELECT') OR has_table_privilege('anon', 'public.user_portfolio_items', 'SELECT') THEN
        RAISE EXCEPTION 'migration 94: anon still reads reviews or portfolio';
    END IF;
    IF has_column_privilege('anon', 'public.public_profiles', 'bio', 'SELECT') THEN
        RAISE EXCEPTION 'migration 94: anon still reads public_profiles.bio';
    END IF;
    IF NOT has_column_privilege('anon', 'public.public_profiles', 'first_name', 'SELECT')
       OR NOT has_column_privilege('anon', 'public.public_profiles', 'average_rating', 'SELECT') THEN
        RAISE EXCEPTION 'migration 94: anon lost the public listing columns';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.reviews', 'SELECT') OR NOT has_table_privilege('authenticated', 'public.public_profiles', 'SELECT') THEN
        RAISE EXCEPTION 'migration 94: authenticated lost a read';
    END IF;
END
$post$;

COMMIT;
