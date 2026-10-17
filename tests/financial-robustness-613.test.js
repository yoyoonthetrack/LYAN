'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    postTransferFinancialExecutionEnabled,
    calculateMilestonePricing,
    preparePostTransferRefundBreakdown,
    sumPaymentAdjustments,
    refundableCustomerCents,
    refundTransferExclusion,
    admitStripeWebhookEvent,
    applyPaymentSucceeded,
    applyPaymentFailed,
    applyChargeDisputeCreated,
    applyChargeDisputeClosed,
    classifyStripeDbGap,
    financialAuditEvent,
    PRODUCTION_REF
} = require('../api/stripe-policy');
const { persistGate } = require('../api/post-transfer-lock-persist');
const {
    STRIPE_TEST_GRANT,
    loadServerGrant,
    HISTORIC_PAYMENTS
} = require('../api/post-transfer-stripe-test-grant');

const QA_PAY = {
    customer_total_cents: 4349,
    service_amount_cents: 4200,
    customer_fee_cents: 149,
    provider_fee_cents: 126,
    provider_net_cents: 4074,
    amount_refunded_cents: 0,
    customer_fee_refunded_cents: 0,
    service_refunded_cents: 0,
    provider_fee_reversed_cents: 0,
    provider_net_reversed_cents: 0,
    payment_status: 'SUCCEEDED',
    transfer_status: 'TRANSFERRED'
};

test('6.13 engine and grant stay inactive', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(STRIPE_TEST_GRANT.active, false);
    assert.equal(loadServerGrant().active, false);
});

test('6.13 HTTP persist remains forbidden without grant', () => {
    assert.equal(persistGate({ httpRoute: true }).ok, false);
    assert.equal(persistGate({ httpRoute: true }).code, 'PERSIST_FORBIDDEN_ON_HTTP');
    assert.equal(persistGate({ httpRoute: true, serverStripeTestGrant: true }).ok, false);
});

test('6.13 historic payments stay excluded from new money movement', () => {
    assert.deepEqual(HISTORIC_PAYMENTS, [
        'eee5271c-6a99-410b-8031-f2987a496d26',
        '58f0aad9-9852-4e99-9a51-a3179b049e60',
        'ee5a0c1e-ed4c-471f-8beb-4a9906166c3b'
    ]);
});

test('6.13 SCT 42€ ledger is internally consistent', () => {
    const sct = calculateMilestonePricing(42);
    assert.equal(Number(sct.service_amount_cents), 4200);
    assert.equal(Number(sct.customer_fee_cents), 149);
    assert.equal(Number(sct.customer_total_cents), 4349);
    assert.equal(Number(sct.provider_fee_cents), 126);
    assert.equal(Number(sct.provider_net_cents), 4074);
    assert.equal(Number(sct.customer_fee_cents) + Number(sct.service_amount_cents), Number(sct.customer_total_cents));
    assert.equal(Number(sct.provider_fee_cents) + Number(sct.provider_net_cents), Number(sct.service_amount_cents));
});

test('6.13 two partial refunds then remainder never exceed ledger', () => {
    const first = preparePostTransferRefundBreakdown(QA_PAY, 2000);
    assert.equal(first.ok, true);
    assert.ok(first.refund_amount_cents < 4349);
    const afterFirst = {
        ...QA_PAY,
        amount_refunded_cents: first.refund_amount_cents,
        customer_fee_refunded_cents: first.breakdown.refunded_customer_fee_cents,
        service_refunded_cents: first.breakdown.refunded_service_cents,
        provider_fee_reversed_cents: first.breakdown.reversed_provider_fee_cents,
        provider_net_reversed_cents: first.breakdown.reversed_provider_net_cents
    };
    const second = preparePostTransferRefundBreakdown(afterFirst, 1500);
    assert.equal(second.ok, true);
    const afterSecond = {
        ...afterFirst,
        amount_refunded_cents: afterFirst.amount_refunded_cents + second.refund_amount_cents,
        customer_fee_refunded_cents: afterFirst.customer_fee_refunded_cents + second.breakdown.refunded_customer_fee_cents,
        service_refunded_cents: afterFirst.service_refunded_cents + second.breakdown.refunded_service_cents,
        provider_fee_reversed_cents: afterFirst.provider_fee_reversed_cents + second.breakdown.reversed_provider_fee_cents,
        provider_net_reversed_cents: afterFirst.provider_net_reversed_cents + second.breakdown.reversed_provider_net_cents
    };
    const overflow = preparePostTransferRefundBreakdown(afterSecond, 4349);
    assert.equal(overflow.ok, false);
    assert.equal(overflow.code, 'EXCEEDS_REFUNDABLE');
    const remainder = Number(refundableCustomerCents(afterSecond));
    const last = preparePostTransferRefundBreakdown(afterSecond, remainder);
    assert.equal(last.ok, true);
    assert.equal(afterSecond.amount_refunded_cents + last.refund_amount_cents, 4349);
    assert.equal(afterSecond.provider_net_reversed_cents + last.breakdown.reversed_provider_net_cents, 4074);
    const ledger = sumPaymentAdjustments([
        { refund_amount_cents: first.refund_amount_cents, adjusted_provider_net_cents: first.breakdown.reversed_provider_net_cents, stripe_refund_id: 're_p1', stripe_reversal_id: 'trr_p1' },
        { refund_amount_cents: second.refund_amount_cents, adjusted_provider_net_cents: second.breakdown.reversed_provider_net_cents, stripe_refund_id: 're_p2', stripe_reversal_id: 'trr_p2' },
        { refund_amount_cents: last.refund_amount_cents, adjusted_provider_net_cents: last.breakdown.reversed_provider_net_cents, stripe_refund_id: 're_p3', stripe_reversal_id: 'trr_p3' }
    ]);
    assert.equal(ledger.refund_amount_cents, 4349);
    assert.equal(ledger.adjusted_provider_net_cents, 4074);
});

test('6.13 refund versus transfer exclusion remains exclusive', () => {
    const transferred = refundTransferExclusion({ transfer_status: 'TRANSFERRED' }, { status: 'RELEASED' });
    assert.ok(transferred);
    assert.equal(transferred.exclusive, true);
});

test('6.13 webhooks isolate live from staging and never regress refunded payments', () => {
    assert.equal(admitStripeWebhookEvent({ livemode: true }, { SUPABASE_URL: 'https://tdktfbtqceldlaeqjtow.supabase.co' }).ok, false);
    assert.equal(admitStripeWebhookEvent({ livemode: false }, { SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` }).ok, false);
    const late = applyPaymentSucceeded({
        payment_status: 'REFUNDED',
        transfer_status: 'REVERSED',
        customer_total_cents: 4349,
        stripe_charge_id: 'ch_qa'
    }, { amount: 4349, latest_charge: 'ch_late' });
    assert.equal(late.preserve_payment, true);
    const failed = applyPaymentFailed({ payment_status: 'REFUNDED' });
    assert.equal(failed.apply, false);
    const dispute = applyChargeDisputeCreated({ payment_status: 'REFUNDED' });
    assert.equal(dispute.apply, false);
    assert.equal(applyChargeDisputeClosed({ payment_status: 'DISPUTED' }).apply, false);
});

test('6.13 reconciliation never creates Stripe objects', () => {
    const gap = classifyStripeDbGap({
        payment: {
            payment_status: 'SUCCEEDED',
            stripe_payment_intent_id: 'pi_1',
            stripe_transfer_id: 'tr_1',
            transfer_status: 'PENDING_VALIDATION',
            reversal_lock: 'rv_op_x'
        },
        listedReversals: [{ id: 'trr_real' }],
        listedRefunds: [{ id: 're_real' }]
    });
    assert.equal(gap.create, false);
    const event = financialAuditEvent('gap', { payment_id: 'p', authorization: 'Bearer secret', stripe_secret_key: 'sk_test' });
    assert.equal(event.authorization, undefined);
    assert.equal(event.stripe_secret_key, undefined);
});
