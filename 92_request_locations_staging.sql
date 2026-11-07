-- LYANN Migration 92 — public.request_locations: approximate mission location, stored apart from requests.
-- Staging only (tdktfbtqceldlaeqjtow). Never Production. Notes: docs/request-locations-staging.md.
-- Rollback: 92_request_locations_rollback.sql.
--
-- Model (contract: docs/approx-location-contract-v2.md, engine: approx-zone.js)
--   one row per announcement (request_id is the primary key); an announcement without a row is a legacy one and
--   behaves exactly as before.
--   REMOTE                      no place at all
--   ON_SITE, no visibility      territory without selectable referential (Guyane, ...): the mode is kept, nothing else
--   ON_SITE + DISCREET          commune only
--   ON_SITE + STANDARD          commune + sector (zone id of a versioned referential) + referential version
--   No coordinate, no address, no free text column exists. V1 zone ids stay storable and decodable (version >= 1).
--
-- Security model
--   * RLS is enabled in the same transaction as the table.
--   * Nobody but service_role can write. anon and authenticated receive no privilege except SELECT for authenticated.
--     The default Supabase grants are revoked explicitly, TRUNCATE, TRIGGER, REFERENCES and MAINTAIN included.
--   * Writes come from the authenticated server route (api/request-location-routes.js), which checks the JWT, the
--     authorship, the zone against the V2 referential and the territory / commune against the real announcement.
--   * Read: authenticated members only, and only for an announcement they can read in public.requests. The policy
--     asks "can I read this request?" with a plain subquery, so the secure requests policy of migration 90 is applied
--     under the caller's own role. No SECURITY DEFINER function is involved. anon reads nothing.
--   * Deleting an announcement deletes its location (ON DELETE CASCADE). Missions keep their own rules: their foreign key
--     to requests is untouched.
BEGIN;

-- 0. Preconditions: the audited state of phases 2.8B-1.3 and 2.8B-1.4. Anything else aborts and rolls back.
DO $pre$
DECLARE
    v_role text;
    v_priv text;
BEGIN
    IF to_regclass('public.requests') IS NULL
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.requests'::regclass) THEN
        RAISE EXCEPTION 'migration 92: public.requests missing or RLS disabled';
    END IF;
    IF to_regclass('public.request_locations') IS NOT NULL THEN
        RAISE EXCEPTION 'migration 92: public.request_locations already exists';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = 'public.requests'::regclass AND i.indisprimary
                   AND (SELECT array_agg(a.attname::text) FROM pg_attribute a WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)) = ARRAY['id']
                   AND (SELECT atttypid FROM pg_attribute WHERE attrelid = 'public.requests'::regclass AND attname = 'id') = 'uuid'::regtype) THEN
        RAISE EXCEPTION 'migration 92: requests primary key is not (id uuid)';
    END IF;
    -- Migration 90: one SELECT policy, for authenticated, anon without SELECT.
    IF (SELECT array_agg(policyname || ':' || roles::text ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL'))
       IS DISTINCT FROM ARRAY['Requests readable by authorized members:{authenticated}'] THEN
        RAISE EXCEPTION 'migration 92: apply migration 90 first (unexpected SELECT policies on requests)';
    END IF;
    IF has_table_privilege('anon', 'public.requests', 'SELECT') THEN
        RAISE EXCEPTION 'migration 92: anon can read requests (migration 90 incomplete)';
    END IF;
    -- Migration 91: no structural privilege left on requests for the client roles.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES'] LOOP
            IF has_table_privilege(v_role, 'public.requests', v_priv) THEN
                RAISE EXCEPTION 'migration 92: apply migration 91 first (% has % on requests)', v_role, v_priv;
            END IF;
        END LOOP;
    END LOOP;
END
$pre$;

-- 1. The table.
CREATE TABLE public.request_locations (
    request_id          uuid        PRIMARY KEY REFERENCES public.requests (id) ON DELETE CASCADE,
    service_mode        text        NOT NULL,
    location_visibility text,
    commune_code        text,
    zone_id             text,
    zone_version        smallint,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT request_locations_service_mode_check CHECK (service_mode IN ('ON_SITE', 'REMOTE')),
    CONSTRAINT request_locations_visibility_check   CHECK (location_visibility IS NULL OR location_visibility IN ('STANDARD', 'DISCREET')),
    CONSTRAINT request_locations_commune_format     CHECK (commune_code IS NULL OR commune_code ~ '^\d{5}$'),
    -- Canonical zone id of the engine: territory, version, level, cell. V1 ("971-v1-a-12.34") and V2 are both valid.
    CONSTRAINT request_locations_zone_format        CHECK (zone_id IS NULL OR zone_id ~ '^\d{3}-v[1-9]\d?-[a-z]-(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$'),
    CONSTRAINT request_locations_version_range      CHECK (zone_version IS NULL OR zone_version BETWEEN 1 AND 99),
    -- The only coherent shapes. COALESCE: a NULL comparison must never let a row through.
    CONSTRAINT request_locations_shape CHECK (COALESCE(
           (service_mode = 'REMOTE'  AND location_visibility IS NULL      AND commune_code IS NULL     AND zone_id IS NULL     AND zone_version IS NULL)
        OR (service_mode = 'ON_SITE' AND location_visibility IS NULL      AND commune_code IS NULL     AND zone_id IS NULL     AND zone_version IS NULL)
        OR (service_mode = 'ON_SITE' AND location_visibility = 'DISCREET' AND commune_code IS NOT NULL AND zone_id IS NULL     AND zone_version IS NULL)
        OR (service_mode = 'ON_SITE' AND location_visibility = 'STANDARD' AND commune_code IS NOT NULL AND zone_id IS NOT NULL AND zone_version IS NOT NULL
            AND zone_version = substring(zone_id FROM '^\d{3}-v([1-9]\d?)-')::smallint
            AND left(zone_id, 3) = left(commune_code, 3)),
        false))
);

COMMENT ON TABLE public.request_locations IS
    'Approximate location of an announcement (commune, sector id, referential version). No coordinate, no address. Written by the server route only (service_role). Migration 92.';

-- Keeps created_at, request_id and updated_at honest whoever writes. Plain trigger function, not SECURITY DEFINER.
CREATE FUNCTION public.lyann_request_locations_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN
        RAISE EXCEPTION 'request_locations.request_id cannot change' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.lyann_request_locations_touch() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_request_locations_touch
    BEFORE UPDATE ON public.request_locations
    FOR EACH ROW EXECUTE FUNCTION public.lyann_request_locations_touch();

-- 2. RLS first, then privileges: do not keep the Supabase default grants.
ALTER TABLE public.request_locations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.request_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.request_locations TO authenticated;
GRANT ALL ON TABLE public.request_locations TO service_role;

-- Members read a location only when they can read the announcement itself (author, public open announcement, target,
-- invitee, quote provider, mission helper, admin: whatever migration 90 decides). The subquery runs under the caller's
-- own role, so public.requests RLS applies to it. There is no INSERT / UPDATE / DELETE policy and no privilege.
CREATE POLICY request_locations_read_authorized ON public.request_locations
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_locations.request_id));

COMMENT ON POLICY request_locations_read_authorized ON public.request_locations IS
    'Readable only when the announcement is readable by the caller (public.requests policy, migration 90). No write policy.';

-- 3. Post-conditions: roll back if the result is not exactly what was prepared.
DO $post$
DECLARE
    v_role text;
    v_priv text;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.request_locations'::regclass) THEN
        RAISE EXCEPTION 'migration 92: RLS is not enabled on request_locations';
    END IF;
    IF (SELECT array_agg(policyname || ':' || cmd || ':' || roles::text) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'request_locations')
       IS DISTINCT FROM ARRAY['request_locations_read_authorized:SELECT:{authenticated}'] THEN
        RAISE EXCEPTION 'migration 92: unexpected policies on request_locations';
    END IF;
    -- Effective privileges (direct, inherited, PUBLIC).
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
        IF has_table_privilege('anon', 'public.request_locations', v_priv) THEN
            RAISE EXCEPTION 'migration 92: anon has % on request_locations', v_priv;
        END IF;
        IF v_priv <> 'SELECT' AND has_table_privilege('authenticated', 'public.request_locations', v_priv) THEN
            RAISE EXCEPTION 'migration 92: authenticated has % on request_locations', v_priv;
        END IF;
    END LOOP;
    IF NOT has_table_privilege('authenticated', 'public.request_locations', 'SELECT') THEN
        RAISE EXCEPTION 'migration 92: authenticated cannot read request_locations';
    END IF;
    IF has_any_column_privilege('anon', 'public.request_locations', 'SELECT, INSERT, UPDATE, REFERENCES')
       OR has_any_column_privilege('authenticated', 'public.request_locations', 'INSERT, UPDATE, REFERENCES') THEN
        RAISE EXCEPTION 'migration 92: a column privilege exists on request_locations';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.request_locations'::regclass AND a.grantee = 0) THEN
        RAISE EXCEPTION 'migration 92: PUBLIC holds a privilege on request_locations';
    END IF;
    IF NOT (has_table_privilege('service_role', 'public.request_locations', 'INSERT')
        AND has_table_privilege('service_role', 'public.request_locations', 'UPDATE')
        AND has_table_privilege('service_role', 'public.request_locations', 'DELETE')
        AND has_table_privilege('service_role', 'public.request_locations', 'SELECT')) THEN
        RAISE EXCEPTION 'migration 92: service_role cannot write request_locations';
    END IF;
    -- The trigger function is not callable by clients.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_function_privilege(v_role, 'public.lyann_request_locations_touch()', 'EXECUTE') THEN
            RAISE EXCEPTION 'migration 92: % can execute lyann_request_locations_touch', v_role;
        END IF;
    END LOOP;
    -- No SECURITY DEFINER anywhere in this migration.
    IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.lyann_request_locations_touch()'::regprocedure AND prosecdef) THEN
        RAISE EXCEPTION 'migration 92: unexpected SECURITY DEFINER';
    END IF;
    -- Foreign key to requests, cascade on delete only for this table.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.request_locations'::regclass AND contype = 'f'
                   AND confrelid = 'public.requests'::regclass AND confdeltype = 'c') THEN
        RAISE EXCEPTION 'migration 92: foreign key to requests missing';
    END IF;
END
$post$;

COMMIT;
