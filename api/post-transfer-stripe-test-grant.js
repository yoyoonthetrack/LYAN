'use strict';

const fs = require('fs');
const path = require('path');
const { STAGING_REF, PRODUCTION_REF } = require('../scripts/staging-v2-guard');
const { inspectStripeEnv, postTransferOperationKeys } = require('./stripe-policy');

const STRIPE_TEST_PLATFORM_ACCOUNT = 'acct_1U1RkJLqYzmscXLu';
const STRIPE_TEST_CONNECT_ACCOUNT = 'acct_1UQSauLqYzxtggU5';
const GRANT_STATE_PATH = path.join(__dirname, '../artifacts/staging-v2/phase612c/grant.state.json');
const HISTORIC_PAYMENTS = Object.freeze([
    'eee5271c-6a99-410b-8031-f2987a496d26',
    '58f0aad9-9852-4e99-9a51-a3179b049e60',
    'ee5a0c1e-ed4c-471f-8beb-4a9906166c3b'
]);

const AUTHORIZED_612C = Object.freeze({
    supabase_project: STAGING_REF,
    project_id: STAGING_REF,
    stripe_account: STRIPE_TEST_PLATFORM_ACCOUNT,
    platform_account_id: STRIPE_TEST_PLATFORM_ACCOUNT,
    connect_account_id: STRIPE_TEST_CONNECT_ACCOUNT,
    request_id: 'a0fb8b98-0cf4-4d95-9d7e-bc72bc82d97c',
    payment_id: '9273e301-afaa-4421-a10a-cb47033dd225',
    operation_id: '1ab92753-74b1-4650-b0cf-7ad51c13d3b4',
    max_amount_cents: 4349,
    max_reversal_cents: 4074,
    stripe_livemode: false,
    single_logical_operation: true
});

const STRIPE_TEST_GRANT = Object.freeze({
    active: false,
    supabase_project: STAGING_REF,
    project_id: STAGING_REF,
    stripe_account: STRIPE_TEST_PLATFORM_ACCOUNT,
    platform_account_id: STRIPE_TEST_PLATFORM_ACCOUNT,
    connect_account_id: STRIPE_TEST_CONNECT_ACCOUNT,
    request_id: null,
    payment_id: null,
    operation_id: null,
    max_amount_cents: 4349,
    max_reversal_cents: 4074,
    expires_at: null,
    stripe_livemode: false,
    single_logical_operation: true
});

function supabaseProjectFromEnv(env) {
    const src = env || process.env;
    const url = String(src.LYANN_SUPABASE_URL || src.SUPABASE_URL || '');
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
    if (match) return match[1];
    return String(src.LYANN_E2E_WRITE_PROJECT_REF || '') || null;
}

function grantFactsFromValidated(ctx, options) {
    const env = (options && options.env) || process.env;
    const inspected = inspectStripeEnv(env);
    const payment = ctx.payment || {};
    return {
        requestId: ctx.request && ctx.request.id,
        paymentId: payment.id,
        operationId: ctx.decision && ctx.decision.operation_id,
        amountCents: ctx.amount && ctx.amount.cents,
        supabaseProject: supabaseProjectFromEnv(env),
        stripeAccount: options && options.stripeAccount || null,
        connectAccount: (options && options.connectAccount)
            || payment.stripe_connect_account_id
            || payment.connect_account_id
            || null,
        livemode: inspected.mode === 'live' || inspected.secretKind === 'live' || (options && options.livemode === true),
        now: options && options.now || new Date(),
        env
    };
}

function evaluateStripeTestGrant(grant, facts) {
    const g = grant || STRIPE_TEST_GRANT;
    const f = facts || {};
    if (f.supabaseProject === PRODUCTION_REF) {
        return { ok: false, code: 'PRODUCTION_FORBIDDEN', write: false };
    }
    if (f.livemode === true || g.stripe_livemode === true) {
        return { ok: false, code: 'STRIPE_LIVE_BLOCKED', write: false };
    }
    if (f.env && inspectStripeEnv(f.env).secretKind === 'live') {
        return { ok: false, code: 'STRIPE_LIVE_BLOCKED', write: false };
    }
    if (g.active !== true) {
        return { ok: false, code: 'STRIPE_TEST_NOT_ACTIVATED', write: false, stripe_test_allowed: false };
    }
    if (!g.request_id || !g.payment_id || !g.operation_id || g.max_amount_cents == null || !g.expires_at) {
        return { ok: false, code: 'GRANT_INCOMPLETE', write: false };
    }
    if (HISTORIC_PAYMENTS.includes(String(g.payment_id)) || HISTORIC_PAYMENTS.includes(String(f.paymentId))) {
        return { ok: false, code: 'HISTORIC_PAYMENT_FORBIDDEN', write: false };
    }
    if (g.supabase_project !== STAGING_REF || f.supabaseProject !== g.supabase_project) {
        return { ok: false, code: 'SUPABASE_PROJECT_MISMATCH', write: false };
    }
    if (!f.stripeAccount || f.stripeAccount !== g.stripe_account || g.stripe_account !== STRIPE_TEST_PLATFORM_ACCOUNT) {
        return { ok: false, code: 'STRIPE_ACCOUNT_MISMATCH', write: false };
    }
    if (g.connect_account_id && f.connectAccount && f.connectAccount !== g.connect_account_id) {
        return { ok: false, code: 'CONNECT_ACCOUNT_MISMATCH', write: false };
    }
    if (g.expires_at && new Date(f.now || Date.now()).getTime() > new Date(g.expires_at).getTime()) {
        return { ok: false, code: 'GRANT_EXPIRED', write: false };
    }
    if (String(f.requestId) !== String(g.request_id)) {
        return { ok: false, code: 'REQUEST_NOT_GRANTED', write: false };
    }
    if (String(f.paymentId) !== String(g.payment_id)) {
        return { ok: false, code: 'PAYMENT_NOT_GRANTED', write: false };
    }
    if (String(f.operationId) !== String(g.operation_id)) {
        return { ok: false, code: 'OPERATION_NOT_GRANTED', write: false };
    }
    if (Number(f.amountCents) > Number(g.max_amount_cents)) {
        return { ok: false, code: 'AMOUNT_EXCEEDS_GRANT', write: false };
    }
    if (Number(f.amountCents) <= 0) {
        return { ok: false, code: 'AMOUNT_NOT_POSITIVE', write: false };
    }
    const keys = postTransferOperationKeys(g.operation_id);
    if (!keys.ok) return { ok: false, code: keys.code, write: false };
    return {
        ok: true,
        code: 'GRANT_MATCH',
        write: true,
        single_logical_operation: g.single_logical_operation === true,
        reversalKey: keys.reversalKey,
        refundKey: keys.refundKey,
        operation_id: keys.operation_id
    };
}

function matchesAuthorized612c(parsed) {
    return parsed
        && parsed.active === true
        && String(parsed.supabase_project || parsed.project_id) === AUTHORIZED_612C.supabase_project
        && String(parsed.stripe_account || parsed.platform_account_id) === AUTHORIZED_612C.stripe_account
        && String(parsed.connect_account_id) === AUTHORIZED_612C.connect_account_id
        && String(parsed.request_id) === AUTHORIZED_612C.request_id
        && String(parsed.payment_id) === AUTHORIZED_612C.payment_id
        && String(parsed.operation_id) === AUTHORIZED_612C.operation_id
        && Number(parsed.max_amount_cents) === AUTHORIZED_612C.max_amount_cents
        && Number(parsed.max_reversal_cents) === AUTHORIZED_612C.max_reversal_cents
        && parsed.stripe_livemode === false;
}

function loadServerGrant() {
    try {
        if (!fs.existsSync(GRANT_STATE_PATH)) return STRIPE_TEST_GRANT;
        const parsed = JSON.parse(fs.readFileSync(GRANT_STATE_PATH, 'utf8'));
        if (!matchesAuthorized612c(parsed) || !parsed.expires_at) return STRIPE_TEST_GRANT;
        const expires = new Date(parsed.expires_at).getTime();
        const now = Date.now();
        if (!Number.isFinite(expires) || expires <= now || expires > now + (30 * 60 * 1000) + 5000) {
            return STRIPE_TEST_GRANT;
        }
        return Object.freeze({
            ...AUTHORIZED_612C,
            active: true,
            expires_at: parsed.expires_at
        });
    } catch (_) {
        return STRIPE_TEST_GRANT;
    }
}

function writeServerGrant(expiresAt) {
    const expires = expiresAt || new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const payload = {
        ...AUTHORIZED_612C,
        active: true,
        expires_at: expires
    };
    fs.mkdirSync(path.dirname(GRANT_STATE_PATH), { recursive: true });
    fs.writeFileSync(GRANT_STATE_PATH, JSON.stringify(payload, null, 2));
    return loadServerGrant();
}

function clearServerGrant() {
    if (fs.existsSync(GRANT_STATE_PATH)) fs.unlinkSync(GRANT_STATE_PATH);
    return STRIPE_TEST_GRANT;
}

function decideStripeWriteAfterReconcile(read) {
    const row = read || {};
    if (row.livemode === true) {
        return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: 'STRIPE_LIVE_BLOCKED' };
    }
    if (row.timeout === true || row.incomplete === true || row.status === 'uncertain') {
        return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: row.code || 'STRIPE_READ_UNCERTAIN' };
    }
    if (Number(row.candidates || 0) > 1) {
        return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: 'MULTIPLE_CANDIDATES' };
    }
    if (row.mismatch === true) {
        return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: row.code || 'STRIPE_ID_FOREIGN' };
    }
    if (row.found === true && row.searchComplete === true && row.id) {
        if (row.expectedAmount != null && Number(row.amount) !== Number(row.expectedAmount)) {
            return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: 'AMOUNT_MISMATCH' };
        }
        if (row.expectedParent && row.parent && row.parent !== row.expectedParent) {
            return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: 'PARENT_MISMATCH' };
        }
        if (row.expectedDestination && row.destination && row.destination !== row.expectedDestination) {
            return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: 'DESTINATION_MISMATCH' };
        }
        return { write: false, reuse: row.id, lock_kept: true, retryBlind: false, code: 'RECONCILED_EXISTING' };
    }
    if (row.found === false && row.searchComplete === true) {
        return { write: true, reuse: null, lock_kept: true, retryBlind: false, code: 'ABSENT_MAY_CREATE' };
    }
    return { write: false, reuse: null, lock_kept: true, retryBlind: false, code: 'STRIPE_READ_UNCERTAIN' };
}

function admitStripeTestWrite(grant, facts, prepared) {
    const evaluated = evaluateStripeTestGrant(grant, facts);
    if (!evaluated.ok) {
        return { ok: false, invoked: false, createReversal: false, createRefund: false, code: evaluated.code };
    }
    if (!prepared || prepared.ok !== true) {
        return { ok: false, invoked: false, createReversal: false, createRefund: false, code: (prepared && prepared.code) || 'PREPARE_REQUIRED' };
    }
    if (prepared.idempotencyKey !== evaluated.reversalKey && prepared.idempotencyKey !== evaluated.refundKey) {
        return { ok: false, invoked: false, createReversal: false, createRefund: false, code: 'IDEMPOTENCY_KEY_MISMATCH' };
    }
    return {
        ok: true,
        code: 'GRANT_MATCH',
        invoked: false,
        idempotencyKey: prepared.idempotencyKey,
        method: prepared.method
    };
}

module.exports = {
    STAGING_REF,
    PRODUCTION_REF,
    STRIPE_TEST_PLATFORM_ACCOUNT,
    STRIPE_TEST_CONNECT_ACCOUNT,
    HISTORIC_PAYMENTS,
    AUTHORIZED_612C,
    STRIPE_TEST_GRANT,
    GRANT_STATE_PATH,
    loadServerGrant,
    writeServerGrant,
    clearServerGrant,
    evaluateStripeTestGrant,
    grantFactsFromValidated,
    decideStripeWriteAfterReconcile,
    admitStripeTestWrite,
    supabaseProjectFromEnv
};
