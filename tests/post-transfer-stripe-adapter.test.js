'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    postTransferFinancialExecutionEnabled,
    paymentWritePaths,
    preparePostTransferRefundBreakdown
} = require('../api/stripe-policy');
const {
    METHOD,
    POST_TRANSFER_STRIPE_CONTRACTS,
    rejectLiveStripe,
    validatePreparedAgainstPayment,
    admitStripeDispatch,
    planReversalCall,
    planRefundCall,
    dispatchPreparedStripeCall,
    dispatchStripeRead,
    classifyStripeRead,
    admitStripeRead,
    planTransferRetrieve,
    planListReversals,
    planRefundRetrieve,
    planListRefunds,
    planPaymentIntentRetrieve,
    planChargeRetrieve,
    isReadMethod,
    isWriteMethod,
    interpretMockOutcome,
    createMockPostTransferStripe
} = require('../api/post-transfer-stripe-adapter');
const { createExecutionStore, startExecution, applyOutcome, runHappyPath } = require('../api/post-transfer-execution');

const ADMIN = { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] };

function payment(overrides) {
    return {
        id: 'pay-610n',
        milestone_id: 'ms-610n',
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_610n',
        stripe_payment_intent_id: 'pi_610n',
        stripe_charge_id: 'ch_610n',
        stripe_connect_account_id: 'acct_connect_test',
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

function storeFor(cents, operationId) {
    return createExecutionStore({
        payments: [payment()],
        milestones: [{ id: 'ms-610n', status: 'RELEASED' }],
        requests: [{ id: 'req-610n', payment_id: 'pay-610n', status: 'ADMIN_APPROVED', requested_cents: cents }],
        decisions: [{ request_id: 'req-610n', action: 'ADMIN_APPROVED', operation_id: operationId, decided_amount_cents: cents }]
    });
}

test('6.10N contracts cover reversal refund retrieve and list', () => {
    assert.equal(Boolean(POST_TRANSFER_STRIPE_CONTRACTS[METHOD.CREATE_REVERSAL]), true);
    assert.equal(Boolean(POST_TRANSFER_STRIPE_CONTRACTS[METHOD.CREATE_REFUND]), true);
    assert.equal(Boolean(POST_TRANSFER_STRIPE_CONTRACTS[METHOD.LIST_REVERSALS]), true);
    assert.equal(POST_TRANSFER_STRIPE_CONTRACTS[METHOD.CREATE_REVERSAL].resultPrefix, 'trr_');
    assert.equal(POST_TRANSFER_STRIPE_CONTRACTS[METHOD.CREATE_REFUND].idempotency, 're_op_<operation_id>_after_rv');
});

test('6.10N reversal success is mock-only and never invokes Stripe', () => {
    const pay = payment();
    const breakdown = preparePostTransferRefundBreakdown(pay, 4349);
    const planned = planReversalCall({ payment: pay, breakdown, operationId: 'op-610n' });
    const mock = createMockPostTransferStripe({ 'transfers.createReversal': { id: 'trr_ok' } });
    const dispatched = dispatchPreparedStripeCall(planned, mock, { payment: pay, allowReal: false });
    const interpreted = interpretMockOutcome('reversal_success', { id: 'trr_ok' });
    assert.equal(planned.method, METHOD.CREATE_REVERSAL);
    assert.equal(planned.idempotencyKey, 'rv_op_op-610n');
    assert.equal(planned.invoke, false);
    assert.equal(dispatched.invoked, false);
    assert.equal(dispatched.stripeClientUsed, false);
    assert.equal(mock.calls.length, 0);
    assert.equal(interpreted.reversalId, 'trr_ok');
});

test('6.10N reversal refused and timeout keep the lock semantics', () => {
    const refused = interpretMockOutcome('reversal_refused', { code: 'balance_insufficient' });
    const timeout = interpretMockOutcome('reversal_timeout', { listRetrieved: false });
    assert.equal(refused.code, 'balance_insufficient');
    assert.equal(timeout.retryBlind, false);
    assert.equal(timeout.action, 'keep');
});

test('6.10N reversal already created is reconciled without a new call', () => {
    const already = interpretMockOutcome('reversal_already', { id: 'trr_exist' });
    assert.equal(already.action, 'already');
    assert.equal(already.invoked, false);
});

test('6.10N refund success refused timeout and already stay mocked', () => {
    assert.equal(interpretMockOutcome('refund_success', { id: 're_ok' }).refundId, 're_ok');
    assert.equal(interpretMockOutcome('refund_refused', { code: 'charge_already_refunded' }).code, 'charge_already_refunded');
    assert.equal(interpretMockOutcome('refund_timeout', { listRetrieved: false }).retryBlind, false);
    assert.equal(interpretMockOutcome('refund_already', { id: 're_exist' }).action, 'already');
});

test('6.10N reversal success then refund failed never marks executed', () => {
    const store = storeFor(4349, 'op-610n-split');
    startExecution(store, { admin: ADMIN, requestId: 'req-610n' });
    applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610n',
        operationId: 'op-610n-split',
        reversalId: 'trr_610n_split',
        amount: 4074
    });
    const failed = applyOutcome(store, { type: 'refund_failed', paymentId: 'pay-610n' });
    assert.equal(failed.phase, 'refund_failed');
    assert.equal(store.adjustments.length, 0);
    assert.notEqual(store.getRequest('req-610n').execution_status, 'EXECUTED');
    assert.equal(store.getPayment('pay-610n').stripe_reversal_id, 'trr_610n_split');
});

test('6.10N double execution stays on one reservation', () => {
    const store = storeFor(4349, 'op-610n-dbl');
    const a = startExecution(store, { admin: ADMIN, requestId: 'req-610n' });
    const b = startExecution(store, { admin: ADMIN, requestId: 'req-610n' });
    assert.equal(a.action, 'prepared');
    assert.equal(b.action, 'resume');
    assert.equal(a.reversalCall.idempotencyKey, b.reversalCall.idempotencyKey);
    assert.equal(store.stripeCalls.every((row) => row.invoke === false), true);
});

test('6.10N two successive partials use distinct operation keys', () => {
    const first = storeFor(2000, 'op-610n-s1');
    runHappyPath(first, { admin: ADMIN, requestId: 'req-610n', reversalId: 'trr_s1', refundId: 're_s1' });
    const pay = first.getPayment('pay-610n');
    const second = createExecutionStore({
        payments: [pay],
        milestones: [{ id: 'ms-610n', status: 'RELEASED' }],
        requests: [{ id: 'req-610n-2', payment_id: 'pay-610n', status: 'ADMIN_APPROVED', requested_cents: 2349 }],
        decisions: [{ request_id: 'req-610n-2', action: 'ADMIN_APPROVED', operation_id: 'op-610n-s2', decided_amount_cents: 2349 }]
    });
    const again = runHappyPath(second, { admin: ADMIN, requestId: 'req-610n-2', reversalId: 'trr_s2', refundId: 're_s2' });
    assert.equal(again.executed, true);
    assert.notEqual(
        planReversalCall({ payment: pay, breakdown: { reversal_amount_cents: 1 }, operationId: 'op-610n-s1' }).idempotencyKey,
        planReversalCall({ payment: pay, breakdown: { reversal_amount_cents: 1 }, operationId: 'op-610n-s2' }).idempotencyKey
    );
});

test('6.10N late webhook only observes', () => {
    const pay = payment({ reversal_lock: 'pending_rv_pay-610n' });
    const routed = interpretMockOutcome('webhook', {
        payment: pay,
        event: { type: 'transfer.reversed', data: { object: { object: 'transfer', reversals: { data: [{ id: 'trr_late' }] } } } }
    });
    assert.equal(routed.persist, false);
    assert.equal(routed.invoked, false);
});

test('6.10N incorrect amount connect account intent and transfer are refused', () => {
    const pay = payment();
    const breakdown = preparePostTransferRefundBreakdown(pay, 4349);
    const reversal = planReversalCall({ payment: pay, breakdown, operationId: 'op-610n-v' });
    const refund = planRefundCall({ payment: pay, breakdown, operationId: 'op-610n-v' });
    assert.equal(validatePreparedAgainstPayment(reversal, pay, { amount: 1 }).code, 'AMOUNT_MISMATCH');
    assert.equal(validatePreparedAgainstPayment(reversal, pay, { transfer: 'tr_other' }).code, 'TRANSFER_MISMATCH');
    assert.equal(validatePreparedAgainstPayment(refund, pay, { payment_intent: 'pi_other' }).code, 'PAYMENT_INTENT_MISMATCH');
    assert.equal(validatePreparedAgainstPayment(reversal, pay, { connectAccount: 'acct_other' }).code, 'CONNECT_ACCOUNT_MISMATCH');
});

test('6.10N Stripe Live is blocked and engine stays off', () => {
    const live = rejectLiveStripe({ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_PUBLISHABLE_KEY: 'pk_live_x' });
    const liveObject = rejectLiveStripe({ STRIPE_SECRET_KEY: 'sk_test_x' }, { livemode: true });
    const admitted = admitStripeDispatch({ ok: true, method: METHOD.CREATE_REVERSAL }, { allowReal: true });
    assert.equal(live.code, 'STRIPE_LIVE_BLOCKED');
    assert.equal(liveObject.code, 'STRIPE_LIVE_BLOCKED');
    assert.equal(admitted.invoked, false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-after-transfer'), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.equal(server.includes('/v1/payments/refund-after-transfer'), false);
    assert.equal(server.includes('transfers.createReversal'), false);
});

test('6.10O read methods are distinct from financial writes', () => {
    assert.equal(isReadMethod(METHOD.RETRIEVE_TRANSFER), true);
    assert.equal(isWriteMethod(METHOD.CREATE_REVERSAL), true);
    assert.equal(isReadMethod(METHOD.CREATE_REFUND), false);
    const writeOnRead = admitStripeRead({ method: METHOD.CREATE_REVERSAL, ok: true }, {});
    assert.equal(writeOnRead.code, 'STRIPE_WRITE_FORBIDDEN_ON_READ_PATH');
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('6.10O missing object with complete search is absent, incomplete is uncertain', () => {
    assert.equal(classifyStripeRead({ found: false, searchComplete: true }).status, 'absent');
    assert.equal(classifyStripeRead({ found: false, searchComplete: false }).status, 'uncertain');
    assert.equal(classifyStripeRead({ timeout: true }).status, 'uncertain');
    assert.equal(classifyStripeRead({ incomplete: true }).status, 'uncertain');
    assert.equal(classifyStripeRead({ candidates: 2 }).status, 'uncertain');
    assert.equal(classifyStripeRead({ livemode: true }).status, 'blocked');
    assert.equal(classifyStripeRead({ found: true, searchComplete: true }).status, 'confirmed');
});

test('6.10O mock reads confirm transfer intent charge and refunds', async () => {
    const pay = payment({ stripe_charge_id: 'ch_610n' });
    const mock = createMockPostTransferStripe({
        'transfers.retrieve': { id: 'tr_610n', amount: 4074, destination: 'acct_connect_test', source_transaction: 'ch_610n', livemode: false },
        'transfers.listReversals': { object: 'list', has_more: false, data: [] },
        'paymentIntents.retrieve': { id: 'pi_610n', latest_charge: 'ch_610n', livemode: false },
        'charges.retrieve': { id: 'ch_610n', amount: 4349, livemode: false },
        'refunds.list': { object: 'list', has_more: false, data: [] }
    });
    const transfer = await dispatchStripeRead(planTransferRetrieve(pay), mock, { payment: pay });
    const reversals = await dispatchStripeRead(planListReversals(pay), mock, { payment: pay });
    const intent = await dispatchStripeRead(planPaymentIntentRetrieve(pay), mock, { payment: pay });
    const charge = await dispatchStripeRead(planChargeRetrieve(pay), mock, { payment: pay });
    const refunds = await dispatchStripeRead(planListRefunds(pay), mock, { payment: pay });
    assert.equal(transfer.classification, 'confirmed');
    assert.equal(transfer.object.amount, 4074);
    assert.equal(reversals.classification, 'absent');
    assert.equal(intent.object.latest_charge, 'ch_610n');
    assert.equal(charge.classification, 'confirmed');
    assert.equal(refunds.classification, 'absent');
    assert.equal(refunds.createRefund, false);
});

test('6.10O unknown id timeout incomplete list and live object block money movement', async () => {
    const pay = payment();
    const missing = createMockPostTransferStripe({
        'transfers.retrieve': () => {
            const error = new Error('missing');
            error.code = 'resource_missing';
            error.statusCode = 404;
            throw error;
        }
    });
    const timed = createMockPostTransferStripe({ 'transfers.retrieve': 'timeout' });
    const incomplete = createMockPostTransferStripe({
        'refunds.list': { object: 'list', has_more: true, data: [{ id: 're_one', livemode: false }] }
    });
    const many = createMockPostTransferStripe({
        'refunds.list': { object: 'list', has_more: false, data: [{ id: 're_a' }, { id: 're_b' }] }
    });
    const live = createMockPostTransferStripe({
        'transfers.retrieve': { id: 'tr_610n', livemode: true }
    });
    const absent = await dispatchStripeRead(planTransferRetrieve(pay), missing, { payment: pay });
    const timeout = await dispatchStripeRead(planTransferRetrieve(pay), timed, { payment: pay });
    const page = await dispatchStripeRead(planListRefunds(pay), incomplete, { payment: pay });
    const multi = await dispatchStripeRead(planListRefunds(pay), many, { payment: pay });
    const blocked = await dispatchStripeRead(planTransferRetrieve(pay), live, { payment: pay });
    assert.equal(absent.classification, 'absent');
    assert.equal(timeout.classification, 'uncertain');
    assert.equal(page.classification, 'uncertain');
    assert.equal(multi.classification, 'uncertain');
    assert.equal(blocked.classification, 'blocked');
    assert.equal(timeout.createReversal, false);
    assert.equal(page.createRefund, false);
});

test('6.10O mismatch parents and financial dispatch stay refused', async () => {
    const pay = payment();
    const wrongTransfer = await dispatchStripeRead(
        { ok: true, method: METHOD.RETRIEVE_TRANSFER, transfer: 'tr_other' },
        createMockPostTransferStripe(),
        { payment: pay }
    );
    const wrongIntent = await dispatchStripeRead(
        { ok: true, method: METHOD.RETRIEVE_INTENT, payment_intent: 'pi_other' },
        createMockPostTransferStripe(),
        { payment: pay }
    );
    const wrongCharge = await dispatchStripeRead(
        { ok: true, method: METHOD.RETRIEVE_CHARGE, charge: 'ch_other' },
        createMockPostTransferStripe(),
        { payment: pay, expected: { charge: 'ch_610n' } }
    );
    const write = dispatchPreparedStripeCall(planReversalCall({
        payment: pay,
        breakdown: preparePostTransferRefundBreakdown(pay, 4349),
        operationId: 'op-610o'
    }), createMockPostTransferStripe(), { payment: pay, allowReal: true });
    assert.equal(wrongTransfer.code, 'TRANSFER_MISMATCH');
    assert.equal(wrongIntent.code, 'PAYMENT_INTENT_MISMATCH');
    assert.equal(wrongCharge.code, 'CHARGE_MISMATCH');
    assert.equal(write.invoked, false);
    assert.equal(write.stripeClientUsed, false);
});

test('6.10O late webhook and crash resume still do not invoke Stripe', () => {
    const store = storeFor(4349, 'op-610o-resume');
    startExecution(store, { admin: ADMIN, requestId: 'req-610n' });
    const snap = store.getPayment('pay-610n');
    const resumed = createExecutionStore({
        payments: [snap],
        milestones: [{ id: 'ms-610n', status: 'RELEASED' }],
        requests: [store.getRequest('req-610n')],
        decisions: [{ request_id: 'req-610n', action: 'ADMIN_APPROVED', operation_id: 'op-610o-resume', decided_amount_cents: 4349 }]
    });
    const again = startExecution(resumed, { admin: ADMIN, requestId: 'req-610n' });
    const late = interpretMockOutcome('webhook', {
        payment: snap,
        event: { type: 'charge.refunded', data: { object: { refunds: { data: [{ id: 're_late' }] } } } }
    });
    assert.equal(again.action, 'resume');
    assert.equal(late.persist, false);
    assert.equal(resumed.stripeCalls.every((row) => row.invoke === false), true);
});
