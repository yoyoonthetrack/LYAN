'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { postTransferFinancialExecutionEnabled } = require('../api/stripe-policy');
const { executeAdminPostTransfer } = require('../api/post-transfer-admin-execute');
const { memoryStore } = require('../api/post-transfer-refund-flow');
const {
    createPostTransferSupabaseAdapter,
    LOCK_STEP_RPC
} = require('../api/post-transfer-supabase-adapter');

const ROOT = path.join(__dirname, '..');
const INSTALL = path.join(ROOT, 'artifacts/staging-v2/phase610z/install-071.sql');
const SOURCE = path.join(ROOT, 'artifacts/staging-v2/phase610y/proposed-071.sql');
const ROLLBACK = path.join(ROOT, 'artifacts/staging-v2/phase610z/install-071-rollback.sql');
const SHAFILE = path.join(ROOT, 'artifacts/staging-v2/phase610z/install-071.sha256');
const EXPECTED = '4b276f6d78db382d7a9f816ebda403ac4dd747ee7999e060f8e01d51ca498462';

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('6.10Z install file is the 6.10Y hardened 071 and not the 5-arg initial', () => {
    const sql = fs.readFileSync(INSTALL, 'utf8');
    assert.equal(sha256(INSTALL), EXPECTED);
    assert.equal(sha256(SOURCE), EXPECTED);
    assert.equal(sha256(INSTALL), sha256(SOURCE));
    assert.match(fs.readFileSync(SHAFILE, 'utf8'), new RegExp(EXPECTED));
    assert.match(sql, /p_server_attested boolean DEFAULT false/);
    assert.match(sql, /p_request_id uuid DEFAULT NULL/);
    assert.match(sql, /GRANT EXECUTE[\s\S]*service_role/);
    assert.match(sql, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated/);
    assert.match(sql, /auth\.role\(\)/);
    assert.match(sql, /SESSION_USER IN \('authenticated', 'anon'\)/);
    assert.match(sql, /SET search_path TO 'public', 'pg_temp'/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /ADMIN_APPROVED/);
    assert.match(sql, /DISPUTED/);
    assert.match(sql, /PAYMENT_ALREADY_REFUNDED/);
    assert.match(sql, /STRIPE_ID_FOREIGN/);
    assert.match(sql, /FOR UPDATE/);
    assert.equal(sql.includes('confirm_post_transfer_refund_secure('), false);
    assert.match(fs.readFileSync(ROLLBACK, 'utf8'), /DROP FUNCTION IF EXISTS public\.post_transfer_lock_step_secure/);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(LOCK_STEP_RPC, 'post_transfer_lock_step_secure');
});

test('6.10Z p_server_attested cannot come from HTTP body or client flags', async () => {
    const calls = [];
    const adapter = createPostTransferSupabaseAdapter({
        client: {
            async rpc(name, args) {
                calls.push({ name, args });
                return { data: { ok: true, action: 'confirm' }, error: null };
            }
        },
        isolatedLocal: true
    });
    const fromBody = await adapter.confirmReversal({
        paymentId: '11111111-1111-4111-8111-111111111111',
        operationId: 'op-z',
        requestId: '31111111-1111-4111-8111-111111111111',
        reversalId: 'trr_610z_ok',
        attested: true,
        body: { attested: true, p_server_attested: true }
    });
    assert.equal(fromBody.code, 'CONFIRMATION_REQUIRED');
    assert.equal(fromBody.retryBlind, false);
    const fromHttp = await adapter.confirmReversal({
        paymentId: '11111111-1111-4111-8111-111111111111',
        operationId: 'op-z',
        requestId: '31111111-1111-4111-8111-111111111111',
        reversalId: 'trr_610z_ok',
        attested: true,
        httpRoute: true
    });
    assert.equal(fromHttp.code, 'CONFIRMATION_REQUIRED');
    const missing = await adapter.confirmReversal({
        paymentId: '11111111-1111-4111-8111-111111111111',
        operationId: 'op-z',
        requestId: '31111111-1111-4111-8111-111111111111',
        reversalId: 'trr_610z_ok',
        attested: false
    });
    assert.equal(missing.code, 'CONFIRMATION_REQUIRED');
    assert.equal(calls.length, 0);

    const store = memoryStore({
        payments: [{
            id: 'pay-z',
            milestone_id: 'ms-z',
            payment_status: 'SUCCEEDED',
            transfer_status: 'TRANSFERRED',
            stripe_payment_intent_id: 'pi_z',
            stripe_charge_id: 'ch_z',
            stripe_transfer_id: 'tr_z',
            stripe_connect_account_id: 'acct_z',
            customer_total_cents: 4349,
            customer_fee_cents: 149,
            service_amount_cents: 4200,
            provider_fee_cents: 126,
            provider_net_cents: 4074,
            amount_refunded_cents: 0,
            customer_fee_refunded_cents: 0,
            service_refunded_cents: 0,
            provider_fee_reversed_cents: 0,
            provider_net_reversed_cents: 0
        }],
        milestones: [{ id: 'ms-z', status: 'RELEASED' }]
    });
    store._requests.set('req-z', {
        id: 'req-z',
        payment_id: 'pay-z',
        status: 'ADMIN_APPROVED',
        requested_cents: 4349,
        executed_at: null
    });
    store._decisions.push({
        request_id: 'req-z',
        payment_id: 'pay-z',
        action: 'ADMIN_APPROVED',
        operation_id: 'op-z',
        decided_amount_cents: 4349
    });
    const http = await executeAdminPostTransfer(store, {
        admin: { authorized: true, userId: 'admin', role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] },
        requestId: 'req-z',
        body: { attested: true, p_server_attested: true, enable_execution: true, force: true }
    });
    assert.equal(http.body.code, 'EXECUTION_DISABLED');
    assert.equal(http.body.persist_used, false);
    assert.equal(http.body.execute, false);
});
