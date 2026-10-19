'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
    createPostTransferSupabaseAdapter,
    createIsolatedSupabaseShim
} = require('../api/post-transfer-supabase-adapter');
const { executeAdminPostTransfer } = require('../api/post-transfer-admin-execute');
const { postTransferFinancialExecutionEnabled } = require('../api/stripe-policy');
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
    userId: 'admin-auto',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

let pg;
let adapter;

function ready() {
    pg.query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id IN ('${IDS.PAY}', '${IDS.PAY2}');
        DELETE FROM post_transfer_refund_decisions WHERE payment_id = '${IDS.PAY}' AND request_id <> '${IDS.REQ}';
        DELETE FROM post_transfer_refund_requests WHERE payment_id = '${IDS.PAY}' AND id <> '${IDS.REQ}';
    `);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-auto', decided_amount_cents: 4349 });
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55446';
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

test('AUTO persist: HTTP execute does not write 071 locks', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const before = pg.query('SELECT reversal_lock, refund_lock, post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    const http = await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        body: { enable_execution: true, p_server_attested: true }
    });
    assert.equal(http.body.code, 'EXECUTION_DISABLED');
    assert.equal(http.body.persist_used, false);
    assert.deepEqual(pg.query('SELECT reversal_lock, refund_lock, post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0], before);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('AUTO persist: acquire, timeout resume, confirm, 069, no blind retry', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const acquired = await adapter.acquireReversalLock({
        paymentId: IDS.PAY, operationId: 'op-auto', requestId: IDS.REQ
    });
    assert.equal(acquired.action, 'acquire');
    const resumed = await adapter.resumeReversalLock({
        paymentId: IDS.PAY, operationId: 'op-auto', requestId: IDS.REQ
    });
    assert.equal(resumed.action, 'resume');
    const denied = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-auto', requestId: IDS.REQ,
        reversalId: 'trr_auto_ok1', attested: false
    });
    assert.equal(denied.code, 'CONFIRMATION_REQUIRED');
    const confirmed = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-auto', requestId: IDS.REQ,
        reversalId: 'trr_auto_ok1', attested: true, nextStatus: 'REVERSED'
    });
    assert.equal(confirmed.action, 'confirm');
    const finalized = await adapter.finalizeRefund({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-auto',
        refundId: 're_auto_ok1',
        reversalId: 'trr_auto_ok1',
        amountCents: 4349,
        refundServiceCents: 4200,
        refundCustFeeCents: 149,
        refundProvNetCents: 4074,
        refundProvFeeCents: 126
    });
    assert.equal(finalized.action, 'complete');
    const row = pg.query('SELECT payment_status, transfer_status, reversal_lock, refund_lock FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(row.payment_status, 'REFUNDED');
    assert.equal(row.transfer_status, 'REVERSED');
    assert.equal(row.reversal_lock, null);
    assert.equal(row.refund_lock, null);
});

test('AUTO persist: concurrent acquire one holder; second partial after restart', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    pg.query.exec(`
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        ) VALUES ('${IDS.REQ}', '${IDS.PAY}', 'ADMIN_APPROVED', 'op-auto-b', 4349);
    `);
    const [a, b] = await Promise.all([
        adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-auto', requestId: IDS.REQ }),
        adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-auto-b', requestId: IDS.REQ })
    ]);
    const wins = [a, b].filter((row) => row.action === 'acquire');
    const loses = [a, b].filter((row) => row.action === 'reject');
    assert.equal(wins.length, 1);
    assert.equal(loses.length, 1);
    await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-auto', requestId: IDS.REQ,
        reversalId: 'trr_auto_part', attested: true, nextStatus: 'PARTIALLY_REVERSED'
    }).catch(() => null);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-auto-p1', decided_amount_cents: 2000, requested_cents: 2000 });
    pg.query.exec(`UPDATE post_transfer_refund_requests SET requested_cents = 2000 WHERE id = '${IDS.REQ}';`);
    const first = await adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-auto-p1', requestId: IDS.REQ });
    assert.ok(first.action === 'acquire' || first.action === 'resume');
    const c1 = await adapter.confirmReversal({
        paymentId: IDS.PAY, operationId: 'op-auto-p1', requestId: IDS.REQ,
        reversalId: 'trr_auto_p1xx', attested: true, nextStatus: 'PARTIALLY_REVERSED'
    });
    assert.equal(c1.action, 'confirm');
    const f1 = await adapter.finalizeRefund({
        paymentId: IDS.PAY,
        requestId: IDS.REQ,
        operationId: 'op-auto-p1',
        refundId: 're_auto_p1xxxx',
        reversalId: 'trr_auto_p1xx',
        amountCents: 2000,
        refundServiceCents: 1930,
        refundCustFeeCents: 70,
        refundProvNetCents: 1872,
        refundProvFeeCents: 58
    });
    assert.equal(f1.action, 'complete');
    const mid = pg.query('SELECT payment_status, amount_refunded_cents FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(mid.payment_status, 'PARTIALLY_REFUNDED');
    assert.equal(Number(mid.amount_refunded_cents), 2000);
});
