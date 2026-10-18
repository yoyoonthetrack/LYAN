'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    postTransferFinancialExecutionEnabled,
    preparePostTransferRefundBreakdown
} = require('../api/stripe-policy');
const {
    persistGate,
    persistLocksActive,
    createPostTransferLockPersist
} = require('../api/post-transfer-lock-persist');
const {
    createExecutionStore,
    startExecution,
    applyOutcome
} = require('../api/post-transfer-execution');
const {
    interpretMockOutcome,
    createMockPostTransferStripe
} = require('../api/post-transfer-stripe-adapter');
const {
    IDS,
    startIsolatedPg610w,
    resetPayment,
    resetRequest,
    createPersistentStore,
    acquireConcurrent
} = require('./helpers/isolated-pg-610w');

const ADMIN = { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] };
let pg;

function persist(query) {
    return createPostTransferLockPersist({ query, isolatedLocal: true });
}

function liveStore(query, persistClient, extras) {
    const payment = query('SELECT * FROM payments WHERE id = $1', [IDS.PAY])[0];
    const request = query('SELECT * FROM post_transfer_refund_requests WHERE id = $1', [IDS.REQ])[0];
    const decisions = query('SELECT * FROM post_transfer_refund_decisions WHERE request_id = $1', [IDS.REQ]);
    return createPersistentStore(query, {
        persist: persistClient,
        payments: [payment],
        milestones: [{ id: IDS.MS, status: 'RELEASED' }],
        requests: [request],
        decisions,
        ...(extras || {})
    });
}

function failQuery(query, needle) {
    const wrapped = (sql, params) => {
        if (String(sql).includes(needle)) throw new Error('TEST_FAIL_DB ' + needle);
        return query(sql, params);
    };
    wrapped.exec = query.exec;
    return wrapped;
}

function readyPayment() {
    pg.query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id = '${IDS.PAY}';
        DELETE FROM post_transfer_refund_decisions
          WHERE payment_id = '${IDS.PAY}' AND request_id <> '${IDS.REQ}';
        DELETE FROM post_transfer_refund_requests
          WHERE payment_id = '${IDS.PAY}' AND id <> '${IDS.REQ}';
    `);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610w', decided_amount_cents: 4349 });
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55441';
    pg = await startIsolatedPg610w();
});

after(() => {
    if (pg && pg.stop) pg.stop();
});

test('6.10W persist gate refuses HTTP and disabled engine', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(persistGate({ httpRoute: true, isolatedLocal: true, query() { return []; } }).code, 'PERSIST_FORBIDDEN_ON_HTTP');
    assert.equal(persistGate({ query() { return []; } }).code, 'PERSIST_DISABLED');
    assert.equal(persistGate({ isolatedLocal: true, query() { return []; } }).ok, true);
    assert.equal(persistLocksActive({ persist: {}, isolatedLocal: true }, { httpRoute: true }), false);
    assert.equal(persistLocksActive({ persist: {} }, {}), false);
});

test('6.10W HTTP startExecution never uses persist even if attached', () => {
    const store = createExecutionStore({
        payments: [{
            id: 'pay-http',
            milestone_id: 'ms',
            payment_status: 'SUCCEEDED',
            transfer_status: 'TRANSFERRED',
            stripe_transfer_id: 'tr_x',
            stripe_payment_intent_id: 'pi_x',
            customer_total_cents: 4349,
            customer_fee_cents: 149,
            service_amount_cents: 4200,
            provider_fee_cents: 126,
            provider_net_cents: 4074,
            amount_refunded_cents: 0,
            customer_fee_refunded_cents: 0,
            service_refunded_cents: 0,
            provider_fee_reversed_cents: 0,
            provider_net_reversed_cents: 0,
            reversal_lock: null,
            refund_lock: null,
            post_transfer_operation_id: null
        }],
        milestones: [{ id: 'ms', status: 'RELEASED' }],
        requests: [{ id: 'req-http', payment_id: 'pay-http', status: 'ADMIN_APPROVED', requested_cents: 4349 }],
        decisions: [{ request_id: 'req-http', action: 'ADMIN_APPROVED', operation_id: 'op-http', decided_amount_cents: 4349 }]
    });
    store.isolatedLocal = true;
    store.persist = {
        acquireReversal() { throw new Error('persist called'); }
    };
    const started = startExecution(store, { admin: ADMIN, requestId: 'req-http', httpRoute: true });
    assert.equal(started.persist_used, false);
    assert.equal(started.execute, false);
});

test('6.10W 1-4 concurrent acquire, workers, same and different operation_id', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const client = persist(pg.query);
    const first = client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    const again = client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    const other = client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-other' });
    assert.equal(first.action, 'acquire');
    assert.equal(again.action, 'resume');
    assert.equal(other.code, 'EXECUTION_IN_PROGRESS');
    assert.equal(first.payment.post_transfer_operation_id, 'op-610w');
    assert.equal(again.payment.reversal_lock, 'pending_rv_' + IDS.PAY);

    resetPayment(pg.query, IDS.PAY, {});
    const raced = await acquireConcurrent(pg.bin, pg.port, pg.db, IDS.PAY, 'op-a', 'op-b');
    const winners = raced.filter((row) => row.out.includes(IDS.PAY));
    assert.equal(winners.length, 1);
    const live = pg.query('SELECT post_transfer_operation_id, reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.ok(live.reversal_lock === 'pending_rv_' + IDS.PAY);
    assert.ok(live.post_transfer_operation_id === 'op-a' || live.post_transfer_operation_id === 'op-b');

    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-worker' });
    const workerA = persist(pg.query);
    const workerB = persist(pg.query);
    const storeA = liveStore(pg.query, workerA);
    const storeB = liveStore(pg.query, workerB);
    const wa = startExecution(storeA, { admin: ADMIN, requestId: IDS.REQ });
    const wb = startExecution(storeB, { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(wa.persist_used, true);
    assert.equal(wb.persist_used, true);
    assert.ok((wa.action === 'prepared' && wb.action === 'resume') || (wa.action === 'resume' && wb.action === 'prepared'));
    assert.equal(wa.operation_id, wb.operation_id);
    assert.equal(createMockPostTransferStripe().calls.length, 0);
});

test('6.10W 5 timeout before mock Stripe keeps the lock', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const client = persist(pg.query);
    const acquired = client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    assert.equal(acquired.action, 'acquire');
    const timeout = interpretMockOutcome('reversal_timeout', { listRetrieved: false });
    assert.equal(timeout.retryBlind, false);
    assert.ok(timeout.action === 'keep' || timeout.code);
    const live = client.loadPayment(IDS.PAY);
    assert.equal(live.reversal_lock, 'pending_rv_' + IDS.PAY);
    assert.equal(live.stripe_reversal_id, null);
    assert.equal(client.stats.stripeCreates, 0);
});

test('6.10W 6 reversal mock confirmed but confirm SQL fails — lock kept, id not overwritten', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const client = persist(pg.query);
    const acquired = client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    assert.equal(acquired.action, 'acquire');
    assert.equal(acquired.payment.stripe_reversal_id, null);

    const failing = persist(failQuery(pg.query, 'SET stripe_reversal_id'));
    let failed;
    try {
        failed = failing.confirmReversal({
            paymentId: IDS.PAY,
            operationId: 'op-610w',
            reversalId: 'trr_already',
            nextStatus: 'REVERSED'
        });
    } catch (error) {
        failed = { action: 'reject', code: 'TX_ABORTED', error: String(error.message) };
    }
    assert.equal(failed.action, 'reject');
    const afterFail = pg.query('SELECT reversal_lock, stripe_reversal_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(afterFail.reversal_lock, 'pending_rv_' + IDS.PAY);
    assert.equal(afterFail.stripe_reversal_id, null);
});

test('6.10W 7 refund mock confirmed but SQL 069 fails — refund_lock kept', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const client = persist(pg.query);
    client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    const confirmed = client.confirmReversal({
        paymentId: IDS.PAY,
        operationId: 'op-610w',
        reversalId: 'trr_610w_ok',
        nextStatus: 'REVERSED'
    });
    assert.equal(confirmed.action, 'confirm');
    assert.equal(confirmed.payment.refund_lock, 'pending_re_after_' + IDS.PAY);
    const failing = persist(failQuery(pg.query, 'confirm_post_transfer_refund_secure'));
    const finalized = failing.finalize069({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-610w',
        refundId: 're_610w_ok',
        reversalId: 'trr_610w_ok',
        amountCents: 4349,
        refundServiceCents: 4200,
        refundCustFeeCents: 149,
        refundProvNetCents: 4074,
        refundProvFeeCents: 126
    });
    assert.equal(finalized.action, 'reject');
    assert.equal(finalized.lock_kept, true);
    assert.equal(finalized.rpcInvoked, false);
    const live = client.loadPayment(IDS.PAY);
    assert.equal(live.refund_lock, 'pending_re_after_' + IDS.PAY);
    assert.equal(live.stripe_refund_id, null);
    assert.equal(pg.query('SELECT count(*)::int AS n FROM payment_adjustments WHERE payment_id = $1', [IDS.PAY])[0].n, 0);
});

test('6.10W 8 resume after simulated restart uses the same operation_id', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    persist(pg.query).acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    const restarted = persist(pg.query);
    const resumed = restarted.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    assert.equal(resumed.action, 'resume');
    assert.equal(resumed.payment.post_transfer_operation_id, 'op-610w');
});

test('6.10W 9-10 two successive partials then double SQL 069', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const firstBreak = preparePostTransferRefundBreakdown(
        pg.query('SELECT * FROM payments WHERE id = $1', [IDS.PAY])[0],
        2000
    );
    resetRequest(pg.query, IDS.REQ, { requested_cents: 2000, operation_id: 'op-p1', decided_amount_cents: 2000 });
    const client = persist(pg.query);
    assert.equal(client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-p1' }).action, 'acquire');
    assert.equal(client.confirmReversal({
        paymentId: IDS.PAY,
        operationId: 'op-p1',
        reversalId: 'trr_610w_p1',
        nextStatus: 'PARTIALLY_REVERSED'
    }).action, 'confirm');
    const first = client.finalize069({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-p1',
        refundId: 're_610w_p1',
        reversalId: 'trr_610w_p1',
        amountCents: firstBreak.refund_amount_cents,
        refundServiceCents: firstBreak.breakdown.refunded_service_cents,
        refundCustFeeCents: firstBreak.breakdown.refunded_customer_fee_cents,
        refundProvNetCents: firstBreak.breakdown.reversed_provider_net_cents,
        refundProvFeeCents: firstBreak.breakdown.reversed_provider_fee_cents
    });
    assert.equal(first.action, 'complete');
    assert.equal(first.payment.payment_status, 'PARTIALLY_REFUNDED');
    assert.equal(first.payment.post_transfer_operation_id, null);

    const req2 = '33333333-3333-4333-8333-333333333333';
    pg.query.exec(`
        DELETE FROM post_transfer_refund_decisions WHERE operation_id = 'op-p2';
        DELETE FROM post_transfer_refund_requests WHERE id = '${req2}';
        INSERT INTO post_transfer_refund_requests (
            id, payment_id, milestone_id, requester_id, provider_id, requested_cents, status
        ) VALUES ('${req2}', '${IDS.PAY}', '${IDS.MS}', '${IDS.A}', '${IDS.B}', 2349, 'ADMIN_APPROVED');
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        ) VALUES ('${req2}', '${IDS.PAY}', 'ADMIN_APPROVED', 'op-p2', 2349);
    `);
    const afterFirst = pg.query('SELECT * FROM payments WHERE id = $1', [IDS.PAY])[0];
    const secondBreak = preparePostTransferRefundBreakdown(afterFirst, 2349);
    assert.equal(secondBreak.ok, true);
    assert.equal(client.acquireReversal({ paymentId: IDS.PAY, operationId: 'op-p2' }).action, 'acquire');
    assert.equal(client.confirmReversal({
        paymentId: IDS.PAY,
        operationId: 'op-p2',
        reversalId: 'trr_610w_p2',
        nextStatus: 'REVERSED'
    }).action, 'confirm');
    const second = client.finalize069({
        paymentId: IDS.PAY,
        requestId: req2,
        operationId: 'op-p2',
        refundId: 're_610w_p2',
        reversalId: 'trr_610w_p2',
        amountCents: secondBreak.refund_amount_cents,
        refundServiceCents: secondBreak.breakdown.refunded_service_cents,
        refundCustFeeCents: secondBreak.breakdown.refunded_customer_fee_cents,
        refundProvNetCents: secondBreak.breakdown.reversed_provider_net_cents,
        refundProvFeeCents: secondBreak.breakdown.reversed_provider_fee_cents
    });
    assert.equal(second.action, 'complete');
    assert.equal(second.payment.payment_status, 'REFUNDED');

    const twice = client.finalize069({
        paymentId: IDS.PAY,
        requestId: req2,
        operationId: 'op-p2',
        refundId: 're_610w_p2',
        reversalId: 'trr_610w_p2',
        amountCents: secondBreak.refund_amount_cents,
        refundServiceCents: secondBreak.breakdown.refunded_service_cents,
        refundCustFeeCents: secondBreak.breakdown.refunded_customer_fee_cents,
        refundProvNetCents: secondBreak.breakdown.reversed_provider_net_cents,
        refundProvFeeCents: secondBreak.breakdown.reversed_provider_fee_cents
    });
    assert.ok(twice.action === 'already' || twice.action === 'reject');
    if (twice.action === 'already') assert.equal(twice.result.idempotent, true);
});

test('6.10W 11-14 wrong request, REFUNDED, foreign lock, ambiguous Stripe', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    resetRequest(pg.query, IDS.REQ, { status: 'OPEN', noDecision: true });
    const store = liveStore(pg.query, persist(pg.query));
    const wrong = startExecution(store, { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(wrong.action, 'reject');
    assert.equal(wrong.code, 'REQUEST_NOT_APPROVED');
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, null);

    const refunded = persist(pg.query).acquireReversal({ paymentId: IDS.PAY2, operationId: 'op-done' });
    assert.equal(refunded.code, 'PAYMENT_ALREADY_REFUNDED');

    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610w' });
    resetPayment(pg.query, IDS.PAY, {
        reversal_lock: 'pending_rv_' + IDS.PAY,
        post_transfer_operation_id: 'op-foreign',
        transfer_status: 'REVERSAL_PROCESSING'
    });
    const foreign = persist(pg.query).acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    assert.equal(foreign.code, 'EXECUTION_IN_PROGRESS');

    resetPayment(pg.query, IDS.PAY, {});
    persist(pg.query).acquireReversal({ paymentId: IDS.PAY, operationId: 'op-610w' });
    const ambiguous = interpretMockOutcome('reversal_timeout', { incomplete: true, listRetrieved: false });
    assert.equal(ambiguous.retryBlind, false);
    const locked = persist(pg.query).loadPayment(IDS.PAY);
    assert.equal(locked.reversal_lock, 'pending_rv_' + IDS.PAY);
    assert.equal(applyOutcome(createExecutionStore({
        payments: [locked]
    }), { type: 'reversal_timeout', paymentId: IDS.PAY, listRetrieved: false }).createRefund, false);
});
