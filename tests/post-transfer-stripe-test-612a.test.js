'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    executeAdminPostTransfer,
    runStripeTest,
    runStripeTestPath,
    validateExecuteContext,
    resolvePostTransferExecutionMode,
    STRIPE_TEST_ACTIVATION,
    MODES
} = require('../api/post-transfer-orchestrator');
const {
    STRIPE_TEST_GRANT,
    loadServerGrant,
    evaluateStripeTestGrant,
    decideStripeWriteAfterReconcile,
    admitStripeTestWrite,
    STAGING_REF,
    PRODUCTION_REF,
    STRIPE_TEST_PLATFORM_ACCOUNT,
    HISTORIC_PAYMENTS
} = require('../api/post-transfer-stripe-test-grant');
const { planReversalCall, planRefundCall } = require('../api/post-transfer-stripe-adapter');
const { preparePostTransferRefundBreakdown, postTransferFinancialExecutionEnabled } = require('../api/stripe-policy');
const { createPostTransferSupabaseAdapter, createIsolatedSupabaseShim } = require('../api/post-transfer-supabase-adapter');
const {
    IDS,
    startIsolatedPg610w,
    resetPayment,
    resetRequest,
    isolatedHttpStore
} = require('./helpers/isolated-pg-610w');

const SQL071 = path.join(__dirname, '../artifacts/staging-v2/phase610z/install-071.sql');
const ADMIN = {
    authorized: true,
    userId: 'admin-612a',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

function activeGrant(overrides) {
    return {
        ...STRIPE_TEST_GRANT,
        active: true,
        request_id: IDS.REQ,
        payment_id: IDS.PAY,
        operation_id: 'op-612a',
        max_amount_cents: 4349,
        expires_at: '2099-01-01T00:00:00.000Z',
        ...overrides
    };
}

function facts(overrides) {
    return {
        requestId: IDS.REQ,
        paymentId: IDS.PAY,
        operationId: 'op-612a',
        amountCents: 4349,
        supabaseProject: STAGING_REF,
        stripeAccount: STRIPE_TEST_PLATFORM_ACCOUNT,
        livemode: false,
        now: new Date('2026-10-14T22:00:00.000Z'),
        env: { STRIPE_SECRET_KEY: 'sk_test_612a', STRIPE_PUBLISHABLE_KEY: 'pk_test_612a' },
        ...overrides
    };
}

function createDispatch(script) {
    const queue = Array.isArray(script) ? script.slice() : [];
    const calls = [];
    return {
        calls,
        async reconcile() {
            const next = queue.shift() || { found: false, searchComplete: true };
            calls.push({ kind: 'reconcile', write: false });
            return next;
        },
        async dispatch(prepared) {
            calls.push({
                kind: 'write',
                method: prepared && prepared.method,
                idempotencyKey: prepared && prepared.idempotencyKey
            });
            const next = queue.shift() || { ok: true, livemode: false };
            if (next.livemode === true) return { ok: false, livemode: true, code: 'STRIPE_LIVE_BLOCKED' };
            if (next.timeout === true) return { ok: false, timeout: true, code: 'STRIPE_SIM_TIMEOUT' };
            return { ok: true, livemode: false, real: false, id: next.id };
        }
    };
}

let pg;
let adapter;

function ready(op) {
    pg.query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id = '${IDS.PAY}';
        DELETE FROM post_transfer_refund_decisions WHERE payment_id = '${IDS.PAY}' AND request_id <> '${IDS.REQ}';
        DELETE FROM post_transfer_refund_requests WHERE payment_id = '${IDS.PAY}' AND id <> '${IDS.REQ}';
    `);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, {
        operation_id: op || 'op-612a',
        decided_amount_cents: 4349,
        requested_cents: 4349
    });
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55449';
    pg = await startIsolatedPg610w({ extraSqlFiles: [SQL071] });
    if (pg) {
        adapter = createPostTransferSupabaseAdapter({
            client: createIsolatedSupabaseShim(pg.query),
            isolatedLocal: true
        });
    }
});

after(() => {
    if (pg && pg.stop) pg.stop();
});

test('612A server grant stays inactive and HTTP cannot rewrite it', () => {
    assert.equal(STRIPE_TEST_GRANT.active, false);
    assert.equal(loadServerGrant().active, false);
    assert.equal(STRIPE_TEST_ACTIVATION.allowed, false);
    assert.equal(STRIPE_TEST_ACTIVATION.grant_active, false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(runStripeTest().body.code, 'STRIPE_TEST_NOT_ACTIVATED');
    assert.equal(runStripeTest().body.stripe_real, 0);
    assert.equal(evaluateStripeTestGrant(loadServerGrant(), facts()).code, 'STRIPE_TEST_NOT_ACTIVATED');
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    const start = server.indexOf("app.post('/v1/admin/post-transfer-refund-requests/:id/execute'");
    const next = server.indexOf('app.post(', start + 10);
    const block = server.slice(start, next);
    assert.equal(block.includes('serverAdapter'), false);
    assert.equal(block.includes('serverStripeDispatch'), false);
    assert.equal(block.includes('STRIPE_TEST_GRANT'), false);
    assert.equal(server.includes('transfers.createReversal'), false);
});

test('612A targeted authorization refusals', () => {
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ supabaseProject: PRODUCTION_REF })).code, 'PRODUCTION_FORBIDDEN');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ livemode: true })).code, 'STRIPE_LIVE_BLOCKED');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ supabaseProject: 'otherprojectxxxx' })).code, 'SUPABASE_PROJECT_MISMATCH');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ stripeAccount: 'acct_other' })).code, 'STRIPE_ACCOUNT_MISMATCH');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ requestId: IDS.REQ2 })).code, 'REQUEST_NOT_GRANTED');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ paymentId: IDS.PAY2 })).code, 'PAYMENT_NOT_GRANTED');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ operationId: 'op-other' })).code, 'OPERATION_NOT_GRANTED');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ amountCents: 99999 })).code, 'AMOUNT_EXCEEDS_GRANT');
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts({ now: new Date('2100-01-01T00:00:00Z') })).code, 'GRANT_EXPIRED');
    assert.equal(evaluateStripeTestGrant(activeGrant({ payment_id: HISTORIC_PAYMENTS[0] }), facts({ paymentId: HISTORIC_PAYMENTS[0] })).code, 'HISTORIC_PAYMENT_FORBIDDEN');
    assert.equal(evaluateStripeTestGrant(activeGrant({ request_id: null }), facts()).code, 'GRANT_INCOMPLETE');
    const second = evaluateStripeTestGrant(activeGrant(), facts({ requestId: IDS.REQ2, operationId: 'op-612a-b' }));
    assert.equal(second.ok, false);
    assert.equal(evaluateStripeTestGrant(activeGrant(), facts()).code, 'GRANT_MATCH');
});

test('612A HTTP force/headers cannot activate grant', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const before = pg.query('SELECT reversal_lock, refund_lock, payment_status FROM payments WHERE id = $1', [IDS.PAY])[0];
    const http = await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        httpRoute: true,
        body: {
            mode: 'STRIPE_TEST',
            force: true,
            enable_execution: true,
            grant: { active: true, request_id: IDS.REQ, payment_id: IDS.PAY, operation_id: 'op-612a' }
        },
        headers: { 'x-enable-execution': '1' },
        trustedConfig: { mode: 'STRIPE_TEST', grant: { active: true } }
    });
    assert.equal(http.body.code, 'EXECUTION_DISABLED');
    assert.equal(http.body.persist_used, false);
    assert.deepEqual(pg.query('SELECT reversal_lock, refund_lock, payment_status FROM payments WHERE id = $1', [IDS.PAY])[0], before);
    assert.equal(resolvePostTransferExecutionMode({ grant: { active: true, req: true } }, { facts: facts() }).reason, 'HTTP_UNTRUSTED');
});

test('612A planned Stripe calls keep existing idempotency keys', () => {
    const payment = {
        stripe_transfer_id: 'tr_612a',
        stripe_payment_intent_id: 'pi_612a',
        stripe_charge_id: 'ch_612a'
    };
    const breakdown = preparePostTransferRefundBreakdown({
        ...payment,
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
    }, 4349);
    const reversal = planReversalCall({ payment, breakdown, operationId: 'op-612a' });
    const refund = planRefundCall({ payment, breakdown, operationId: 'op-612a' });
    assert.equal(reversal.method, 'transfers.createReversal');
    assert.equal(reversal.idempotencyKey, 'rv_op_op-612a');
    assert.equal(refund.method, 'refunds.create');
    assert.equal(refund.idempotencyKey, 're_op_op-612a_after_rv');
    const admitted = admitStripeTestWrite(activeGrant(), facts(), reversal);
    assert.equal(admitted.ok, true);
    assert.equal(admitted.idempotencyKey, 'rv_op_op-612a');
    assert.equal(admitStripeTestWrite(loadServerGrant(), facts(), reversal).code, 'STRIPE_TEST_NOT_ACTIVATED');
});

test('612A reconcile refuses uncertain/live/foreign and reuses a confirmed id', () => {
    assert.equal(decideStripeWriteAfterReconcile({ livemode: true }).code, 'STRIPE_LIVE_BLOCKED');
    assert.equal(decideStripeWriteAfterReconcile({ timeout: true }).write, false);
    assert.equal(decideStripeWriteAfterReconcile({ incomplete: true }).code, 'STRIPE_READ_UNCERTAIN');
    assert.equal(decideStripeWriteAfterReconcile({ candidates: 2, found: true, searchComplete: true }).code, 'MULTIPLE_CANDIDATES');
    assert.equal(decideStripeWriteAfterReconcile({ mismatch: true }).code, 'STRIPE_ID_FOREIGN');
    const reused = decideStripeWriteAfterReconcile({
        found: true,
        searchComplete: true,
        id: 'trr_existing',
        amount: 4074,
        expectedAmount: 4074,
        parent: 'tr_612a',
        expectedParent: 'tr_612a'
    });
    assert.equal(reused.write, false);
    assert.equal(reused.reuse, 'trr_existing');
    assert.equal(decideStripeWriteAfterReconcile({ found: false, searchComplete: true }).write, true);
});

test('612A isolated path: inactive grant never acquires; synthetic grant uses 071 then mock then 069', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-612a');
    const store = isolatedHttpStore(pg.query, IDS);
    const validated = await validateExecuteContext(store, { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(validated.ok, true);
    const inactive = await runStripeTestPath(validated, {
        grant: loadServerGrant(),
        adapter,
        stripeDispatch: createDispatch([]),
        facts: facts()
    });
    assert.equal(inactive.body.code, 'STRIPE_TEST_NOT_ACTIVATED');
    assert.equal(inactive.body.persist_used, false);
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, null);

    const dispatch = createDispatch([
        { found: false, searchComplete: true },
        { ok: true, id: 'trr_612a_full1' },
        { found: false, searchComplete: true },
        { ok: true, id: 're_612a_full1xx' }
    ]);
    const done = await runStripeTestPath(validated, {
        grant: activeGrant(),
        adapter,
        stripeDispatch: dispatch,
        facts: facts()
    });
    assert.equal(done.body.code, 'STRIPE_TEST_COMPLETE');
    assert.equal(done.body.stripe_proof, false);
    assert.equal(done.body.stripe_real, 0);
    assert.equal(pg.query('SELECT payment_status FROM payments WHERE id = $1', [IDS.PAY])[0].payment_status, 'REFUNDED');
    assert.deepEqual(dispatch.calls.filter((row) => row.kind === 'write').map((row) => row.idempotencyKey), [
        'rv_op_op-612a',
        're_op_op-612a_after_rv'
    ]);
});

test('612A lost Stripe read keeps lock and does not write', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-612a');
    const store = isolatedHttpStore(pg.query, IDS);
    const validated = await validateExecuteContext(store, { admin: ADMIN, requestId: IDS.REQ });
    const lost = await runStripeTestPath(validated, {
        grant: activeGrant(),
        adapter,
        stripeDispatch: createDispatch([{ timeout: true, incomplete: true, searchComplete: false }]),
        facts: facts()
    });
    assert.equal(lost.body.code, 'STRIPE_READ_UNCERTAIN');
    assert.equal(lost.body.retryBlind, false);
    assert.equal(lost.body.lock_kept, true);
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, 'pending_rv_' + IDS.PAY);
});

test('612A concurrent synthetic grants: one 071 holder', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-612a');
    const store = isolatedHttpStore(pg.query, IDS);
    const validated = await validateExecuteContext(store, { admin: ADMIN, requestId: IDS.REQ });
    const [a, b] = await Promise.all([
        runStripeTestPath(validated, {
            grant: activeGrant(),
            adapter,
            stripeDispatch: createDispatch([{ timeout: true, incomplete: true }]),
            facts: facts()
        }),
        adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-other', requestId: IDS.REQ })
    ]);
    const lock = pg.query('SELECT post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.ok(lock.post_transfer_operation_id === 'op-612a' || lock.post_transfer_operation_id === 'op-other');
    assert.ok(a.body.lock_kept || b.action === 'acquire' || b.code === 'EXECUTION_IN_PROGRESS');
});

test('612A second logical operation is refused by the grant', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-612a');
    const store = isolatedHttpStore(pg.query, IDS);
    const validated = await validateExecuteContext(store, { admin: ADMIN, requestId: IDS.REQ });
    const denied = await runStripeTestPath(validated, {
        grant: activeGrant(),
        adapter,
        stripeDispatch: createDispatch([]),
        facts: facts({ operationId: 'op-612a-2', requestId: IDS.REQ })
    });
    assert.equal(denied.body.code, 'OPERATION_NOT_GRANTED');
    assert.equal(denied.body.persist_used, false);
});
