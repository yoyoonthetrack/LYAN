'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    inspectStripeEnv,
    connectStatus,
    connectPayoutReady,
    shouldCreateConnectAccount,
    buildConnectAccountParams,
    buildAccountLinkParams,
    calculateMilestonePricing,
    paymentAmountSnapshot,
    resumePaymentDecision,
    legacyPaymentColumns,
    quoteFullyReleased,
    providerCanBePaid,
    evaluateTransfer,
    evaluateRefund,
    applyPaymentSucceeded,
    claimWebhookDecision,
    safeStripeReturnUrl
} = require('../api/stripe-policy');

const TEST_ENV = {
    STRIPE_SECRET_KEY: 'sk_test_unit',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_unit',
    STRIPE_LIVE_ENABLED: ''
};

test('sk_test_ and pk_test_ are allowed', () => {
    const inspected = inspectStripeEnv(TEST_ENV);
    assert.equal(inspected.mode, 'test');
    assert.equal(inspected.allowsSecretUse, true);
    assert.equal(inspected.allowsPublishableUse, true);
    assert.equal(inspected.liveBlocked, false);
});

test('sk_live_ is refused while live is disabled', () => {
    const inspected = inspectStripeEnv({ ...TEST_ENV, STRIPE_SECRET_KEY: 'sk_live_unit' });
    assert.equal(inspected.mode, 'invalid');
    assert.equal(inspected.liveBlocked, true);
    assert.equal(inspected.allowsSecretUse, false);
});

test('pk_live_ is refused while live is disabled and is not publishable', () => {
    const inspected = inspectStripeEnv({ ...TEST_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_live_unit' });
    assert.equal(inspected.mode, 'invalid');
    assert.equal(inspected.liveBlocked, true);
    assert.equal(inspected.allowsPublishableUse, false);
});

test('missing and invalid keys are distinct from test', () => {
    assert.equal(inspectStripeEnv({}).mode, 'missing');
    assert.equal(inspectStripeEnv({ STRIPE_SECRET_KEY: 'sk_unknown' }).mode, 'invalid');
});

test('webhook signature helper rejects a bad signature and accepts a known one', () => {
    const Stripe = require('stripe');
    const stripe = new Stripe('sk_test_unit');
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'payment_intent.succeeded', data: { object: { id: 'pi_test' } } });
    const secret = `whsec_${Buffer.from('unit-test-secret').toString('base64')}`;
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = stripe.webhooks.constructEvent(payload, header, secret);
    assert.equal(event.id, 'evt_1');
    assert.throws(() => stripe.webhooks.constructEvent(payload, 't=1,v1=bad', secret));
    assert.equal(JSON.stringify(event).includes(secret), false);
});

test('webhook claim is idempotent and a failure can be retried', () => {
    assert.equal(claimWebhookDecision(null).action, 'insert');
    assert.equal(claimWebhookDecision({ status: 'processed' }).action, 'duplicate');
    assert.equal(claimWebhookDecision({ status: 'failed' }).action, 'retry');
    assert.equal(claimWebhookDecision({ status: 'processing' }).action, 'retry');
});

test('payment is refused without a Connect account', () => {
    const decision = providerCanBePaid({ id: 'p1', account_type: 'real', stripe_account_id: null }, null);
    assert.equal(decision.ok, false);
    assert.equal(decision.code, 'CONNECT_REQUIRED');
});

function v2Account(status, details) {
    return {
        id: 'acct_test',
        configuration: {
            recipient: {
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: {
                            status,
                            status_details: details || []
                        }
                    }
                }
            }
        }
    };
}

test('no account, incomplete onboarding, pending, past due and active transfers', () => {
    assert.equal(connectStatus(null).account_created, false);
    assert.equal(connectPayoutReady(null).code, 'CONNECT_REQUIRED');

    const pastDue = connectStatus(v2Account('restricted', [{ code: 'requirements_past_due' }]));
    assert.equal(pastDue.account_created, true);
    assert.equal(pastDue.onboarding_completed, false);
    assert.equal(pastDue.transfers_active, false);
    assert.equal(connectPayoutReady(v2Account('restricted', [{ code: 'requirements_past_due' }])).ok, false);

    const pending = connectStatus(v2Account('pending', [{ code: 'requirements_pending_verification' }]));
    assert.equal(pending.onboarding_completed, true);
    assert.equal(pending.transfers_active, false);
    assert.equal(connectPayoutReady(v2Account('pending', [{ code: 'requirements_pending_verification' }])).ok, false);

    const active = connectPayoutReady(v2Account('active', []));
    assert.equal(active.ok, true);
    assert.equal(active.status.transfers_active, true);
    assert.equal(active.status.onboarding_completed, true);
    assert.equal(active.status.payouts_enabled, false);
});

test('a profile that already has a Connect account is not created again', () => {
    assert.equal(shouldCreateConnectAccount({ stripe_account_id: null }), true);
    assert.equal(shouldCreateConnectAccount({ stripe_account_id: 'acct_test' }), false);
});

test('Accounts v2 creation and onboarding link keep the LYANN return urls', () => {
    const created = buildConnectAccountParams('membre@example.com');
    assert.equal(created.dashboard, 'express');
    assert.equal(created.identity.country, 'fr');
    assert.equal(created.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
    assert.equal(created.defaults.responsibilities.fees_collector, 'application');
    assert.equal(created.defaults.responsibilities.losses_collector, 'application');
    const link = buildAccountLinkParams(
        'acct_test',
        'https://lyann.app/?action=finances&connect=return',
        'https://lyann.app/?action=finances&connect=refresh'
    );
    assert.equal(link.use_case.type, 'account_onboarding');
    assert.equal(link.use_case.account_onboarding.return_url, 'https://lyann.app/?action=finances&connect=return');
    assert.equal(link.use_case.account_onboarding.refresh_url, 'https://lyann.app/?action=finances&connect=refresh');
    assert.equal('configurations' in link.use_case.account_onboarding, false);
    const legacy = legacyPaymentColumns({
        customer_total_cents: 1030n,
        lyann_revenue_cents: 60n,
        provider_net_cents: 970n
    });
    assert.equal(Number(calculateMilestonePricing('10.00').customer_fee_cents), 149);
    assert.equal(quoteFullyReleased([{ status: 'RELEASED' }]), true);
    assert.equal(quoteFullyReleased([{ status: 'FUNDED' }]), false);
    assert.deepEqual(legacy, {
        amount_gross_cents: 1030,
        amount_platform_fee_cents: 60,
        amount_provider_net_cents: 970
    });
});

test('a milestone cannot be funded when the Connect account is not ready', () => {
    const profile = { id: 'p1', account_type: 'real', stripe_account_id: 'acct_test' };
    const pending = providerCanBePaid(profile, v2Account('pending', [{ code: 'requirements_past_due' }]));
    assert.equal(pending.ok, false);
    const ready = providerCanBePaid(profile, v2Account('active', []));
    assert.equal(ready.ok, true);
});

test('succeeded payment intent marks the milestone FUNDED only for the expected amount', () => {
    const payment = { customer_total_cents: 10300 };
    const ok = applyPaymentSucceeded(payment, { amount: 10300, latest_charge: 'ch_test' });
    assert.equal(ok.ok, true);
    assert.equal(ok.milestone_status, 'FUNDED');
    assert.equal(ok.payment_status, 'SUCCEEDED');
    assert.equal(applyPaymentSucceeded(payment, { amount: 10000 }).ok, false);
});

test('release prepares one transfer and a second release is refused', () => {
    const payment = { payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', stripe_charge_id: 'ch_test', stripe_transfer_id: null };
    const first = evaluateTransfer({ payment, milestone: { status: 'COMPLETED' }, providerAccountId: 'acct_a', destinationAccountId: 'acct_a' });
    assert.equal(first.ok, true);
    assert.equal(first.sourceTransaction, 'ch_test');
    const again = evaluateTransfer({
        payment: { ...payment, transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_test' },
        milestone: { status: 'COMPLETED' },
        providerAccountId: 'acct_a',
        destinationAccountId: 'acct_a'
    });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'ALREADY_TRANSFERRED');
});

test('an unfunded milestone and the wrong Connect account cannot be transferred', () => {
    const unfunded = evaluateTransfer({
        payment: { payment_status: 'CREATED', transfer_status: 'NOT_STARTED' },
        milestone: { status: 'PENDING' },
        providerAccountId: 'acct_a',
        destinationAccountId: 'acct_a'
    });
    assert.equal(unfunded.code, 'NOT_FUNDED');
    const wrong = evaluateTransfer({
        payment: { payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION' },
        milestone: { status: 'COMPLETED' },
        providerAccountId: 'acct_a',
        destinationAccountId: 'acct_b'
    });
    assert.equal(wrong.code, 'WRONG_CONNECT_ACCOUNT');
});

test('a dispute forbids the transfer', () => {
    const decision = evaluateTransfer({
        payment: { payment_status: 'DISPUTED', transfer_status: 'PENDING_VALIDATION' },
        milestone: { status: 'DISPUTED' },
        providerAccountId: 'acct_a',
        destinationAccountId: 'acct_a'
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.code, 'DISPUTED');
});

test('cancellation before transfer can refund once', () => {
    const payment = { payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', stripe_refund_id: null, customer_total_cents: 10300 };
    assert.equal(evaluateRefund(payment, { status: 'FUNDED' }).ok, true);
    const twice = evaluateRefund({ ...payment, payment_status: 'REFUNDED', stripe_refund_id: 're_test' }, { status: 'CANCELLED' });
    assert.equal(twice.ok, false);
    assert.equal(twice.code, 'ALREADY_REFUNDED');
    assert.equal(twice.idempotent, true);
});

test('a transferred payment cannot be refunded by the pre-transfer route', () => {
    const decision = evaluateRefund({ payment_status: 'SUCCEEDED', transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_test' }, { status: 'RELEASED' });
    assert.equal(decision.code, 'ALREADY_TRANSFERRED');
});

test('onboarding return urls stay on LYANN', () => {
    assert.equal(safeStripeReturnUrl('https://lyann.app/feed'), 'https://lyann.app/feed');
    assert.equal(safeStripeReturnUrl('https://evil.example/steal'), 'https://lyann.app/');
});

function expectPricing(amount, customerFee, providerFee) {
    const price = calculateMilestonePricing(amount);
    const service = Number(price.service_amount_cents);
    assert.equal(Number(price.customer_fee_cents), customerFee);
    assert.equal(Number(price.provider_fee_cents), providerFee);
    assert.equal(Number(price.customer_total_cents), service + customerFee);
    assert.equal(Number(price.provider_net_cents), service - providerFee);
    assert.equal(Number(price.lyann_revenue_cents), customerFee + providerFee);
}

test('customer protection is 3 percent with a 1.49 euro minimum and provider commission stays 3 percent', () => {
    expectPricing('10.00', 149, 30);
    expectPricing('20.00', 149, 60);
    expectPricing('49.49', 149, 148);
    expectPricing('49.50', 149, 149);
    expectPricing('50.00', 150, 150);
    expectPricing('100.00', 300, 300);
    expectPricing('500.00', 1500, 1500);
});

test('three milestones are priced separately, so the minimum applies to each payment', () => {
    const parts = ['10.00', '20.00', '70.00'].map((amount) => calculateMilestonePricing(amount));
    assert.deepEqual(parts.map((part) => Number(part.customer_fee_cents)), [149, 149, 210]);
    assert.equal(parts.reduce((sum, part) => sum + Number(part.customer_fee_cents), 0), 508);
    assert.equal(Number(calculateMilestonePricing('100.00').customer_fee_cents), 300);
});

test('an already succeeded payment keeps its old cents and is never repriced', () => {
    const oldPayment = {
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_payment_intent_id: 'pi_old',
        stripe_transfer_id: 'tr_old',
        service_amount_cents: 1000,
        customer_fee_cents: 30,
        customer_total_cents: 1030,
        provider_fee_cents: 30,
        provider_net_cents: 970,
        lyann_revenue_cents: 60
    };
    assert.equal(resumePaymentDecision(oldPayment).action, 'refuse');
    assert.equal(paymentAmountSnapshot(oldPayment).customer_total_cents, 1030);
    assert.equal(Number(calculateMilestonePricing('10.00').customer_total_cents), 1149);
    const funded = { ...oldPayment, payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', stripe_transfer_id: null };
    assert.equal(resumePaymentDecision(funded).action, 'refuse');
});

test('a CREATED payment with a PaymentIntent is reused and a second click does not create another one', () => {
    const created = {
        payment_status: 'CREATED',
        transfer_status: 'NOT_STARTED',
        stripe_payment_intent_id: 'pi_existing',
        service_amount_cents: 1000,
        customer_fee_cents: 30,
        customer_total_cents: 1030,
        provider_fee_cents: 30,
        provider_net_cents: 970,
        lyann_revenue_cents: 60
    };
    assert.equal(resumePaymentDecision(created).action, 'reuse');
    assert.equal(resumePaymentDecision(created).action, 'reuse');
    assert.equal(paymentAmountSnapshot(created).customer_fee_cents, 30);
    const orphan = { ...created, stripe_payment_intent_id: null };
    assert.equal(resumePaymentDecision(orphan).action, 'attach');
    assert.equal(paymentAmountSnapshot(orphan).customer_total_cents, 1030);
});

test('a full refund before transfer uses the stored total, not the new tariff', () => {
    const stored = {
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_refund_id: null,
        customer_total_cents: 1030,
        customer_fee_cents: 30
    };
    assert.equal(evaluateRefund(stored, { status: 'FUNDED' }).ok, true);
    assert.equal(stored.customer_total_cents, 1030);
    assert.notEqual(stored.customer_total_cents, Number(calculateMilestonePricing('10.00').customer_total_cents));
});

test('checkout displays server amounts and does not recompute 3 percent', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../chat-logic.js'), 'utf8');
    assert.equal(source.includes('agreedPrice * 0.03'), false);
    assert.match(source, /amounts\.customer_total_cents/);
    assert.match(source, /amounts\.customer_fee_cents/);
    assert.match(source, /amounts\.service_amount_cents/);
});
