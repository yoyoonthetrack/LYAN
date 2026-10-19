'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    postTransferFinancialExecutionEnabled,
    paymentWritePaths
} = require('../api/stripe-policy');
const { memoryStore } = require('../api/post-transfer-refund-flow');
const {
    executeAdminPostTransfer,
    guardAdminExecute,
    EXECUTE_ROUTE
} = require('../api/post-transfer-admin-execute');

const ADMIN = {
    authorized: true,
    userId: 'admin-610u',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

function payment(overrides) {
    return {
        id: 'pay-610u',
        milestone_id: 'ms-610u',
        requester_id: 'user-a',
        provider_id: 'user-b',
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_payment_intent_id: 'pi_610u',
        stripe_charge_id: 'ch_610u',
        stripe_transfer_id: 'tr_610u',
        stripe_connect_account_id: 'acct_610u',
        stripe_refund_id: null,
        stripe_reversal_id: null,
        reversal_lock: null,
        refund_lock: null,
        post_transfer_operation_id: null,
        service_amount_cents: 4200,
        customer_fee_cents: 149,
        customer_total_cents: 4349,
        provider_fee_cents: 126,
        provider_net_cents: 4074,
        amount_refunded_cents: 0,
        customer_fee_refunded_cents: 0,
        service_refunded_cents: 0,
        provider_fee_reversed_cents: 0,
        provider_net_reversed_cents: 0,
        ...overrides
    };
}

function seed(overrides) {
    const store = memoryStore({
        payments: [payment(overrides.payment)],
        milestones: [{ id: 'ms-610u', status: 'RELEASED' }]
    });
    const request = {
        id: 'req-610u',
        payment_id: 'pay-610u',
        requester_id: 'user-a',
        provider_id: 'user-b',
        milestone_id: 'ms-610u',
        status: overrides.status || 'ADMIN_APPROVED',
        requested_cents: 4349,
        executed_at: overrides.executed_at || null,
        execution_operation_id: overrides.execution_operation_id || null
    };
    store._requests.set(request.id, request);
    if (overrides.noDecision !== true) {
        store._decisions.push({
            request_id: 'req-610u',
            payment_id: 'pay-610u',
            action: 'ADMIN_APPROVED',
            operation_id: overrides.operationId || 'op-610u',
            decided_amount_cents: overrides.decided || 4349
        });
    }
    return store;
}

test('6.10U route is registered, engine stays off, Stripe write APIs stay out of server.js', () => {
    assert.equal(EXECUTE_ROUTE, '/v1/admin/post-transfer-refund-requests/:id/execute');
    assert.equal(paymentWritePaths().includes(EXECUTE_ROUTE), true);
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-after-transfer'), false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.match(server, /post-transfer-refund-requests\/:id\/execute/);
    assert.equal(server.includes('transfers.createReversal'), false);
});

test('6.10U authorized admin is prepared then refused before Stripe', async () => {
    const result = await executeAdminPostTransfer(seed({}), { admin: ADMIN, requestId: 'req-610u' });
    assert.equal(result.http, 409);
    assert.equal(result.body.code, 'EXECUTION_DISABLED');
    assert.equal(result.body.execute, false);
    assert.equal(result.body.createReversal, false);
    assert.equal(result.body.createRefund, false);
    assert.equal(result.body.invoked, false);
    assert.equal(result.body.engine, false);
    assert.equal(result.body.operation_id, 'op-610u');
    assert.equal(result.body.reversal_key, 'rv_op_op-610u');
    assert.equal(result.body.refund_key, 're_op_op-610u_after_rv');
    assert.equal(result.body.prepared, true);
});

test('6.10U admin without permission, disabled account and invalid JWT are refused', async () => {
    const store = seed({});
    const noPerm = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'ops', role: 'SUPPORT', status: 'ACTIVE', permissions: [] },
        requestId: 'req-610u'
    });
    assert.equal(noPerm.http, 403);
    const disabled = await executeAdminPostTransfer(store, {
        admin: { ...ADMIN, status: 'DISABLED' },
        requestId: 'req-610u'
    });
    assert.equal(disabled.http, 403);
    const jwt = guardAdminExecute({ authorized: false, status: 401, error: 'Jeton invalide' });
    assert.equal(jwt.http, 401);
    assert.equal(jwt.body.execute, false);
    const a = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'user-a', role: 'USER', status: 'ACTIVE', permissions: [] },
        requestId: 'req-610u'
    });
    assert.equal(a.http, 403);
});

test('6.10U unapproved request and missing decision are blocked', async () => {
    const open = await executeAdminPostTransfer(seed({ status: 'OPEN' }), { admin: ADMIN, requestId: 'req-610u' });
    assert.equal(open.http, 409);
    assert.equal(open.body.code, 'REQUEST_NOT_APPROVED');
    const missing = await executeAdminPostTransfer(seed({ noDecision: true }), { admin: ADMIN, requestId: 'req-610u' });
    assert.equal(missing.http, 409);
    assert.equal(missing.body.code, 'DECISION_REQUIRED');
});

test('6.10U incorrect amount and mismatched Stripe parents are refused', async () => {
    const store = seed({});
    const amount = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: 'req-610u',
        requestedCents: 2000
    });
    assert.equal(amount.http, 400);
    assert.equal(amount.body.code, 'AMOUNT_MISMATCH');
    const pi = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: 'req-610u',
        expected: { payment_intent: 'pi_other' }
    });
    assert.equal(pi.body.code, 'PAYMENT_INTENT_MISMATCH');
    const tr = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: 'req-610u',
        expected: { transfer: 'tr_other' }
    });
    assert.equal(tr.body.code, 'TRANSFER_MISMATCH');
    const connect = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: 'req-610u',
        expected: { connectAccount: 'acct_other' }
    });
    assert.equal(connect.body.code, 'CONNECT_ACCOUNT_MISMATCH');
    assert.equal(amount.body.createRefund, false);
});

test('6.10U already executed and double request stay idempotent without money', async () => {
    const done = await executeAdminPostTransfer(seed({ executed_at: '2026-10-14T00:00:00Z' }), {
        admin: ADMIN,
        requestId: 'req-610u'
    });
    assert.equal(done.http, 200);
    assert.equal(done.body.idempotent, true);
    assert.equal(done.body.execute, false);
    const store = seed({});
    const first = await executeAdminPostTransfer(store, { admin: ADMIN, requestId: 'req-610u' });
    const second = await executeAdminPostTransfer(store, { admin: ADMIN, requestId: 'req-610u' });
    assert.equal(first.body.code, 'EXECUTION_DISABLED');
    assert.equal(second.body.code, 'EXECUTION_DISABLED');
    assert.equal(first.body.reversal_key, second.body.reversal_key);
    assert.equal(first.body.invoked, false);
    assert.equal(second.body.invoked, false);
});

test('6.10U occupied lock, timeout and resume refuse Stripe writes', async () => {
    const busy = await executeAdminPostTransfer(seed({
        payment: { reversal_lock: 'pending_rv_pay-610u', post_transfer_operation_id: 'op-other' }
    }), { admin: ADMIN, requestId: 'req-610u' });
    assert.equal(busy.http, 409);
    assert.equal(busy.body.code, 'EXECUTION_IN_PROGRESS');
    assert.equal(busy.body.createReversal, false);

    const timeout = await executeAdminPostTransfer(seed({}), {
        admin: ADMIN,
        requestId: 'req-610u',
        stripeRead: () => ({ status: 'uncertain', timeout: true, code: 'STRIPE_READ_UNCERTAIN' })
    });
    assert.equal(timeout.http, 409);
    assert.equal(timeout.body.code, 'STRIPE_READ_UNCERTAIN');
    assert.equal(timeout.body.lock_kept, true);
    assert.equal(timeout.body.retryBlind, false);
    assert.equal(timeout.body.execute, false);

    const resume = await executeAdminPostTransfer(seed({
        payment: {
            reversal_lock: 'pending_rv_pay-610u',
            post_transfer_operation_id: 'op-610u',
            transfer_status: 'REVERSAL_PROCESSING'
        }
    }), { admin: ADMIN, requestId: 'req-610u' });
    assert.equal(resume.body.code, 'EXECUTION_DISABLED');
    assert.equal(resume.body.action, 'resume');
    assert.equal(resume.body.reversal_key, 'rv_op_op-610u');
    assert.equal(resume.body.createReversal, false);
});

test('6.10U user enable_execution flag cannot bypass the engine', async () => {
    const result = await executeAdminPostTransfer(seed({}), {
        admin: ADMIN,
        requestId: 'req-610u',
        body: { enable_execution: true, force: true, createReversal: true }
    });
    assert.equal(result.body.execute, false);
    assert.equal(result.body.createReversal, false);
    assert.equal(result.body.createRefund, false);
    assert.equal(result.body.engine, false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});
