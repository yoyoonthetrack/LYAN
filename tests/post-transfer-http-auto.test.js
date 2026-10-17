'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    postTransferFinancialExecutionEnabled
} = require('../api/stripe-policy');
const { memoryStore } = require('../api/post-transfer-refund-flow');
const {
    executeAdminPostTransfer,
    guardAdminExecute,
    inspectPaymentReady
} = require('../api/post-transfer-admin-execute');
const { createPostTransferSupabaseAdapter } = require('../api/post-transfer-supabase-adapter');

const ADMIN = {
    authorized: true,
    userId: 'admin-auto',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

function payment(overrides) {
    return {
        id: 'pay-auto',
        milestone_id: 'ms-auto',
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_payment_intent_id: 'pi_auto',
        stripe_charge_id: 'ch_auto',
        stripe_transfer_id: 'tr_auto',
        stripe_connect_account_id: 'acct_auto',
        amount_refunded_cents: 0,
        customer_total_cents: 4349,
        customer_fee_cents: 149,
        service_amount_cents: 4200,
        provider_fee_cents: 126,
        provider_net_cents: 4074,
        customer_fee_refunded_cents: 0,
        service_refunded_cents: 0,
        provider_fee_reversed_cents: 0,
        provider_net_reversed_cents: 0,
        reversal_lock: null,
        refund_lock: null,
        post_transfer_operation_id: null,
        ...overrides
    };
}

function seed(overrides) {
    const store = memoryStore({
        payments: [payment(overrides.payment)],
        milestones: [{ id: 'ms-auto', status: 'RELEASED' }]
    });
    store._requests.set('req-auto', {
        id: 'req-auto',
        payment_id: 'pay-auto',
        status: overrides.status || 'ADMIN_APPROVED',
        requested_cents: 4349,
        executed_at: overrides.executed_at || null
    });
    if (overrides.noDecision !== true) {
        store._decisions.push({
            request_id: 'req-auto',
            payment_id: 'pay-auto',
            action: 'ADMIN_APPROVED',
            operation_id: overrides.operationId || 'op-auto',
            decided_amount_cents: overrides.decided || 4349
        });
    }
    store.persist = {
        acquireReversal() { throw new Error('persist called from HTTP'); }
    };
    return store;
}

test('AUTO HTTP: engine off, no Stripe write APIs in server, persist unused', async () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    const start = server.indexOf("app.post('/v1/admin/post-transfer-refund-requests/:id/execute'");
    const next = server.indexOf('app.post(', start + 10);
    const executeBlock = server.slice(start, next);
    assert.ok(executeBlock.includes('executeAdminPostTransfer'));
    assert.equal(executeBlock.includes('transfers.createReversal'), false);
    assert.equal(executeBlock.includes('refunds.create'), false);
    assert.equal(server.includes('transfers.createReversal'), false);
    const store = seed({});
    const before = { ...(await store.getPayment({ id: 'pay-auto' })) };
    const result = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: 'req-auto',
        body: { attested: true, p_server_attested: true, enable_execution: true }
    });
    assert.equal(result.http, 409);
    assert.equal(result.body.code, 'EXECUTION_DISABLED');
    assert.equal(result.body.persist_used, false);
    assert.equal(result.body.lock_persisted, false);
    assert.deepEqual(await store.getPayment({ id: 'pay-auto' }), before);
});

test('AUTO HTTP: JWT, A/B/C, admin sans droit, admin désactivé', async () => {
    const store = seed({});
    assert.equal((await executeAdminPostTransfer(store, {
        admin: { authorized: false, status: 401 }, requestId: 'req-auto'
    })).http, 401);
    assert.equal(guardAdminExecute({ authorized: false, status: 401 }).body.execute, false);
    for (const userId of ['user-a', 'user-b', 'user-c']) {
        const denied = await executeAdminPostTransfer(store, {
            admin: { authorized: true, userId, role: 'USER', status: 'ACTIVE', permissions: [] },
            requestId: 'req-auto'
        });
        assert.equal(denied.http, 403);
    }
    assert.equal((await executeAdminPostTransfer(store, {
        admin: { ...ADMIN, permissions: [], role: 'SUPPORT' }, requestId: 'req-auto'
    })).http, 403);
    assert.equal((await executeAdminPostTransfer(store, {
        admin: { ...ADMIN, status: 'DISABLED' }, requestId: 'req-auto'
    })).http, 403);
});

test('AUTO HTTP: unapproved, no decision, amount, PI, charge, transfer, connect', async () => {
    assert.equal((await executeAdminPostTransfer(seed({ status: 'OPEN' }), { admin: ADMIN, requestId: 'req-auto' })).body.code, 'REQUEST_NOT_APPROVED');
    assert.equal((await executeAdminPostTransfer(seed({ noDecision: true }), { admin: ADMIN, requestId: 'req-auto' })).body.code, 'DECISION_REQUIRED');
    assert.equal((await executeAdminPostTransfer(seed({}), { admin: ADMIN, requestId: 'req-auto', requestedCents: 1 })).body.code, 'AMOUNT_MISMATCH');
    assert.equal((await executeAdminPostTransfer(seed({}), { admin: ADMIN, requestId: 'req-auto', expected: { payment_intent: 'pi_x' } })).body.code, 'PAYMENT_INTENT_MISMATCH');
    assert.equal((await executeAdminPostTransfer(seed({}), { admin: ADMIN, requestId: 'req-auto', expected: { charge: 'ch_x' } })).body.code, 'CHARGE_MISMATCH');
    assert.equal((await executeAdminPostTransfer(seed({}), { admin: ADMIN, requestId: 'req-auto', expected: { transfer: 'tr_x' } })).body.code, 'TRANSFER_MISMATCH');
    assert.equal((await executeAdminPostTransfer(seed({}), { admin: ADMIN, requestId: 'req-auto', expected: { connectAccount: 'acct_x' } })).body.code, 'CONNECT_ACCOUNT_MISMATCH');
});

test('AUTO HTTP: DISPUTED, REFUNDED, ambiguous lock, timeout, lost Stripe, postgres error path', async () => {
    assert.equal(inspectPaymentReady(payment({ payment_status: 'DISPUTED' })).code, 'DISPUTED');
    assert.equal((await executeAdminPostTransfer(seed({ payment: { payment_status: 'DISPUTED' } }), { admin: ADMIN, requestId: 'req-auto' })).body.code, 'DISPUTED');
    assert.equal((await executeAdminPostTransfer(seed({ payment: { payment_status: 'REFUNDED' } }), { admin: ADMIN, requestId: 'req-auto' })).body.code, 'PAYMENT_ALREADY_REFUNDED');
    assert.equal((await executeAdminPostTransfer(seed({
        payment: { reversal_lock: 'pending_rv_pay-auto', refund_lock: 'pending_re_after_pay-auto' }
    }), { admin: ADMIN, requestId: 'req-auto' })).body.code, 'AMBIGUOUS_LOCK_STATE');
    const timeout = await executeAdminPostTransfer(seed({}), {
        admin: ADMIN,
        requestId: 'req-auto',
        stripeRead: () => ({ timeout: true, status: 'uncertain', code: 'STRIPE_READ_UNCERTAIN' })
    });
    assert.equal(timeout.body.code, 'STRIPE_READ_UNCERTAIN');
    assert.equal(timeout.body.retryBlind, false);
    const lost = await executeAdminPostTransfer(seed({}), {
        admin: ADMIN,
        requestId: 'req-auto',
        stripeRead: () => ({ status: 'uncertain', code: 'STRIPE_RESPONSE_LOST' })
    });
    assert.equal(lost.body.code, 'STRIPE_RESPONSE_LOST');
    assert.equal(lost.body.retryBlind, false);
    const live = await executeAdminPostTransfer(seed({}), {
        admin: ADMIN,
        requestId: 'req-auto',
        stripeRead: () => ({ livemode: true, code: 'STRIPE_LIVE_BLOCKED' })
    });
    assert.equal(live.body.code, 'STRIPE_LIVE_BLOCKED');
});

test('AUTO HTTP: concurrent prepares share operation_id and do not mutate payment', async () => {
    const store = seed({});
    const [first, second] = await Promise.all([
        executeAdminPostTransfer(store, { admin: ADMIN, requestId: 'req-auto' }),
        executeAdminPostTransfer(store, { admin: ADMIN, requestId: 'req-auto' })
    ]);
    assert.equal(first.body.code, 'EXECUTION_DISABLED');
    assert.equal(second.body.code, 'EXECUTION_DISABLED');
    assert.equal(first.body.operation_id, second.body.operation_id);
    assert.equal(first.body.reversal_key, second.body.reversal_key);
    const live = await store.getPayment({ id: 'pay-auto' });
    assert.equal(live.reversal_lock, null);
    assert.equal(live.post_transfer_operation_id, null);
});

test('AUTO HTTP adapter never forwards client attestation', async () => {
    const calls = [];
    const adapter = createPostTransferSupabaseAdapter({
        client: { async rpc(name, args) { calls.push({ name, args }); return { data: { ok: true }, error: null }; } },
        isolatedLocal: true
    });
    const denied = await adapter.confirmReversal({
        paymentId: 'pay-auto',
        operationId: 'op-auto',
        requestId: 'req-auto',
        reversalId: 'trr_auto_ok',
        attested: true,
        httpRoute: true,
        body: { p_server_attested: true }
    });
    assert.equal(denied.code, 'CONFIRMATION_REQUIRED');
    assert.equal(denied.code_detail, 'CLIENT_ATTESTATION_FORBIDDEN');
    assert.equal(calls.length, 0);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});
