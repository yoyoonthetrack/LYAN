#!/usr/bin/env node
/*
 * Phase 3.0B. Proves, on a throw-away Staging QA account only, whether POST /v1/auth/continue-signup can confirm an
 * e-mail address without proof of possession.
 *
 *   node scripts/continue-signup-check.js <backendBaseUrl> --expect=open|closed
 *
 * It creates ONE unconfirmed user (@lyann-test.invalid, no e-mail is sent: Auth admin createUser with email_confirm
 * false), calls the route without any credential, then reads the user back and tries a password sign-in. The user is
 * deleted at the end. No existing account is read or modified. Staging only: force-staging-v2-env refuses any other
 * Supabase project.
 */
require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');

const base = (process.argv[2] || '').replace(/\/$/, '');
const expect = ((process.argv.find((a) => a.startsWith('--expect=')) || '--expect=closed').split('=')[1]);
if (!/^https?:\/\//.test(base)) { console.error('usage: continue-signup-check.js <backendBaseUrl> --expect=open|closed'); process.exit(2); }

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const post = async (body, headers = {}) => {
    const r = await fetch(`${base}/v1/auth/continue-signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
    const email = `qa-3b-${Date.now()}@lyann-test.invalid`;
    const password = `Qa-${Math.random().toString(36).slice(2)}-Aa1`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: false });
    const id = created.data?.user?.id;
    if (!id) { console.error('QA user not created', created.error); process.exit(2); }
    const out = { base, expect, qaUserCreatedUnconfirmed: !created.data.user.email_confirmed_at };
    try {
        out.callWithoutCredential = await post({ userId: id });
        const after = await admin.auth.admin.getUserById(id);
        out.confirmedAfterCall = !!after.data?.user?.email_confirmed_at;
        const login = await anon.auth.signInWithPassword({ email, password });
        out.passwordLogin = login.error ? { ok: false, code: login.error.code || login.error.message } : { ok: true };
        // Existence oracle: does the response differ between a real id and an unknown id?
        out.unknownId = await post({ userId: '00000000-0000-4000-8000-0000000000aa' });
        out.malformedId = await post({ userId: 'not-a-uuid' });
        out.oracle = JSON.stringify([out.callWithoutCredential.status, out.callWithoutCredential.body]) !== JSON.stringify([out.unknownId.status, out.unknownId.body]);
    } finally {
        const del = await admin.auth.admin.deleteUser(id);
        out.qaUserDeleted = !del.error;
    }
    const open = out.confirmedAfterCall === true || out.passwordLogin?.ok === true;
    out.verdict = open ? 'OPEN: an unauthenticated caller confirmed an address' : 'CLOSED: confirmation refused, address still unconfirmed';
    console.log(JSON.stringify(out, null, 2));
    process.exit((expect === 'open') === open ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
