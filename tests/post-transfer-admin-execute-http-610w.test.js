'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    postTransferFinancialExecutionEnabled
} = require('../api/stripe-policy');
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

const ADMIN = {
    authorized: true,
    userId: 'admin-610w',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

let pg;

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55442';
    pg = await startIsolatedPg610w();
});

after(() => {
    if (pg && pg.stop) pg.stop();
});

function store() {
    return isolatedHttpStore(pg.query, IDS);
}

function locks() {
    return pg.query('SELECT reversal_lock, refund_lock, post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
}

test('6.10W HTTP isolated fixture: ADMIN_APPROVED unexecuted → EXECUTION_DISABLED, no persist', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610w' });
    const before = locks();
    const result = await executeAdminPostTransfer(store(), { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(result.http, 409);
    assert.equal(result.body.code, 'EXECUTION_DISABLED');
    assert.equal(result.body.execute, false);
    assert.equal(result.body.createReversal, false);
    assert.equal(result.body.createRefund, false);
    assert.equal(result.body.invoked, false);
    assert.equal(result.body.engine, false);
    assert.equal(result.body.persist_used, false);
    assert.equal(result.body.lock_persisted, false);
    assert.equal(result.body.operation_id, 'op-610w');
    assert.deepEqual(locks(), before);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('6.10W HTTP isolated fixture: decision, amount and Stripe parents', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { status: 'OPEN', noDecision: true });
    const open = await executeAdminPostTransfer(store(), { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(open.body.code, 'REQUEST_NOT_APPROVED');

    resetRequest(pg.query, IDS.REQ, { noDecision: true });
    const missing = await executeAdminPostTransfer(store(), { admin: ADMIN, requestId: IDS.REQ });
    assert.equal(missing.body.code, 'DECISION_REQUIRED');

    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610w' });
    const amount = await executeAdminPostTransfer(store(), {
        admin: ADMIN,
        requestId: IDS.REQ,
        requestedCents: 999
    });
    assert.equal(amount.http, 400);
    assert.equal(amount.body.code, 'AMOUNT_MISMATCH');

    const pi = await executeAdminPostTransfer(store(), {
        admin: ADMIN,
        requestId: IDS.REQ,
        expected: { payment_intent: 'pi_other' }
    });
    assert.equal(pi.body.code, 'PAYMENT_INTENT_MISMATCH');
    const charge = await executeAdminPostTransfer(store(), {
        admin: ADMIN,
        requestId: IDS.REQ,
        expected: { charge: 'ch_other' }
    });
    assert.equal(charge.body.code, 'CHARGE_MISMATCH');
    const transfer = await executeAdminPostTransfer(store(), {
        admin: ADMIN,
        requestId: IDS.REQ,
        expected: { transfer: 'tr_other' }
    });
    assert.equal(transfer.body.code, 'TRANSFER_MISMATCH');
    const connect = await executeAdminPostTransfer(store(), {
        admin: ADMIN,
        requestId: IDS.REQ,
        expected: { connectAccount: 'acct_other' }
    });
    assert.equal(connect.body.code, 'CONNECT_ACCOUNT_MISMATCH');
    assert.equal(locks().reversal_lock, null);
    assert.equal(locks().post_transfer_operation_id, null);
});

test('6.10W HTTP isolated fixture: JWT, missing finance.refund, concurrent, force flags', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, { operation_id: 'op-610w' });
    const jwt = guardAdminExecute({ authorized: false, status: 401, error: 'Jeton invalide' });
    assert.equal(jwt.http, 401);
    assert.equal(jwt.body.execute, false);

    const forbidden = await executeAdminPostTransfer(store(), {
        admin: { authorized: true, userId: 'user-a', role: 'USER', status: 'ACTIVE', permissions: [] },
        requestId: IDS.REQ
    });
    assert.equal(forbidden.http, 403);

    const httpStore = store();
    const [a, b] = await Promise.all([
        executeAdminPostTransfer(httpStore, { admin: ADMIN, requestId: IDS.REQ }),
        executeAdminPostTransfer(httpStore, { admin: ADMIN, requestId: IDS.REQ })
    ]);
    assert.equal(a.body.code, 'EXECUTION_DISABLED');
    assert.equal(b.body.code, 'EXECUTION_DISABLED');
    assert.equal(a.body.persist_used, false);
    assert.equal(b.body.lock_persisted, false);

    const forced = await executeAdminPostTransfer(store(), {
        admin: ADMIN,
        requestId: IDS.REQ,
        body: { enable_execution: true, force: true }
    });
    assert.equal(forced.body.code, 'EXECUTION_DISABLED');
    assert.equal(forced.body.execute, false);
    assert.equal(forced.body.createReversal, false);
    assert.equal(locks().reversal_lock, null);
    assert.equal(pg.query('SELECT count(*)::int AS n FROM payment_adjustments', [])[0].n, 0);
});
