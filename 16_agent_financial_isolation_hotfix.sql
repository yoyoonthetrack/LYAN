-- ============================================================================
-- LYANN DOM — 16_AGENT_FINANCIAL_ISOLATION_HOTFIX.SQL
-- STEP 9: AGENT FINANCIAL & GOVERNANCE ISOLATION HOTFIX (REAL COLUMNS ONLY)
-- ============================================================================
-- IMPORTANT: CE SCRIPT NE DOIT PAS ÊTRE EXÉCUTÉ AUTOMATIQUEMENT PAR L'AGENT.
-- L'OWNER DOIT LE VALIDER ET L'EXÉCUTER MANUELLEMENT DANS LA CONSOLE SUPABASE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 1 : CORRECTION DE LA FONCTION DE GARDE-FOU D'ISOLATION AGENT
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_agent_financial_isolation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_agent boolean := false;
BEGIN
    -- Détermination robuste du statut Agent : soit drapeau profil is_agent = true,
    -- soit association directe existante dans public.lyann_agents
    v_is_agent := (NEW.is_agent IS TRUE) OR EXISTS (
        SELECT 1 FROM public.lyann_agents WHERE linked_profile_id = NEW.id
    );

    IF v_is_agent THEN
        -- Isolation Financière : Un Agent LYANN ne peut pas posséder d'identifiant Stripe réel
        IF NEW.stripe_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'ISOLATION FINANCIÈRE VIOLÉE : Un Agent LYANN (non humain) ne peut pas posséder d identifiant Stripe réel.'
                USING ERRCODE = '42501';
        END IF;
        
        -- Isolation Gouvernance : Un Agent LYANN ne peut pas être membre de l'équipe d'administration RBAC
        IF EXISTS (SELECT 1 FROM public.admin_members WHERE user_id = NEW.id) THEN
            RAISE EXCEPTION 'ISOLATION GOUVERNANCE VIOLÉE : Un Agent LYANN ne peut pas être membre de l équipe d administration.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 2 : INSTALLATION IDEMPOTENTE DU TRIGGER SUR PUBLIC.PROFILES
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_check_agent_financial_isolation ON public.profiles;

CREATE TRIGGER trg_check_agent_financial_isolation
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_agent_financial_isolation();

COMMIT;
