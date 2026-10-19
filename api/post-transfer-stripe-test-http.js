'use strict';

const {
    inspectStripeEnv,
    postTransferFinancialExecutionEnabled
} = require('./stripe-policy');
const { createPostTransferSupabaseAdapter } = require('./post-transfer-supabase-adapter');
const {
    loadServerGrant,
    evaluateStripeTestGrant,
    AUTHORIZED_612C
} = require('./post-transfer-stripe-test-grant');

function moneyOff(extra) {
    return {
        ok: false,
        invoked: false,
        execute: false,
        createReversal: false,
        createRefund: false,
        real: false,
        ...extra
    };
}

function createStripeTestHttpDispatch({ stripe, facts }) {
    const calls = [];
    const stats = { writes: 0, reads: 0 };

    async function reconcile(prepared, expected) {
        stats.reads += 1;
        const grant = loadServerGrant();
        const admitted = evaluateStripeTestGrant(grant, facts);
        if (!admitted.ok) return { found: false, searchComplete: false, incomplete: true, code: admitted.code };
        try {
            if (prepared && prepared.method === 'transfers.createReversal') {
                const listed = await stripe.transfers.listReversals(prepared.transfer, { limit: 100 });
                const data = ((listed && listed.data) || []).filter((row) => row && row.livemode !== true);
                const matches = data.filter((row) => Number(row.amount) === Number(expected && expected.expectedAmount != null ? expected.expectedAmount : prepared.amount));
                calls.push({ kind: 'reconcile', method: 'transfers.listReversals', count: matches.length });
                if (data.some((row) => row.livemode === true)) {
                    return { livemode: true, found: true, searchComplete: true };
                }
                if (listed && listed.has_more === true) {
                    return { found: false, searchComplete: false, incomplete: true, candidates: data.length };
                }
                if (matches.length > 1) {
                    return { found: true, searchComplete: true, candidates: matches.length };
                }
                if (matches.length === 1) {
                    return {
                        found: true,
                        searchComplete: true,
                        id: matches[0].id,
                        amount: matches[0].amount,
                        parent: prepared.transfer,
                        destination: expected && expected.expectedDestination || null,
                        livemode: false,
                        candidates: 1
                    };
                }
                return { found: false, searchComplete: true, candidates: 0, livemode: false };
            }
            if (prepared && prepared.method === 'refunds.create') {
                const listed = await stripe.refunds.list({
                    payment_intent: prepared.payment_intent,
                    limit: 100
                });
                const data = ((listed && listed.data) || []).filter((row) => row && row.livemode !== true);
                const matches = data.filter((row) => Number(row.amount) === Number(expected && expected.expectedAmount != null ? expected.expectedAmount : prepared.amount));
                calls.push({ kind: 'reconcile', method: 'refunds.list', count: matches.length });
                if (listed && listed.has_more === true) {
                    return { found: false, searchComplete: false, incomplete: true, candidates: data.length };
                }
                if (matches.length > 1) {
                    return { found: true, searchComplete: true, candidates: matches.length };
                }
                if (matches.length === 1) {
                    return {
                        found: true,
                        searchComplete: true,
                        id: matches[0].id,
                        amount: matches[0].amount,
                        parent: prepared.payment_intent,
                        livemode: false,
                        candidates: 1
                    };
                }
                return { found: false, searchComplete: true, candidates: 0, livemode: false };
            }
            return { found: false, searchComplete: false, incomplete: true };
        } catch (error) {
            if (error && (error.code === 'ETIMEDOUT' || error.type === 'StripeConnectionError')) {
                return { found: false, searchComplete: false, timeout: true, incomplete: true };
            }
            return { found: false, searchComplete: false, incomplete: true, error: String(error && error.code || 'read_failed') };
        }
    }

    async function dispatch(prepared) {
        const grant = loadServerGrant();
        const admitted = evaluateStripeTestGrant(grant, facts);
        if (!admitted.ok) return moneyOff({ code: admitted.code });
        if (!prepared || prepared.ok !== true) return moneyOff({ code: 'PREPARE_REQUIRED' });
        if (prepared.idempotencyKey !== admitted.reversalKey && prepared.idempotencyKey !== admitted.refundKey) {
            return moneyOff({ code: 'IDEMPOTENCY_KEY_MISMATCH' });
        }
        if (prepared.method === 'transfers.createReversal') {
            if (Number(prepared.amount) !== AUTHORIZED_612C.max_reversal_cents) {
                return moneyOff({ code: 'AMOUNT_EXCEEDS_GRANT' });
            }
            const created = await stripe.transfers.createReversal(prepared.transfer, {
                amount: AUTHORIZED_612C.max_reversal_cents
            }, { idempotencyKey: admitted.reversalKey });
            stats.writes += 1;
            calls.push({ kind: 'write', method: prepared.method, id: created && created.id, idempotencyKey: admitted.reversalKey });
            if (!created || created.livemode === true) return moneyOff({ code: 'STRIPE_LIVE_BLOCKED', livemode: true });
            return { ok: true, id: created.id, livemode: false, real: true, stripe_proof: true, amount: created.amount };
        }
        if (prepared.method === 'refunds.create') {
            if (Number(prepared.amount) !== AUTHORIZED_612C.max_amount_cents) {
                return moneyOff({ code: 'AMOUNT_EXCEEDS_GRANT' });
            }
            const created = await stripe.refunds.create({
                payment_intent: prepared.payment_intent,
                amount: AUTHORIZED_612C.max_amount_cents
            }, { idempotencyKey: admitted.refundKey });
            stats.writes += 1;
            calls.push({ kind: 'write', method: prepared.method, id: created && created.id, idempotencyKey: admitted.refundKey });
            if (!created || created.livemode === true) return moneyOff({ code: 'STRIPE_LIVE_BLOCKED', livemode: true });
            return { ok: true, id: created.id, livemode: false, real: true, stripe_proof: true, amount: created.amount };
        }
        return moneyOff({ code: 'STRIPE_METHOD_FORBIDDEN' });
    }

    return { reconcile, dispatch, calls, stats };
}

function attachServerStripeTestRuntime({ supabaseAdmin, env }) {
    if (postTransferFinancialExecutionEnabled() === true) return {};
    const inspected = inspectStripeEnv(env || process.env);
    if (inspected.mode !== 'test' || inspected.secretKind !== 'test' || inspected.liveBlocked) return {};
    const grant = loadServerGrant();
    if (grant.active !== true) return {};
    const stripe = require('stripe')((env || process.env).STRIPE_SECRET_KEY);
    const facts = {
        requestId: grant.request_id,
        paymentId: grant.payment_id,
        operationId: grant.operation_id,
        amountCents: grant.max_amount_cents,
        supabaseProject: grant.supabase_project,
        stripeAccount: grant.stripe_account,
        connectAccount: grant.connect_account_id,
        livemode: false,
        env: env || process.env
    };
    return {
        serverAdapter: createPostTransferSupabaseAdapter({
            client: supabaseAdmin,
            serverStripeTestGrant: true
        }),
        serverStripeDispatch: createStripeTestHttpDispatch({ stripe, facts }),
        stripeAccount: grant.stripe_account,
        connectAccount: grant.connect_account_id,
        env: env || process.env
    };
}

module.exports = {
    createStripeTestHttpDispatch,
    attachServerStripeTestRuntime
};
