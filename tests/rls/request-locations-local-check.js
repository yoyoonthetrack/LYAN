'use strict';

// Local proof of migration 92 on a real Postgres engine (PGlite, in memory). Touches no Supabase project.
//   npm i --no-save @electric-sql/pglite    (not a project dependency)
//   node tests/rls/request-locations-local-check.js
// Migrations 90, 91 and 92 and the rollback are executed verbatim, on a requests table carrying the Supabase
// default privileges (including default privileges for tables and functions created later).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (_) {
    console.error('Missing @electric-sql/pglite. Run: npm i --no-save @electric-sql/pglite');
    process.exit(2);
}

const root = path.join(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const m90 = read('90_requests_select_rls_hardening_staging.sql');
const m91 = read('91_requests_dangerous_privileges_staging.sql');
const m92 = read('92_request_locations_staging.sql');
const r92 = read('92_request_locations_rollback.sql');

const U = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AUTHOR = U(1), TARGET = U(2), OUTSIDER = U(3), ADMIN = U(4);
const R = { pub: 'b0000000-0000-4000-8000-000000000001', direct: 'b0000000-0000-4000-8000-000000000002',
    closed: 'b0000000-0000-4000-8000-000000000003', pending: 'b0000000-0000-4000-8000-000000000004',
    prohibited: 'b0000000-0000-4000-8000-000000000005' };

const SCHEMA = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
CREATE TABLE public.admin_roles (id uuid PRIMARY KEY, code text);
CREATE TABLE public.admin_members (user_id uuid, role_id uuid, status text);
CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
    WHERE am.user_id = auth.uid() AND am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER')); $$;
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id uuid, title text, description text NOT NULL DEFAULT 'd', status text DEFAULT 'OPEN',
  visibility text DEFAULT 'PUBLIC', target_user_id uuid, safety_status text DEFAULT 'SAFE', classification_status text DEFAULT 'UNCLASSIFIED',
  public_moderation_status text NOT NULL DEFAULT 'approved', location text);
CREATE TABLE public.request_invitations (id serial PRIMARY KEY, request_id uuid REFERENCES public.requests(id), requester_id uuid, recipient_id uuid, status text);
CREATE TABLE public.quotes (id serial PRIMARY KEY, request_id uuid REFERENCES public.requests(id), provider_id uuid, requester_id uuid);
CREATE TABLE public.missions (id serial PRIMARY KEY, helper_id uuid, requester_id uuid, related_request_id uuid REFERENCES public.requests(id));
-- Supabase defaults: every object created later in public is granted to the client roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requests are viewable by everyone" ON public.requests FOR SELECT USING (
  CASE WHEN ((auth.uid() IS NOT NULL) AND (auth.uid() = requester_id) AND (public_moderation_status IS DISTINCT FROM 'rejected'::text)) THEN true
       WHEN (public_moderation_status IS DISTINCT FROM 'approved'::text) THEN
         CASE WHEN (COALESCE(auth.role(), ''::text) IS DISTINCT FROM 'authenticated'::text) THEN false ELSE is_current_user_admin() END
       ELSE true END);
CREATE POLICY "Authenticated users can insert own requests" ON public.requests FOR INSERT
  WITH CHECK ((auth.role() = 'authenticated'::text) AND ((requester_id = auth.uid()) OR (requester_id IS NULL)));
CREATE POLICY "Users can update own requests" ON public.requests FOR UPDATE USING ((auth.uid() = requester_id) OR is_current_user_admin());
CREATE POLICY "Users can delete own requests" ON public.requests FOR DELETE USING ((auth.uid() = requester_id) OR is_current_user_admin());
`;

async function freshDb({ upTo = 92 } = {}) {
    const db = new PGlite();
    db_ = db;
    await db.exec(SCHEMA);
    await db.exec(`INSERT INTO public.admin_roles VALUES ('c0000000-0000-4000-8000-000000000001','ADMIN');
      INSERT INTO public.admin_members VALUES ('${ADMIN}','c0000000-0000-4000-8000-000000000001','ACTIVE');`);
    await db.exec(`INSERT INTO public.requests (id, requester_id, title, status, visibility, target_user_id, safety_status, public_moderation_status) VALUES
      ('${R.pub}','${AUTHOR}','pub','OPEN','PUBLIC',NULL,'SAFE','approved'),
      ('${R.direct}','${AUTHOR}','direct','OPEN','DIRECT','${TARGET}','SAFE','approved'),
      ('${R.closed}','${AUTHOR}','closed','CLOSED','PUBLIC',NULL,'SAFE','approved'),
      ('${R.pending}','${AUTHOR}','pending','OPEN','PUBLIC',NULL,'SAFE','pending'),
      ('${R.prohibited}','${AUTHOR}','prohibited','OPEN','PUBLIC',NULL,'PROHIBITED','approved');`);
    if (upTo >= 90) await db.exec(m90);
    if (upTo >= 91) await db.exec(m91);
    return db;
}
let db_;
const fails = async (fn) => {
    try { await fn(); } catch (e) { try { await db_.exec('ROLLBACK'); } catch (_) { /* nothing open */ } return String(e.message || e); }
    return null;
};
const asRole = async (db, role, sub, fn) => {
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub, role }) : '']);
    await db.exec(`SET ROLE ${role}`);
    try { return await fn(); } finally { await db.exec('RESET ROLE'); await db.exec(`SELECT set_config('request.jwt.claims', '', false)`); }
};
const priv = async (db, role, p, rel = 'public.request_locations') => (await db.query(`SELECT has_table_privilege($1, $2, $3) AS ok`, [role, rel, p])).rows[0].ok;
const seedLocations = (db) => db.exec(`INSERT INTO public.request_locations (request_id, service_mode, location_visibility, commune_code, zone_id, zone_version) VALUES
  ('${R.pub}','ON_SITE','STANDARD','97113','971-v2-a-15.16',2),
  ('${R.direct}','ON_SITE','DISCREET','97113',NULL,NULL),
  ('${R.closed}','REMOTE',NULL,NULL,NULL,NULL),
  ('${R.pending}','ON_SITE','STANDARD','97113','971-v2-a-15.16',2),
  ('${R.prohibited}','ON_SITE','DISCREET','97113',NULL,NULL)`);
const visibleLocations = (db, role, sub) => asRole(db, role, sub, async () =>
    (await db.query('SELECT request_id FROM public.request_locations')).rows.map((r) => r.request_id).sort());
const names = (...keys) => keys.map((k) => R[k]).sort();

// What each actor may see: exactly the announcements they can read in requests (migration 90), no more.
async function assertMatrix(db, label) {
    assert.deepEqual(await visibleLocations(db, 'authenticated', AUTHOR), names('pub', 'direct', 'closed', 'pending', 'prohibited'), `${label}: author reads own`);
    assert.deepEqual(await visibleLocations(db, 'authenticated', OUTSIDER), names('pub'), `${label}: stranger only reads the public open announcement`);
    assert.deepEqual(await visibleLocations(db, 'authenticated', TARGET), names('pub', 'direct'), `${label}: target reads the direct announcement`);
    assert.deepEqual(await visibleLocations(db, 'authenticated', ADMIN), names('pub', 'direct', 'closed', 'pending', 'prohibited'), `${label}: admin reads all`);
    const anonError = await asRole(db, 'anon', null, () => fails(() => db.query('SELECT request_id FROM public.request_locations')));
    assert.match(anonError, /permission denied/, `${label}: anon cannot read`);
    // The location is never more visible than its announcement.
    for (const [sub] of [[AUTHOR], [OUTSIDER], [TARGET], [ADMIN]]) {
        const reqs = await asRole(db, 'authenticated', sub, async () => (await db.query('SELECT id FROM public.requests')).rows.map((r) => r.id));
        const locs = await visibleLocations(db, 'authenticated', sub);
        assert.ok(locs.every((id) => reqs.includes(id)), `${label}: ${sub} location subset of requests`);
    }
}

(async () => {
    // 1. Preconditions refuse an unexpected state and change nothing.
    let db = await freshDb({ upTo: 89 });
    assert.match(await fails(() => db.exec(m92)), /apply migration 90 first/);
    assert.equal(await db.query(`SELECT to_regclass('public.request_locations') AS t`).then((r) => r.rows[0].t), null);
    await db.close();
    db = await freshDb({ upTo: 90 });
    assert.match(await fails(() => db.exec(m92)), /apply migration 91 first/);
    await db.close();

    // 2. Apply on the audited state.
    db = await freshDb();
    await db.exec(m92);
    assert.match(await fails(() => db.exec(m92)), /already exists/, 'second application refused');

    // 3. Effective privileges and policy
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) assert.equal(await priv(db, 'anon', p), false, `anon ${p}`);
    for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) assert.equal(await priv(db, 'authenticated', p), false, `authenticated ${p}`);
    assert.equal(await priv(db, 'authenticated', 'SELECT'), true);
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(await priv(db, 'service_role', p), true, `service_role ${p}`);
    assert.equal((await db.query(`SELECT relrowsecurity AS rls FROM pg_class WHERE oid='public.request_locations'::regclass`)).rows[0].rls, true);
    assert.deepEqual((await db.query(`SELECT policyname, cmd, roles::text AS roles FROM pg_policies WHERE tablename='request_locations'`)).rows,
        [{ policyname: 'request_locations_read_authorized', cmd: 'SELECT', roles: '{authenticated}' }]);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid='public.request_locations'::regclass AND a.grantee=0`)).rows[0].n, 0);
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query(`SELECT has_function_privilege($1,'public.lyann_request_locations_touch()','EXECUTE') AS ok`, [role])).rows[0].ok, false);
    assert.equal((await db.query(`SELECT bool_or(prosecdef) AS d FROM pg_proc WHERE proname='lyann_request_locations_touch'`)).rows[0].d, false, 'no SECURITY DEFINER');
    // requests keeps migration 90 and 91 results
    assert.equal(await priv(db, 'anon', 'SELECT', 'public.requests'), false);
    assert.equal(await priv(db, 'authenticated', 'TRUNCATE', 'public.requests'), false);

    // 4. Constraints: coherent shapes only, checked as the table owner (the strongest writer)
    const insert = (rid, mode, vis, commune, zone, version) => db.query(
        `INSERT INTO public.request_locations (request_id, service_mode, location_visibility, commune_code, zone_id, zone_version)
         VALUES ($1,$2,$3,$4,$5,$6)`, [rid, mode, vis, commune, zone, version]);
    const reset = () => db.exec('DELETE FROM public.request_locations');
    const good = [
        ['REMOTE', null, null, null, null], ['ON_SITE', null, null, null, null], ['ON_SITE', 'DISCREET', '97113', null, null],
        ['ON_SITE', 'STANDARD', '97113', '971-v2-a-15.16', 2],
        ['ON_SITE', 'STANDARD', '97113', '971-v1-a-12.34', 1],           // legacy V1 stays decodable
        ['ON_SITE', 'STANDARD', '97413', '974-v2-b-0.0', 2]
    ];
    for (const row of good) { await reset(); await insert(R.pub, ...row); }
    const bad = {
        'REMOTE with commune': ['REMOTE', null, '97113', null, null], 'REMOTE with visibility': ['REMOTE', 'DISCREET', null, null, null],
        'REMOTE with zone': ['REMOTE', null, null, '971-v2-a-15.16', 2],
        'DISCREET without commune': ['ON_SITE', 'DISCREET', null, null, null], 'DISCREET with zone': ['ON_SITE', 'DISCREET', '97113', '971-v2-a-15.16', 2],
        'STANDARD without zone': ['ON_SITE', 'STANDARD', '97113', null, null], 'STANDARD without commune': ['ON_SITE', 'STANDARD', null, '971-v2-a-15.16', 2],
        'STANDARD without version': ['ON_SITE', 'STANDARD', '97113', '971-v2-a-15.16', null],
        'version differs from id': ['ON_SITE', 'STANDARD', '97113', '971-v2-a-15.16', 1],
        'commune of another territory': ['ON_SITE', 'STANDARD', '97213', '971-v2-a-15.16', 2],
        'non canonical zone id': ['ON_SITE', 'STANDARD', '97113', '971-v02-a-15.16', 2],
        'zero padded cell': ['ON_SITE', 'STANDARD', '97113', '971-v2-a-015.16', 2],
        'free text as zone': ['ON_SITE', 'STANDARD', '97113', '12 rue des Lilas', 2],
        'sql in zone': ['ON_SITE', 'STANDARD', '97113', "971-v2-a-1.1'; --", 2],
        'bad commune format': ['ON_SITE', 'DISCREET', '9711', null, null], 'letters in commune': ['ON_SITE', 'DISCREET', 'Gosier', null, null],
        'unknown mode': ['ANYWHERE', null, null, null, null], 'unknown visibility': ['ON_SITE', 'EXACT', '97113', null, null],
        'null mode': [null, null, null, null, null], 'version 0': ['ON_SITE', 'STANDARD', '97113', '971-v2-a-15.16', 0]
    };
    for (const [name, row] of Object.entries(bad)) { await reset(); assert.ok(await fails(() => insert(R.pub, ...row)), `constraint must refuse: ${name}`); }
    await reset();
    await insert(R.pub, 'REMOTE', null, null, null, null);
    assert.ok(await fails(() => insert(R.pub, 'REMOTE', null, null, null, null)), 'one location per announcement');
    assert.ok(await fails(() => insert('b0000000-0000-4000-8000-0000000000ff', 'REMOTE', null, null, null, null)), 'unknown announcement refused (foreign key)');
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='request_locations' ORDER BY 1`)).rows.map((r) => r.column_name);
    assert.deepEqual(columns, ['commune_code', 'created_at', 'location_visibility', 'request_id', 'service_mode', 'updated_at', 'zone_id', 'zone_version'], 'no coordinate, no address column');

    // 5. Row level: the matrix, with real roles
    await reset(); await seedLocations(db);
    await assertMatrix(db, 'after migration');

    // 6. No direct write for any client role, whatever the row
    for (const [role, sub] of [['anon', null], ['authenticated', AUTHOR], ['authenticated', ADMIN]]) {
        for (const sql of [
            `INSERT INTO public.request_locations (request_id, service_mode) VALUES ('${R.prohibited}', 'REMOTE')`,
            `UPDATE public.request_locations SET service_mode = 'REMOTE', location_visibility = NULL, commune_code = NULL, zone_id = NULL, zone_version = NULL`,
            `DELETE FROM public.request_locations`, 'TRUNCATE public.request_locations'
        ]) assert.match(await asRole(db, role, sub, () => fails(() => db.exec(sql))), /permission denied/, `${role}: ${sql.slice(0, 30)}`);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.request_locations')).rows[0].n, 5);
    // service_role (the server) writes; the trigger keeps created_at and refuses a new request_id
    await db.exec(`SET ROLE service_role`);
    await db.exec(`UPDATE public.request_locations SET service_mode='REMOTE', location_visibility=NULL, commune_code=NULL, zone_id=NULL, zone_version=NULL, created_at = '2000-01-01' WHERE request_id='${R.pub}'`);
    assert.match(await fails(() => db.exec(`UPDATE public.request_locations SET request_id='${R.direct}' WHERE request_id='${R.pub}'`)), /cannot change|duplicate/);
    await db.exec('RESET ROLE');
    const touched = (await db.query(`SELECT created_at > '2000-01-02' AS created_kept, updated_at >= created_at AS ordered FROM public.request_locations WHERE request_id='${R.pub}'`)).rows[0];
    assert.deepEqual(touched, { created_kept: true, ordered: true });
    await reset(); await seedLocations(db);

    // 7. Deleting an announcement removes its location; the announcement owner needs no privilege on the table
    await asRole(db, 'authenticated', AUTHOR, () => db.exec(`DELETE FROM public.requests WHERE id = '${R.prohibited}'`));
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.request_locations WHERE request_id='${R.prohibited}'`)).rows[0].n, 0, 'cascade');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.request_locations')).rows[0].n, 4);
    // Missions keep their own rule: an announcement with a mission cannot be deleted (foreign key untouched)
    await db.exec(`INSERT INTO public.missions (helper_id, requester_id, related_request_id) VALUES ('${TARGET}','${AUTHOR}','${R.pub}')`);
    assert.ok(await asRole(db, 'authenticated', AUTHOR, () => fails(() => db.exec(`DELETE FROM public.requests WHERE id = '${R.pub}'`))));
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.request_locations WHERE request_id='${R.pub}'`)).rows[0].n, 1, 'location kept with its announcement');

    // 8. A participant (quote provider) reads the location of an announcement they may read, nothing else
    await db.exec(`INSERT INTO public.quotes (request_id, provider_id, requester_id) VALUES ('${R.closed}','${OUTSIDER}','${AUTHOR}')`);
    assert.deepEqual(await visibleLocations(db, 'authenticated', OUTSIDER), names('pub', 'closed'));
    await db.exec('DELETE FROM public.quotes');
    await db.exec('DELETE FROM public.missions');

    // 9. Rollback guard, then the clean removal; requests untouched
    assert.match(await fails(() => db.exec(r92)), /holds 4 row/);
    await db.exec(`BEGIN; SET LOCAL lyann.rollback_92_drop_rows = 'yes';\n${r92.replace(/^BEGIN;/m, '')}`);
    assert.equal(await db.query(`SELECT to_regclass('public.request_locations') AS t`).then((r) => r.rows[0].t), null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.requests')).rows[0].n, 4);
    await db.exec(m92);   // can be applied again after a rollback
    await db.close();

    // 10. Mutants: wrong migrations are stopped by their post-conditions, or caught by the matrix
    const mutants = {
        'keeps default grants': [m92.replace('REVOKE ALL ON TABLE public.request_locations FROM PUBLIC, anon, authenticated;', ''), 'post'],
        'authenticated may insert': [m92.replace('GRANT SELECT ON TABLE public.request_locations TO authenticated;', 'GRANT SELECT, INSERT ON TABLE public.request_locations TO authenticated;'), 'post'],
        'anon may read': [m92.replace('GRANT SELECT ON TABLE public.request_locations TO authenticated;', 'GRANT SELECT ON TABLE public.request_locations TO authenticated, anon;'), 'post'],
        'rls forgotten': [m92.replace('ALTER TABLE public.request_locations ENABLE ROW LEVEL SECURITY;', ''), 'post'],
        'policy for public': [m92.replace('FOR SELECT TO authenticated\n    USING', 'FOR SELECT TO public\n    USING'), 'post'],
        'trigger function callable': [m92.replace('REVOKE ALL ON FUNCTION public.lyann_request_locations_touch() FROM PUBLIC, anon, authenticated;', ''), 'post'],
        'policy lets everyone read': [m92.replace('USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_locations.request_id))', 'USING (true)'), 'matrix']
    };
    for (const [name, [sql, how]] of Object.entries(mutants)) {
        assert.notEqual(sql, m92, `mutant "${name}" did not change the SQL`);
        const mdb = await freshDb();
        if (how === 'post') {
            assert.ok(await fails(() => mdb.exec(sql)), `mutant "${name}" must be rejected by the migration`);
            assert.equal(await mdb.query(`SELECT to_regclass('public.request_locations') AS t`).then((r) => r.rows[0].t), null, `"${name}" left nothing behind`);
        } else {
            await mdb.exec(sql);
            await seedLocations(mdb);
            assert.ok(await fails(() => assertMatrix(mdb, name)), `mutant "${name}" must be caught by the role matrix`);
        }
        await mdb.close();
    }
    console.log('request locations local check passed');
})().catch((error) => { console.error(error); process.exit(1); });
