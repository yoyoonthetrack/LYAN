'use strict';

// Local proof of migration 91 on a real Postgres engine (PGlite, in memory). Touches no Supabase project.
//   npm i --no-save @electric-sql/pglite    (not a project dependency)
//   node tests/rls/requests-privileges-local-check.js
// The migration and rollback files are executed verbatim, after migration 90, on a table that carries the
// Supabase default privileges (anon / authenticated / service_role: all).

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
const r91 = read('91_requests_dangerous_privileges_rollback.sql');

const SCHEMA = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id uuid, title text, status text DEFAULT 'OPEN', visibility text DEFAULT 'PUBLIC',
  target_user_id uuid, safety_status text DEFAULT 'SAFE', classification_status text DEFAULT 'UNCLASSIFIED',
  public_moderation_status text NOT NULL DEFAULT 'approved');
CREATE TABLE public.request_invitations (id serial PRIMARY KEY, request_id uuid REFERENCES public.requests(id), requester_id uuid, recipient_id uuid, status text);
CREATE TABLE public.quotes (id serial PRIMARY KEY, request_id uuid REFERENCES public.requests(id), provider_id uuid, requester_id uuid);
CREATE TABLE public.missions (id serial PRIMARY KEY, helper_id uuid, requester_id uuid, related_request_id uuid REFERENCES public.requests(id));
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
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

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'a0000000-0000-4000-8000-000000000002';

async function freshDb({ with90 = true } = {}) {
    const db = new PGlite();
    db_ = db;
    await db.exec(SCHEMA);
    await db.exec(`INSERT INTO public.requests (id, requester_id, title) VALUES
      ('b0000000-0000-4000-8000-000000000001','${A}','a1'),('b0000000-0000-4000-8000-000000000002','${B}','b1');`);
    if (with90) await db.exec(m90);
    return db;
}
const priv = async (db, role, p) => (await db.query(`SELECT has_table_privilege($1, 'public.requests', $2) AS ok`, [role, p])).rows[0].ok;
const asRole = async (db, role, sub, fn) => {
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub, role }) : '']);
    await db.exec(`SET ROLE ${role}`);
    try { return await fn(); } finally { await db.exec('RESET ROLE'); await db.exec(`SELECT set_config('request.jwt.claims', '', false)`); }
};
// A migration that aborts leaves its own BEGIN open (psql would too): close it so the session is usable again.
const fails = async (fn) => {
    try { await fn(); } catch (e) { try { await db_.exec('ROLLBACK'); } catch (_) { /* no open transaction */ } return String(e.message || e); }
    return null;
};
let db_;
const policyFingerprint = async (db) => (await db.query(`SELECT md5(string_agg(policyname||cmd||roles::text||coalesce(qual,'')||coalesce(with_check,''), '|' ORDER BY policyname)) AS h FROM pg_policies WHERE tablename='requests'`)).rows[0].h;
const otherAcl = async (db) => (await db.query(`SELECT string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type, ',' ORDER BY 1) AS s
  FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid='public.requests'::regclass AND a.privilege_type NOT IN ('TRUNCATE','TRIGGER','REFERENCES')`)).rows[0].s;

(async () => {
    // 1. Before: the dangerous privileges exist (Supabase default).
    let db = await freshDb();
    for (const role of ['anon', 'authenticated']) for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) assert.equal(await priv(db, role, p), true, `${role} ${p} before`);
    const before = { policies: await policyFingerprint(db), acl: await otherAcl(db) };

    // 2. Apply migration 91 verbatim.
    await db.exec(m91);
    for (const role of ['anon', 'authenticated']) for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) assert.equal(await priv(db, role, p), false, `${role} ${p} after`);
    for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(await priv(db, 'service_role', p), true, `service_role ${p}`);
    assert.equal(await priv(db, 'postgres', 'TRUNCATE'), true);
    assert.equal(await policyFingerprint(db), before.policies, 'policies unchanged');
    assert.equal(await otherAcl(db), before.acl, 'other privileges unchanged');
    assert.equal(await priv(db, 'anon', 'SELECT'), false);
    assert.equal(await priv(db, 'authenticated', 'SELECT'), true);
    assert.equal(await priv(db, 'anon', 'INSERT'), true);

    // 3. Real roles: TRUNCATE denied, rows intact.
    assert.match(await asRole(db, 'anon', null, () => fails(() => db.exec('TRUNCATE public.requests'))), /permission denied/);
    assert.match(await asRole(db, 'authenticated', A, () => fails(() => db.exec('TRUNCATE public.requests'))), /permission denied/);
    assert.match(await asRole(db, 'authenticated', A, () => fails(() => db.exec('TRUNCATE public.requests CASCADE'))), /permission denied/);
    assert.equal(Number((await db.query('SELECT count(*) AS n FROM public.requests')).rows[0].n), 2);

    // 4. Ordinary journeys still work under real roles.
    assert.deepEqual(await asRole(db, 'anon', null, () => fails(() => db.query('SELECT id FROM public.requests'))) !== null, true, 'anon cannot read');
    const own = await asRole(db, 'authenticated', A, async () => (await db.query('SELECT title FROM public.requests ORDER BY title')).rows.map((r) => r.title));
    assert.deepEqual(own, ['a1', 'b1'], 'author reads own + public open ad');
    await asRole(db, 'authenticated', A, async () => {
        const ins = await db.query(`INSERT INTO public.requests (requester_id, title) VALUES ('${A}', 'new') RETURNING id`);
        const up = await db.query(`UPDATE public.requests SET title = 'new2' WHERE id = '${ins.rows[0].id}' RETURNING id`);
        assert.equal(up.rows.length, 1);
        const foreign = await db.query(`UPDATE public.requests SET title = 'x' WHERE requester_id = '${B}' RETURNING id`);
        assert.equal(foreign.rows.length, 0, 'cannot edit a foreign request');
        const del = await db.query(`DELETE FROM public.requests WHERE id = '${ins.rows[0].id}' RETURNING id`);
        assert.equal(del.rows.length, 1);
    });
    assert.ok(await asRole(db, 'anon', null, () => fails(() => db.exec(`INSERT INTO public.requests (title) VALUES ('x')`))), 'anon cannot insert');
    // Foreign keys, triggers and the owner are unaffected (owner statements).
    await db.exec(`INSERT INTO public.quotes (request_id, provider_id, requester_id) VALUES ('b0000000-0000-4000-8000-000000000001','${B}','${A}')`);
    await db.exec(`CREATE OR REPLACE FUNCTION public.t() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER trg_t BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.t();`);
    await asRole(db, 'authenticated', A, async () => {
        const up = await db.query(`UPDATE public.requests SET title = 'with trigger' WHERE requester_id = '${A}' RETURNING id`);
        assert.equal(up.rows.length, 1, 'triggers fire without the TRIGGER privilege');
    });
    await db.exec('DROP TRIGGER trg_t ON public.requests');

    // 5. Re-applying is harmless; the rollback restores exactly the three privileges.
    await db.exec(m91);
    await db.exec(r91);
    for (const role of ['anon', 'authenticated']) for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) assert.equal(await priv(db, role, p), true, `${role} ${p} after rollback`);
    assert.equal(await priv(db, 'anon', 'SELECT'), false, 'rollback never gives SELECT back to anon');
    assert.equal(await policyFingerprint(db), before.policies);
    await db.exec(m91);
    await db.close();

    // 6. Negative preconditions: without migration 90 (old permissive policy) the migration refuses and changes nothing.
    db = await freshDb({ with90: false });
    assert.match(await fails(() => db.exec(m91)), /apply migration 90 first/);
    assert.equal(await priv(db, 'anon', 'TRUNCATE'), true, 'aborted migration changed nothing');
    await db.close();

    // 7. A PUBLIC grant is also removed, and the other privileges and the policies stay identical.
    db = await freshDb();
    await db.exec('GRANT TRUNCATE, TRIGGER ON public.requests TO PUBLIC; GRANT SELECT ON public.requests TO anon;');
    assert.match(await fails(() => db.exec(m91)), /anon still has SELECT/);
    await db.exec('REVOKE SELECT ON public.requests FROM anon');
    await db.exec(m91);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid='public.requests'::regclass AND a.grantee=0`)).rows[0].n, 0, 'PUBLIC grants removed');
    await db.close();

    // 8. Mutants: a migration that revokes too much or too little must be caught by its own post-conditions.
    const mutants = {
        'revokes DELETE too': m91.replace('REVOKE TRUNCATE, TRIGGER, REFERENCES ON', 'REVOKE TRUNCATE, TRIGGER, REFERENCES, DELETE ON'),
        'forgets REFERENCES': m91.replace('REVOKE TRUNCATE, TRIGGER, REFERENCES ON', 'REVOKE TRUNCATE, TRIGGER ON'),
        'forgets authenticated': m91.replace('FROM PUBLIC, anon, authenticated;', 'FROM PUBLIC, anon;'),
        'touches service_role': m91.replace('FROM PUBLIC, anon, authenticated;', 'FROM PUBLIC, anon, authenticated, service_role;'),
    };
    for (const [name, sql] of Object.entries(mutants)) {
        assert.notEqual(sql, m91, `mutant ${name} did not change the SQL`);
        const mdb = await freshDb();
        assert.ok(await fails(() => mdb.exec(sql)), `mutant "${name}" must be rejected`);
        assert.equal(await priv(mdb, 'anon', 'TRUNCATE'), true, `mutant "${name}" must leave nothing half-applied`);
        await mdb.close();
    }
    console.log('requests privileges local check passed');
})().catch((error) => { console.error(error); process.exit(1); });
