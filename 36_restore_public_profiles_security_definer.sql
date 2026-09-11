-- ============================================================================
-- LYANN — Migration 36: restore public_profiles as a deliberate safe public view
--
-- Migration 35 temporarily set `public.public_profiles` to SECURITY INVOKER.
-- In production the underlying `profiles` table is owner/admin-only under RLS,
-- so SECURITY INVOKER makes the public directory unusable and can surface
-- permission errors through RLS helper functions.
--
-- `public_profiles` is intentionally a narrow, whitelisted projection and does
-- not expose email, phone, exact address, Stripe/KYC/internal risk fields.
-- Restore the default SECURITY DEFINER view behavior and keep explicit read
-- access on this safe projection only.
-- ============================================================================

BEGIN;

ALTER VIEW public.public_profiles RESET (security_invoker);

GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

COMMIT;
