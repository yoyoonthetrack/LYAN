'use strict';

// Migrations 96 and 97 (prepared, NOT applied): run on an in-memory Postgres (PGlite).
// PGlite is not a project dependency: npm install --no-save @electric-sql/pglite@0.2
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let PGlite = null;
try {
    ({ PGlite } = require('@electric-sql/pglite'));
} catch (_) {
    PGlite = null;
}

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const M96 = read('96_conversations_insert_policy_lockdown_staging.sql');
const B96 = read('96_conversations_insert_policy_lockdown_rollback.sql');
const M97 = read('97_default_function_privileges_lockdown_staging.sql');
const B97 = read('97_default_function_privileges_lockdown_rollback.sql');
const skip = !PGlite && 'PGlite not installed (npm install --no-save @electric-sql/pglite@0.2)';
const code = sql => sql.replace(/^--.*$/gm, '');

const A = '00000000-0000-4000-a000-0000000000a1';
const B = '00000000-0000-4000-a000-0000000000b2';

// Staging reproduction: two PERMISSIVE INSERT policies on conversations, full table grants for anon / authenticated (Supabase default).
const SCHEMA = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO anon, authenticated, service_role;
CREATE TABLE public.conversations (id uuid primary key default gen_random_uuid(), mission_id uuid, started_by uuid, context_mode text default 'request');
CREATE TABLE public.conversation_participants (conversation_id uuid, user_id uuid);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.conversations, public.conversation_participants TO anon, authenticated, service_role;
CREATE POLICY "Participants can view conversation" ON public.conversations FOR SELECT TO public
  USING (exists (select 1 from public.conversation_participants p where p.conversation_id = id and p.user_id::text = coalesce(current_setting('test.uid', true), '')));
CREATE POLICY "No direct insert on conversations for standard users" ON public.conversations FOR INSERT TO public WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Users can insert conversations" ON public.conversations FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "No direct insert on participants for standard users" ON public.conversation_participants FOR INSERT TO public WITH CHECK (public.is_current_user_admin());
-- legitimate creation path: SECURITY DEFINER owned by the (superuser) owner, like get_or_create_conversation
CREATE FUNCTION public.get_or_create_conversation(p_target uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; BEGIN
  INSERT INTO public.conversations (started_by, context_mode) VALUES (nullif(current_setting('test.uid', true), '')::uuid, 'direct') RETURNING id INTO v;
  INSERT INTO public.conversation_participants VALUES (v, nullif(current_setting('test.uid', true), '')::uuid), (v, p_target);
  RETURN v; END $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
`;

async function as(db, role, sql, uid = '', admin = false) {
    await db.exec(`SELECT set_config('test.uid', '${uid}', false), set_config('test.admin', '${admin ? 'on' : ''}', false);`);
    try {
        await db.exec(`SET ROLE ${role}; ${sql}; RESET ROLE;`);
        return 'ok';
    } catch (error) {
        await db.exec('RESET ROLE').catch(() => {});
        return /row-level security|permission denied/i.test(String(error.message)) ? 'denied' : `error: ${error.message}`;
    }
}

const policies = async db => (await db.query(`select policyname, cmd, roles::text roles, permissive, qual, with_check from pg_policies where tablename = 'conversations' order by policyname`)).rows;

test('migration 96 text removes exactly one policy and nothing else', () => {
    assert.match(M96, /tdktfbtqceldlaeqjtow/);
    assert.doesNotMatch(M96, /gzispjfoywklpqatjyop/);
    const body = code(M96);
    assert.equal((body.match(/\bDROP\s+POLICY\b/gi) || []).length, 1);
    assert.match(body, /DROP POLICY "Users can insert conversations" ON public\.conversations;/);
    assert.doesNotMatch(body, /\bCREATE\s+POLICY|\bDELETE\s+FROM|\bTRUNCATE|\bALTER\s+TABLE|\bUPDATE\s+public|\bINSERT\s+INTO|\bGRANT\b|\bREVOKE\b/i);
    assert.match(M96, /^COMMIT;/m);
    assert.match(B96, /CREATE POLICY "Users can insert conversations" ON public\.conversations FOR INSERT TO public WITH CHECK \(true\);/);
});

test('migration 97 text only edits default function privileges', () => {
    const body = code(M97);
    assert.doesNotMatch(M97, /gzispjfoywklpqatjyop/);
    assert.doesNotMatch(body, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b|\bINSERT\b|\bCREATE\s+POLICY|\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public/i);
    assert.match(body, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;/);
    assert.match(B97, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;/);
});

test('PGlite: migration 96 closes direct INSERT, keeps the legitimate paths, rollback is exact', { skip }, async () => {
    const db = new PGlite();
    await db.exec(SCHEMA);
    const before = await policies(db);
    assert.equal(before.length, 3);

    // drift reproduced: anon and members can insert, with a forged started_by
    assert.equal(await as(db, 'anon', `insert into public.conversations (started_by, context_mode) values ('${B}', 'direct')`), 'ok');
    assert.equal(await as(db, 'authenticated', `insert into public.conversations (started_by) values ('${B}')`, A), 'ok');

    await db.exec(M96);
    const after = await policies(db);
    assert.deepEqual(after.map(p => p.policyname), ['No direct insert on conversations for standard users', 'Participants can view conversation']);
    assert.deepEqual(after.filter(p => p.policyname !== 'Users can insert conversations'), before.filter(p => p.policyname !== 'Users can insert conversations'), 'other policies untouched');

    assert.equal(await as(db, 'anon', `insert into public.conversations (started_by, context_mode) values ('${B}', 'direct')`), 'denied');
    assert.equal(await as(db, 'authenticated', `insert into public.conversations (started_by) values ('${B}')`, A), 'denied');
    assert.equal(await as(db, 'authenticated', `insert into public.conversations (started_by) values ('${A}')`, A), 'denied');
    assert.equal(await as(db, 'authenticated', `insert into public.conversation_participants values (gen_random_uuid(), '${A}')`, A), 'denied');
    // legitimate paths
    assert.equal(await as(db, 'authenticated', `select public.get_or_create_conversation('${B}')`, A), 'ok', 'SECURITY DEFINER creation path');
    assert.equal(await as(db, 'service_role', `insert into public.conversations (started_by) values ('${A}')`), 'ok', 'service_role bypasses RLS');
    assert.equal(await as(db, 'authenticated', `insert into public.conversations (started_by) values ('${A}')`, A, true), 'ok', 'admin keeps direct insert');
    // member still reads his own conversation, never another one
    const mine = await db.query(`select count(*)::int n from public.conversations c where c.started_by = '${A}' and c.context_mode = 'direct'`);
    assert.ok(mine.rows[0].n >= 1);

    await db.exec(B96);
    assert.deepEqual(await policies(db), before, 'rollback restores the exact policy set');
    assert.equal(await as(db, 'anon', `insert into public.conversations (started_by) values ('${B}')`), 'ok', 'rollback reopens the original behavior');

    // refuses to run when the expected policy is absent (no silent drift) and when the admin-only policy is missing
    await db.exec(`DROP POLICY "Users can insert conversations" ON public.conversations`);
    await assert.rejects(() => db.exec(M96), /not found as expected/);
    await db.exec('ROLLBACK');
    await db.exec(B96);
    await db.exec(`DROP POLICY "No direct insert on conversations for standard users" ON public.conversations`);
    await assert.rejects(() => db.exec(M96), /admin-only INSERT policy is missing/);
    await db.exec('ROLLBACK');
    await db.close();
});

test('PGlite: migration 97 only affects functions created afterwards, rollback restores the defaults', { skip }, async () => {
    const db = new PGlite();
    await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;`);
    const defaults = async () => (await db.query(`select defaclnamespace::oid::int ns, defaclobjtype::text t, defaclacl::text acl from pg_default_acl order by 1, 2`)).rows;
    const snapshot0 = await defaults();
    const priv = async fn => (await db.query(`select has_function_privilege('anon', '${fn}', 'EXECUTE') a, has_function_privilege('authenticated', '${fn}', 'EXECUTE') u, has_function_privilege('service_role', '${fn}', 'EXECUTE') s`)).rows[0];
    await db.exec(`CREATE FUNCTION public.before_97() RETURNS int LANGUAGE sql AS 'select 1'`);
    assert.deepEqual(await priv('public.before_97()'), { a: true, u: true, s: true }, 'drift reproduced for a new function');
    assert.match((await db.query(`select proacl::text p from pg_proc where proname = 'before_97'`)).rows[0].p, /=X\/postgres/, 'PUBLIC grant present too (built-in default)');

    await db.exec(M97);
    await db.exec(`CREATE FUNCTION public.after_97() RETURNS int LANGUAGE sql AS 'select 1'`);
    assert.deepEqual(await priv('public.after_97()'), { a: false, u: false, s: true }, 'a new function is no longer exposed');
    assert.deepEqual(await priv('public.before_97()'), { a: true, u: true, s: true }, 'existing functions are unchanged');
    // an explicit GRANT still makes a function public API
    await db.exec(`CREATE FUNCTION public.explicit_rpc() RETURNS int LANGUAGE sql AS 'select 1'; GRANT EXECUTE ON FUNCTION public.explicit_rpc() TO authenticated`);
    assert.deepEqual(await priv('public.explicit_rpc()'), { a: false, u: true, s: true });

    assert.equal((await db.query(`select proacl::text p from pg_proc where proname = 'after_97'`)).rows[0].p, '{postgres=X/postgres,service_role=X/postgres}');

    await db.exec(B97);
    assert.deepEqual(await defaults(), snapshot0, 'rollback restores pg_default_acl exactly');
    await db.exec(`CREATE FUNCTION public.after_rollback() RETURNS int LANGUAGE sql AS 'select 1'`);
    assert.deepEqual(await priv('public.after_rollback()'), { a: true, u: true, s: true }, 'rollback restores the default grants');
    await db.close();
});
