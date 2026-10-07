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
