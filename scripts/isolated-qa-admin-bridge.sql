-- Isolated QA only. schema.sql seeded admin_roles.slug / admin_permissions.label.
-- Migration 12 expects admin_roles.code and admin_permissions.name.
-- Never run against gzispjfoywklpqatjyop.

ALTER TABLE public.admin_roles
  ADD COLUMN IF NOT EXISTS code text;

UPDATE public.admin_roles
SET code = upper(replace(slug, '-', '_'))
WHERE code IS NULL AND slug IS NOT NULL;

UPDATE public.admin_roles
SET code = upper(replace(name, ' ', '_'))
WHERE code IS NULL AND name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_roles_code_key ON public.admin_roles (code);

ALTER TABLE public.admin_roles ALTER COLUMN slug DROP NOT NULL;

ALTER TABLE public.admin_permissions
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.admin_permissions
SET name = label
WHERE name IS NULL AND label IS NOT NULL;

ALTER TABLE public.admin_permissions ALTER COLUMN label DROP NOT NULL;
