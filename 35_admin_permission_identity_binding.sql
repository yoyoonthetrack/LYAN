-- LYANN Migration 35 — bind RBAC permission helpers to caller identity.
CREATE OR REPLACE FUNCTION public.has_admin_permission(p_user_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_is_service_role boolean := (COALESCE(auth.role(), current_setting('request.jwt.claim.role', true)) = 'service_role');
    v_is_super boolean;
    v_has_perm boolean;
BEGIN
    IF p_user_id IS NULL THEN RETURN FALSE; END IF;
    IF NOT v_is_service_role AND (auth.uid() IS NULL OR p_user_id <> auth.uid()) THEN
        RETURN FALSE;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.admin_members am
        JOIN public.admin_roles ar ON am.role_id = ar.id
        WHERE am.user_id = p_user_id AND am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','OWNER')
    ) INTO v_is_super;
    IF v_is_super THEN RETURN TRUE; END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.admin_members am
        JOIN public.admin_roles ar ON am.role_id = ar.id
        JOIN public.admin_role_permissions arp ON ar.id = arp.role_id
        JOIN public.admin_permissions ap ON arp.permission_id = ap.id
        WHERE am.user_id = p_user_id AND am.status = 'ACTIVE' AND ap.code = p_permission_code
    ) INTO v_has_perm;
    RETURN v_has_perm;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_members am
    JOIN public.admin_roles ar ON ar.id = am.role_id
    WHERE am.user_id = auth.uid()
      AND am.status = 'ACTIVE'
      AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER')
  );
$function$;
