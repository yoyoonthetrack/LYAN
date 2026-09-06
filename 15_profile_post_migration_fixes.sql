-- ============================================================================
-- LYANN DOM — 15_PROFILE_POST_MIGRATION_FIXES.SQL (V2 HARDENED)
-- STEP 8: EXPLICIT TAMPER REJECTION TRIGGER ON PUBLIC.PROFILES
-- ============================================================================
-- IMPORTANT: CE SCRIPT NE DOIT PAS ÊTRE EXÉCUTÉ AUTOMATIQUEMENT PAR L'AGENT.
-- L'OWNER DOIT LE VALIDER ET L'EXÉCUTER MANUELLEMENT DANS LA CONSOLE SUPABASE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 1 : FONCTION TRIGGER DE REFUS EXPLICIT DE TAMPERING (BEFORE UPDATE)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Permettre uniquement au service_role et aux Administrateurs RBAC de modifier les champs sensibles
    IF auth.role() != 'service_role' AND NOT public.is_current_user_admin() THEN
        -- Audit exhaustif des colonnes protégées (Rôle, Type de compte, Stripe, Statut Pro, KYC, Agent)
        IF NEW.role IS DISTINCT FROM OLD.role OR
           NEW.account_type IS DISTINCT FROM OLD.account_type OR
           NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id OR
           NEW.stripe_account_status IS DISTINCT FROM OLD.stripe_account_status OR
           NEW.is_pro IS DISTINCT FROM OLD.is_pro OR
           NEW.kyc_verified IS DISTINCT FROM OLD.kyc_verified OR
           NEW.is_verified IS DISTINCT FROM OLD.is_verified OR
           NEW.is_agent IS DISTINCT FROM OLD.is_agent OR
           NEW.professional_status IS DISTINCT FROM OLD.professional_status THEN
            RAISE EXCEPTION 'Modification of protected profile fields is not allowed' USING ERRCODE = '42501';
        END IF;

        -- Protection des colonnes immuables (id, created_at)
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Modification of immutable profile fields is not allowed' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 2 : FONCTION TRIGGER DE PROTECTION INITIALISATION (BEFORE INSERT)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Permettre uniquement au service_role et aux Administrateurs RBAC d'initialiser des valeurs privilègiées
    IF auth.role() != 'service_role' AND NOT public.is_current_user_admin() THEN
        IF (NEW.role IS NOT NULL AND NEW.role != 'USER') OR
           (NEW.account_type IS NOT NULL AND NEW.account_type != 'real') OR
           (NEW.is_pro IS TRUE) OR
           (NEW.kyc_verified IS TRUE) OR
           (NEW.is_verified IS TRUE) OR
           (NEW.is_agent IS TRUE) OR
           (NEW.stripe_account_id IS NOT NULL) THEN
            RAISE EXCEPTION 'Initialization of privileged profile fields is not allowed' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 3 : INSTALLATION IDEMPOTENTE DES TRIGGERS
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_protect_sensitive_profile_columns_update ON public.profiles;
CREATE TRIGGER trg_protect_sensitive_profile_columns_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_sensitive_profile_columns_update();

DROP TRIGGER IF EXISTS trg_protect_sensitive_profile_columns_insert ON public.profiles;
CREATE TRIGGER trg_protect_sensitive_profile_columns_insert
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_sensitive_profile_columns_insert();

COMMIT;
