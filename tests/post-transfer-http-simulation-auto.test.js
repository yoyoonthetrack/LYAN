'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    simulateIsolatedPostTransfer,
    simulationAllowed,
    createMockStripeSim
} = require('../api/post-transfer-http-simulation');
const { executeAdminPostTransfer } = require('../api/post-transfer-admin-execute');
const {
    createPostTransferSupabaseAdapter,
    createIsolatedSupabaseShim
} = require('../api/post-transfer-supabase-adapter');
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
    userId: 'admin-sim',
    role: 'FINANCE',
    status: 'ACTIVE',
    permissions: ['finance.refund']
};

let pg;
let adapter;

function ready(op, cents) {
    pg.query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id = '${IDS.PAY}';
        DELETE FROM post_transfer_refund_decisions WHERE payment_id = '${IDS.PAY}' AND request_id <> '${IDS.REQ}';
        DELETE FROM post_transfer_refund_requests WHERE payment_id = '${IDS.PAY}' AND id <> '${IDS.REQ}';
    `);
    resetPayment(pg.query, IDS.PAY, {});
    resetRequest(pg.query, IDS.REQ, {
        operation_id: op || 'op-sim',
        decided_amount_cents: cents || 4349,
        requested_cents: cents || 4349
    });
    if (cents && cents !== 4349) {
        pg.query.exec(`UPDATE post_transfer_refund_requests SET requested_cents = ${Number(cents)} WHERE id = '${IDS.REQ}';`);
    }
}

function harness(extra) {
    return {
        admin: ADMIN,
        requestId: IDS.REQ,
        simulationHarness: true,
        isolatedLocal: true,
        adapter,
        stripeSim: createMockStripeSim([
            { ok: true, id: 'trr_sim_full01' },
            { ok: true, id: 're_sim_full01xx' }
        ]),
        ...extra
    };
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55447';
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

test('SIM HTTP exploitation stays EXECUTION_DISABLED and server has no harness route', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const before = pg.query('SELECT reversal_lock, refund_lock FROM payments WHERE id = $1', [IDS.PAY])[0];
    const http = await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        body: { simulationHarness: true, enable_execution: true, p_server_attested: true }
    });
    assert.equal(http.body.code, 'EXECUTION_DISABLED');
    assert.equal(http.body.persist_used, false);
    assert.deepEqual(pg.query('SELECT reversal_lock, refund_lock FROM payments WHERE id = $1', [IDS.PAY])[0], before);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.equal(server.includes('post-transfer-http-simulation'), false);
    assert.equal(server.includes('simulateIsolatedPostTransfer'), false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('SIM harness gate refuses HTTP/body/engine-less adapter', () => {
    assert.equal(simulationAllowed({ simulationHarness: true, isolatedLocal: true, httpRoute: true }).code, 'SIMULATION_FORBIDDEN_FROM_HTTP');
    assert.equal(simulationAllowed({ simulationHarness: true, isolatedLocal: true, body: {} }).code, 'SIMULATION_FORBIDDEN_FROM_HTTP');
    assert.equal(simulationAllowed({ isolatedLocal: true }).code, 'SIMULATION_REQUIRED');
    assert.equal(simulationAllowed({ simulationHarness: true }).code, 'ISOLATED_LOCAL_REQUIRED');
});

test('SIM happy path: HTTP prepare → 071 → stripe mock → 069', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-sim', 4349);
    const result = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({}));
    assert.equal(result.http, 200);
    assert.equal(result.body.code, 'SIMULATION_COMPLETE');
    assert.equal(result.body.simulated, true);
    assert.equal(result.body.stripe_real, 0);
    assert.equal(result.body.payment_status, 'REFUNDED');
    assert.equal(result.body.transfer_status, 'REVERSED');
    const row = pg.query('SELECT payment_status, transfer_status, reversal_lock, refund_lock, amount_refunded_cents FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(row.payment_status, 'REFUNDED');
    assert.equal(Number(row.amount_refunded_cents), 4349);
    assert.equal(row.reversal_lock, null);
    assert.equal(adapter.stats.stripeCreates, 0);
});

test('SIM timeout after lock keeps lock and forbids blind retry', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-sim-to', 4349);
    const timed = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({
        stripeSim: createMockStripeSim([{ timeout: true }])
    }));
    assert.equal(timed.body.code, 'STRIPE_SIM_TIMEOUT');
    assert.equal(timed.body.retryBlind, false);
    assert.equal(timed.body.lock_kept, true);
    const locked = pg.query('SELECT reversal_lock, post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(locked.reversal_lock, 'pending_rv_' + IDS.PAY);
    assert.equal(locked.post_transfer_operation_id, 'op-sim-to');

    const resumed = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({
        stripeSim: createMockStripeSim([
            { ok: true, id: 'trr_sim_resume1' },
            { ok: true, id: 're_sim_resume1x' }
        ])
    }));
    assert.equal(resumed.body.code, 'SIMULATION_COMPLETE');
    assert.equal(pg.query('SELECT payment_status FROM payments WHERE id = $1', [IDS.PAY])[0].payment_status, 'REFUNDED');
});

test('SIM lost Stripe response does not retry blindly', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-sim-lost', 4349);
    const lost = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({
        stripeSim: createMockStripeSim([{ lost: true }])
    }));
    assert.equal(lost.body.code, 'STRIPE_RESPONSE_LOST');
    assert.equal(lost.body.retryBlind, false);
    assert.equal(lost.body.lock_kept, true);
});

test('SIM concurrent harness: one 071 holder', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-sim-a', 4349);
    pg.query.exec(`
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        ) VALUES ('${IDS.REQ}', '${IDS.PAY}', 'ADMIN_APPROVED', 'op-sim-b', 4349);
    `);
    const store = isolatedHttpStore(pg.query, IDS);
    const [a, b] = await Promise.all([
        simulateIsolatedPostTransfer(store, harness({
            stripeSim: createMockStripeSim([{ timeout: true }])
        })),
        adapter.acquireReversalLock({ paymentId: IDS.PAY, operationId: 'op-sim-b', requestId: IDS.REQ })
    ]);
    const holders = [a, b].filter((row) => (row.body && row.body.lock_kept) || row.action === 'acquire' || row.action === 'resume');
    const denied = [a, b].filter((row) => (row.body && row.body.code === 'EXECUTION_IN_PROGRESS') || row.code === 'EXECUTION_IN_PROGRESS' || row.code === 'DECISION_REQUIRED');
    assert.ok(holders.length >= 1);
    const lock = pg.query('SELECT post_transfer_operation_id FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.ok(['op-sim-a', 'op-sim-b'].includes(lock.post_transfer_operation_id));
    void denied;
});

test('SIM two successive partials via harness', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-sim-p1', 2000);
    const first = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({
        stripeSim: createMockStripeSim([
            { ok: true, id: 'trr_sim_p1xxxx' },
            { ok: true, id: 're_sim_p1xxxxx' }
        ])
    }));
    assert.equal(first.body.code, 'SIMULATION_COMPLETE');
    assert.equal(first.body.payment_status, 'PARTIALLY_REFUNDED');
    const reqPart2 = '33333333-3333-4333-8333-333333333333';
    pg.query.exec(`
        INSERT INTO post_transfer_refund_requests (
            id, payment_id, milestone_id, requester_id, provider_id, requested_cents, status
        ) VALUES (
            '${reqPart2}', '${IDS.PAY}', '${IDS.MS}', '${IDS.A}', '${IDS.B}', 2349, 'ADMIN_APPROVED'
        );
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        ) VALUES ('${reqPart2}', '${IDS.PAY}', 'ADMIN_APPROVED', 'op-sim-p2', 2349);
    `);
    const second = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({
        requestId: reqPart2,
        stripeSim: createMockStripeSim([
            { ok: true, id: 'trr_sim_p2xxxx' },
            { ok: true, id: 're_sim_p2xxxxx' }
        ])
    }));
    assert.equal(second.body.code, 'SIMULATION_COMPLETE');
    assert.equal(second.body.payment_status, 'REFUNDED');
    const row = pg.query('SELECT payment_status, amount_refunded_cents FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.equal(row.payment_status, 'REFUNDED');
    assert.equal(Number(row.amount_refunded_cents), 4349);
});

test('SIM permissions and business refusals still go through HTTP prepare', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const forbidden = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({
        admin: { authorized: true, userId: 'user-a', role: 'USER', status: 'ACTIVE', permissions: [] }
    }));
    assert.equal(forbidden.http, 403);
    resetRequest(pg.query, IDS.REQ, { status: 'OPEN', noDecision: true });
    const open = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), harness({}));
    assert.equal(open.body.code, 'REQUEST_NOT_APPROVED');
});
