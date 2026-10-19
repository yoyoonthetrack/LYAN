'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    postTransferFinancialExecutionEnabled,
    paymentWritePaths,
    admitPostTransferExecution,
    invokePreparedStripeCall,
    prepareTransfersCreateReversal,
    prepareRefundsCreate,
    postTransferOperationKeys,
    reversalReservationId
} = require('../api/stripe-policy');
const {
    createExecutionStore,
    startExecution,
    prepareRefundStep,
    applyOutcome,
    runHappyPath
} = require('../api/post-transfer-execution');

const ADMIN = { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] };
const QA_ADMIN = {
    role: 'QA_610F2_REFUND',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

function payment(overrides) {
    return {
        id: 'pay-610g',
        milestone_id: 'ms-610g',
        requester_id: 'user-a',
        provider_id: 'user-b',
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_610g',
        stripe_payment_intent_id: 'pi_610g',
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

function approved(cents, operationId, requestId) {
    return {
        requests: [{
            id: requestId || 'req-610g',
            payment_id: 'pay-610g',
            status: 'ADMIN_APPROVED',
            requested_cents: cents,
            decided_by: 'admin-finance'
        }],
        decisions: [{
            request_id: requestId || 'req-610g',
            action: 'ADMIN_APPROVED',
            operation_id: operationId,
            decided_amount_cents: cents
        }]
    };
}

function storeFor(cents, operationId, payOverrides) {
    const extra = approved(cents, operationId);
    return createExecutionStore({
        payments: [payment(payOverrides)],
        milestones: [{ id: 'ms-610g', status: 'RELEASED' }],
        requests: extra.requests,
        decisions: extra.decisions
    });
}

test('6.10G full reversal and refund stay prepare-only then ledger after mock confirm', () => {
    const stripe = {
        transfers: { createReversal() { throw new Error('stripe reversal called'); } },
        refunds: { create() { throw new Error('stripe refund called'); } }
    };
    const store = storeFor(4349, 'op-610g-full');
    const pathResult = runHappyPath(store, {
        admin: ADMIN,
        requestId: 'req-610g',
        reversalId: 'trr_610g_full',
        refundId: 're_610g_full'
    });
    assert.equal(pathResult.executed, true);
    assert.equal(pathResult.started.reversalCall.invoke, false);
    assert.equal(pathResult.started.reversalCall.amount, 4074);
    assert.equal(pathResult.started.reversalCall.idempotencyKey, 'rv_op_op-610g-full');
    assert.equal(pathResult.finished.adjustment.refund_amount_cents, 4349);
    assert.equal(store.getPayment('pay-610g').payment_status, 'REFUNDED');
    assert.equal(store.getPayment('pay-610g').transfer_status, 'REVERSED');
    assert.equal(store.getPayment('pay-610g').amount_refunded_cents, 4349);
    assert.equal(store.getPayment('pay-610g').provider_net_reversed_cents, 4074);
    assert.equal(store.getRequest('req-610g').status, 'ADMIN_APPROVED');
    assert.equal(store.getRequest('req-610g').execution_status, 'EXECUTED');
    assert.equal(startExecution(store, { admin: ADMIN, requestId: 'req-610g', stripe }).idempotent, true);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('6.10G partial reversal and refund write a partial ledger', () => {
    const store = storeFor(2000, 'op-610g-partial');
    const result = runHappyPath(store, {
        admin: QA_ADMIN,
        requestId: 'req-610g',
        reversalId: 'trr_610g_p',
        refundId: 're_610g_p'
    });
    assert.equal(result.executed, true);
    assert.equal(result.started.breakdown.refund_amount_cents, 2000);
    assert.ok(result.started.breakdown.reversal_amount_cents < 4074);
    assert.equal(store.getPayment('pay-610g').payment_status, 'PARTIALLY_REFUNDED');
    assert.equal(store.getPayment('pay-610g').transfer_status, 'PARTIALLY_REVERSED');
    assert.equal(store.adjustments.length, 1);
});

test('6.10G two successive refunds use distinct operation keys', () => {
    const firstStore = storeFor(2000, 'op-610g-s1');
    runHappyPath(firstStore, {
        admin: ADMIN,
        requestId: 'req-610g',
        reversalId: 'trr_610g_s1',
        refundId: 're_610g_s1'
    });
    const pay = firstStore.getPayment('pay-610g');
    const second = createExecutionStore({
        payments: [pay],
        milestones: [{ id: 'ms-610g', status: 'RELEASED' }],
        requests: [{
            id: 'req-610g-2',
            payment_id: 'pay-610g',
            status: 'ADMIN_APPROVED',
            requested_cents: 2349
        }],
        decisions: [{
            request_id: 'req-610g-2',
            action: 'ADMIN_APPROVED',
            operation_id: 'op-610g-s2',
            decided_amount_cents: 2349
        }]
    });
    const again = runHappyPath(second, {
        admin: ADMIN,
        requestId: 'req-610g-2',
        reversalId: 'trr_610g_s2',
        refundId: 're_610g_s2'
    });
    assert.equal(again.executed, true);
    assert.equal(second.getPayment('pay-610g').amount_refunded_cents, 4349);
    assert.notEqual(
        postTransferOperationKeys('op-610g-s1').reversalKey,
        postTransferOperationKeys('op-610g-s2').reversalKey
    );
});

test('6.10G admin double click resumes the same reservation and keys', () => {
    const store = storeFor(4349, 'op-610g-dbl');
    const first = startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const second = startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(first.action, 'prepared');
    assert.equal(second.action, 'resume');
    assert.equal(first.operation_id, second.operation_id);
    assert.equal(first.reversalCall.idempotencyKey, second.reversalCall.idempotencyKey);
    assert.equal(store.getPayment('pay-610g').stripe_reversal_id, null);
    assert.equal(store.getPayment('pay-610g').reversal_lock, reversalReservationId('pay-610g'));
    assert.equal(store.getPayment('pay-610g').post_transfer_operation_id, 'op-610g-dbl');
});

test('6.10G reversal timeout keeps the lock and does not retry blindly', () => {
    const store = storeFor(4349, 'op-610g-to');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const timeout = applyOutcome(store, { type: 'reversal_timeout', paymentId: 'pay-610g', listRetrieved: false });
    assert.equal(timeout.action, 'keep');
    assert.equal(timeout.retryBlind, false);
    assert.equal(timeout.releaseReservation, false);
    assert.equal(store.getPayment('pay-610g').reversal_lock, reversalReservationId('pay-610g'));
    assert.equal(store.getPayment('pay-610g').stripe_reversal_id, null);
    const resume = startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(resume.action, 'resume');
    assert.equal(resume.reversalCall.idempotencyKey, 'rv_op_op-610g-to');
});

test('6.10G refund timeout after confirmed reversal stays awaiting refund', () => {
    const store = storeFor(4349, 'op-610g-rto');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610g',
        operationId: 'op-610g-rto',
        reversalId: 'trr_610g_rto',
        amount: 4074
    });
    const refund = prepareRefundStep(store, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(refund.phase, 'refund_prepared');
    const timeout = applyOutcome(store, { type: 'refund_timeout', paymentId: 'pay-610g', listRetrieved: false });
    assert.equal(timeout.retryBlind, false);
    assert.equal(store.getPayment('pay-610g').transfer_status, 'REVERSED');
    assert.equal(store.getRequest('req-610g').execution_status == null, true);
    const resume = prepareRefundStep(store, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(resume.refundCall.idempotencyKey, 're_op_op-610g-rto_after_rv');
});

test('6.10G failed reversal never starts a refund', () => {
    const store = storeFor(4349, 'op-610g-failrv');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const failed = applyOutcome(store, { type: 'reversal_failed', paymentId: 'pay-610g' });
    assert.equal(failed.code, 'REVERSAL_IMPOSSIBLE');
    assert.equal(store.getPayment('pay-610g').transfer_status, 'REVERSAL_FAILED');
    const refund = prepareRefundStep(store, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(refund.action, 'reject');
    assert.equal(refund.code, 'REVERSAL_FAILED');
    assert.equal(store.adjustments.length, 0);
});

test('6.10G failed refund after reversal keeps awaiting refund and no ledger', () => {
    const store = storeFor(4349, 'op-610g-failre');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610g',
        operationId: 'op-610g-failre',
        reversalId: 'trr_610g_failre',
        amount: 4074
    });
    const failed = applyOutcome(store, { type: 'refund_failed', paymentId: 'pay-610g' });
    assert.equal(failed.phase, 'refund_failed');
    assert.equal(store.adjustments.length, 0);
    assert.notEqual(store.getRequest('req-610g').execution_status, 'EXECUTED');
});

test('6.10G reversal confirmed without refund is a resume state', () => {
    const store = storeFor(4349, 'op-610g-wait');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const reversed = applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610g',
        operationId: 'op-610g-wait',
        reversalId: 'trr_610g_wait',
        amount: 4074
    });
    assert.equal(reversed.consistency.code, 'REVERSED_AWAITING_REFUND');
    assert.equal(store.getRequest('req-610g').execution_status == null, true);
});

test('6.10G existing refund id is reconciled and never invoked again', () => {
    const store = storeFor(4349, 'op-610g-exist');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610g',
        operationId: 'op-610g-exist',
        reversalId: 'trr_610g_exist',
        amount: 4074
    });
    const first = applyOutcome(store, {
        type: 'refund_already',
        paymentId: 'pay-610g',
        requestId: 'req-610g',
        operationId: 'op-610g-exist',
        refundId: 're_610g_exist',
        reversalId: 'trr_610g_exist'
    });
    const second = applyOutcome(store, {
        type: 'refund_already',
        paymentId: 'pay-610g',
        requestId: 'req-610g',
        operationId: 'op-610g-exist',
        refundId: 're_610g_exist',
        reversalId: 'trr_610g_exist'
    });
    assert.equal(first.executed, true);
    assert.equal(second.idempotent, true);
    assert.equal(store.adjustments.length, 1);
});

test('6.10G duplicate webhook only observes', () => {
    const store = storeFor(4349, 'op-610g-wh');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const event = {
        type: 'transfer.reversed',
        data: { object: { object: 'transfer', reversals: { data: [{ id: 'trr_610g_wh' }] }, amount_reversed: 4074 } }
    };
    const first = applyOutcome(store, { type: 'webhook', paymentId: 'pay-610g', event });
    const second = applyOutcome(store, { type: 'webhook', paymentId: 'pay-610g', event });
    assert.equal(first.action, 'complete_reservation');
    assert.equal(first.persist, false);
    assert.equal(second.action, 'already_synced');
    assert.equal(store.stripeCalls.every((row) => row.invoke === false), true);
});

test('6.10G two concurrent executions keep a single lock', () => {
    const store = storeFor(4349, 'op-610g-c1');
    store.requests.set('req-610g-b', {
        id: 'req-610g-b',
        payment_id: 'pay-610g',
        status: 'ADMIN_APPROVED',
        requested_cents: 2000
    });
    store.decisions.push({
        request_id: 'req-610g-b',
        action: 'ADMIN_APPROVED',
        operation_id: 'op-610g-c2',
        decided_amount_cents: 2000
    });
    const a = startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const b = startExecution(store, { admin: ADMIN, requestId: 'req-610g-b' });
    assert.equal(a.action, 'prepared');
    assert.equal(b.code, 'EXECUTION_IN_PROGRESS');
    assert.equal(store.getPayment('pay-610g').post_transfer_operation_id, 'op-610g-c1');
    assert.equal(store.getPayment('pay-610g').reversal_lock, reversalReservationId('pay-610g'));
});

test('6.10G excess approved amount is refused before any reservation', () => {
    const store = storeFor(99999, 'op-610g-excess');
    const started = startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(started.action, 'reject');
    assert.equal(started.code, 'EXCEEDS_REFUNDABLE');
    assert.equal(store.getPayment('pay-610g').stripe_reversal_id, null);
    assert.equal(store.getPayment('pay-610g').reversal_lock, null);
});

test('6.10G unauthorized actor cannot start execution', () => {
    const store = storeFor(4349, 'op-610g-unauth');
    const denied = startExecution(store, {
        admin: { role: 'SUPPORT', status: 'ACTIVE' },
        requestId: 'req-610g'
    });
    assert.equal(denied.http, 403);
    assert.equal(store.getPayment('pay-610g').transfer_status, 'TRANSFERRED');
});

test('6.10G refund without confirmed reversal cannot mark executed', () => {
    const store = storeFor(4349, 'op-610g-orphan');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const orphan = applyOutcome(store, {
        type: 'refund_confirmed',
        paymentId: 'pay-610g',
        requestId: 'req-610g',
        operationId: 'op-610g-orphan',
        refundId: 're_610g_orphan',
        reversalId: reversalReservationId('pay-610g')
    });
    assert.equal(orphan.code, 'CONFIRMATION_REQUIRED');
    assert.equal(store.adjustments.length, 0);
});

test('6.10J crash resume rereads 068 locks, not a memory map', () => {
    const first = storeFor(4349, 'op-610j-crash');
    startExecution(first, { admin: ADMIN, requestId: 'req-610g' });
    const snap = first.getPayment('pay-610g');
    const resumed = createExecutionStore({
        payments: [snap],
        milestones: [{ id: 'ms-610g', status: 'RELEASED' }],
        requests: first.getRequest('req-610g') ? [first.getRequest('req-610g')] : [],
        decisions: [{ request_id: 'req-610g', action: 'ADMIN_APPROVED', operation_id: 'op-610j-crash', decided_amount_cents: 4349 }]
    });
    const again = startExecution(resumed, { admin: ADMIN, requestId: 'req-610g' });
    assert.equal(again.action, 'resume');
    assert.equal(resumed.getPayment('pay-610g').reversal_lock, reversalReservationId('pay-610g'));
    assert.equal(resumed.getPayment('pay-610g').stripe_reversal_id, null);
});

test('6.10J unknown operation_id cannot confirm a lock', () => {
    const store = storeFor(4349, 'op-610j-known');
    startExecution(store, { admin: ADMIN, requestId: 'req-610g' });
    const unknown = applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610g',
        operationId: 'op-unknown',
        reversalId: 'trr_610j',
        amount: 4074
    });
    assert.equal(unknown.code, 'UNKNOWN_OPERATION');
    assert.equal(store.getPayment('pay-610g').reversal_lock, reversalReservationId('pay-610g'));
});

test('6.10J successive partial keeps the first confirmed reversal id until the second confirm', () => {
    const store = storeFor(2000, 'op-610j-s1');
    runHappyPath(store, { admin: ADMIN, requestId: 'req-610g', reversalId: 'trr_610j_s1', refundId: 're_610j_s1' });
    assert.equal(store.getPayment('pay-610g').stripe_reversal_id, 'trr_610j_s1');
    assert.equal(store.getPayment('pay-610g').reversal_lock, null);
    store.requests.set('req-610j-2', {
        id: 'req-610j-2',
        payment_id: 'pay-610g',
        status: 'ADMIN_APPROVED',
        requested_cents: 2349
    });
    store.decisions.push({
        request_id: 'req-610j-2',
        action: 'ADMIN_APPROVED',
        operation_id: 'op-610j-s2',
        decided_amount_cents: 2349
    });
    const second = startExecution(store, { admin: ADMIN, requestId: 'req-610j-2' });
    assert.equal(second.action, 'prepared');
    assert.equal(store.getPayment('pay-610g').stripe_reversal_id, 'trr_610j_s1');
    assert.equal(store.getPayment('pay-610g').reversal_lock, reversalReservationId('pay-610g'));
});

test('6.10G prepared Stripe calls never invoke and no financial route is added', () => {
    const paymentRow = payment();
    const reversal = prepareTransfersCreateReversal({
        payment: paymentRow,
        breakdown: { reversal_amount_cents: 4074 },
        operationId: 'op-610g-prep'
    });
    const refund = prepareRefundsCreate({
        payment: paymentRow,
        breakdown: { refund_amount_cents: 4349 },
        operationId: 'op-610g-prep'
    });
    const invoked = invokePreparedStripeCall(reversal);
    assert.equal(reversal.invoke, false);
    assert.equal(refund.invoke, false);
    assert.equal(invoked.invoked, false);
    assert.equal(invoked.code, 'STRIPE_INVOKE_FORBIDDEN');
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-after-transfer'), false);
    assert.equal(paymentWritePaths().includes('/v1/admin/post-transfer-refund-execute'), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.equal(server.includes('transfers.createReversal'), false);
    assert.equal(server.includes('/v1/payments/refund-after-transfer'), false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(admitPostTransferExecution({
        admin: ADMIN,
        request: { status: 'OPEN' },
        decision: { action: 'ADMIN_APPROVED', operation_id: 'op-x', decided_amount_cents: 100 },
        payment: paymentRow,
        milestone: { status: 'RELEASED' }
    }).code, 'REQUEST_NOT_APPROVED');
});
