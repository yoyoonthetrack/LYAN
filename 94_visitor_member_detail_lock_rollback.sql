-- Rollback of migration 94 (v2) — Staging only (tdktfbtqceldlaeqjtow). Restores the exact definitions captured during the 3.2C-3 audit.
-- The rehearsal (scripts/rehearse-migration-94.js) proves that policies, ACLs, the view definition and the data are identical after apply + rollback.
BEGIN;

-- reviews / portfolio / recommendations: public read policies again.
DROP POLICY IF EXISTS "Members read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Members read user_portfolio_items" ON public.user_portfolio_items;
DROP POLICY IF EXISTS "Public read user_portfolio_items" ON public.user_portfolio_items;
CREATE POLICY "Public read user_portfolio_items" ON public.user_portfolio_items
    FOR SELECT USING (is_public = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Members read recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Public read recommendations" ON public.recommendations;
CREATE POLICY "Public read recommendations" ON public.recommendations FOR SELECT USING (true);

-- public_profiles: previous definition (bio readable by everyone).
CREATE OR REPLACE VIEW public.public_profiles AS
 SELECT p.id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.territory,
    p.city,
    p.bio,
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

-- Detail RPCs: executable by everyone again (PUBLIC + anon + authenticated + service_role, as captured).
GRANT EXECUTE ON FUNCTION public.get_user_trust_and_reputation(uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profile_pro_status(uuid) TO PUBLIC, anon, authenticated, service_role;

-- Storage: previous public read policies.
DROP POLICY IF EXISTS "Members read portfolio_images" ON storage.objects;
DROP POLICY IF EXISTS "Public read portfolio_images" ON storage.objects;
CREATE POLICY "Public read portfolio_images" ON storage.objects FOR SELECT USING (bucket_id = 'portfolio_images');
DROP POLICY IF EXISTS "Members read request-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read request-photos" ON storage.objects;
CREATE POLICY "Public read request-photos" ON storage.objects FOR SELECT USING (bucket_id = 'request-photos');

COMMIT;
