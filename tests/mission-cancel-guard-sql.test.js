'use strict';

// Runs migration 87 on an in-memory Postgres (PGlite). PGlite is not a project dependency:
// npm install --no-save @electric-sql/pglite@0.2
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

const SCHEMA = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.missions (id uuid PRIMARY KEY, status text NOT NULL, requester_id uuid, helper_id uuid, request_invitation_id uuid, updated_at timestamptz);
CREATE TABLE public.quotes (id uuid PRIMARY KEY, mission_id uuid);
CREATE TABLE public.milestones (id uuid PRIMARY KEY, quote_id uuid, status text NOT NULL);
CREATE TABLE public.payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), milestone_id uuid, payment_status text, stripe_payment_intent_id text);
CREATE TABLE public.request_invitations (id uuid PRIMARY KEY, conversation_id uuid);
CREATE TABLE public.messages (id serial PRIMARY KEY, conversation_id uuid, sender_id uuid, content text, created_at timestamptz);
`;

const REQUESTER = '00000000-0000-4000-a000-0000000000a1';
const HELPER = '00000000-0000-4000-a000-0000000000b2';
const OUTSIDER = '00000000-0000-4000-a000-0000000000c3';

const CASES = [
    ['unpaid mission', ['PENDING'], [], true],
    ['abandoned checkout', ['PENDING'], [[0, 'CREATED', 'pi_x']], true],
    ['declined card only', ['PENDING'], [[0, 'FAILED', 'pi_x']], true],
    ['3DS in progress', ['PENDING'], [[0, 'REQUIRES_ACTION', 'pi_x']], false],
    ['processing', ['PENDING'], [[0, 'PROCESSING', 'pi_x']], false],
    ['paid, milestone FUNDED', ['FUNDED'], [[0, 'SUCCEEDED', 'pi_x']], false],
    ['paid, milestone webhook late', ['PENDING'], [[0, 'SUCCEEDED', 'pi_x']], false],
    ['one of two milestones paid', ['FUNDED', 'PENDING'], [[0, 'SUCCEEDED', 'pi_x']], false],
    ['partially refunded', ['FUNDED'], [[0, 'PARTIALLY_REFUNDED', 'pi_x']], false],
    ['work declared done', ['COMPLETED'], [[0, 'SUCCEEDED', 'pi_x']], false],
    ['funds transferred', ['RELEASED'], [[0, 'SUCCEEDED', 'pi_x']], false],
    ['disputed', ['DISPUTED'], [[0, 'DISPUTED', 'pi_x']], false],
    ['declined then paid', ['FUNDED'], [[0, 'FAILED', 'pi_a'], [0, 'SUCCEEDED', 'pi_b']], false]
];

let seq = 0;
const uuid = () => `10000000-0000-4000-a000-${String(++seq).padStart(12, '0')}`;

async function freshDb() {
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', '87_lyann_mission_cancel_after_payment_guard_staging.sql'), 'utf8'));
    return db;
}

async function mission(db, milestoneStatuses, payments) {
    const id = uuid(), quote = uuid(), invitation = uuid();
    await db.query('INSERT INTO public.request_invitations VALUES ($1, $2)', [invitation, uuid()]);
    await db.query("INSERT INTO public.missions VALUES ($1, 'AGREED', $2, $3, $4, now())", [id, REQUESTER, HELPER, invitation]);
    await db.query('INSERT INTO public.quotes VALUES ($1, $2)', [quote, id]);
    const milestones = [];
    for (const status of milestoneStatuses) {
        const milestone = uuid();
        milestones.push(milestone);
        await db.query('INSERT INTO public.milestones VALUES ($1, $2, $3)', [milestone, quote, status]);
    }
    for (const [index, status, intent] of payments) {
        await db.query('INSERT INTO public.payments (milestone_id, payment_status, stripe_payment_intent_id) VALUES ($1, $2, $3)', [milestones[index], status, intent]);
    }
    return id;
}

async function cancel(db, missionId, uid) {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
    try {
        await db.query('SELECT public.cancel_mission_secure($1, $2)', [missionId, 'motif QA']);
        return { ok: true };
    } catch (error) {
        return { ok: false, code: error.code, message: error.message };
    }
}

async function status(db, missionId) {
    return (await db.query('SELECT status FROM public.missions WHERE id = $1', [missionId])).rows[0].status;
}

test('migration 87: cancellation stays open before payment and is refused once money is engaged', { skip: !PGlite && 'PGlite absent' }, async () => {
    const db = await freshDb();
    for (const [name, milestones, payments, allowed] of CASES) {
        const id = await mission(db, milestones, payments);
        const result = await cancel(db, id, REQUESTER);
        assert.equal(result.ok, allowed, name);
        assert.equal(await status(db, id), allowed ? 'CANCELLED' : 'AGREED', name);
        if (!allowed) assert.match(result.message, /Aide LYANN/, name);
    }
    await db.close();
});

test('migration 87: the Lyanneur cannot cancel a paid mission; outsiders and anonymous calls are refused', { skip: !PGlite && 'PGlite absent' }, async () => {
    const db = await freshDb();
    const paid = await mission(db, ['FUNDED'], [[0, 'SUCCEEDED', 'pi_x']]);
    assert.equal((await cancel(db, paid, HELPER)).ok, false);
    const unpaid = await mission(db, ['PENDING'], []);
    assert.equal((await cancel(db, unpaid, OUTSIDER)).code, '42501');
    assert.equal((await cancel(db, unpaid, '')).code, '42501');
    const grants = (await db.query("SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'cancel_mission_secure'")).rows.map((row) => row.grantee);
    assert.equal(grants.includes('anon'), false);
    assert.equal(grants.includes('authenticated'), true);
    await db.close();
});

test('migration 87: a second cancellation is refused and logs a single system message', { skip: !PGlite && 'PGlite absent' }, async () => {
    const db = await freshDb();
    const id = await mission(db, ['PENDING'], []);
    assert.equal((await cancel(db, id, REQUESTER)).ok, true);
    const second = await cancel(db, id, HELPER);
    assert.equal(second.ok, false);
    assert.match(second.message, /CANCELLED/);
    const messages = (await db.query("SELECT count(*)::int AS n FROM public.messages WHERE content LIKE '%' || $1 || '%'", [id])).rows[0].n;
    assert.equal(messages, 1);
    await db.close();
});
