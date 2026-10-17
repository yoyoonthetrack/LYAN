'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    applyAccountUpdated,
    preparePreTransferRefund,
    preTransferRefundExecutionEnabled,
    preTransferRefundClientOverride,
    applyChargeDisputeCreated,
    applyChargeDisputeUpdated,
    applyChargeDisputeClosed,
    preparePostTransferRefundBreakdown,
    sumPaymentAdjustments,
    refundableCustomerCents,
    refundReservationId,
    postTransferFinancialExecutionEnabled,
    calculateMilestonePricing
} = require('../api/stripe-policy');
const { loadServerGrant, STRIPE_TEST_GRANT } = require('../api/post-transfer-stripe-test-grant');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const FUNDED = {
    id: 'pay-614',
    payment_status: 'SUCCEEDED',
    transfer_status: 'PENDING_VALIDATION',
    client_validated_at: null,
    stripe_transfer_id: null,
    stripe_refund_id: null,
    stripe_payment_intent_id: 'pi_614',
    customer_total_cents: 4349,
    service_amount_cents: 4200,
    customer_fee_cents: 149,
    provider_fee_cents: 126,
    provider_net_cents: 4074,
    amount_refunded_cents: 0,
    customer_fee_refunded_cents: 0,
    service_refunded_cents: 0,
    provider_fee_reversed_cents: 0,
    provider_net_reversed_cents: 0
};

function readyAccount() {
    return {
        id: 'acct_qa',
        configuration: {
            recipient: {
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: { status: 'active', status_details: [] }
                    }
                }
            }
        }
    };
}

test('6.14 engine and grant stay off', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(preTransferRefundExecutionEnabled(), false);
    assert.equal(STRIPE_TEST_GRANT.active, false);
    assert.equal(loadServerGrant().active, false);
    assert.equal(fs.existsSync(path.join(__dirname, '../artifacts/staging-v2/phase612c/grant.state.json')), false);
});

test('6.14 account.updated never creates or retries a Transfer', () => {
    const first = applyAccountUpdated({
        account: readyAccount(),
        payments: [{
            id: 'p1',
            milestone_id: 'm1',
            transfer_status: 'TRANSFER_FAILED',
            payment_status: 'SUCCEEDED',
            stripe_transfer_id: null
        }]
    });
    assert.equal(first.createTransfer, false);
    assert.equal(first.retryTransfer, false);
    assert.equal(first.createRefund, false);
    assert.equal(first.announcePayoutReady, true);
    assert.deepEqual(first.observed_transfer_failed, ['m1']);
    const replay = applyAccountUpdated({
        account: readyAccount(),
        payments: [{
            id: 'p1',
            milestone_id: 'm1',
            transfer_status: 'TRANSFER_FAILED',
            payment_status: 'SUCCEEDED',
            stripe_transfer_id: null
        }]
    });
    assert.equal(replay.createTransfer, false);
    assert.equal(replay.retryTransfer, false);
    const transferred = applyAccountUpdated({
        account: readyAccount(),
        payments: [{
            transfer_status: 'TRANSFERRED',
            stripe_transfer_id: 'tr_keep',
            payment_status: 'SUCCEEDED'
        }]
    });
    assert.equal(transferred.preserve_transferred, true);
    assert.deepEqual(transferred.observed_transfer_failed, []);
    const refunding = applyAccountUpdated({
        account: readyAccount(),
        payments: [{
            transfer_status: 'TRANSFER_FAILED',
            payment_status: 'SUCCEEDED',
            stripe_refund_id: refundReservationId('pay-x'),
            milestone_id: 'm-refund'
        }]
    });
    assert.deepEqual(refunding.observed_transfer_failed, []);
    const disputed = applyAccountUpdated({
        account: readyAccount(),
        payments: [{
            transfer_status: 'TRANSFER_FAILED',
            payment_status: 'DISPUTED',
            milestone_id: 'm-disp'
        }]
    });
    assert.deepEqual(disputed.observed_transfer_failed, []);
    const serverSrc = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    const accountCase = serverSrc.split("case 'account.updated'")[1].split('default:')[0];
    assert.equal(accountCase.includes('retryMilestoneTransfer'), false);
    assert.equal(accountCase.includes('transfers.create'), false);
    assert.equal(accountCase.includes('applyAccountUpdated'), true);
});

test('6.14 refund-untransferred requires owner, ignores client money fields, stays execution-disabled', () => {
    assert.equal(preTransferRefundClientOverride({ enable_execution: true }).ok, false);
    assert.equal(preTransferRefundClientOverride({ amount_cents: 1 }).code, 'CLIENT_AMOUNT_FORBIDDEN');
    assert.equal(preTransferRefundClientOverride({ payment_intent: 'pi_evil' }).code, 'CLIENT_PI_FORBIDDEN');
    const owner = preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: FUNDED,
        milestone: { status: 'FUNDED' },
        body: { milestone_id: 'm' }
    });
    assert.equal(owner.execute, false);
    assert.equal(owner.createRefund, false);
    assert.equal(owner.persist, false);
    assert.equal(owner.code, 'EXECUTION_DISABLED');
    assert.equal(owner.amount_cents, 4349);
    assert.equal(owner.payment_intent, 'pi_614');
    const stranger = preparePreTransferRefund({
        authUid: C,
        requesterId: A,
        payment: FUNDED,
        milestone: { status: 'FUNDED' },
        body: { milestone_id: 'm' }
    });
    assert.equal(stranger.http, 403);
    assert.equal(stranger.createRefund, false);
    const provider = preparePreTransferRefund({
        authUid: B,
        requesterId: A,
        payment: FUNDED,
        milestone: { status: 'FUNDED' },
        body: {}
    });
    assert.equal(provider.http, 403);
    const transferred = preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: { ...FUNDED, transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_1' },
        milestone: { status: 'RELEASED' },
        body: {}
    });
    assert.equal(transferred.code, 'ALREADY_TRANSFERRED');
    assert.equal(transferred.createRefund, false);
    const validated = preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: { ...FUNDED, client_validated_at: '2026-10-14T00:00:00.000Z' },
        milestone: { status: 'COMPLETED' },
        body: {}
    });
    assert.equal(validated.code, 'TRANSFER_IN_PROGRESS');
    const live = preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: FUNDED,
        milestone: { status: 'FUNDED' },
        body: {},
        livemode: true
    });
    assert.equal(live.code, 'LIVE_REFUND_BLOCKED');
    const already = preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: { ...FUNDED, payment_status: 'REFUNDED', stripe_refund_id: 're_done' },
        milestone: { status: 'CANCELLED' },
        body: {}
    });
    assert.equal(already.idempotent, true);
    assert.equal(already.createRefund, false);
    const lateWebhook = preparePreTransferRefund({
        authUid: A,
        requesterId: A,
        payment: { ...FUNDED, stripe_refund_id: refundReservationId(FUNDED.id) },
        milestone: { status: 'FUNDED' },
        body: {},
        listedRefunds: [{ id: 're_recovered' }]
    });
    assert.equal(lateWebhook.reconcile, true);
    assert.equal(lateWebhook.createRefund, false);
    assert.equal(lateWebhook.refund_id, 're_recovered');
});

test('6.14 partial refunds stay within SCT ledger and remain idempotent per operation', () => {
    const sct = calculateMilestonePricing(42);
    assert.equal(Number(sct.customer_total_cents), 4349);
    const first = preparePostTransferRefundBreakdown(FUNDED, 2000);
    assert.equal(first.ok, true);
    const afterFirst = {
        ...FUNDED,
        amount_refunded_cents: first.refund_amount_cents,
        customer_fee_refunded_cents: first.breakdown.refunded_customer_fee_cents,
        service_refunded_cents: first.breakdown.refunded_service_cents,
        provider_fee_reversed_cents: first.breakdown.reversed_provider_fee_cents,
        provider_net_reversed_cents: first.breakdown.reversed_provider_net_cents
    };
    const firstAgain = preparePostTransferRefundBreakdown(afterFirst, 2000);
    assert.equal(firstAgain.ok, true);
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
    assert.equal(preparePostTransferRefundBreakdown(afterSecond, 4349).code, 'EXCEEDS_REFUNDABLE');
    const remainder = Number(refundableCustomerCents(afterSecond));
    const last = preparePostTransferRefundBreakdown(afterSecond, remainder);
    assert.equal(last.ok, true);
    assert.equal(last.is_final_refund, true);
    assert.equal(afterSecond.amount_refunded_cents + last.refund_amount_cents, 4349);
    assert.equal(afterSecond.provider_net_reversed_cents + last.breakdown.reversed_provider_net_cents, 4074);
    const ledger = sumPaymentAdjustments([
        { refund_amount_cents: first.refund_amount_cents, adjusted_provider_net_cents: first.breakdown.reversed_provider_net_cents, adjusted_customer_fee_cents: first.breakdown.refunded_customer_fee_cents, stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1' },
        { refund_amount_cents: second.refund_amount_cents, adjusted_provider_net_cents: second.breakdown.reversed_provider_net_cents, adjusted_customer_fee_cents: second.breakdown.refunded_customer_fee_cents, stripe_refund_id: 're_2', stripe_reversal_id: 'trr_2' },
        { refund_amount_cents: last.refund_amount_cents, adjusted_provider_net_cents: last.breakdown.reversed_provider_net_cents, adjusted_customer_fee_cents: last.breakdown.refunded_customer_fee_cents, stripe_refund_id: 're_3', stripe_reversal_id: 'trr_3' }
    ]);
    assert.equal(ledger.refund_amount_cents, 4349);
    assert.equal(ledger.adjusted_provider_net_cents, 4074);
    assert.ok(ledger.adjusted_customer_fee_cents <= 149);
});

test('6.14 chargebacks freeze without money movement and closed stays manual', () => {
    const created = applyChargeDisputeCreated({ payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION' });
    assert.equal(created.apply, true);
    assert.equal(created.createRefund, false);
    assert.equal(created.createReversal, false);
    const replay = applyChargeDisputeCreated({ payment_status: 'DISPUTED' });
    assert.equal(replay.action, 'already');
    const updated = applyChargeDisputeUpdated({ payment_status: 'DISPUTED' });
    assert.equal(updated.apply, false);
    const afterTransfer = applyChargeDisputeCreated({
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_1'
    });
    assert.equal(afterTransfer.action, 'freeze_after_transfer');
    assert.equal(afterTransfer.createReversal, false);
    const inFlight = applyChargeDisputeCreated({
        payment_status: 'SUCCEEDED',
        stripe_refund_id: refundReservationId('pay-614')
    });
    assert.equal(inFlight.action, 'freeze_refund_in_flight');
    assert.equal(inFlight.createRefund, false);
    const closedFirst = applyChargeDisputeClosed({ payment_status: 'SUCCEEDED' });
    assert.equal(closedFirst.apply, false);
    assert.equal(closedFirst.code, 'DISPUTE_CLOSE_REQUIRES_OPERATOR');
    const closedAfter = applyChargeDisputeClosed({ payment_status: 'DISPUTED' });
    assert.equal(closedAfter.createRefund, false);
    assert.equal(closedAfter.createReversal, false);
    const refunded = applyChargeDisputeCreated({ payment_status: 'REFUNDED' });
    assert.equal(refunded.apply, false);
});
