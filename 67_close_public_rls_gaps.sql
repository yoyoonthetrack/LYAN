-- Staging security gap: nine public tables were readable and writable
-- by anon and authenticated because row level security was off and
-- the default grants included every privilege, including TRUNCATE.
-- TRUNCATE ignores row level security, so the extra grants are revoked.
-- The API uses the service role, which bypasses these policies.
-- lyann_support_user_id() is security definer and keeps working.

REVOKE ALL ON TABLE public.categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions_plans FROM anon, authenticated;
REVOKE ALL ON TABLE public.internal_taxonomy_tags FROM anon, authenticated;
REVOKE ALL ON TABLE public.lyann_runtime_config FROM anon, authenticated;
REVOKE ALL ON TABLE public.projects FROM anon, authenticated;
REVOKE ALL ON TABLE public.project_images FROM anon, authenticated;
REVOKE ALL ON TABLE public.quote_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.insurance_claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_tickets FROM anon, authenticated;

GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT SELECT ON TABLE public.subscriptions_plans TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_images TO authenticated;
GRANT SELECT ON TABLE public.quote_versions TO authenticated;
GRANT SELECT ON TABLE public.insurance_claims TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_tickets TO authenticated;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_taxonomy_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS plans_public_read ON public.subscriptions_plans;
CREATE POLICY plans_public_read ON public.subscriptions_plans
    FOR SELECT TO anon, authenticated
    USING (active IS DISTINCT FROM false);

DROP POLICY IF EXISTS projects_owner_read ON public.projects;
CREATE POLICY projects_owner_read ON public.projects
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS projects_owner_insert ON public.projects;
CREATE POLICY projects_owner_insert ON public.projects
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS projects_owner_update ON public.projects;
CREATE POLICY projects_owner_update ON public.projects
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS projects_owner_delete ON public.projects;
CREATE POLICY projects_owner_delete ON public.projects
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS project_images_owner_read ON public.project_images;
CREATE POLICY project_images_owner_read ON public.project_images
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_images.project_id AND p.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS project_images_owner_insert ON public.project_images;
CREATE POLICY project_images_owner_insert ON public.project_images
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_images.project_id AND p.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS project_images_owner_update ON public.project_images;
CREATE POLICY project_images_owner_update ON public.project_images
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_images.project_id AND p.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_images.project_id AND p.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS project_images_owner_delete ON public.project_images;
CREATE POLICY project_images_owner_delete ON public.project_images
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_images.project_id AND p.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS quote_versions_party_read ON public.quote_versions;
CREATE POLICY quote_versions_party_read ON public.quote_versions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quotes q
        JOIN public.missions m ON m.id = q.mission_id
        WHERE q.id = quote_versions.quote_id
          AND (m.requester_id = auth.uid() OR m.helper_id = auth.uid())
    ));

DROP POLICY IF EXISTS insurance_claims_claimant_read ON public.insurance_claims;
CREATE POLICY insurance_claims_claimant_read ON public.insurance_claims
    FOR SELECT TO authenticated
    USING (claimant_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_owner_read ON public.support_tickets;
CREATE POLICY support_tickets_owner_read ON public.support_tickets
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_owner_insert ON public.support_tickets;
CREATE POLICY support_tickets_owner_insert ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
