-- LYANN Migration 93 — public.editorial_highlights: cartes « À la une près de chez vous » (Découvrir uniquement).
-- Staging only (tdktfbtqceldlaeqjtow). Never Production. Rollback: 93_editorial_highlights_rollback.sql.
--
-- Only NEW objects are created: one table, one trigger function, one trigger, two indexes, one RLS policy, one Storage bucket.
-- No existing table, policy, function or row is read-modified. Dropping those objects restores the previous state exactly.
--
-- Security model
--   * RLS is enabled in the same transaction as the table.
--   * Nobody but service_role can write. anon and authenticated only receive SELECT on public columns (never created_by /
--     updated_by, which are administrator identifiers), and only on rows that are published AND inside their publication
--     window (starts_at / ends_at). Drafts, archived and scheduled cards are invisible to every client.
--   * Writes come from the admin routes of api/server.js (/v1/admin/editorial/highlights*), which verify the JWT and the
--     administrator permission server-side, sanitise every field, validate the image (magic bytes, MIME, size) and write
--     one admin_audit_events row per action.
--   * The call to action is a whitelisted target (cta_target) plus an optional category label: no URL is ever stored, so a
--     card cannot redirect to an arbitrary site.
--   * Storage bucket editorial-highlights: public read (images of published cards), 1 MiB per file, JPEG / PNG / WebP only.
--     No storage.objects policy is created: only service_role (the admin route) can upload.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.editorial_highlights') IS NOT NULL THEN
        RAISE EXCEPTION 'migration 93: public.editorial_highlights already exists';
    END IF;
    IF to_regclass('public.admin_audit_events') IS NULL THEN
        RAISE EXCEPTION 'migration 93: public.admin_audit_events missing (audit is mandatory)';
    END IF;
END
$pre$;

CREATE TABLE public.editorial_highlights (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 48),
    teaser      text NOT NULL CHECK (char_length(btrim(teaser)) BETWEEN 3 AND 80),
    label       text CHECK (label IS NULL OR char_length(btrim(label)) BETWEEN 2 AND 24),
    image_url   text CHECK (image_url IS NULL OR image_url ~ '^https://[A-Za-z0-9.-]+/storage/v1/object/public/editorial-highlights/[A-Za-z0-9._/-]+$'),
    image_alt   text CHECK (image_alt IS NULL OR char_length(image_alt) <= 120),
    territory   text NOT NULL DEFAULT 'all' CHECK (territory IN ('all', 'guadeloupe', 'martinique', 'guyane', 'reunion')),
    theme       text CHECK (theme IS NULL OR theme IN ('rentree', 'toussaint', 'noel', 'carnaval', 'careme', 'paques', 'vacances', 'saison', 'autre')),
    cta_target  text NOT NULL CHECK (cta_target IN ('lyanneurs', 'lyanneurs_category', 'annonces', 'annonces_category', 'annonces_map')),
    cta_value   text CHECK (cta_value IS NULL OR char_length(btrim(cta_value)) BETWEEN 2 AND 60),
    starts_at   timestamptz,
    ends_at     timestamptz,
    priority    integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at timestamptz,
    created_by  uuid,
    updated_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT editorial_highlights_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT editorial_highlights_published_has_image CHECK (status <> 'published' OR image_url IS NOT NULL),
    CONSTRAINT editorial_highlights_category_cta CHECK (cta_target NOT IN ('lyanneurs_category', 'annonces_category') OR cta_value IS NOT NULL)
);

COMMENT ON TABLE public.editorial_highlights IS 'Cartes « À la une près de chez vous » de Découvrir. Écriture: service_role via routes admin uniquement.';

CREATE INDEX editorial_highlights_visible_idx
    ON public.editorial_highlights (priority, published_at DESC)
    WHERE status = 'published';
CREATE INDEX editorial_highlights_territory_idx
    ON public.editorial_highlights (territory, status);

CREATE FUNCTION public.editorial_highlights_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    NEW.updated_at := now();
    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END
$fn$;

CREATE TRIGGER editorial_highlights_touch
    BEFORE INSERT OR UPDATE ON public.editorial_highlights
    FOR EACH ROW EXECUTE FUNCTION public.editorial_highlights_touch();

ALTER TABLE public.editorial_highlights ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.editorial_highlights FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, title, teaser, label, image_url, image_alt, territory, theme, cta_target, cta_value, starts_at, ends_at, priority, published_at)
    ON public.editorial_highlights TO anon, authenticated;

CREATE POLICY editorial_highlights_public_read
    ON public.editorial_highlights
    FOR SELECT
    TO anon, authenticated
    USING (
        status = 'published'
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at > now())
    );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('editorial-highlights', 'editorial-highlights', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMIT;
