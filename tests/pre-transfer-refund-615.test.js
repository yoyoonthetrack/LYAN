'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
    const {
    preparePreTransferRefund,
    classifyPreTransferRefundBusiness,
    admitPreTransferRefundDispatch,
    preTransferRefundExecutionEnabled,
    reconcileRefundAfterFailure,
    refundReservationId,
    refundTransferExclusion,
    postTransferFinancialExecutionEnabled,
    customerFeeRefundPolicy,
    optionARefundBreakdown,
    optionARefundAmountCents
} = require('../api/stripe-policy');
const {
    PRE_TRANSFER_REFUND_GRANT,
    AUTHORIZED_615,
    FUTURE_QA_PAYMENT_ID,
    QA_REQUESTER_A,
    GRANT_STATE_PATH,
    loadPreTransferRefundGrant,
    evaluatePreTransferRefundGrant,
    STAGING_REF,
    PRODUCTION_REF,
    STRIPE_TEST_PLATFORM_ACCOUNT
} = require('../api/pre-transfer-refund-grant');
const { loadServerGrant } = require('../api/post-transfer-stripe-test-grant');

const A = QA_REQUESTER_A;
const B = 'f30466d3-fcb5-4567-a1ac-8860a563c377';
const C = '54818b8c-15a1-4c01-9fb7-1952ed262a4f';

const PAY = {
    id: FUTURE_QA_PAYMENT_ID,
    payment_status: 'SUCCEEDED',
    transfer_status: 'PENDING_VALIDATION',
    client_validated_at: null,
    stripe_transfer_id: null,
    stripe_refund_id: null,
    stripe_reversal_id: null,
    stripe_payment_intent_id: 'pi_615_qa',
    customer_total_cents: 4349,
    service_amount_cents: 4200,
    customer_fee_cents: 149
};

function prepare(overrides) {
    return preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: PAY,
        milestone: { status: 'FUNDED' },
        mission: { status: 'AGREED', requester_id: A },
        body: { milestone_id: 'm' },
        livemode: false,
        grantActive: false,
        grantEvaluation: { ok: false, write: false, code: 'GRANT_INACTIVE' },
        ...overrides
    });
}

test('6.15 execution stays disabled and grants stay off', () => {
    assert.equal(preTransferRefundExecutionEnabled(), false);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(PRE_TRANSFER_REFUND_GRANT.active, false);
    assert.equal(loadPreTransferRefundGrant().active, false);
    assert.equal(loadServerGrant().active, false);
    assert.equal(fs.existsSync(GRANT_STATE_PATH), false);
});

test('6.15 cases 1-12 refusals without Stripe', () => {
    assert.equal(prepare({ authUid: null }).http, 401);
    assert.equal(prepare({ authUid: C }).http, 403);
    assert.equal(prepare({ authUid: B }).http, 403);
    assert.equal(prepare({ payment: null }).code, 'PAYMENT_NOT_FOUND');
    assert.equal(prepare({
        payment: { ...PAY, payment_status: 'REFUNDED', stripe_refund_id: 're_done' }
    }).code, 'ALREADY_REFUNDED');
    assert.equal(prepare({
        payment: { ...PAY, transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_1' },
        milestone: { status: 'RELEASED' }
    }).code, 'ALREADY_TRANSFERRED');
    assert.equal(prepare({
        payment: { ...PAY, client_validated_at: '2026-10-14T00:00:00.000Z' }
    }).code, 'TRANSFER_IN_PROGRESS');
    assert.equal(prepare({
        payment: { ...PAY, payment_status: 'DISPUTED' },
        milestone: { status: 'DISPUTED' }
    }).code, 'DISPUTED');
    assert.equal(prepare({ milestone: { status: 'IN_PROGRESS' } }).code, 'BUSINESS_POLICY_REQUIRED');
    assert.equal(prepare({ milestone: { status: 'COMPLETED' } }).code, 'BUSINESS_POLICY_REQUIRED');
    assert.equal(prepare({ body: { amount_cents: 1 } }).code, 'CLIENT_AMOUNT_FORBIDDEN');
    assert.equal(prepare({ body: { payment_intent: 'pi_evil' } }).code, 'CLIENT_PI_FORBIDDEN');
    assert.equal(prepare({ body: { enable_execution: true } }).code, 'CLIENT_CANNOT_ENABLE_EXECUTION');
    assert.equal(prepare({ query: { force: true } }).code, 'CLIENT_CANNOT_ENABLE_EXECUTION');
    assert.equal(prepare({ headers: { 'x-enable-execution': 'true' } }).code, 'CLIENT_CANNOT_ENABLE_EXECUTION');
});

test('6.15 cases 13-17 grant isolations stay refused', () => {
    const baseFacts = {
        paymentId: FUTURE_QA_PAYMENT_ID,
        requesterId: A,
        paymentIntent: 'pi_615_qa',
        amountCents: 4349,
        supabaseProject: STAGING_REF,
        stripeAccount: STRIPE_TEST_PLATFORM_ACCOUNT,
        livemode: false,
        now: new Date('2026-10-14T22:00:00.000Z'),
        env: { STRIPE_SECRET_KEY: 'sk_test_615' }
    };
    const active = {
        ...AUTHORIZED_615,
        active: true,
        stripe_payment_intent_id: 'pi_615_qa',
        expires_at: '2099-01-01T00:00:00.000Z'
    };
    assert.equal(evaluatePreTransferRefundGrant(active, {
        ...baseFacts,
        supabaseProject: PRODUCTION_REF
    }).code, 'PRODUCTION_FORBIDDEN');
    assert.equal(evaluatePreTransferRefundGrant(active, {
        ...baseFacts,
        stripeAccount: 'acct_other'
    }).code, 'STRIPE_ACCOUNT_MISMATCH');
    assert.equal(evaluatePreTransferRefundGrant(active, {
        ...baseFacts,
        livemode: true
    }).code, 'STRIPE_LIVE_BLOCKED');
    assert.equal(evaluatePreTransferRefundGrant({
        ...active,
        expires_at: '2020-01-01T00:00:00.000Z'
    }, baseFacts).code, 'GRANT_EXPIRED');
    assert.equal(evaluatePreTransferRefundGrant(active, {
        ...baseFacts,
        paymentId: '9273e301-afaa-4421-a10a-cb47033dd225'
    }).code, 'HISTORIC_PAYMENT_FORBIDDEN');
    assert.equal(evaluatePreTransferRefundGrant(active, {
        ...baseFacts,
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    }).code, 'PAYMENT_NOT_GRANTED');
    const liveHttp = prepare({ livemode: true, grantActive: true, grantEvaluation: { ok: true, write: true } });
    assert.equal(liveHttp.code, 'LIVE_REFUND_BLOCKED');
    assert.equal(liveHttp.execute, false);
});

test('6.15 cases 18-25 concurrency, timeout, reconcile, idempotence', () => {
    const exclusion = refundTransferExclusion(PAY, { status: 'FUNDED' });
    assert.equal(exclusion.exclusive, true);
    const lock = { holder: null };
    function acquire() {
        if (lock.holder) return { ok: false, code: 'CONCURRENCY_LOCK_FAILED' };
        lock.holder = refundReservationId(PAY.id);
        return { ok: true, reservation: lock.holder };
    }
    assert.equal(acquire().ok, true);
    assert.equal(acquire().code, 'CONCURRENCY_LOCK_FAILED');
    const timeout = reconcileRefundAfterFailure({ listRetrieved: false });
    assert.equal(timeout.action, 'keep');
    assert.equal(timeout.releaseReservation, false);
    const lost = admitPreTransferRefundDispatch({
        execute: true,
        action: 'resume'
    }, { timeout: true });
    assert.equal(lost.createRefund, false);
    assert.equal(lost.lock_kept, true);
    const late = prepare({
        payment: { ...PAY, stripe_refund_id: refundReservationId(PAY.id) },
        listedRefunds: [{ id: 're_late' }]
    });
    assert.equal(late.reconcile, true);
    assert.equal(late.createRefund, false);
    const restart = prepare({
        payment: { ...PAY, stripe_refund_id: refundReservationId(PAY.id) }
    });
    assert.equal(restart.code, 'EXECUTION_DISABLED');
    assert.equal(restart.execute, false);
    const alreadyStripe = prepare({ listedRefunds: [{ id: 're_exists' }] });
    assert.equal(alreadyStripe.code, 'RECONCILE_EXISTING_REFUND');
    const first = prepare();
    const second = prepare();
    assert.equal(first.code, 'EXECUTION_DISABLED');
    assert.equal(second.code, first.code);
    assert.equal(first.idempotency_key, second.idempotency_key);
});

test('6.15 HTTP cannot activate a matching synthetic grant', () => {
    const granted = prepare({
        grantActive: true,
        grantEvaluation: { ok: true, write: true, code: 'GRANT_MATCH' },
        body: { enable_execution: true }
    });
    assert.equal(granted.execute, false);
    assert.equal(granted.code, 'CLIENT_CANNOT_ENABLE_EXECUTION');
    const matching = prepare({
        grantActive: true,
        grantEvaluation: { ok: true, write: true, code: 'GRANT_MATCH' }
    });
    assert.equal(matching.execute, true);
    assert.equal(matching.createRefund, true);
    const inactiveServer = loadPreTransferRefundGrant();
    assert.equal(inactiveServer.active, false);
    const fromServer = prepare({
        grantActive: inactiveServer.active,
        grantEvaluation: evaluatePreTransferRefundGrant(inactiveServer, {
            paymentId: PAY.id,
            requesterId: A,
            amountCents: 4349,
            supabaseProject: STAGING_REF,
            stripeAccount: STRIPE_TEST_PLATFORM_ACCOUNT
        })
    });
    assert.equal(fromServer.execute, false);
    assert.equal(fromServer.code, 'EXECUTION_DISABLED');
});

test('6.15 business classification does not invent auto-refund for started work', () => {
    assert.equal(classifyPreTransferRefundBusiness({
        payment: PAY,
        milestone: { status: 'FUNDED' },
        mission: { status: 'AGREED' }
    }).decision, 'AUTO_ELIGIBLE');
    assert.equal(classifyPreTransferRefundBusiness({
        payment: PAY,
        milestone: { status: 'IN_PROGRESS' },
        mission: { status: 'IN_PROGRESS' }
    }).decision, 'NEEDS_PROVIDER_OR_ADMIN');
    assert.equal(classifyPreTransferRefundBusiness({
        payment: PAY,
        milestone: { status: 'IN_PROGRESS' },
        mission: { status: 'IN_PROGRESS' },
        providerConsented: true
    }).decision, 'AUTO_ELIGIBLE');
    const testAutoBlocked = prepare({
        env: { STRIPE_TEST_AUTO_REFUND: 'true' },
        livemode: false
    });
    assert.equal(testAutoBlocked.execute, false);
    assert.equal(testAutoBlocked.code, 'FEE_POLICY_UNDECIDED');
    const testAutoReady = prepare({
        env: { STRIPE_TEST_AUTO_REFUND: 'true', LYANN_CUSTOMER_FEE_REFUND: 'refund' },
        livemode: false
    });
    assert.equal(testAutoReady.execute, true);
    assert.equal(testAutoReady.code, 'READY');
    assert.equal(testAutoReady.amount_cents, 4349);
    const testAutoRetain = prepare({
        env: { STRIPE_TEST_AUTO_REFUND: 'true', LYANN_CUSTOMER_FEE_REFUND: 'retain' },
        livemode: false
    });
    assert.equal(testAutoRetain.amount_cents, 4200);
    assert.equal(testAutoRetain.fee_policy, 'FEE_RETAINED');
    assert.equal(classifyPreTransferRefundBusiness({
        payment: PAY,
        milestone: { status: 'COMPLETED' },
        mission: { status: 'IN_PROGRESS' }
    }).decision, 'NEEDS_ADMIN');
    assert.equal(classifyPreTransferRefundBusiness({
        payment: PAY,
        milestone: { status: 'FUNDED' },
        mission: { status: 'CANCELLED' }
    }).code, 'BUSINESS_POLICY_REQUIRED');
});
