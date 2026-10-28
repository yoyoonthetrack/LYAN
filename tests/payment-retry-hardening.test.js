'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
    failedIntentRetryDecision,
    paymentIntentIdempotencyKey,
    existingMilestoneTransferDecision,
    missionBlocksMoneyStep,
    calculateMilestonePricing,
    applyPaymentSucceeded,
    applyPaymentFailed
} = require('../api/stripe-policy');
const editor = require('../quote-milestone-editor');
const financeUi = require('../finance-policy-ui');

const server = fs.readFileSync('api/server.js', 'utf8');
const intentRoute = server.slice(
    server.indexOf("app.post('/v1/payments/create-milestone-intent'"),
    server.indexOf("app.post('/v1/milestones/start-work'")
);
const transferHelper = server.slice(
    server.indexOf('async function retryMilestoneTransfer'),
    server.indexOf("app.post('/v1/milestones/release-payment'")
);
const webhook = server.slice(server.indexOf("app.post(['/v1/payments/webhook'"));
const webhookSucceeded = webhook.slice(
    webhook.indexOf("case 'payment_intent.succeeded'"),
    webhook.indexOf("case 'payment_intent.requires_action'")
);

const failedRow = { id: 'pay-1', payment_status: 'FAILED', customer_total_cents: 10300, stripe_payment_intent_id: 'pi_1' };
const openIntent = { id: 'pi_1', status: 'requires_payment_method', amount: 10300, currency: 'eur', livemode: false, metadata: { milestone_id: 'm-1' } };

test('a declined card is retried on the same PaymentIntent, never a second one', () => {
    assert.equal(failedIntentRetryDecision(failedRow, openIntent, 'm-1').action, 'reuse');
    assert.equal(failedIntentRetryDecision(failedRow, { ...openIntent, status: 'requires_action' }, 'm-1').action, 'reuse');
    for (const status of ['processing', 'requires_capture', 'succeeded']) {
        const decision = failedIntentRetryDecision(failedRow, { ...openIntent, status }, 'm-1');
        assert.equal(decision.action, 'wait', status);
        assert.equal(decision.code, 'PAIEMENT_EN_CONFIRMATION');
    }
    assert.equal(failedIntentRetryDecision(failedRow, { ...openIntent, status: 'canceled' }, 'm-1').action, 'create');
});

test('a failed intent with another amount, milestone or mode blocks instead of charging', () => {
    assert.equal(failedIntentRetryDecision(failedRow, { ...openIntent, amount: 10301 }, 'm-1').code, 'AMOUNT_MISMATCH');
    assert.equal(failedIntentRetryDecision(failedRow, { ...openIntent, currency: 'usd' }, 'm-1').code, 'AMOUNT_MISMATCH');
    assert.equal(failedIntentRetryDecision(failedRow, openIntent, 'm-2').action, 'block');
    assert.equal(failedIntentRetryDecision(failedRow, { ...openIntent, livemode: true }, 'm-1').code, 'STRIPE_MODE_MISMATCH');
    assert.equal(failedIntentRetryDecision(failedRow, { ...openIntent, status: 'unknown' }, 'm-1').action, 'block');
    assert.equal(failedIntentRetryDecision(null, openIntent, 'm-1').action, 'block');
});

test('the Stripe idempotency key is per payment row so a new attempt is not rejected by Stripe', () => {
    assert.equal(paymentIntentIdempotencyKey('m-1', 'pay-1'), 'pi_milestone_m-1_pay-1');
    assert.notEqual(paymentIntentIdempotencyKey('m-1', 'pay-1'), paymentIntentIdempotencyKey('m-1', 'pay-2'));
    assert.equal(paymentIntentIdempotencyKey('m-1', 'pay-1'), paymentIntentIdempotencyKey('m-1', 'pay-1'));
    assert.doesNotMatch(intentRoute, /idempotencyKey: stripeIdempotencyKey/);
    assert.equal((intentRoute.match(/paymentIntentIdempotencyKey\(milestone\.id, /g) || []).length, 2);
});

test('create-milestone-intent retries a failed attempt before inserting a new row', () => {
    const retry = intentRoute.indexOf('failedIntentRetryDecision');
    const insert = intentRoute.indexOf(".insert({");
    assert.ok(retry > 0 && retry < insert);
    assert.match(intentRoute, /\.in\('payment_status', \['FAILED', 'CANCELLED'\]\)\s*\n\s*\.eq\('stripe_payment_intent_id', retryIntent\.id\)/);
    assert.ok(intentRoute.indexOf('newPaymentIntakeDecision') < intentRoute.indexOf('paymentIntents.create'));
});

test('create-milestone-intent never invents a mock PaymentIntent and never hands out an untracked secret', () => {
    assert.doesNotMatch(intentRoute, /stripe_test_mock|pi_test_|_secret_test/);
    assert.doesNotMatch(intentRoute, /require\('stripe'\)\(process\.env\.STRIPE_SECRET_KEY\)/);
    assert.match(intentRoute, /PAIEMENT_NON_ENREGISTRE/);
    const link = intentRoute.slice(intentRoute.indexOf('const linked = await supabaseAdmin'));
    assert.ok(link.indexOf('PAIEMENT_NON_ENREGISTRE') < link.indexOf('client_secret: paymentIntent.client_secret'));
});

test('a concurrent second click is told the payment is being prepared, not that it is secured', () => {
    const conflict = intentRoute.slice(intentRoute.indexOf("insertErr.code === '23505'"));
    assert.match(conflict, /resumePaymentDecision\(concPayment\)/);
    assert.match(conflict, /return inProgress\(\)/);
    assert.match(intentRoute, /PAIEMENT_EN_PREPARATION/);
});

test('a sub-cent milestone amount is refused instead of being truncated', () => {
    assert.equal(calculateMilestonePricing('12.50').service_amount_cents, 1250n);
    assert.equal(calculateMilestonePricing('12.500').service_amount_cents, 1250n);
    assert.equal(calculateMilestonePricing(100).customer_total_cents, 10300n);
    assert.equal(calculateMilestonePricing(12.5).customer_fee_cents, 149n);
    assert.throws(() => calculateMilestonePricing('33.335'));
    assert.throws(() => calculateMilestonePricing('1e3'));
    assert.throws(() => calculateMilestonePricing('-5'));
    assert.throws(() => calculateMilestonePricing('abc'));
    assert.match(intentRoute, /MONTANT_INVALIDE/);
});

test('the dispute webhook no longer throws on an undeclared variable and checks its writes', () => {
    const dispute = webhook.slice(webhook.indexOf("case 'charge.dispute.created'"), webhook.indexOf("case 'charge.dispute.closed'"));
    assert.doesNotMatch(dispute, /chargeId/);
    assert.match(dispute, /DISPUTE_PAYMENT_WRITE_FAILED/);
    assert.doesNotMatch(dispute, /refunds\.create|transfers\.create/);
});

test('payment_intent.succeeded never marks the event processed after a failed write', () => {
    assert.match(webhookSucceeded, /if \(paymentWrite\.error\) throw/);
    assert.match(webhookSucceeded, /if \(milestoneWrite\.error\) throw/);
    assert.match(webhookSucceeded, /metadataPaymentId/);
    assert.match(webhookSucceeded, /PAYMENT_INTENT_MISMATCH/);
    assert.match(webhookSucceeded, /DUPLICATE_MILESTONE_CHARGE/);
    assert.doesNotMatch(webhookSucceeded, /refunds\.create/);
    const handler = webhook.slice(webhook.indexOf('} catch (handlerErr) {'));
    assert.match(handler.slice(0, 400), /stripe_webhook_events'\)\.delete\(\)/);
    assert.match(handler.slice(0, 400), /status\(500\)/);
});

test('webhook replays and out-of-order events keep the settled state', () => {
    const succeeded = { payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', customer_total_cents: 10300, milestone_status: 'FUNDED' };
    assert.equal(applyPaymentFailed(succeeded).apply, false);
    assert.equal(applyPaymentSucceeded(succeeded, { amount: 10300 }).idempotent, true);
    assert.equal(applyPaymentSucceeded({ ...succeeded, payment_status: 'FAILED' }, { amount: 10300 }).payment_status, 'SUCCEEDED');
    assert.equal(applyPaymentSucceeded({ ...succeeded, payment_status: 'CREATED' }, { amount: 10299 }).code, 'AMOUNT_MISMATCH');
});

test('release, transfer and dispute read the money row, not a declined attempt', () => {
    assert.match(server, /function milestoneMoneyPayment[\s\S]{0,300}\.not\('payment_status', 'in', '\(FAILED,CANCELLED\)'\)/);
    const release = server.slice(server.indexOf("app.post('/v1/milestones/release-payment'"), server.indexOf("app.post('/v1/milestones/claim-transfer'"));
    const dispute = server.slice(server.indexOf("app.post('/v1/milestones/raise-dispute'"), server.indexOf("app.post('/v1/payments/validate-and-transfer'"));
    assert.match(release, /milestoneMoneyPayment\(milestone_id\)/);
    assert.match(dispute, /milestoneMoneyPayment\(milestone_id\)/);
    assert.match(transferHelper, /milestoneMoneyPayment\(milestoneId\)/);
});

test('a transfer is looked up in Stripe before it is created and never mocked', () => {
    assert.doesNotMatch(transferHelper, /stripe_test_mock|tr_test_/);
    assert.match(transferHelper, /STRIPE_UNAVAILABLE/);
    const list = transferHelper.indexOf('transfers.list');
    const create = transferHelper.indexOf('transfers.create');
    assert.ok(list > 0 && list < create);
    assert.ok(transferHelper.indexOf('liveTransferDecision') < create);
    assert.match(transferHelper, /TRANSFER_DB_SYNC_PENDING/);
    const failedWrites = transferHelper.match(/transfer_status: 'TRANSFER_FAILED' \}\)\s*\n\s*\.eq\('id', payment\.id\)\s*\n\s*\.is\('stripe_transfer_id', null\)/g) || [];
    assert.equal(failedWrites.length, 3);
});

test('an earlier Stripe transfer for the milestone completes the release instead of paying twice', () => {
    const transfer = { id: 'tr_1', amount: 9700, destination: 'acct_1', reversed: false, amount_reversed: 0, metadata: { milestone_id: 'm-1' } };
    assert.deepEqual(existingMilestoneTransferDecision([], 'm-1', 9700, 'acct_1'), { action: 'create' });
    assert.deepEqual(existingMilestoneTransferDecision([{ ...transfer, metadata: { milestone_id: 'm-2' } }], 'm-1', 9700, 'acct_1'), { action: 'create' });
    assert.deepEqual(existingMilestoneTransferDecision([transfer], 'm-1', 9700, 'acct_1'), { action: 'complete', transferId: 'tr_1' });
    assert.equal(existingMilestoneTransferDecision([transfer], 'm-1', 9701, 'acct_1').action, 'block');
    assert.equal(existingMilestoneTransferDecision([transfer], 'm-1', 9700, 'acct_2').action, 'block');
    assert.equal(existingMilestoneTransferDecision([{ ...transfer, reversed: true }], 'm-1', 9700, 'acct_1').action, 'block');
    assert.equal(existingMilestoneTransferDecision([transfer, { ...transfer, id: 'tr_2' }], 'm-1', 9700, 'acct_1').action, 'block');
});

test('Finances ignores declined attempts: no phantom expense and no phantom gain', () => {
    const me = 'user-me';
    const rows = [
        { id: 'p-failed', requester_id: me, provider_id: 'other', payment_status: 'FAILED', transfer_status: 'NOT_STARTED', service_amount_cents: 10000, customer_fee_cents: 300, customer_total_cents: 10300, provider_fee_cents: 300, provider_net_cents: 9700 },
        { id: 'p-ok', requester_id: me, provider_id: 'other', payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', service_amount_cents: 10000, customer_fee_cents: 300, customer_total_cents: 10300, provider_fee_cents: 300, provider_net_cents: 9700 },
        { id: 'p-cancel', requester_id: 'other', provider_id: me, payment_status: 'CANCELLED', transfer_status: 'NOT_STARTED', service_amount_cents: 5000, customer_fee_cents: 150, customer_total_cents: 5150, provider_fee_cents: 150, provider_net_cents: 4850 }
    ];
    const lines = financeUi.ledgerLines(me, rows);
    assert.deepEqual(lines.map((line) => line.id), ['p-ok']);
    assert.equal(lines[0].cents, 10300);
    const summary = financeUi.dossierSummary(me, {
        requester_id: me,
        provider_id: 'other',
        milestones: [{ id: 'm-1', title: 'Pose', status: 'FUNDED', amount: 100 }],
        payments: [{ ...rows[0], milestone_id: 'm-1' }, { ...rows[1], milestone_id: 'm-1' }]
    });
    assert.match(summary, /payé 103,00/);
    assert.match(summary, /Paiement sécurisé/);
});

test('the milestone editor refuses an empty step before the quote reaches SQL', () => {
    const state = editor.createState({ defaults: [{ title: 'A', percent: 100, amount: 100 }, { title: 'B', percent: 0, amount: 0 }] });
    const checked = editor.validate(state, 100);
    assert.equal(checked.ok, false);
    assert.match(checked.message, /supérieur à 0/);
    editor.removeRow(state, state.rows[1].id);
    assert.equal(editor.validate(state, 100).ok, true);
});

test('a cancelled mission freezes work, validation and transfers instead of moving secured funds', () => {
    assert.equal(missionBlocksMoneyStep({ status: 'CANCELLED' }), true);
    assert.equal(missionBlocksMoneyStep({ status: 'canceled' }), true);
    assert.equal(missionBlocksMoneyStep(null), true);
    assert.equal(missionBlocksMoneyStep({ status: 'AGREED' }), false);
    assert.equal(missionBlocksMoneyStep({ status: 'IN_PROGRESS' }), false);
    const route = (from, to) => server.slice(server.indexOf(from), server.indexOf(to));
    const startWork = route("app.post('/v1/milestones/start-work'", "app.post('/v1/milestones/submit-completion'");
    const submit = route("app.post('/v1/milestones/submit-completion'", 'async function retryMilestoneTransfer');
    const release = route("app.post('/v1/milestones/release-payment'", "app.post('/v1/milestones/claim-transfer'");
    for (const body of [startWork, submit]) {
        assert.ok(body.indexOf('missionBlocksMoneyStep(mission)') > 0);
        assert.ok(body.indexOf('missionBlocksMoneyStep(mission)') < body.indexOf(".update("));
    }
    assert.ok(release.indexOf('missionBlocksMoneyStep(mission)') < release.indexOf('client_validated_at: nowIso'));
    assert.ok(transferHelper.indexOf('missionBlocksMoneyStep(transferMission)') < transferHelper.indexOf('stripe.transfers.create'));
    assert.match(transferHelper, /MISSION_A_VERIFIER/);
});

test('migration 87 refuses cancellation once a payment is engaged (proposal, applied by hand)', () => {
    const sql = fs.readFileSync('87_lyann_mission_cancel_after_payment_guard_staging.sql', 'utf8');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cancel_mission_secure/);
    assert.match(sql, /m\.status IN \('FUNDED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'DISPUTED'\)/);
    assert.match(sql, /p\.payment_status IN \('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED'\)/);
    assert.doesNotMatch(sql, /payment_status = 'CREATED'/);
    assert.match(sql, /Contactez l''Aide LYANN/);
    assert.ok(sql.indexOf('IF EXISTS') < sql.indexOf("SET status = 'CANCELLED'"));
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.cancel_mission_secure\(uuid, text\) FROM PUBLIC, anon/);
});

test('a payment confirmed after the mission was cancelled is recorded, flagged and does not reopen the request', () => {
    assert.match(webhookSucceeded, /PAYMENT_ON_CANCELLED_MISSION/);
    assert.match(webhookSucceeded, /requestId && !paidAfterCancel/);
    assert.match(webhookSucceeded, /missionBlocksMoneyStep\(missionRow\)/);
});

test('a refund made outside LYANN is flagged for an operator instead of passing silently', () => {
    const refunded = webhook.slice(webhook.indexOf("case 'charge.refunded'"), webhook.indexOf("case 'transfer.reversed'"));
    assert.match(refunded, /REFUND_OUTSIDE_LYANN/);
    assert.doesNotMatch(refunded, /refunds\.create/);
});

test('a dispute that arrives before the payment is settled is retried, never dropped', () => {
    const { disputeArrivedBeforeSettlement } = require('../api/stripe-policy');
    for (const status of ['CREATED', 'REQUIRES_ACTION', 'PROCESSING']) assert.equal(disputeArrivedBeforeSettlement({ payment_status: status }), true);
    for (const status of ['SUCCEEDED', 'DISPUTED', 'REFUNDED', 'FAILED']) assert.equal(disputeArrivedBeforeSettlement({ payment_status: status }), false);
    assert.equal(disputeArrivedBeforeSettlement(null), false);
    const dispute = webhook.slice(webhook.indexOf("case 'charge.dispute.created'"), webhook.indexOf("case 'charge.dispute.closed'"));
    assert.ok(dispute.indexOf('DISPUTE_BEFORE_PAYMENT_SETTLED') < dispute.indexOf(".update({ payment_status: 'DISPUTED' })"));
    assert.match(dispute, /PAYMENT_READ_FAILED/);
    assert.match(webhook, /\.delete\(\)\.eq\('stripe_event_id', event\.id\)/);
});

test('no transfer leaves while Stripe reports the charge as disputed, refunded, unpaid or for another amount', () => {
    const { fundedChargeTransferDecision } = require('../api/stripe-policy');
    const charge = { status: 'succeeded', paid: true, disputed: false, refunded: false, amount_refunded: 0, amount: 2649 };
    assert.deepEqual(fundedChargeTransferDecision(charge, 2649), { ok: true });
    assert.equal(fundedChargeTransferDecision({ ...charge, disputed: true }, 2649).code, 'DISPUTED');
    assert.equal(fundedChargeTransferDecision({ ...charge, amount_refunded: 100 }, 2649).code, 'REFUND_BLOCKS_TRANSFER');
    assert.equal(fundedChargeTransferDecision({ ...charge, amount: 2600 }, 2649).code, 'AMOUNT_MISMATCH');
    assert.equal(fundedChargeTransferDecision({ ...charge, status: 'pending' }, 2649).code, 'CHARGE_A_VERIFIER');
    assert.equal(fundedChargeTransferDecision(null, 2649).code, 'CHARGE_A_VERIFIER');
    const gate = transferHelper.indexOf('fundedChargeTransferDecision(');
    assert.ok(gate > 0 && gate < transferHelper.indexOf("update({ transfer_status: 'TRANSFER_FAILED' })"));
    assert.ok(gate < transferHelper.indexOf('stripe.transfers.create'));
});
