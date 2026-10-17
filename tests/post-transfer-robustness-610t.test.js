'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    postTransferFinancialExecutionEnabled,
    paymentWritePaths,
    preparePostTransferRefundBreakdown,
    postTransferOperationKeys,
    reconcileReversalAfterFailure,
    reconcilePostTransferRefundAfterFailure,
    admitStripeWebhookEvent,
    constructStripeWebhookEvent,
    applyPaymentSucceeded,
    applyPaymentFailed,
    applyPaymentProcessing,
    applyChargeRefunded,
    routePostTransferWebhook,
    postTransferWebhookPersistDecision,
    stripeChargeId,
    persistableStripeChargeId,
    canWebhookFundMilestone,
    evaluateTransfer,
    canApprovePostTransferRefund,
    postTransferRefundAccessDecision,
    claimPostTransferAdminDecision,
    STAGING_V2_REF,
    PRODUCTION_REF
} = require('../api/stripe-policy');
const {
    ACQUIRE_REVERSAL_SQL,
    CONFIRM_REVERSAL_SQL,
    applyAcquireReversal,
    applyConfirmReversal
} = require('../api/post-transfer-lock-sql');
const {
    createExecutionStore,
    startExecution,
    prepareRefundStep,
    applyOutcome,
    runHappyPath,
    neverCallStripe
} = require('../api/post-transfer-execution');
const { classifyStripeRead: classifyRead } = require('../api/post-transfer-stripe-adapter');
const {
    createRequest,
    replyRequest,
    viewRequest,
    decideRequest,
    memoryStore
} = require('../api/post-transfer-refund-flow');

const ADMIN = { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'], userId: 'admin-t' };
const A = 'user-a-610t';
const B = 'user-b-610t';
const C = 'user-c-610t';

function payment(overrides) {
    return {
        id: 'pay-610t',
        milestone_id: 'ms-610t',
        requester_id: A,
        provider_id: B,
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_610t',
        stripe_payment_intent_id: 'pi_610t',
        stripe_charge_id: 'ch_610t',
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

function storeFor(cents, operationId, payOverrides) {
    return createExecutionStore({
        payments: [payment(payOverrides)],
        milestones: [{ id: 'ms-610t', status: 'RELEASED' }],
        requests: [{
            id: 'req-610t',
            payment_id: 'pay-610t',
            status: 'ADMIN_APPROVED',
            requested_cents: cents,
            decided_by: 'admin-t'
        }],
        decisions: [{
            request_id: 'req-610t',
            action: 'ADMIN_APPROVED',
            operation_id: operationId,
            decided_amount_cents: cents
        }]
    });
}

function flowSeed() {
    return memoryStore({
        payments: [payment()],
        milestones: [{ id: 'ms-610t', status: 'RELEASED' }]
    });
}

test('6.10T engine off and no financial post-Transfer HTTP route', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-after-transfer'), false);
    assert.equal(paymentWritePaths().includes('/v1/admin/post-transfer-refund-execute'), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.equal(server.includes('transfers.createReversal'), false);
    assert.equal(server.includes('/v1/payments/refund-after-transfer'), false);
    assert.match(server, /stripeChargeId\(payment\.stripe_charge_id\)/);
    assert.match(server, /\.in\('status', \['PENDING', 'IN_PROGRESS', 'FUNDED'\]\)/);
});

test('6.10T latest_charge object is coerced to ch_ (6.10Q non-regression)', () => {
    const expanded = { id: 'ch_3UQYJLLqYzmscXLu0EqlfigF', object: 'charge', amount: 4349, refunds: null };
    assert.equal(stripeChargeId(expanded), 'ch_3UQYJLLqYzmscXLu0EqlfigF');
    assert.equal(stripeChargeId('ch_plain'), 'ch_plain');
    assert.equal(stripeChargeId(JSON.stringify(expanded)), null);
    const first = applyPaymentSucceeded(payment({
        payment_status: 'CREATED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_transfer_id: null,
        stripe_charge_id: null
    }), { amount: 4349, latest_charge: expanded });
    assert.equal(first.ok, true);
    assert.equal(first.stripe_charge_id, 'ch_3UQYJLLqYzmscXLu0EqlfigF');
    const replay = applyPaymentSucceeded(payment({
        stripe_charge_id: expanded
    }), { amount: 4349, latest_charge: expanded });
    assert.equal(replay.stripe_charge_id, 'ch_3UQYJLLqYzmscXLu0EqlfigF');
    const ready = evaluateTransfer({
        payment: payment({
            transfer_status: 'PENDING_VALIDATION',
            stripe_transfer_id: null,
            stripe_charge_id: expanded
        }),
        milestone: { status: 'FUNDED' },
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_b'
    });
    assert.equal(ready.sourceTransaction, 'ch_3UQYJLLqYzmscXLu0EqlfigF');
    assert.equal(persistableStripeChargeId({ id: 'ch_old' }, { id: 'ch_new' }), 'ch_old');
});

test('6.10T Stripe failure matrix keeps locks and never double-writes', () => {
    const cases = [
        { type: 'reversal_failed', paymentId: 'pay-610t' },
        { type: 'reversal_timeout', paymentId: 'pay-610t', listRetrieved: false },
        { type: 'reversal_timeout', paymentId: 'pay-610t', listRetrieved: true, recoveredReversal: { id: 'trr_lost' } },
        { type: 'reversal_timeout', paymentId: 'pay-610t', listRetrieved: true, insufficientConnectBalance: true },
        { type: 'reversal_timeout', paymentId: 'pay-610t', listRetrieved: true, listedReversals: [{ id: 'trr_a' }, { id: 'trr_b' }] }
    ];
    const refused = storeFor(4349, 'op-t-refuse');
    startExecution(refused, { admin: ADMIN, requestId: 'req-610t' });
    const fail = applyOutcome(refused, cases[0]);
    assert.equal(fail.code, 'REVERSAL_IMPOSSIBLE');
    assert.equal(refused.getPayment('pay-610t').reversal_lock, 'pending_rv_pay-610t');
    assert.equal(prepareRefundStep(refused, { admin: ADMIN, requestId: 'req-610t' }).code, 'REVERSAL_FAILED');

    const timeout = storeFor(4349, 'op-t-to');
    startExecution(timeout, { admin: ADMIN, requestId: 'req-610t' });
    const keep = applyOutcome(timeout, cases[1]);
    assert.equal(keep.action, 'keep');
    assert.equal(keep.retryBlind, false);
    assert.equal(timeout.getPayment('pay-610t').reversal_lock, 'pending_rv_pay-610t');
    assert.equal(timeout.getPayment('pay-610t').stripe_reversal_id, null);

    const lost = reconcileReversalAfterFailure({
        recoveredReversal: { id: 'trr_lost' },
        listedReversals: [],
        listRetrieved: true
    });
    assert.equal(lost.action, 'complete');
    assert.equal(lost.reversalId, 'trr_lost');
    assert.equal(lost.releaseReservation, false);

    const pgFail = storeFor(4349, 'op-t-pg');
    startExecution(pgFail, { admin: ADMIN, requestId: 'req-610t' });
    const unknown = applyConfirmReversal(pgFail.getPayment('pay-610t'), 'op-other', 'trr_ok', 'REVERSED');
    assert.equal(unknown.action, 'reject');
    assert.equal(unknown.code, 'UNKNOWN_OPERATION');
    assert.equal(pgFail.getPayment('pay-610t').reversal_lock, 'pending_rv_pay-610t');

    const refundStore = storeFor(4349, 'op-t-re');
    startExecution(refundStore, { admin: ADMIN, requestId: 'req-610t' });
    applyOutcome(refundStore, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610t',
        operationId: 'op-t-re',
        reversalId: 'trr_ok',
        amount: 4074
    });
    const refundTimeout = applyOutcome(refundStore, { type: 'refund_timeout', paymentId: 'pay-610t', listRetrieved: false });
    assert.equal(refundTimeout.retryBlind, false);
    assert.equal(refundStore.getPayment('pay-610t').refund_lock, 'pending_re_after_pay-610t');
    assert.equal(refundStore.adjustments.length, 0);

    const refundLost = reconcilePostTransferRefundAfterFailure({
        recoveredRefund: { id: 're_lost' },
        listedRefunds: [],
        listRetrieved: true
    });
    assert.equal(refundLost.action, 'complete');
    assert.equal(refundLost.releaseReservation, false);

    const refundFail = applyOutcome(refundStore, { type: 'refund_failed', paymentId: 'pay-610t' });
    assert.equal(refundFail.phase, 'refund_failed');
    assert.equal(refundStore.adjustments.length, 0);

    const insufficient = reconcileReversalAfterFailure({
        recoveredReversal: null,
        listedReversals: [],
        listRetrieved: true,
        insufficientConnectBalance: true
    });
    assert.equal(insufficient.code, 'REVERSAL_IMPOSSIBLE');
    assert.equal(insufficient.releaseReservation, false);

    const incomplete = classifyRead({ found: true, searchComplete: false, timeout: false });
    assert.equal(incomplete.status, 'uncertain');
    const missing = classifyRead({ found: false, searchComplete: true });
    assert.equal(missing.status, 'absent');
    const many = classifyRead({ found: true, searchComplete: true, candidates: 2 });
    assert.equal(many.code, 'MULTIPLE_CANDIDATES');
    assert.equal(many.createRefund, false);
});

test('6.10T concurrency uses 068 predicates and a single lock holder', () => {
    assert.match(ACQUIRE_REVERSAL_SQL, /reversal_lock IS NULL/);
    assert.match(ACQUIRE_REVERSAL_SQL, /refund_lock IS NULL/);
    assert.match(ACQUIRE_REVERSAL_SQL, /WHERE id = \$2/);
    assert.match(CONFIRM_REVERSAL_SQL, /reversal_lock = \('pending_rv_' \|\| id::text\)/);
    const store = storeFor(4349, 'op-t-c1');
    store.requests.set('req-b', { id: 'req-b', payment_id: 'pay-610t', status: 'ADMIN_APPROVED', requested_cents: 2000 });
    store.decisions.push({ request_id: 'req-b', action: 'ADMIN_APPROVED', operation_id: 'op-t-c2', decided_amount_cents: 2000 });
    const a = startExecution(store, { admin: ADMIN, requestId: 'req-610t' });
    const b = startExecution(store, { admin: ADMIN, requestId: 'req-b' });
    assert.equal(a.action, 'prepared');
    assert.equal(b.code, 'EXECUTION_IN_PROGRESS');
    const pay = payment();
    const first = applyAcquireReversal(pay, 'op-1');
    const second = applyAcquireReversal(pay, 'op-2');
    assert.equal(first.action, 'acquire');
    assert.equal(second.code, 'EXECUTION_IN_PROGRESS');
    const claim1 = claimPostTransferAdminDecision({ status: 'OPEN' });
    const claim2 = claimPostTransferAdminDecision({ status: 'ADMIN_APPROVED' });
    assert.equal(claim1.action, 'acquire');
    assert.equal(claim2.action, 'already');
});

test('6.10T two successive partial refunds accumulate exactly then refuse a third', () => {
    const firstBd = preparePostTransferRefundBreakdown(payment(), 2000);
    assert.equal(firstBd.ok, true);
    assert.equal(firstBd.refund_amount_cents, 2000);
    assert.equal(firstBd.reversal_amount_cents, 1875);
    assert.equal(firstBd.breakdown.refunded_customer_fee_cents, 68);
    assert.equal(firstBd.breakdown.refunded_service_cents, 1932);
    const store = storeFor(2000, 'op-t-p1');
    const first = runHappyPath(store, {
        admin: ADMIN,
        requestId: 'req-610t',
        reversalId: 'trr_p1',
        refundId: 're_p1'
    });
    assert.equal(first.executed, true);
    const afterFirst = store.getPayment('pay-610t');
    assert.equal(afterFirst.amount_refunded_cents, 2000);
    assert.equal(afterFirst.provider_net_reversed_cents, 1875);
    assert.equal(afterFirst.stripe_reversal_id, 'trr_p1');
    assert.equal(afterFirst.stripe_refund_id, 're_p1');
    const secondBd = preparePostTransferRefundBreakdown(afterFirst, 2349);
    assert.equal(secondBd.is_final_refund, true);
    assert.equal(secondBd.refund_amount_cents, 2349);
    assert.equal(secondBd.reversal_amount_cents, 2199);
    store.requests.set('req-p2', {
        id: 'req-p2',
        payment_id: 'pay-610t',
        status: 'ADMIN_APPROVED',
        requested_cents: 2349
    });
    store.decisions.push({
        request_id: 'req-p2',
        action: 'ADMIN_APPROVED',
        operation_id: 'op-t-p2',
        decided_amount_cents: 2349
    });
    const second = runHappyPath(store, {
        admin: ADMIN,
        requestId: 'req-p2',
        reversalId: 'trr_p2',
        refundId: 're_p2'
    });
    assert.equal(second.executed, true);
    const final = store.getPayment('pay-610t');
    assert.equal(final.amount_refunded_cents, 4349);
    assert.equal(final.provider_net_reversed_cents, 4074);
    assert.equal(final.customer_fee_refunded_cents, 149);
    assert.equal(final.service_refunded_cents, 4200);
    assert.equal(final.provider_fee_reversed_cents, 126);
    assert.equal(final.stripe_refund_id, 're_p2');
    assert.equal(store.adjustments.length, 2);
    assert.notEqual(postTransferOperationKeys('op-t-p1').refundKey, postTransferOperationKeys('op-t-p2').refundKey);
    const third = preparePostTransferRefundBreakdown(final, 1);
    assert.equal(third.ok, false);
    assert.equal(third.code, 'EXCEEDS_REFUNDABLE');
});

test('6.10T partial then admin reject or Stripe fail does not erase first ledger (async)', async () => {
    const store = storeFor(2000, 'op-t-hold2');
    runHappyPath(store, { admin: ADMIN, requestId: 'req-610t', reversalId: 'trr_hold2', refundId: 're_hold2' });
    const flow = memoryStore({
        payments: [store.getPayment('pay-610t')],
        milestones: [{ id: 'ms-610t', status: 'RELEASED' }]
    });
    const opened = await createRequest(flow, { authUid: A, paymentId: 'pay-610t', requestedCents: 2349 });
    const rejected = await decideRequest(flow, {
        requestId: opened.body.request_id,
        action: 'reject',
        reason: 'geste refusé',
        admin: ADMIN
    });
    assert.equal(rejected.body.status, 'ADMIN_REJECTED');
    const held = await flow.getPayment({ id: 'pay-610t' });
    assert.equal(held.amount_refunded_cents, 2000);
    assert.equal(held.stripe_refund_id, 're_hold2');
    store.requests.set('req-fail', {
        id: 'req-fail',
        payment_id: 'pay-610t',
        status: 'ADMIN_APPROVED',
        requested_cents: 2349
    });
    store.decisions.push({
        request_id: 'req-fail',
        action: 'ADMIN_APPROVED',
        operation_id: 'op-t-fail2',
        decided_amount_cents: 2349
    });
    startExecution(store, { admin: ADMIN, requestId: 'req-fail' });
    applyOutcome(store, { type: 'reversal_failed', paymentId: 'pay-610t' });
    assert.equal(store.getPayment('pay-610t').amount_refunded_cents, 2000);
    assert.equal(store.getPayment('pay-610t').stripe_refund_id, 're_hold2');
});

test('6.10T webhooks never create money or overwrite terminals', () => {
    assert.equal(canWebhookFundMilestone('RELEASED'), false);
    assert.equal(canWebhookFundMilestone('CANCELLED'), false);
    assert.equal(canWebhookFundMilestone('PENDING'), true);
    assert.equal(applyPaymentFailed(payment()).apply, false);
    assert.equal(applyPaymentProcessing(payment()).apply, false);
    assert.equal(applyPaymentProcessing({ payment_status: 'CREATED' }).apply, true);
    const store = storeFor(4349, 'op-t-wh');
    startExecution(store, { admin: ADMIN, requestId: 'req-610t' });
    const event = {
        type: 'transfer.reversed',
        data: { object: { object: 'transfer', reversals: { data: [{ id: 'trr_wh' }] }, amount_reversed: 4074 } }
    };
    const first = applyOutcome(store, { type: 'webhook', paymentId: 'pay-610t', event });
    const second = applyOutcome(store, { type: 'webhook', paymentId: 'pay-610t', event });
    assert.equal(first.createReversal, false);
    assert.equal(first.createRefund, false);
    assert.equal(first.persist, false);
    assert.equal(second.action, 'already_synced');
    assert.equal(store.getPayment('pay-610t').reversal_lock, 'pending_rv_pay-610t');
    const persist = postTransferWebhookPersistDecision(first);
    assert.equal(persist.persist, false);
    const chargeWh = applyChargeRefunded(payment({
        stripe_reversal_id: 'trr_1',
        transfer_status: 'REVERSED',
        refund_lock: 'pending_re_after_pay-610t'
    }), { id: 'ch_610t', refunds: { data: [{ id: 're_early' }] }, amount_refunded: 4349 });
    assert.equal(chargeWh.createRefund, false);
    assert.notEqual(chargeWh.action, 'complete_reservation');
    const lateFailed = applyPaymentFailed(payment({ payment_status: 'SUCCEEDED' }));
    assert.equal(lateFailed.apply, false);
    const incomplete = routePostTransferWebhook({ type: 'transfer.reversed', data: {} }, payment());
    assert.equal(incomplete.createReversal, false);
    const testOnProd = admitStripeWebhookEvent({ livemode: false }, { SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` });
    assert.equal(testOnProd.ok, false);
    assert.equal(testOnProd.code, 'TEST_EVENT_ON_PRODUCTION');
    const liveBlocked = admitStripeWebhookEvent({ livemode: true }, { SUPABASE_URL: `https://${STAGING_V2_REF}.supabase.co` });
    assert.equal(liveBlocked.ok, false);
    assert.equal(liveBlocked.code, 'LIVE_EVENT_BLOCKED');
    const liveOnStaging = admitStripeWebhookEvent({ livemode: true }, {
        SUPABASE_URL: `https://${STAGING_V2_REF}.supabase.co`,
        STRIPE_LIVE_ENABLED: 'true'
    });
    assert.equal(liveOnStaging.ok, false);
    assert.equal(liveOnStaging.code, 'LIVE_EVENT_ON_STAGING');
    const stripe = require('stripe')('sk_test_610t');
    const bad = constructStripeWebhookEvent(stripe, '{}', 't=1,v1=nope', { STRIPE_WEBHOOK_SECRET: 'whsec_test' });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'STRIPE_SIGNATURE_INVALID');
});

test('6.10T authorizations: A request, B reply, C denied, admin-only decide', async () => {
    const store = flowSeed();
    const asC = await createRequest(store, { authUid: C, paymentId: 'pay-610t', requestedCents: 4349 });
    assert.equal(asC.http, 403);
    const asA = await createRequest(store, { authUid: A, paymentId: 'pay-610t', requestedCents: 4349 });
    assert.equal(asA.http, 200);
    const bApprove = await decideRequest(store, {
        requestId: asA.body.request_id,
        action: 'approve',
        requestedCents: 4349,
        admin: { userId: B, role: 'PROVIDER', status: 'ACTIVE', permissions: [] }
    });
    assert.equal(bApprove.http, 403);
    const bReply = await replyRequest(store, { authUid: B, requestId: asA.body.request_id, response: 'accept' });
    assert.equal(bReply.http, 200);
    const cView = await viewRequest(store, { authUid: C, requestId: asA.body.request_id });
    assert.equal(cView.http, 403);
    const noPerm = await decideRequest(store, {
        requestId: asA.body.request_id,
        action: 'approve',
        requestedCents: 4349,
        admin: { userId: 'ops', role: 'SUPPORT', status: 'ACTIVE', permissions: ['ops.read'] }
    });
    assert.equal(noPerm.http, 403);
    const disabled = await decideRequest(store, {
        requestId: asA.body.request_id,
        action: 'approve',
        requestedCents: 4349,
        admin: { ...ADMIN, status: 'DISABLED' }
    });
    assert.equal(disabled.http, 403);
    const ok = await decideRequest(store, {
        requestId: asA.body.request_id,
        action: 'approve',
        requestedCents: 4349,
        admin: ADMIN
    });
    assert.equal(ok.http, 200);
    assert.equal(ok.body.execute, false);
    assert.equal(ok.body.createRefund, false);
    assert.equal(canApprovePostTransferRefund({ role: 'FINANCE', status: 'ACTIVE' }), true);
    assert.equal(canApprovePostTransferRefund({ role: 'SUPPORT', status: 'ACTIVE', permissions: [] }), false);
    const accessC = postTransferRefundAccessDecision({ authUid: C, requesterId: A, providerId: B });
    assert.equal(accessC.action, 'forbidden');
});

test('6.10T resume after finalize is idempotent and never calls Stripe', () => {
    const store = storeFor(4349, 'op-t-done');
    const done = runHappyPath(store, {
        admin: ADMIN,
        requestId: 'req-610t',
        reversalId: 'trr_done',
        refundId: 're_done'
    });
    assert.equal(done.executed, true);
    const again = startExecution(store, { admin: ADMIN, requestId: 'req-610t' });
    assert.equal(again.idempotent, true);
    const prepared = neverCallStripe(store, { method: 'refunds.create', invoke: false });
    assert.equal(prepared.invoked, false);
    assert.equal(store.getPayment('pay-610t').reversal_lock, null);
    assert.equal(store.getPayment('pay-610t').refund_lock, null);
});
