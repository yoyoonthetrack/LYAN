'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const {
    postTransferFinancialExecutionEnabled
} = require('../api/stripe-policy');
const {
    createPostTransferSupabaseAdapter,
    createIsolatedSupabaseShim,
    isServerReversalId
} = require('../api/post-transfer-supabase-adapter');
const {
    executeAdminPostTransfer,
    guardAdminExecute
} = require('../api/post-transfer-admin-execute');
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
    userId: 'admin-610y',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

let pg;
let adapter;

function step(args) {
    return adapter.acquireReversalLock(args);
}

function failSql(sql) {
    try {
        pg.query.exec(sql);
        return 'no-error';
    } catch (error) {
        return String(error.message);
    }
}

function ready() {
    pg.query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id IN ('${IDS.PAY}', '${IDS.PAY2}');
        DELETE FROM post_transfer_refund_decisions WHERE payment_id IN ('${IDS.PAY}', '${IDS.PAY2}') AND request_id <> '${IDS.REQ}';
        DELETE FROM post_transfer_refund_requests WHERE payment_id = '${IDS.PAY}' AND id <> '${IDS.REQ}';
        UPDATE payments SET stripe_reversal_id = NULL WHERE id = '${IDS.PAY2}';
    `);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610y', decided_amount_cents: 4349 });
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55444';
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

test('6.10Y proposed 071 is hardened and engine stays off', () => {
    const sql = fs.readFileSync(SQL071, 'utf8');
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /search_path TO 'public', 'pg_temp'/);
    assert.match(sql, /p_server_attested/);
    assert.match(sql, /REQUEST_REQUIRED/);
    assert.match(sql, /auth\.role\(\)/);
    assert.match(sql, /REVOKE ALL/);
    assert.match(sql, /GRANT EXECUTE[\s\S]*service_role/);
    assert.equal(sql.includes('gzispjfoywklpqatjyop'), false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(isServerReversalId('trr_abc12'), true);
    assert.equal(isServerReversalId('re_abc12'), false);
    assert.equal(isServerReversalId('pending_rv_x'), false);
    assert.equal(isServerReversalId('not-stripe'), false);
});

test('6.10Y attacks 1-2 anon and authenticated cannot execute 071', (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const call = `SELECT public.post_transfer_lock_step_secure('acquire', '${IDS.PAY}', 'op-610y', NULL, NULL, '${IDS.REQ}', false);`;
    const anon = failSql(`SET ROLE anon; ${call}`);
    const auth = failSql(`SET ROLE authenticated; ${call}`);
    assert.match(anon, /FORBIDDEN|42501|permission denied/i);
    assert.match(auth, /FORBIDDEN|42501|permission denied/i);
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, null);
});

test('6.10Y attacks 3-6 unapproved, foreign payment, bad op, amount mismatch', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    resetRequest(pg.query, IDS.REQ, { status: 'OPEN', noDecision: true });
    const open = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(open.code, 'REQUEST_NOT_APPROVED');

    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610y' });
    const mismatch = await step({ paymentId: IDS.PAY2, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(mismatch.code, 'PAYMENT_MISMATCH');

    const badOp = await step({ paymentId: IDS.PAY, operationId: 'op-wrong', requestId: IDS.REQ });
    assert.equal(badOp.code, 'DECISION_REQUIRED');

    resetRequest(pg.query, IDS.REQ, { requested_cents: 4349, decided_amount_cents: 999, operation_id: 'op-610y' });
    const amount = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(amount.code, 'AMOUNT_MISMATCH');
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, null);
});

test('6.10Y attacks 7-12 reversal proof, locks, resume, double confirm', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const acquired = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(acquired.action, 'acquire');

    const noAttest = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_ok', nextStatus: 'REVERSED', attested: false
    });
    assert.equal(noAttest.code, 'CONFIRMATION_REQUIRED');
    assert.equal(noAttest.retryBlind, false);

    const invalid = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'not-a-reversal', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(invalid.code, 'CONFIRMATION_REQUIRED');

    pg.query.exec(`UPDATE payments SET stripe_reversal_id = 'trr_610y_ok' WHERE id = '${IDS.PAY2}'`);
    const foreign = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_ok', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(foreign.code, 'STRIPE_ID_FOREIGN');
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, 'pending_rv_' + IDS.PAY);

    resetPayment(pg.query, IDS.PAY, {});
    const unlocked = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_ok2', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(unlocked.code, 'UNKNOWN_OPERATION');

    resetPayment(pg.query, IDS.PAY, {
        reversal_lock: 'pending_rv_' + IDS.PAY,
        post_transfer_operation_id: 'op-foreign',
        transfer_status: 'REVERSAL_PROCESSING'
    });
    const otherWorker = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_ok3', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(otherWorker.code, 'UNKNOWN_OPERATION');
    assert.equal(pg.query('SELECT post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0].post_transfer_operation_id, 'op-foreign');

    resetPayment(pg.query, IDS.PAY, {
        reversal_lock: 'pending_rv_' + IDS.PAY,
        post_transfer_operation_id: 'op-610y',
        transfer_status: 'REVERSAL_PROCESSING'
    });
    const badResume = await adapter.resumeReversalLock({
        paymentId: IDS.PAY, operationId: 'op-other', requestId: IDS.REQ
    });
    assert.equal(badResume.code, 'DECISION_REQUIRED');

    const confirmed = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_ok4', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(confirmed.action, 'confirm');
    const twice = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_ok4', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(twice.action, 'already');
    const overwrite = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ,
        reversalId: 'trr_610y_other', nextStatus: 'REVERSED', attested: true
    });
    assert.equal(overwrite.code, 'STRIPE_ID_PRESERVED');
    assert.equal(pg.query('SELECT stripe_reversal_id FROM payments WHERE id = $1', [IDS.PAY])[0].stripe_reversal_id, 'trr_610y_ok4');
});

test('6.10Y attacks 13-20 concurrent, refunded, partial, disputed, rejected, nulls', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const [a, b] = await Promise.all([
        step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ }),
        step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ })
    ]);
    assert.ok([a.action, b.action].includes('acquire'));
    assert.equal(pg.query('SELECT post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0].post_transfer_operation_id, 'op-610y');

    ready();
    const reqRefunded = '35555555-5555-4555-8555-555555555555';
    pg.query.exec(`
        DELETE FROM post_transfer_refund_decisions WHERE request_id = '${reqRefunded}';
        DELETE FROM post_transfer_refund_requests WHERE id = '${reqRefunded}';
        INSERT INTO post_transfer_refund_requests (
            id, payment_id, milestone_id, requester_id, provider_id, requested_cents, status
        ) VALUES ('${reqRefunded}', '${IDS.PAY2}', '${IDS.MS}', '${IDS.A}', '${IDS.B}', 4349, 'ADMIN_APPROVED');
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        ) VALUES ('${reqRefunded}', '${IDS.PAY2}', 'ADMIN_APPROVED', 'op-ref', 4349);
    `);
    const refunded = await step({ paymentId: IDS.PAY2, operationId: 'op-ref', requestId: reqRefunded });
    assert.equal(refunded.code, 'PAYMENT_ALREADY_REFUNDED');

    ready();
    resetPayment(pg.query, IDS.PAY, {
        payment_status: 'PARTIALLY_REFUNDED',
        transfer_status: 'PARTIALLY_REVERSED',
        amount_refunded_cents: 2000,
        provider_net_reversed_cents: 1875
    });
    const partial = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(partial.action, 'acquire');

    ready();
    resetPayment(pg.query, IDS.PAY, { payment_status: 'DISPUTED', transfer_status: 'TRANSFERRED' });
    const disputed = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(disputed.code, 'DISPUTED');

    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { status: 'ADMIN_REJECTED', noDecision: true });
    const rejected = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(rejected.code, 'REQUEST_NOT_APPROVED');

    resetRequest(pg.query, IDS.REQ, { noDecision: true });
    const noDec = await step({ paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ });
    assert.equal(noDec.code, 'DECISION_REQUIRED');

    const jwtRole = failSql(`SELECT set_config('request.jwt.claim.role', 'authenticated', true); SELECT public.post_transfer_lock_step_secure('acquire', '${IDS.PAY}', 'op-610y', NULL, NULL, '${IDS.REQ}', false);`);
    assert.match(jwtRole, /FORBIDDEN/);

    const malformed = await step({ paymentId: IDS.PAY, operationId: '   ', requestId: IDS.REQ });
    assert.equal(malformed.code, 'OPERATION_ID_REQUIRED');
    const missingReq = await step({ paymentId: IDS.PAY, operationId: 'op-610y' });
    assert.equal(missingReq.code, 'REQUEST_REQUIRED');
    assert.equal(pg.query('SELECT reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0].reversal_lock, null);
});

test('6.10Y adapter timeout/ambiguous have no blind retry; HTTP execute ignores persist', async (t) => {
    const timeoutClient = {
        async rpc() {
            return { data: null, error: { message: 'timed out', code: 'ETIMEDOUT' } };
        }
    };
    const timeoutAdapter = createPostTransferSupabaseAdapter({
        client: timeoutClient,
        isolatedLocal: true
    });
    const timeout = await timeoutAdapter.acquireReversalLock({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ
    });
    assert.equal(timeout.code, 'RPC_TIMEOUT');
    assert.equal(timeout.retryBlind, false);
    assert.equal(timeout.createRefund, false);

    const emptyClient = { async rpc() { return { data: null, error: null }; } };
    const emptyAdapter = createPostTransferSupabaseAdapter({ client: emptyClient, isolatedLocal: true });
    const ambiguous = await emptyAdapter.acquireReversalLock({
        paymentId: IDS.PAY, operationId: 'op-610y', requestId: IDS.REQ
    });
    assert.equal(ambiguous.code, 'AMBIGUOUS_RPC');
    assert.equal(ambiguous.retryBlind, false);

    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const store = isolatedHttpStore(pg.query, IDS);
    store.persist = {
        acquireReversalLock() { throw new Error('persist invoked'); }
    };
    const jwt = guardAdminExecute({ authorized: false, status: 401 });
    assert.equal(jwt.http, 401);
    const a = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'user-a', role: 'USER', status: 'ACTIVE', permissions: [] },
        requestId: IDS.REQ
    });
    assert.equal(a.http, 403);
    const exec = await executeAdminPostTransfer(store, {
        admin: ADMIN,
        requestId: IDS.REQ,
        body: { force: true, enable_execution: true, requested_cents: 1 }
    });
    assert.equal(exec.body.code, 'EXECUTION_DISABLED');
    assert.equal(exec.body.persist_used, false);
    assert.equal(exec.body.execute, false);
});
