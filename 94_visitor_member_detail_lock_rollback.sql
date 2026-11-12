-- Rollback of migration 94 (Staging only, tdktfbtqceldlaeqjtow): restores the previous visitor reads (reviews, portfolio, bio).
BEGIN;

DROP POLICY IF EXISTS "Members read reviews" ON public.reviews;
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT USING (true);
GRANT SELECT ON public.reviews TO anon;

DROP POLICY IF EXISTS "Members read user_portfolio_items" ON public.user_portfolio_items;
CREATE POLICY "Public read user_portfolio_items" ON public.user_portfolio_items
    FOR SELECT USING (is_public = true OR auth.uid() = user_id);
GRANT SELECT ON public.user_portfolio_items TO anon;

-- Table-level grant again (it supersedes the column list granted by 94).
GRANT SELECT ON public.public_profiles TO anon;

COMMIT;
