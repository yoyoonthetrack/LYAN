'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    orchestratePostTransferRefund,
    executeAdminPostTransfer,
    resolvePostTransferExecutionMode,
    buildServerAttestation,
    MODES,
    STRIPE_TEST_ACTIVATION
} = require('../api/post-transfer-orchestrator');
const {
    simulateIsolatedPostTransfer,
    createMockStripeSim
} = require('../api/post-transfer-http-simulation');
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
    userId: 'admin-orch',
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
        operation_id: op || 'op-orch',
        decided_amount_cents: cents || 4349,
        requested_cents: cents || 4349
    });
    if (cents && cents !== 4349) {
        pg.query.exec(`UPDATE post_transfer_refund_requests SET requested_cents = ${Number(cents)} WHERE id = '${IDS.REQ}';`);
    }
}

before(async () => {
    if (!process.env.LYANN_610W_PG_PORT) process.env.LYANN_610W_START_PORT = '55448';
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

test('ORCH HTTP and simulation share the same orchestrator function', () => {
    assert.equal(executeAdminPostTransfer.orchestrate, orchestratePostTransferRefund);
    assert.equal(simulateIsolatedPostTransfer.orchestrate, orchestratePostTransferRefund);
    assert.equal(STRIPE_TEST_ACTIVATION.allowed, false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.match(server, /httpRoute: true/);
    assert.equal(server.includes('trustedConfig'), false);
    assert.equal(server.includes('simulateIsolatedPostTransfer'), false);
});

test('ORCH mode cannot be chosen from HTTP inputs', () => {
    assert.equal(resolvePostTransferExecutionMode({ mode: 'STRIPE_TEST' }, { httpRoute: true }).mode, MODES.DISABLED);
    assert.equal(resolvePostTransferExecutionMode({ mode: 'SIMULATED', isolatedLocal: true, simulationHarness: true }, { body: { mode: 'STRIPE_TEST' } }).mode, MODES.DISABLED);
    assert.equal(resolvePostTransferExecutionMode({ mode: 'STRIPE_TEST' }, {}).reason, 'STRIPE_TEST_NOT_ACTIVATED');
    assert.equal(resolvePostTransferExecutionMode({ mode: 'SIMULATED', isolatedLocal: true, simulationHarness: true, adapter: {}, stripeDispatch: {} }, {}).mode, MODES.SIMULATED);
    const liveAttest = buildServerAttestation(MODES.SIMULATED, { ok: true, livemode: false, id: 'trr_x' });
    assert.equal(liveAttest.attested, true);
    assert.equal(liveAttest.stripe_proof, false);
    assert.equal(liveAttest.attestation_kind, 'SIMULATED_SERVER');
});

test('ORCH DISABLED mutates nothing even with force body and STRIPE_TEST trusted leak', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready();
    const before = pg.query('SELECT reversal_lock, refund_lock, payment_status FROM payments WHERE id = $1', [IDS.PAY])[0];
    const http = await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        httpRoute: true,
        body: { mode: 'STRIPE_TEST', enable_execution: true, force: true, p_server_attested: true },
        trustedConfig: { mode: 'STRIPE_TEST', allowStripeTest: true }
    });
    assert.equal(http.body.code, 'EXECUTION_DISABLED');
    assert.equal(http.body.persist_used, false);
    assert.deepEqual(pg.query('SELECT reversal_lock, refund_lock, payment_status FROM payments WHERE id = $1', [IDS.PAY])[0], before);
});

test('ORCH SIMULATED happy path and Live refusal', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-orch', 4349);
    const ok = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        simulationHarness: true,
        isolatedLocal: true,
        adapter,
        stripeSim: createMockStripeSim([
            { ok: true, id: 'trr_orch_full1' },
            { ok: true, id: 're_orch_full1x' }
        ])
    });
    assert.equal(ok.body.code, 'SIMULATION_COMPLETE');
    assert.equal(ok.body.mode, 'SIMULATED');
    assert.equal(ok.body.stripe_proof, false);
    assert.equal(ok.body.attestation_kind, 'SIMULATED_SERVER');
    ready('op-orch-live', 4349);
    const live = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        simulationHarness: true,
        isolatedLocal: true,
        adapter,
        stripeSim: createMockStripeSim([{ livemode: true }])
    });
    assert.equal(live.body.code, 'STRIPE_LIVE_BLOCKED');
    assert.equal(live.body.lock_kept, true);
});

test('ORCH 069 failure keeps lock; resume after fix', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-orch-069', 4349);
    const failing = {
        acquireReversalLock: (...args) => adapter.acquireReversalLock(...args),
        confirmReversal: (...args) => adapter.confirmReversal(...args),
        async finalizeRefund() {
            return { action: 'reject', code: 'MARK_EXECUTED_FAILED', lock_kept: true };
        }
    };
    const fail = await orchestratePostTransferRefund(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        httpRoute: false,
        trustedConfig: {
            mode: 'SIMULATED',
            isolatedLocal: true,
            simulationHarness: true,
            adapter: failing,
            stripeDispatch: createMockStripeSim([
                { ok: true, id: 'trr_orch_069xx' },
                { ok: true, id: 're_orch_069xxx' }
            ])
        }
    });
    assert.equal(fail.body.code, 'MARK_EXECUTED_FAILED');
    assert.equal(fail.body.lock_kept, true);
    const lock = pg.query('SELECT refund_lock, reversal_lock FROM payments WHERE id = $1', [IDS.PAY])[0];
    assert.ok(lock.refund_lock || lock.reversal_lock);
    const resume = await simulateIsolatedPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        simulationHarness: true,
        isolatedLocal: true,
        adapter,
        stripeSim: createMockStripeSim([
            { ok: true, id: 're_orch_069res' }
        ])
    });
    assert.equal(resume.body.code, 'SIMULATION_COMPLETE');
    assert.equal(pg.query('SELECT payment_status FROM payments WHERE id = $1', [IDS.PAY])[0].payment_status, 'REFUNDED');
});

test('ORCH disputed/refunded/force stay refused', async (t) => {
    if (!pg) { t.skip('ENVIRONMENT local postgres absent'); return; }
    ready('op-orch-disp', 4349);
    pg.query.exec(`UPDATE payments SET payment_status = 'DISPUTED' WHERE id = '${IDS.PAY}';`);
    assert.equal((await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN, requestId: IDS.REQ
    })).body.code, 'DISPUTED');
    ready('op-orch-ref', 4349);
    pg.query.exec(`UPDATE payments SET payment_status = 'REFUNDED' WHERE id = '${IDS.PAY}';`);
    assert.equal((await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN, requestId: IDS.REQ
    })).body.code, 'PAYMENT_ALREADY_REFUNDED');
    ready();
    const forced = await executeAdminPostTransfer(isolatedHttpStore(pg.query, IDS), {
        admin: ADMIN,
        requestId: IDS.REQ,
        body: { enable_execution: true, force: true, mode: 'STRIPE_TEST' }
    });
    assert.equal(forced.body.code, 'EXECUTION_DISABLED');
    assert.equal(forced.body.persist_used, false);
});
