-- ============================================================================
-- LYANN DOM — 06_MISSIONS_RLS_SELECT.SQL
-- Migration autonome et idempotente pour la politique RLS SELECT de public.missions
-- Autorise la lecture exclusivement pour le demandeur (requester_id) et le Lyanneur (helper_id)
-- ============================================================================

-- 1. Activation RLS sur public.missions
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- 2. Nettoyage préventif des anciennes politiques SELECT sur public.missions
DROP POLICY IF EXISTS "Participants can view missions" ON public.missions;
DROP POLICY IF EXISTS "Involved parties can view missions" ON public.missions;
DROP POLICY IF EXISTS "Users can view own missions" ON public.missions;

-- 3. Création de la politique RLS SELECT stricte pour les participants de la mission
CREATE POLICY "Participants can view missions"
ON public.missions FOR SELECT
USING (
    auth.uid() = requester_id OR auth.uid() = helper_id
);

-- 4. Permissions de table (GRANT SELECT à authenticated, ALL à service_role)
REVOKE ALL ON public.missions FROM PUBLIC;
GRANT SELECT ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
