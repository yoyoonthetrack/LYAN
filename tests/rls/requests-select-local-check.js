'use strict';

// Local proof of migration 90 on a real Postgres engine (PGlite, in memory). Touches no Supabase project.
//   npm i --no-save @electric-sql/pglite    (not a project dependency)
//   node tests/rls/requests-select-local-check.js
// The tables below reproduce only what the requests SELECT policy depends on. The "live" policy is the one read
// from Staging on 2026-11-05. The migration and rollback files are executed verbatim.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (_) {
    console.error('Missing @electric-sql/pglite. Run: npm i --no-save @electric-sql/pglite');
    process.exit(2);
}

const root = path.join(__dirname, '..', '..');
const migration = fs.readFileSync(process.env.MIGRATION_FILE || path.join(root, '90_requests_select_rls_hardening_staging.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, '90_requests_select_rls_hardening_rollback.sql'), 'utf8');

const LIVE_POLICY = `
CREATE POLICY "Requests are viewable by everyone" ON public.requests FOR SELECT USING (
    CASE
        WHEN ((auth.uid() IS NOT NULL) AND (auth.uid() = requester_id) AND (public_moderation_status IS DISTINCT FROM 'rejected'::text)) THEN true
        WHEN (public_moderation_status IS DISTINCT FROM 'approved'::text) THEN
            CASE
                WHEN (COALESCE(auth.role(), ''::text) IS DISTINCT FROM 'authenticated'::text) THEN false
                ELSE is_current_user_admin()
            END
        ELSE true
    END);`;

const SCHEMA = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.admin_roles (id uuid PRIMARY KEY, code text);
CREATE TABLE public.admin_members (user_id uuid, role_id uuid, status text);
CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
    WHERE am.user_id = auth.uid() AND am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER')); $$;
CREATE TABLE public.requests (
  id uuid PRIMARY KEY, requester_id uuid, title text, status text, visibility text, target_user_id uuid,
  safety_status text, classification_status text, public_moderation_status text NOT NULL, internal_tags text[]);
CREATE TABLE public.request_invitations (id serial PRIMARY KEY, request_id uuid, requester_id uuid, recipient_id uuid, status text);
CREATE TABLE public.quotes (id serial PRIMARY KEY, request_id uuid, provider_id uuid, requester_id uuid);
CREATE TABLE public.missions (id serial PRIMARY KEY, helper_id uuid, requester_id uuid, related_request_id uuid);
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
`;

// Deterministic data
let seed = 90210;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const uuid = (kind, n) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const USERS = Array.from({ length: 30 }, (_, i) => uuid('a', i + 1));
const ADMIN = USERS[0];
const REQUESTS = Array.from({ length: 400 }, (_, i) => ({
    id: uuid('b', i + 1),
    requester: rnd() < 0.9 ? pick(USERS) : null,
    status: pick(['OPEN', 'OPEN', 'OPEN', 'PAUSED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED']),
    visibility: pick(['PUBLIC', 'PUBLIC', 'PUBLIC', 'DIRECT']),
    target: rnd() < 0.3 ? pick(USERS) : null,
    safety: pick(['SAFE', 'SAFE', 'SAFE', 'SAFE', 'PROHIBITED', null]),
    classification: pick(['UNCLASSIFIED', 'CLASSIFIED', 'NEEDS_REVIEW', null]),
    moderation: pick(['approved', 'approved', 'approved', 'pending', 'rejected'])
}));

async function seed_(db) {
    await db.exec(SCHEMA);
    await db.exec(`INSERT INTO public.profiles VALUES ${USERS.map((u) => `('${u}')`).join(',')};`);
    await db.exec(`INSERT INTO public.admin_roles VALUES ('${uuid('c', 1)}','ADMIN'),('${uuid('c', 2)}','SUPPORT');
      INSERT INTO public.admin_members VALUES ('${ADMIN}','${uuid('c', 1)}','ACTIVE'),('${USERS[1]}','${uuid('c', 1)}','SUSPENDED'),('${USERS[2]}','${uuid('c', 2)}','ACTIVE');`);
    await db.exec(`INSERT INTO public.requests VALUES ${REQUESTS.map((r) => `(${lit(r.id)},${lit(r.requester)},'t',${lit(r.status)},${lit(r.visibility)},${lit(r.target)},${lit(r.safety)},${lit(r.classification)},${lit(r.moderation)},ARRAY['#x'])`).join(',')};`);
    const inv = Array.from({ length: 250 }, () => `(${lit(pick(REQUESTS).id)},${lit(pick(USERS))},${lit(pick(USERS))},${lit(pick(['PENDING', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CANCELLED']))})`);
    const quotes = Array.from({ length: 150 }, () => `(${lit(pick(REQUESTS).id)},${lit(pick(USERS))},${lit(pick(USERS))})`);
    const missions = Array.from({ length: 120 }, () => `(${lit(pick(USERS))},${lit(pick(USERS))},${rnd() < 0.85 ? lit(pick(REQUESTS).id) : 'NULL'})`);
    await db.exec(`INSERT INTO public.request_invitations (request_id,requester_id,recipient_id,status) VALUES ${inv.join(',')};
      INSERT INTO public.quotes (request_id,provider_id,requester_id) VALUES ${quotes.join(',')};
      INSERT INTO public.missions (helper_id,requester_id,related_request_id) VALUES ${missions.join(',')};`);
}

// Specification, written independently of the policy text
const SPEC = `
SELECT r.id FROM public.requests r WHERE COALESCE(
     (r.requester_id = $1 AND r.public_moderation_status IS DISTINCT FROM 'rejected')
  OR EXISTS (SELECT 1 FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
             WHERE am.user_id = $1 AND am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER'))
  OR (r.public_moderation_status = 'approved' AND (
        (r.visibility = 'PUBLIC' AND r.status = 'OPEN' AND r.safety_status = 'SAFE' AND r.target_user_id IS NULL
         AND r.classification_status IN ('CLASSIFIED','UNCLASSIFIED'))
     OR (r.safety_status IS DISTINCT FROM 'PROHIBITED' AND (
            r.target_user_id = $1
         OR EXISTS (SELECT 1 FROM public.request_invitations i WHERE i.request_id = r.id AND i.recipient_id = $1 AND i.status <> 'CANCELLED')
         OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.request_id = r.id AND q.provider_id = $1)
         OR EXISTS (SELECT 1 FROM public.missions m WHERE m.related_request_id = r.id AND m.helper_id = $1))))), false)`;

const ids = (rows) => new Set(rows.map((r) => r.id));
async function asAnon(db) {
    await db.exec(`SET ROLE anon; SELECT set_config('request.jwt.claims', '', false);`);
    try { return { rows: (await db.query('SELECT id FROM public.requests')).rows }; }
    catch (error) { return { error: String(error.message || error) }; }
    finally { await db.exec('RESET ROLE'); }
}
async function asMember(db, uid) {
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await db.exec('SET ROLE authenticated');
    try { return ids((await db.query('SELECT id FROM public.requests')).rows); }
    finally { await db.exec('RESET ROLE'); await db.exec(`SELECT set_config('request.jwt.claims', '', false)`); }
}
const specFor = async (db, uid) => ids((await db.query(SPEC, [uid])).rows);
const policyNames = async (db) => (await db.query(`SELECT policyname, roles::text AS roles FROM pg_policies WHERE tablename = 'requests' AND cmd IN ('SELECT','ALL') ORDER BY 1`)).rows;

async function freshDb(policy = LIVE_POLICY) {
    const db = new PGlite();
    await seed_(db);
    await db.exec(policy);
    return db;
}
async function expectMigrationRefused(db, sql, pattern) {
    let message = null;
    try { await db.exec(sql); } catch (error) { message = String(error.message || error); }
    await db.exec('ROLLBACK').catch(() => {});
    assert.ok(message && pattern.test(message), `migration must refuse (${pattern}); got: ${message}`);
}

(async () => {
    const report = {};
    const db = await freshDb();

    // 0. The exposure, reproduced on the live policy
    const before = new Map();
    const anonBefore = await asAnon(db);
    assert.ok(anonBefore.rows && anonBefore.rows.length > 0, 'live policy: anon reads rows');
    const approved = REQUESTS.filter((r) => r.moderation === 'approved').length;
    assert.equal(anonBefore.rows.length, approved, 'live policy: anon reads EVERY approved row');
    const privateApproved = REQUESTS.filter((r) => r.moderation === 'approved' && (r.visibility === 'DIRECT' || r.target || r.status !== 'OPEN' || r.safety !== 'SAFE')).length;
    assert.ok(privateApproved > 50, 'fixture holds many private/closed/targeted/prohibited approved rows');
    for (const uid of USERS) before.set(uid, await asMember(db, uid));
    let leakyBefore = 0;
    for (const uid of USERS) {
        const spec = await specFor(db, uid);
        const leaked = [...before.get(uid)].filter((id) => !spec.has(id));
        if (leaked.length) leakyBefore += 1;
        for (const id of spec) assert.ok(before.get(uid).has(id), 'live policy never hides what the specification grants');
    }
    assert.ok(leakyBefore >= 25, `live policy leaks to most members (${leakyBefore}/30)`);
    report.before = { anonRows: anonBefore.rows.length, approvedRows: approved, membersWithLeaks: `${leakyBefore}/30` };

    // 1. Apply migration 90 verbatim
    await db.exec(migration);
    assert.deepEqual(await policyNames(db), [{ policyname: 'Requests readable by authorized members', roles: '{authenticated}' }]);

    // 2. anon: refused at the privilege level, and no policy would grant it anyway
    const anonAfter = await asAnon(db);
    assert.ok(anonAfter.error && /permission denied/i.test(anonAfter.error), `anon after: ${JSON.stringify(anonAfter).slice(0, 120)}`);
    await db.exec('GRANT SELECT ON public.requests TO anon');
    const anonNoPrivilegeLayer = await asAnon(db);
    assert.equal(anonNoPrivilegeLayer.rows.length, 0, 'even with the privilege restored the policy gives anon no row');
    await db.exec('REVOKE SELECT ON public.requests FROM anon');

    // 3. every member: exactly the specification, and never more than before
    let lost = 0; let kept = 0;
    for (const uid of USERS) {
        const real = await asMember(db, uid);
        const spec = await specFor(db, uid);
        assert.deepEqual([...real].sort(), [...spec].sort(), `member ${uid} differs from the specification`);
        for (const id of real) assert.ok(before.get(uid).has(id), 'migration never grants more than the live policy');
        lost += before.get(uid).size - real.size;
        kept += real.size;
    }
    report.after = { anon: 'permission denied', membersMatchingSpecification: `${USERS.length}/${USERS.length}`, rowsLostByMembers: lost, rowsKept: kept };

    // 4. Named scenarios (the legitimate paths must survive)
    const find = (predicate) => REQUESTS.find(predicate);
    const publicOpen = find((r) => r.moderation === 'approved' && r.visibility === 'PUBLIC' && r.status === 'OPEN' && r.safety === 'SAFE' && !r.target && ['CLASSIFIED', 'UNCLASSIFIED'].includes(r.classification));
    const stranger = USERS.find((u) => u !== ADMIN && !REQUESTS.some((r) => r.requester === u || r.target === u));
    if (stranger) assert.ok((await asMember(db, stranger)).has(publicOpen.id), 'a member reads a public open announcement');
    const rejected = find((r) => r.moderation === 'rejected' && r.requester && r.requester !== ADMIN);
    assert.ok(!(await asMember(db, rejected.requester)).has(rejected.id), 'a rejected announcement stays hidden from its author, as before');
    const own = find((r) => r.moderation === 'pending' && r.requester && r.requester !== ADMIN);
    assert.ok((await asMember(db, own.requester)).has(own.id), 'an author reads own pending announcement');
    const direct = find((r) => r.visibility === 'DIRECT' && r.target && r.moderation === 'approved' && r.safety !== 'PROHIBITED');
    assert.ok((await asMember(db, direct.target)).has(direct.id), 'the target reads the direct announcement');
    const adminRows = await asMember(db, ADMIN);
    assert.equal(adminRows.size, REQUESTS.length, 'the administrator still reads every row');
    const suspended = await asMember(db, USERS[1]);
    const support = await asMember(db, USERS[2]);
    assert.ok(suspended.size < REQUESTS.length && support.size < REQUESTS.length, 'a suspended admin or a non-admin role does not read everything');

    // 5. The helper only answers for the caller and is closed to anon
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: USERS[5], role: 'authenticated' })]);
    await db.exec('SET ROLE authenticated');
    const mine = (await db.query('SELECT public.lyann_request_participant_access($1) AS ok', [REQUESTS[0].id])).rows[0].ok;
    await db.exec('RESET ROLE');
    assert.equal(typeof mine, 'boolean');
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT public.lyann_request_participant_access($1)', [REQUESTS[0].id]), /permission denied/i);
    await db.exec('RESET ROLE');

    // 6. Writes: author updates own row, a stranger cannot, author gets INSERT ... RETURNING
    const ownRow = find((r) => r.requester && r.requester !== ADMIN && r.moderation !== 'rejected');
    await db.exec(`GRANT UPDATE, INSERT ON public.requests TO authenticated`);
    await db.exec(`CREATE POLICY upd_own ON public.requests FOR UPDATE USING (auth.uid() = requester_id)`);
    await db.exec(`CREATE POLICY ins_own ON public.requests FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND requester_id = auth.uid())`);
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: ownRow.requester, role: 'authenticated' })]);
    await db.exec('SET ROLE authenticated');
    const updated = await db.query(`UPDATE public.requests SET title = 'x2' WHERE id = $1 RETURNING id`, [ownRow.id]);
    const inserted = await db.query(`INSERT INTO public.requests (id, requester_id, title, status, visibility, safety_status, classification_status, public_moderation_status)
        VALUES ($1, $2, 't', 'OPEN', 'PUBLIC', 'SAFE', 'UNCLASSIFIED', 'pending') RETURNING id`, [uuid('d', 1), ownRow.requester]);
    await db.exec('RESET ROLE');
    assert.equal(updated.rows.length, 1);
    assert.equal(inserted.rows.length, 1);
    const other = USERS.find((u) => u !== ownRow.requester && u !== ADMIN);
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: other, role: 'authenticated' })]);
    await db.exec('SET ROLE authenticated');
    const hijack = await db.query(`UPDATE public.requests SET title = 'stolen' WHERE id = $1 RETURNING id`, [ownRow.id]);
    await db.exec('RESET ROLE');
    assert.equal(hijack.rows.length, 0);
    await db.exec(`DROP POLICY upd_own ON public.requests; DROP POLICY ins_own ON public.requests; DELETE FROM public.requests WHERE id = '${uuid('d', 1)}'`);

    // 7. Rollback restores the previous state exactly
    await db.exec(rollback);
    assert.deepEqual(await policyNames(db), [{ policyname: 'Requests are viewable by everyone', roles: '{public}' }]);
    const anonRolledBack = await asAnon(db);
    assert.equal(anonRolledBack.rows.length, approved, 'after rollback anon reads the previous set again');
    for (const uid of USERS) {
        const restored = await asMember(db, uid);
        assert.deepEqual([...restored].sort(), [...before.get(uid)].sort(), 'rollback restores each member to the previous set');
    }
    const fn = (await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'lyann_request_participant_access'`)).rows[0].n;
    const idx = (await db.query(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'idx_missions_related_request'`)).rows[0].n;
    assert.deepEqual([fn, idx], [0, 0]);
    // Rolling back twice is refused, and migration 90 can be applied again
    await expectMigrationRefused(db, rollback, /migration 90 is not applied/);
    await db.exec(migration);
    assert.equal((await asAnon(db)).error !== undefined, true);
    report.rollback = 'previous policy, privilege and member sets restored; re-application works';

    // 8. Preconditions
    await expectMigrationRefused(db, migration, /unexpected SELECT policies/); // already applied: refuses a second run
    const extra = await freshDb();
    await extra.exec(`CREATE POLICY second_door ON public.requests FOR SELECT TO authenticated USING (true)`);
    await expectMigrationRefused(extra, migration, /unexpected SELECT policies/);
    assert.equal((await policyNames(extra)).length, 2, 'a refused migration changes nothing');
    const production = await freshDb(`CREATE POLICY "Requests are viewable by everyone" ON public.requests FOR SELECT TO anon, authenticated
        USING (public_moderation_status = 'approved' AND (visibility = 'PUBLIC' OR requester_id = auth.uid() OR target_user_id = auth.uid()));`);
    await expectMigrationRefused(production, migration, /Staging only|not the expected Staging policy/);
    assert.equal((await asAnon(production)).rows !== undefined, true, 'a refused migration leaves anon privileges untouched');
    report.preconditions = 'second policy refused, Production-shaped policy refused, nothing changed';

    console.log(JSON.stringify(report, null, 2));
    console.log('requests select local check passed');
})().catch((error) => { console.error(error); process.exit(1); });
