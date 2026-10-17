'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
    postTransferFinancialExecutionEnabled,
    preparePostTransferRefundBreakdown
} = require('../api/stripe-policy');
const { persistGate } = require('../api/post-transfer-lock-persist');
const {
    LOCK_STEP_RPC,
    createPostTransferSupabaseAdapter,
    createIsolatedSupabaseShim
} = require('../api/post-transfer-supabase-adapter');
const {
    executeAdminPostTransfer,
    guardAdminExecute
} = require('../api/post-transfer-admin-execute');
const { interpretMockOutcome } = require('../api/post-transfer-stripe-adapter');
const {
    IDS,
    startIsolatedPg610w,
    resetPayment,
    resetRequest,
    isolatedHttpStore
} = require('./helpers/isolated-pg-610w');

const SQL071 = path.join(__dirname, '../artifacts/staging-v2/phase610y/proposed-071.sql');
const ADMIN = {
    authorized: true,
    userId: 'admin-610x',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

let pg;
let adapter;

function readyPayment() {
    pg.query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id = '${IDS.PAY}';
        DELETE FROM post_transfer_refund_decisions
          WHERE payment_id = '${IDS.PAY}' AND request_id <> '${IDS.REQ}';
        DELETE FROM post_transfer_refund_requests
          WHERE payment_id = '${IDS.PAY}' AND id <> '${IDS.REQ}';
    `);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610x', decided_amount_cents: 4349 });
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55443';
    pg = await startIsolatedPg610w({ extraSqlFiles: [SQL071] });
    if (pg) adapter = createPostTransferSupabaseAdapter({
        client: createIsolatedSupabaseShim(pg.query),
        isolatedLocal: true
    });
});

after(() => {
    if (pg && pg.stop) pg.stop();
});

test('6.10X persist gate and HTTP adapter stay disabled', async () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(persistGate({ httpRoute: true, isolatedLocal: true, client: {} }).code, 'PERSIST_FORBIDDEN_ON_HTTP');
    assert.equal(persistGate({ client: {} }).code, 'PERSIST_DISABLED');
    assert.equal(persistGate({ isolatedLocal: true, client: {} }).ok, true);
    assert.equal(persistGate({ serverStripeTestGrant: true, client: {} }).code, 'GRANT_INACTIVE');
    const httpAdapter = createPostTransferSupabaseAdapter({
        client: { rpc() { throw new Error('rpc called'); } },
        httpRoute: true,
        isolatedLocal: true
    });
    const refused = await httpAdapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-http' });
    assert.equal(refused.code, 'PERSIST_FORBIDDEN_ON_HTTP');
    assert.equal(refused.execute, false);
    assert.equal(refused.createReversal, false);
});

test('6.10X isolated adapter acquire, single holder, resume, foreign op', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const first = await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    const again = await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    const other = await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-other', requestId: IDS.REQ });
    assert.equal(first.action, 'acquire');
    assert.equal(again.action, 'resume');
    assert.equal(other.code, 'DECISION_REQUIRED');
    const resumed = await adapter.resumeReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    assert.equal(resumed.action, 'resume');
    const live = pg.query('SELECT reversal_lock, post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(live.reversal_lock, 'pending_rv_' + IDS.PAY);
    assert.equal(live.post_transfer_operation_id, 'op-610x');
});

test('6.10X concurrent acquire through the lock RPC yields one holder', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const [a, b] = await Promise.all([
        adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ }),
        adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ })
    ]);
    const actions = [a.action, b.action].sort();
    assert.ok(actions.includes('acquire') || actions.includes('resume'));
    const live = pg.query('SELECT post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(live.post_transfer_operation_id, 'op-610x');
    const holders = [a, b].filter((row) => row.action === 'acquire');
    assert.ok(holders.length <= 1);
});

test('6.10X confirm reversal, 069 finalize, no double adjustment', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    const confirmed = await adapter.confirmReversal({
        paymentId: IDS.PAY,
        operationId: 'op-610x',
        requestId: IDS.REQ,
        reversalId: 'trr_610x_full',
        nextStatus: 'REVERSED',
        attested: true
    });
    assert.equal(confirmed.action, 'confirm');
    const refundResume = await adapter.resumeRefundLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    assert.equal(refundResume.action, 'resume');
    const finalized = await adapter.finalizeRefund({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-610x',
        refundId: 're_610x_full',
        reversalId: 'trr_610x_full',
        amountCents: 4349,
        refundServiceCents: 4200,
        refundCustFeeCents: 149,
        refundProvNetCents: 4074,
        refundProvFeeCents: 126
    });
    assert.equal(finalized.action, 'complete');
    const twice = await adapter.finalizeRefund({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-610x',
        refundId: 're_610x_full',
        reversalId: 'trr_610x_full',
        amountCents: 4349,
        refundServiceCents: 4200,
        refundCustFeeCents: 149,
        refundProvNetCents: 4074,
        refundProvFeeCents: 126
    });
    assert.ok(twice.action === 'already' || twice.code === 'ALREADY_EXECUTED' || twice.action === 'reject');
    const n = pg.query('SELECT count(*)::int AS n FROM payment_adjustments WHERE payment_id = $1', [IDS.PAY])[0].n;
    assert.equal(n, 1);
    assert.equal(adapter.stats.stripeCreates, 0);
});

test('6.10X two successive partials via adapter + 069', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    const firstBreak = preparePostTransferRefundBreakdown(
        pg.query('SELECT * FROM payments WHERE id = $1', [IDS.PAY])[0],
        2000
    );
    resetRequest(pg.query, IDS.REQ, { requested_cents: 2000, operation_id: 'op-x1', decided_amount_cents: 2000 });
    assert.equal((await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-x1', requestId: IDS.REQ })).action, 'acquire');
    assert.equal((await adapter.confirmReversal({
        paymentId: IDS.PAY,
        operationId: 'op-x1',
        requestId: IDS.REQ,
        reversalId: 'trr_610x_p1',
        nextStatus: 'PARTIALLY_REVERSED',
        attested: true
    })).action, 'confirm');
    const first = await adapter.finalizeRefund({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-x1',
        refundId: 're_610x_p1',
        reversalId: 'trr_610x_p1',
        amountCents: firstBreak.refund_amount_cents,
        refundServiceCents: firstBreak.breakdown.refunded_service_cents,
        refundCustFeeCents: firstBreak.breakdown.refunded_customer_fee_cents,
        refundProvNetCents: firstBreak.breakdown.reversed_provider_net_cents,
        refundProvFeeCents: firstBreak.breakdown.reversed_provider_fee_cents
    });
    assert.equal(first.action, 'complete');

    const req2 = '34444444-4444-4444-8444-444444444444';
    pg.query.exec(`
        DELETE FROM post_transfer_refund_decisions WHERE operation_id = 'op-x2';
        DELETE FROM post_transfer_refund_requests WHERE id = '${req2}';
        INSERT INTO post_transfer_refund_requests (
            id, payment_id, milestone_id, requester_id, provider_id, requested_cents, status
        ) VALUES ('${req2}', '${IDS.PAY}', '${IDS.MS}', '${IDS.A}', '${IDS.B}', 2349, 'ADMIN_APPROVED');
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        ) VALUES ('${req2}', '${IDS.PAY}', 'ADMIN_APPROVED', 'op-x2', 2349);
    `);
    const afterFirst = pg.query('SELECT * FROM payments WHERE id = $1', [IDS.PAY])[0];
    const secondBreak = preparePostTransferRefundBreakdown(afterFirst, 2349);
    assert.equal(secondBreak.ok, true);
    assert.equal((await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-x2', requestId: req2 })).action, 'acquire');
    assert.equal((await adapter.confirmReversal({
        paymentId: IDS.PAY,
        operationId: 'op-x2',
        requestId: req2,
        reversalId: 'trr_610x_p2',
        nextStatus: 'REVERSED',
        attested: true
    })).action, 'confirm');
    const second = await adapter.finalizeRefund({
        paymentId: IDS.PAY,
        requestId: req2,
        operationId: 'op-x2',
        refundId: 're_610x_p2',
        reversalId: 'trr_610x_p2',
        amountCents: secondBreak.refund_amount_cents,
        refundServiceCents: secondBreak.breakdown.refunded_service_cents,
        refundCustFeeCents: secondBreak.breakdown.refunded_customer_fee_cents,
        refundProvNetCents: secondBreak.breakdown.reversed_provider_net_cents,
        refundProvFeeCents: secondBreak.breakdown.reversed_provider_fee_cents
    });
    assert.equal(second.action, 'complete');
    assert.equal(pg.query('SELECT payment_status FROM payments WHERE id = $1', [IDS.PAY])[0].payment_status, 'REFUNDED');
});

test('6.10X timeout keeps lock; restart resumes; REFUNDED refused', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    const timeout = interpretMockOutcome('reversal_timeout', { listRetrieved: false });
    assert.equal(timeout.retryBlind, false);
    const state = await adapter.readExecutionState({ paymentId: IDS.PAY, requestId: IDS.REQ, operationId: 'op-610x' });
    assert.equal(state.payment.reversal_lock, 'pending_rv_' + IDS.PAY);
    const restarted = createPostTransferSupabaseAdapter({
        client: createIsolatedSupabaseShim(pg.query),
        isolatedLocal: true
    });
    const resumed = await restarted.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-610x', requestId: IDS.REQ });
    assert.equal(resumed.action, 'resume');
    const refunded = await adapter.acquireReversalLock({ paymentId: IDS.PAY2, operationId: 'op-done', requestId: IDS.REQ2 });
    assert.equal(refunded.code, 'REQUEST_NOT_APPROVED');
});

test('6.10X authenticated role cannot execute lock RPC; HTTP execute ignores persist', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    readyPayment();
    let forbidden = '';
    try {
        pg.query.exec(`SET ROLE authenticated; SELECT public.post_transfer_lock_step_secure('acquire', '${IDS.PAY}', 'op-hack');`);
    } catch (error) {
        forbidden = String(error.message);
    }
    try { pg.query.exec('RESET ROLE'); } catch (_) { /* ignore */ }
    assert.match(forbidden, /FORBIDDEN|42501|permission denied/i);
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, null);

    const store = isolatedHttpStore(pg.query, IDS);
    store.persist = {
        acquireReversalLock() { throw new Error('supabase persist invoked'); },
        acquireReversal() { throw new Error('persist invoked'); }
    };
    const http = await executeAdminPostTransfer(store, { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(http.body.code, 'EXECUTION_DISABLED');
    assert.equal(http.body.persist_used, false);
    assert.equal(http.body.lock_persisted, false);
    assert.equal(http.body.execute, false);
    const jwt = guardAdminExecute({ authorized: false, status: 401, error: 'Jeton invalide' });
    assert.equal(jwt.http, 401);
    const a = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'user-a', role: 'USER', status: 'ACTIVE', permissions: [] },
        requestId: IDS.REQ
    });
    const b = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'user-b', role: 'USER', status: 'ACTIVE', permissions: [] },
        requestId: IDS.REQ
    });
    const c = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'user-c', role: 'USER', status: 'ACTIVE', permissions: [] },
        requestId: IDS.REQ
    });
    assert.equal(a.http, 403);
    assert.equal(b.http, 403);
    assert.equal(c.http, 403);
    const forced = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: IDS.REQ,
        body: { enable_execution: true, force: true }
    });
    assert.equal(forced.body.code, 'EXECUTION_DISABLED');
    assert.equal(LOCK_STEP_RPC, 'post_transfer_lock_step_secure');
});
