'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createRequest,
    replyRequest,
    viewRequest,
    decideRequest,
    listHistory,
    memoryStore
} = require('../api/post-transfer-refund-flow');
const {
    postTransferFinancialExecutionEnabled,
    paymentWritePaths,
    postTransferRefundRequestDecision
} = require('../api/stripe-policy');
const fs = require('node:fs');
const path = require('node:path');

const A = 'user-a-610e';
const B = 'user-b-610e';
const C = 'user-c-610e';
const ADMIN = { userId: 'admin-finance', role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] };

function seed() {
    const payment = {
        id: 'pay-610e',
        requester_id: A,
        provider_id: B,
        milestone_id: 'ms-610e',
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_610e',
        stripe_refund_id: null,
        service_amount_cents: 4200,
        customer_fee_cents: 149,
        customer_total_cents: 4349,
        provider_fee_cents: 126,
        provider_net_cents: 4074,
        amount_refunded_cents: 0,
        customer_fee_refunded_cents: 0,
        service_refunded_cents: 0,
        provider_fee_reversed_cents: 0,
        provider_net_reversed_cents: 0
    };
    return memoryStore({
        payments: [payment, {
            ...payment,
            id: 'pay-held',
            transfer_status: 'PENDING_VALIDATION',
            stripe_transfer_id: null,
            milestone_id: 'ms-held'
        }],
        milestones: [
            { id: 'ms-610e', status: 'RELEASED' },
            { id: 'ms-held', status: 'FUNDED' }
        ]
    });
}

test('6.10E A can open a valid request without Stripe', async () => {
    const store = seed();
    const created = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 4349, reason: 'trop tard' });
    assert.equal(created.http, 200);
    assert.equal(created.body.status, 'OPEN');
    assert.equal(created.body.execute, false);
    assert.equal(created.body.createRefund, false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('6.10E excess amount and untransferred payment are refused', async () => {
    const store = seed();
    const excess = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 5000 });
    assert.equal(excess.http, 400);
    assert.equal(excess.body.code, 'EXCEEDS_REFUNDABLE');
    const held = await createRequest(store, { authUid: A, paymentId: 'pay-held', requestedCents: 100 });
    assert.equal(held.http, 409);
    assert.equal(held.body.code, 'NOT_TRANSFERRED');
});

test('6.10E C cannot request another user’s payment', async () => {
    const store = seed();
    const created = await createRequest(store, { authUid: C, paymentId: 'pay-610e', requestedCents: 4349 });
    assert.equal(created.http, 403);
});

test('6.10E two concurrent requests collapse to one open row', async () => {
    const store = seed();
    const first = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 2000 });
    const second = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 2000 });
    const otherAmount = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 1000 });
    assert.equal(first.body.request_id, second.body.request_id);
    assert.equal(second.body.idempotent, true);
    assert.equal(otherAmount.http, 409);
    assert.equal(otherAmount.body.code, 'REQUEST_ALREADY_OPEN');
    const different = postTransferRefundRequestDecision({
        authUid: A,
        requesterId: A,
        payment: { requester_id: A, transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr', customer_total_cents: 4349, service_amount_cents: 4200, customer_fee_cents: 149, provider_fee_cents: 126, provider_net_cents: 4074 },
        milestone: { status: 'RELEASED' },
        requestedCents: 1000,
        existingRequest: { id: 'req-open', status: 'OPEN', requested_cents: 2000 }
    });
    assert.equal(different.code, 'REQUEST_ALREADY_OPEN');
});

test('6.10E B can accept or decline and C cannot reply', async () => {
    const store = seed();
    const created = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 4349 });
    const c = await replyRequest(store, { authUid: C, requestId: created.body.request_id, response: 'accept' });
    assert.equal(c.http, 403);
    const declined = await replyRequest(store, { authUid: B, requestId: created.body.request_id, response: 'decline', reason: 'travail déjà fait' });
    assert.equal(declined.http, 200);
    assert.equal(declined.body.status, 'PROVIDER_REPLIED');
    assert.equal(declined.body.provider_response, 'decline');
    assert.equal(declined.body.execute, false);
});

test('6.10F-2 custom role with only finance.refund can decide', async () => {
    const store = seed();
    const created = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 2000 });
    const qaAdmin = {
        authorized: true,
        userId: 'qa-610f2',
        role: 'QA_610F2_REFUND',
        status: 'ACTIVE',
        permissions: ['finance.refund'],
        member: { status: 'ACTIVE', admin_roles: { code: 'QA_610F2_REFUND' } }
    };
    const viewed = await viewRequest(store, { authUid: qaAdmin.userId, requestId: created.body.request_id, admin: qaAdmin });
    assert.equal(viewed.http, 200);
    const approved = await decideRequest(store, {
        requestId: created.body.request_id,
        action: 'approve',
        requestedCents: 2000,
        reason: 'geste QA',
        admin: qaAdmin
    });
    assert.equal(approved.http, 200);
    assert.equal(approved.body.status, 'ADMIN_APPROVED');
    assert.equal(approved.body.execute, false);
});

test('6.10E finance admin can approve or refuse without moving money', async () => {
    const store = seed();
    const created = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 4349 });
    await replyRequest(store, { authUid: B, requestId: created.body.request_id, response: 'accept' });
    const approved = await decideRequest(store, {
        requestId: created.body.request_id,
        action: 'approve',
        requestedCents: 2000,
        reason: 'geste commercial',
        admin: ADMIN
    });
    assert.equal(approved.http, 200);
    assert.equal(approved.body.status, 'ADMIN_APPROVED');
    assert.equal(approved.body.execute, false);
    assert.equal(approved.body.createReversal, false);
    assert.ok(approved.body.operation_id);
    const history = await listHistory(store, { authUid: ADMIN.userId, requestId: created.body.request_id, admin: ADMIN });
    assert.equal(history.body.history.some((row) => row.action === 'ADMIN_APPROVED'), true);
    assert.equal(history.body.history.some((row) => row.action === 'PROVIDER_REPLIED'), true);
});

test('6.10E suspended admin and second concurrent decision are refused', async () => {
    const store = seed();
    const created = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 4349 });
    const suspended = await decideRequest(store, {
        requestId: created.body.request_id,
        action: 'reject',
        reason: 'hors délai',
        admin: { ...ADMIN, status: 'SUSPENDED' }
    });
    assert.equal(suspended.http, 403);
    const first = await decideRequest(store, {
        requestId: created.body.request_id,
        action: 'reject',
        reason: 'prestation conforme',
        admin: ADMIN
    });
    const second = await decideRequest(store, {
        requestId: created.body.request_id,
        action: 'approve',
        requestedCents: 4349,
        admin: ADMIN
    });
    assert.equal(first.body.status, 'ADMIN_REJECTED');
    assert.equal(second.body.idempotent || second.body.code === 'ALREADY_DECIDED', true);
    assert.equal(second.body.execute, false);
    const viewed = await viewRequest(store, { authUid: C, requestId: created.body.request_id });
    assert.equal(viewed.http, 403);
});

test('6.10E routes exist, execution stays off, and adjustments are never written by a decision', async () => {
    const paths = paymentWritePaths();
    assert.equal(paths.includes('/v1/payments/post-transfer-refund-requests'), true);
    assert.equal(paths.includes('/v1/admin/post-transfer-refund-requests'), true);
    assert.equal(paths.includes('/v1/payments/refund-after-transfer'), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.match(server, /post-transfer-refund-requests/);
    assert.equal(server.includes('transfers.createReversal'), false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    const store = seed();
    const created = await createRequest(store, { authUid: A, paymentId: 'pay-610e', requestedCents: 4349 });
    await decideRequest(store, { requestId: created.body.request_id, action: 'approve', requestedCents: 4349, admin: ADMIN });
    assert.equal(store._decisions.some((row) => row.stripe_refund_id), false);
});
