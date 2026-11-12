'use strict';

// Migration 95 (prepared, NOT applied): runs the lockdown of the three internal helper RPCs on an in-memory Postgres (PGlite).
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
const FIX = read('95_internal_helper_rpc_lockdown_staging.sql');
const BACK = read('95_internal_helper_rpc_lockdown_rollback.sql');
const FNS = [
    'public.lyann_insert_notification(uuid,text,text,text,text,text)',
    'public.lyann_pair_conversation(uuid,uuid)',
    'public.lyann_ensure_support_welcome(uuid)'
];

// Staging reproduction: Supabase default privileges grant EXECUTE to anon/authenticated/service_role on every new function in public,
// then migrations 39/40 only did REVOKE ... FROM PUBLIC + GRANT service_role, which leaves the explicit anon/authenticated grants.
const SCHEMA = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.notifications (id serial primary key, user_id uuid, type text);
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION public.lyann_insert_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_entity_type text DEFAULT NULL, p_entity_id text DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.notifications(user_id, type) VALUES (p_user_id, p_type); END $$;
CREATE FUNCTION public.lyann_pair_conversation(p_user_a uuid, p_user_b uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN gen_random_uuid(); END $$;
CREATE FUNCTION public.lyann_ensure_support_welcome(p_user_id uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN gen_random_uuid(); END $$;
CREATE FUNCTION public.lyann_trigger_like_caller() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$ BEGIN PERFORM public.lyann_insert_notification('00000000-0000-4000-a000-0000000000a1', 'X', 't', 'b'); END $$;
REVOKE ALL ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lyann_pair_conversation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lyann_ensure_support_welcome(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_insert_notification(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lyann_pair_conversation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lyann_ensure_support_welcome(uuid) TO service_role;
`;

async function acl(db) {
    const out = {};
    for (const f of FNS) {
        const r = await db.query(`select has_function_privilege('anon', '${f}', 'EXECUTE') a, has_function_privilege('authenticated', '${f}', 'EXECUTE') u, has_function_privilege('service_role', '${f}', 'EXECUTE') s`);
        out[f] = r.rows[0];
    }
    return out;
}

async function callAs(db, role, sql) {
    try {
        await db.exec(`SET ROLE ${role}; ${sql}; RESET ROLE;`);
        return 'executed';
    } catch (error) {
        await db.exec('RESET ROLE').catch(() => {});
        return /permission denied/i.test(String(error.message)) ? 'denied' : `error: ${error.message}`;
    }
}

test('migration 95 text is scoped to the three helpers and never touches Production or data', () => {
    assert.match(FIX, /tdktfbtqceldlaeqjtow/);
    assert.doesNotMatch(FIX, /gzispjfoywklpqatjyop/);
    assert.doesNotMatch(FIX.replace(/^--.*$/gm, ''), /\bDROP\s+POLICY|\bDELETE\s+FROM|\bTRUNCATE|\bALTER\s+TABLE|\bCREATE\s+POLICY|\bUPDATE\s+public/i);
    for (const f of ['lyann_insert_notification', 'lyann_pair_conversation', 'lyann_ensure_support_welcome']) {
        assert.match(FIX, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
        assert.match(FIX, new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role`));
    }
    assert.match(FIX, /^COMMIT;/m);
    assert.match(BACK, /GRANT EXECUTE ON FUNCTION public\.lyann_pair_conversation\(uuid, uuid\) TO anon, authenticated, service_role/);
});

test('PGlite: the Staging drift is reproduced, migration 95 closes it, the rollback restores it exactly', { skip: !PGlite && 'PGlite not installed (npm install --no-save @electric-sql/pglite@0.2)' }, async () => {
    const db = new PGlite();
    await db.exec(SCHEMA);

    const before = await acl(db);
    for (const f of FNS) {
        assert.equal(before[f].a, true, `${f}: anon can execute before the fix (drift reproduced)`);
        assert.equal(before[f].u, true);
        assert.equal(before[f].s, true);
    }
    assert.equal(await callAs(db, 'anon', `select public.lyann_insert_notification('00000000-0000-4000-a000-0000000000a1','OPPORTUNITY','t','b')`), 'executed');

    await db.exec(FIX);
    const after = await acl(db);
    for (const f of FNS) assert.deepEqual(after[f], { a: false, u: false, s: true }, f);
    assert.match(await callAs(db, 'anon', `select public.lyann_insert_notification('00000000-0000-4000-a000-0000000000a1','OPPORTUNITY','t','b')`), /denied/);
    assert.match(await callAs(db, 'authenticated', `select public.lyann_pair_conversation('00000000-0000-4000-a000-0000000000a1','00000000-0000-4000-a000-0000000000b2')`), /denied/);
    assert.match(await callAs(db, 'anon', `select public.lyann_ensure_support_welcome('00000000-0000-4000-a000-0000000000a1')`), /denied/);
    assert.equal(await callAs(db, 'service_role', `select public.lyann_pair_conversation('00000000-0000-4000-a000-0000000000a1','00000000-0000-4000-a000-0000000000b2')`), 'executed');
    // an in-database SECURITY DEFINER caller (owner keeps EXECUTE) keeps working for a member
    assert.equal(await callAs(db, 'authenticated', 'select public.lyann_trigger_like_caller()'), 'executed');

    await db.exec(BACK);
    assert.deepEqual(await acl(db), before, 'rollback restores the exact previous privileges');
    await db.close();
});
