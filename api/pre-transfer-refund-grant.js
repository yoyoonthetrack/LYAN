'use strict';

const fs = require('fs');
const path = require('path');
const { STAGING_REF, PRODUCTION_REF } = require('../scripts/staging-v2-guard');
const { inspectStripeEnv, refundIdempotencyKey } = require('./stripe-policy');

const STRIPE_TEST_PLATFORM_ACCOUNT = 'acct_1U1RkJLqYzmscXLu';
const STRIPE_TEST_CONNECT_ACCOUNT = 'acct_1UQSauLqYzxtggU5';
const GRANT_STATE_PATH = path.join(__dirname, '../artifacts/staging-v2/phase615/grant.state.json');
const QA_REQUESTER_A = '41f31232-70c7-4515-b987-e8160a127f85';
const FUTURE_QA_PAYMENT_ID = '9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175';
const FUTURE_QA_MILESTONE_ID = '8381e711-e08a-47d5-a0c9-78cc15ac2a61';
const FUTURE_QA_PAYMENT_INTENT_ID = 'pi_3UQayALqYzmscXLu0QoeTz81';
const BLOCKED_PAYMENTS = Object.freeze([
    'eee5271c-6a99-410b-8031-f2987a496d26',
    '58f0aad9-9852-4e99-9a51-a3179b049e60',
    'ee5a0c1e-ed4c-471f-8beb-4a9906166c3b',
    '9273e301-afaa-4421-a10a-cb47033dd225'
]);

const AUTHORIZED_615 = Object.freeze({
    supabase_project: STAGING_REF,
    stripe_account: STRIPE_TEST_PLATFORM_ACCOUNT,
    connect_account_id: STRIPE_TEST_CONNECT_ACCOUNT,
    requester_id: QA_REQUESTER_A,
    payment_id: FUTURE_QA_PAYMENT_ID,
    milestone_id: FUTURE_QA_MILESTONE_ID,
    stripe_payment_intent_id: FUTURE_QA_PAYMENT_INTENT_ID,
    max_amount_cents: 4349,
    stripe_livemode: false,
    single_logical_operation: true
});

const PRE_TRANSFER_REFUND_GRANT = Object.freeze({
    active: false,
    supabase_project: STAGING_REF,
    stripe_account: STRIPE_TEST_PLATFORM_ACCOUNT,
    connect_account_id: STRIPE_TEST_CONNECT_ACCOUNT,
    requester_id: null,
    payment_id: null,
    milestone_id: null,
    stripe_payment_intent_id: null,
    max_amount_cents: 4349,
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

function evaluatePreTransferRefundGrant(grant, facts) {
    const g = grant || PRE_TRANSFER_REFUND_GRANT;
    const f = facts || {};
    if (f.supabaseProject === PRODUCTION_REF || g.supabase_project === PRODUCTION_REF) {
        return { ok: false, write: false, code: 'PRODUCTION_FORBIDDEN' };
    }
    if (f.livemode === true || g.stripe_livemode === true) {
        return { ok: false, write: false, code: 'STRIPE_LIVE_BLOCKED' };
    }
    if (f.env && inspectStripeEnv(f.env).secretKind === 'live') {
        return { ok: false, write: false, code: 'STRIPE_LIVE_BLOCKED' };
    }
    if (g.active !== true) {
        return { ok: false, write: false, code: 'GRANT_INACTIVE' };
    }
    if (!g.payment_id || !g.requester_id || g.max_amount_cents == null || !g.expires_at) {
        return { ok: false, write: false, code: 'GRANT_INCOMPLETE' };
    }
    if (BLOCKED_PAYMENTS.includes(String(g.payment_id)) || BLOCKED_PAYMENTS.includes(String(f.paymentId))) {
        return { ok: false, write: false, code: 'HISTORIC_PAYMENT_FORBIDDEN' };
    }
    if (g.supabase_project !== STAGING_REF || f.supabaseProject !== g.supabase_project) {
        return { ok: false, write: false, code: 'SUPABASE_PROJECT_MISMATCH' };
    }
    if (!f.stripeAccount || f.stripeAccount !== g.stripe_account || g.stripe_account !== STRIPE_TEST_PLATFORM_ACCOUNT) {
        return { ok: false, write: false, code: 'STRIPE_ACCOUNT_MISMATCH' };
    }
    if (g.expires_at && new Date(f.now || Date.now()).getTime() > new Date(g.expires_at).getTime()) {
        return { ok: false, write: false, code: 'GRANT_EXPIRED' };
    }
    if (String(f.paymentId) !== String(g.payment_id)) {
        return { ok: false, write: false, code: 'PAYMENT_NOT_GRANTED' };
    }
    if (g.requester_id && f.requesterId && String(f.requesterId) !== String(g.requester_id)) {
        return { ok: false, write: false, code: 'REQUESTER_NOT_GRANTED' };
    }
    if (g.stripe_payment_intent_id && f.paymentIntent && String(f.paymentIntent) !== String(g.stripe_payment_intent_id)) {
        return { ok: false, write: false, code: 'PAYMENT_INTENT_NOT_GRANTED' };
    }
    if (Number(f.amountCents) > Number(g.max_amount_cents)) {
        return { ok: false, write: false, code: 'AMOUNT_EXCEEDS_GRANT' };
    }
    if (Number(f.amountCents) <= 0) {
        return { ok: false, write: false, code: 'AMOUNT_NOT_POSITIVE' };
    }
    return {
        ok: true,
        write: true,
        code: 'GRANT_MATCH',
        idempotencyKey: refundIdempotencyKey(g.payment_id),
        single_logical_operation: g.single_logical_operation === true
    };
}

function matchesAuthorized615(parsed) {
    return parsed
        && parsed.active === true
        && String(parsed.supabase_project) === AUTHORIZED_615.supabase_project
        && String(parsed.stripe_account) === AUTHORIZED_615.stripe_account
        && String(parsed.requester_id) === AUTHORIZED_615.requester_id
        && String(parsed.payment_id) === AUTHORIZED_615.payment_id
        && Number(parsed.max_amount_cents) === AUTHORIZED_615.max_amount_cents
        && parsed.stripe_livemode === false
        && parsed.stripe_payment_intent_id;
}

function loadPreTransferRefundGrant() {
    try {
        if (!fs.existsSync(GRANT_STATE_PATH)) return PRE_TRANSFER_REFUND_GRANT;
        const parsed = JSON.parse(fs.readFileSync(GRANT_STATE_PATH, 'utf8'));
        if (!matchesAuthorized615(parsed) || !parsed.expires_at) return PRE_TRANSFER_REFUND_GRANT;
        const expires = new Date(parsed.expires_at).getTime();
        const now = Date.now();
        if (!Number.isFinite(expires) || expires <= now || expires > now + (20 * 60 * 1000) + 5000) {
            return PRE_TRANSFER_REFUND_GRANT;
        }
        return Object.freeze({
            ...AUTHORIZED_615,
            active: true,
            stripe_payment_intent_id: parsed.stripe_payment_intent_id,
            expires_at: parsed.expires_at
        });
    } catch (_) {
        return PRE_TRANSFER_REFUND_GRANT;
    }
}

function writePreTransferRefundGrant(expiresAt) {
    const expires = expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const payload = {
        ...AUTHORIZED_615,
        active: true,
        expires_at: expires
    };
    fs.mkdirSync(path.dirname(GRANT_STATE_PATH), { recursive: true });
    fs.writeFileSync(GRANT_STATE_PATH, JSON.stringify(payload, null, 2));
    return loadPreTransferRefundGrant();
}

function clearPreTransferRefundGrant() {
    if (fs.existsSync(GRANT_STATE_PATH)) fs.unlinkSync(GRANT_STATE_PATH);
    return PRE_TRANSFER_REFUND_GRANT;
}

function grantFactsFromPayment(payment, options) {
    const env = (options && options.env) || process.env;
    const inspected = inspectStripeEnv(env);
    return {
        paymentId: payment && payment.id,
        requesterId: options && options.requesterId,
        paymentIntent: payment && payment.stripe_payment_intent_id,
        amountCents: Number(payment && payment.customer_total_cents),
        supabaseProject: supabaseProjectFromEnv(env),
        stripeAccount: (options && options.stripeAccount)
            || (inspected.mode === 'test' ? STRIPE_TEST_PLATFORM_ACCOUNT : null),
        livemode: inspected.mode === 'live' || inspected.secretKind === 'live' || (options && options.livemode === true),
        now: (options && options.now) || new Date(),
        env
    };
}

module.exports = {
    STAGING_REF,
    PRODUCTION_REF,
    STRIPE_TEST_PLATFORM_ACCOUNT,
    STRIPE_TEST_CONNECT_ACCOUNT,
    QA_REQUESTER_A,
    FUTURE_QA_PAYMENT_ID,
    FUTURE_QA_MILESTONE_ID,
    FUTURE_QA_PAYMENT_INTENT_ID,
    BLOCKED_PAYMENTS,
    AUTHORIZED_615,
    PRE_TRANSFER_REFUND_GRANT,
    GRANT_STATE_PATH,
    evaluatePreTransferRefundGrant,
    loadPreTransferRefundGrant,
    writePreTransferRefundGrant,
    clearPreTransferRefundGrant,
    grantFactsFromPayment,
    supabaseProjectFromEnv
};
