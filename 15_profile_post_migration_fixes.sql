-- ============================================================================
-- LYANN DOM — 15_PROFILE_POST_MIGRATION_FIXES.SQL
-- STEP 8: SENSITIVE PROFILE COLUMNS PROTECTION TRIGGER
-- ============================================================================
-- IMPORTANT: CE SCRIPT NE DOIT PAS ÊTRE EXÉCUTÉ AUTOMATIQUEMENT PAR L'AGENT.
-- L'OWNER DOIT LE VALIDER ET L'EXÉCUTER MANUELLEMENT DANS LA CONSOLE SUPABASE.
-- ============================================================================

BEGIN;

-- Trigger de protection contre l'altération des champs sensibles du profil (Rôle, Stripe ID, Verification)
CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Empêcher les utilisateurs non-admin d'altérer les champs d'administration et financiers
    IF NOT public.is_current_user_admin() THEN
        NEW.role := OLD.role;
        NEW.account_type := OLD.account_type;
        NEW.stripe_account_id := OLD.stripe_account_id;
        NEW.is_agent := OLD.is_agent;
        NEW.kyc_verified := OLD.kyc_verified;
        NEW.is_verified := OLD.is_verified;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sensitive_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_sensitive_profile_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_sensitive_profile_columns();

COMMIT;
