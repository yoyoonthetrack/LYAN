-- Restore the moderation role permission from 12_admin_and_agents_migration.sql.
-- Idempotent. Does not change payments, buckets, or publication rows.

INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.admin_roles AS roles
JOIN public.admin_permissions AS permissions ON permissions.code = 'moderation.manage'
WHERE roles.code = 'MODERATION'
ON CONFLICT DO NOTHING;
