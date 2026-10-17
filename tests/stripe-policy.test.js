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
    canDeclareWorkDone,
    canValidateRelease,
    canClaimTransfer,
    transferIdempotencyKey,
    transferLockAcquireFrom,
    planTransferLock,
    stripeTransferFailureAction,
    transferLockAllows,
    refundAccessDecision,
    planRefundLock,
    refundReservationId,
    refundIdempotencyKey,
    refundAmountFromPayment,
    stripeRefundFailureAction,
    reconcileRefundAfterFailure,
    refundReservePredicates,
    transferAcquirePredicates,
    financeLockPredicatesExclusive,
    refundTransferExclusion,
    isRefundReservation,
    raiseDisputeDecision,
    disputeDraftRow,
    resolveDisputeDecision,
    applyPaymentFailed,
    applyChargeRefunded,
    webhookSigningSecrets,
    paymentWritePaths,
    releasePaymentDecision,
    classifyFinanceCircuit,
    admitStripeWebhookEvent,
    testWebhookFanoutRisk,
    evaluateRefund,
    applyPaymentSucceeded,
    applyChargeDisputeCreated,
    applyChargeDisputeClosed,
    classifyStripeDbGap,
    financialAuditEvent,
    webhookEventWriteRow,
    webhookEventLegacyPayloadRow,
    shouldFallbackWebhookPayloadColumn,
    claimWebhookDecision,
    safeStripeReturnUrl,
    POST_TRANSFER_REVERSAL_STATUSES,
    POST_TRANSFER_REFUND_STATUSES,
    postTransferFinancialExecutionEnabled,
    refundableCustomerCents,
    recoverableProviderNetCents,
    sumPaymentAdjustments,
    trustedRequestedCents,
    preparePostTransferRefundBreakdown,
    reversalReservationId,
    isReversalReservation,
    postTransferRefundReservationId,
    isPostTransferRefundReservation,
    isConfirmedRefundId,
    reversalIdempotencyKey,
    postTransferRefundIdempotencyKey,
    planReversalLock,
    planPostTransferRefundLock,
    reconcileReversalAfterFailure,
    reconcilePostTransferRefundAfterFailure,
    applyTransferReversed,
    applyPostTransferChargeRefunded,
    postTransferOperationExclusion,
    canApprovePostTransferRefund,
    postTransferRefundAccessDecision,
    postTransferRefundRequestDecision,
    postTransferRefundReplyDecision,
    postTransferRefundApproveDecision,
    paymentAdjustmentAppendRow,
    postTransferOperationKeys,
    reversalIdempotencyKeyForOperation,
    postTransferRefundIdempotencyKeyForOperation,
    claimOpenPostTransferRequest,
    postTransferRefundRequestRow,
    postTransferRefundRejectDecision,
    postTransferRefundDecideDecision,
    postTransferLedgerConsistent,
    postTransferConsistency,
    routePostTransferWebhook,
    postTransferWebhookPersistDecision,
    postTransferWebhookEvents,
    postTransferWebhookPersistEnabled,
    reversalIdFromStripeObject
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
    const direct18 = calculateMilestonePricing(18);
    assert.equal(Number(direct18.service_amount_cents), 1800);
    assert.equal(Number(direct18.customer_fee_cents), 149);
    assert.equal(Number(direct18.customer_total_cents), 1949);
    assert.equal(Number(direct18.service_amount_cents) + Number(direct18.customer_fee_cents), Number(direct18.customer_total_cents));
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

test('webhook event rows use payload_summary and can fall back to payload', () => {
    const row = webhookEventWriteRow({
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', object: 'payment_intent', amount: 4349 } }
    });
    assert.equal(row.stripe_event_id, 'evt_1');
    assert.equal(row.event_type, 'payment_intent.succeeded');
    assert.equal(row.status, 'processing');
    assert.equal(row.payload, undefined);
    assert.deepEqual(row.payload_summary, { object_id: 'pi_test', object: 'payment_intent', amount: 4349 });
    const legacy = webhookEventLegacyPayloadRow(row);
    assert.equal(legacy.payload_summary, undefined);
    assert.deepEqual(legacy.payload, row.payload_summary);
    assert.equal(shouldFallbackWebhookPayloadColumn({ code: 'PGRST204', message: "Could not find the 'payload_summary' column" }), true);
    assert.equal(shouldFallbackWebhookPayloadColumn({ code: '23505', message: 'duplicate' }), false);
});

test('a second succeeded webhook does not reset an existing transfer state', () => {
    const payment = {
        customer_total_cents: 4349,
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_charge_id: 'ch_existing'
    };
    const again = applyPaymentSucceeded(payment, { amount: 4349, latest_charge: 'ch_new' });
    assert.equal(again.ok, true);
    assert.equal(again.idempotent, true);
    assert.equal(again.preserve_transfer, true);
    assert.equal(again.milestone_status, 'FUNDED');
    assert.equal(again.transfer_status, 'PENDING_VALIDATION');
    assert.equal(again.stripe_charge_id, 'ch_existing');
    const transferred = applyPaymentSucceeded({
        ...payment,
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_test'
    }, { amount: 4349, latest_charge: 'ch_new' });
    assert.equal(transferred.preserve_transfer, true);
    assert.equal(transferred.transfer_status, 'TRANSFERRED');
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

test('only one caller can acquire the transfer lock; processing resumes with the same Stripe key', () => {
    assert.deepEqual(transferLockAcquireFrom(), ['PENDING_VALIDATION', 'TRANSFER_FAILED']);
    assert.equal(planTransferLock('PENDING_VALIDATION').action, 'acquire');
    assert.equal(planTransferLock('TRANSFER_FAILED').action, 'acquire');
    assert.equal(planTransferLock('TRANSFER_FAILED').revertTo, 'TRANSFER_FAILED');
    const processing = planTransferLock('TRANSFER_PROCESSING');
    assert.equal(processing.action, 'resume');
    assert.equal(processing.revertTo, 'PENDING_VALIDATION');
    assert.equal(planTransferLock('TRANSFERRED').action, 'reject');
    const first = planTransferLock('PENDING_VALIDATION');
    const second = planTransferLock('TRANSFER_PROCESSING');
    assert.equal(first.action, 'acquire');
    assert.equal(second.action, 'resume');
    assert.notEqual(second.action, 'acquire');
    const key = transferIdempotencyKey('d55485f1-b07e-4dac-9638-2e1d9d55319c');
    assert.equal(key, 'tr_milestone_d55485f1-b07e-4dac-9638-2e1d9d55319c');
    assert.equal(transferIdempotencyKey('d55485f1-b07e-4dac-9638-2e1d9d55319c'), key);
});

test('double click after transfer is refused and a prep failure reverts the lock', () => {
    const transferred = evaluateTransfer({
        payment: { payment_status: 'SUCCEEDED', transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_1' },
        milestone: { status: 'COMPLETED' },
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_b'
    });
    assert.equal(transferred.code, 'ALREADY_TRANSFERRED');
    assert.equal(transferred.idempotent, true);
    const bad = evaluateTransfer({
        payment: { payment_status: 'SUCCEEDED', transfer_status: 'TRANSFER_PROCESSING' },
        milestone: { status: 'COMPLETED' },
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_other'
    });
    assert.equal(bad.ok, false);
    assert.equal(planTransferLock('TRANSFER_PROCESSING').revertTo, 'PENDING_VALIDATION');
});

test('a Stripe timeout without a recovered transfer fails closed; a recovered id completes once', () => {
    const lost = stripeTransferFailureAction(null);
    assert.equal(lost.action, 'fail');
    assert.equal(lost.nextStatus, 'TRANSFER_FAILED');
    const recovered = stripeTransferFailureAction({ id: 'tr_recovered' });
    assert.equal(recovered.action, 'complete');
    assert.equal(recovered.transferId, 'tr_recovered');
});

test('A B and C keep their release roles and C cannot move funds', () => {
    const A = 'requester-a';
    const B = 'provider-b';
    const C = 'third-c';
    assert.equal(canDeclareWorkDone(B, B), true);
    assert.equal(canDeclareWorkDone(A, B), false);
    assert.equal(canDeclareWorkDone(C, B), false);
    assert.equal(canValidateRelease(A, A), true);
    assert.equal(canValidateRelease(B, A), false);
    assert.equal(canValidateRelease(C, A), false);
    assert.equal(canClaimTransfer(B, B), true);
    assert.equal(canClaimTransfer(A, B), false);
    assert.equal(canClaimTransfer(C, B), false);
});

test('a succeeded webhook replay does not open a new transfer', () => {
    const replay = applyPaymentSucceeded({
        customer_total_cents: 4349,
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_charge_id: 'ch_existing'
    }, { amount: 4349, latest_charge: 'ch_new' });
    assert.equal(replay.preserve_transfer, true);
    assert.equal(replay.transfer_status, 'PENDING_VALIDATION');
    const pricing = calculateMilestonePricing('42');
    assert.equal(Number(pricing.service_amount_cents), 4200);
    assert.equal(Number(pricing.customer_total_cents), 4349);
    assert.equal(Number(pricing.provider_net_cents), 4074);
});

test('release-payment is 200 already_transferred for A and stays silent for C', () => {
    const A = 'requester-a';
    const C = 'third-c';
    const milestone = { status: 'RELEASED' };
    const payment = {
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_3UQTBILqYzmscXLu21Mf7H4n',
        client_validated_at: '2026-10-14T15:05:48.000Z'
    };
    const again = releasePaymentDecision({ authUid: A, requesterId: A, milestone, payment });
    assert.equal(again.http, 200);
    assert.equal(again.action, 'already_transferred');
    assert.equal(again.already_transferred, true);
    assert.equal(again.createTransfer, false);
    assert.equal(again.transfer_id, 'tr_3UQTBILqYzmscXLu21Mf7H4n');
    const stranger = releasePaymentDecision({ authUid: C, requesterId: A, milestone, payment });
    assert.equal(stranger.http, 403);
    assert.equal(stranger.exposePayment, false);
    assert.equal(stranger.createTransfer, false);
    assert.equal(stranger.transfer_id, undefined);
});

test('double client validation does not open a second transfer', () => {
    const first = releasePaymentDecision({
        authUid: 'A',
        requesterId: 'A',
        milestone: { status: 'COMPLETED' },
        payment: { payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', client_validated_at: null }
    });
    assert.equal(first.action, 'release');
    assert.equal(first.recordValidation, true);
    const second = releasePaymentDecision({
        authUid: 'A',
        requesterId: 'A',
        milestone: { status: 'COMPLETED' },
        payment: { payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', client_validated_at: '2026-10-14T15:00:00.000Z' }
    });
    assert.equal(second.action, 'release');
    assert.equal(second.recordValidation, false);
    const afterRelease = releasePaymentDecision({
        authUid: 'A',
        requesterId: 'A',
        milestone: { status: 'RELEASED' },
        payment: {
            payment_status: 'SUCCEEDED',
            transfer_status: 'TRANSFERRED',
            stripe_transfer_id: 'tr_done',
            client_validated_at: '2026-10-14T15:00:00.000Z'
        }
    });
    assert.equal(afterRelease.createTransfer, false);
    assert.equal(afterRelease.already_transferred, true);
});

test('interrupted PROCESSING resumes the same key; FAILED reacquires; timeout recovers one transfer', () => {
    const interrupted = planTransferLock('TRANSFER_PROCESSING');
    assert.equal(interrupted.action, 'resume');
    assert.notEqual(interrupted.action, 'acquire');
    const failed = planTransferLock('TRANSFER_FAILED');
    assert.equal(failed.action, 'acquire');
    assert.equal(failed.revertTo, 'TRANSFER_FAILED');
    const key = transferIdempotencyKey('milestone-1');
    assert.equal(key, 'tr_milestone_milestone-1');
    const timeoutLost = stripeTransferFailureAction(null);
    assert.equal(timeoutLost.nextStatus, 'TRANSFER_FAILED');
    const timeoutAfterCreate = stripeTransferFailureAction({ id: 'tr_created_then_timeout' });
    assert.equal(timeoutAfterCreate.action, 'complete');
    assert.equal(timeoutAfterCreate.transferId, 'tr_created_then_timeout');
    assert.equal(evaluateTransfer({
        payment: { payment_status: 'SUCCEEDED', transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_created_then_timeout' },
        milestone: { status: 'COMPLETED' },
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_b'
    }).code, 'ALREADY_TRANSFERRED');
});

test('finance circuit states stay consistent and pricing is unchanged', () => {
    assert.equal(classifyFinanceCircuit({
        milestoneStatus: 'FUNDED', paymentStatus: 'SUCCEEDED', transferStatus: 'PENDING_VALIDATION'
    }).phase, 'FUNDED_HELD');
    assert.equal(classifyFinanceCircuit({
        milestoneStatus: 'COMPLETED', paymentStatus: 'SUCCEEDED', transferStatus: 'PENDING_VALIDATION'
    }).phase, 'AWAITING_CLIENT');
    assert.equal(classifyFinanceCircuit({
        milestoneStatus: 'COMPLETED',
        paymentStatus: 'SUCCEEDED',
        transferStatus: 'TRANSFER_PROCESSING',
        clientValidatedAt: 't'
    }).phase, 'TRANSFER_IN_FLIGHT');
    assert.equal(classifyFinanceCircuit({
        milestoneStatus: 'COMPLETED',
        paymentStatus: 'SUCCEEDED',
        transferStatus: 'TRANSFER_FAILED',
        clientValidatedAt: 't'
    }).phase, 'TRANSFER_RETRYABLE');
    assert.equal(classifyFinanceCircuit({
        milestoneStatus: 'RELEASED',
        paymentStatus: 'SUCCEEDED',
        transferStatus: 'TRANSFERRED',
        clientValidatedAt: 't',
        stripeTransferId: 'tr_1'
    }).phase, 'RELEASED');
    assert.equal(classifyFinanceCircuit({
        milestoneStatus: 'RELEASED',
        paymentStatus: 'SUCCEEDED',
        transferStatus: 'PENDING_VALIDATION'
    }).ok, false);
    const pricing = calculateMilestonePricing('42');
    assert.equal(Number(pricing.provider_net_cents), 4074);
    assert.equal(Number(pricing.customer_total_cents), 4349);
    assert.equal(Number(pricing.service_amount_cents), 4200);
});

test('test webhooks cannot write production from this process and fan-out is classified', () => {
    const replay = applyPaymentSucceeded({
        customer_total_cents: 4349,
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_keep',
        stripe_charge_id: 'ch_existing'
    }, { amount: 4349, latest_charge: 'ch_new' });
    assert.equal(replay.preserve_transfer, true);
    assert.equal(replay.transfer_status, 'TRANSFERRED');
    assert.equal(claimWebhookDecision({ status: 'processed' }).action, 'duplicate');
    assert.equal(admitStripeWebhookEvent({ livemode: false }, {
        SUPABASE_URL: 'https://tdktfbtqceldlaeqjtow.supabase.co'
    }).ok, true);
    assert.equal(admitStripeWebhookEvent({ livemode: false }, {
        SUPABASE_URL: 'https://gzispjfoywklpqatjyop.supabase.co'
    }).code, 'TEST_EVENT_ON_PRODUCTION');
    assert.equal(admitStripeWebhookEvent({ livemode: true }, {
        SUPABASE_URL: 'https://tdktfbtqceldlaeqjtow.supabase.co',
        STRIPE_LIVE_ENABLED: ''
    }).code, 'LIVE_EVENT_BLOCKED');
    const fanout = testWebhookFanoutRisk({
        url: 'https://lyann.app/v1/payments/webhook',
        status: 'enabled',
        livemode: false,
        enabled_events: ['payment_intent.succeeded', 'account.updated']
    });
    assert.equal(fanout.writesProductionIfSignatureVerifies, true);
    assert.equal(fanout.listensTransfer, false);
    const local = testWebhookFanoutRisk({
        url: 'http://127.0.0.1:8098/v1/payments/webhook',
        status: 'enabled',
        livemode: false,
        enabled_events: ['*']
    });
    assert.equal(local.writesProductionIfSignatureVerifies, false);
});

test('refund and transfer cannot both acquire the same payment', () => {
    const held = {
        id: 'pay-1',
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        client_validated_at: null,
        stripe_transfer_id: null,
        stripe_refund_id: null,
        customer_total_cents: 4349
    };
    const funded = refundTransferExclusion(held, { status: 'FUNDED' });
    assert.equal(funded.refundMayMove, true);
    assert.equal(funded.transferMayMove, false);
    assert.equal(funded.exclusive, true);
    const releasing = refundTransferExclusion({
        ...held,
        client_validated_at: '2026-10-14T15:00:00.000Z'
    }, { status: 'COMPLETED' });
    assert.equal(releasing.refundMayMove, false);
    assert.equal(releasing.transferMayMove, true);
    assert.equal(releasing.exclusive, true);
    const inFlight = {
        ...held,
        transfer_status: 'TRANSFER_PROCESSING',
        client_validated_at: 't'
    };
    assert.equal(refundTransferExclusion(inFlight, { status: 'COMPLETED' }).refundMayMove, false);
    assert.equal(planRefundLock(inFlight, { status: 'COMPLETED' }).code, 'TRANSFER_IN_PROGRESS');
    assert.equal(transferLockAllows({
        ...held,
        transfer_status: 'TRANSFER_PROCESSING',
        client_validated_at: 't'
    }), true);
    assert.equal(evaluateTransfer({
        payment: { ...held, stripe_refund_id: refundReservationId('pay-1') },
        milestone: { status: 'COMPLETED' },
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_b'
    }).code, 'REFUND_BLOCKS_TRANSFER');
});

test('double refund is idempotent and a timeout recovers one refund id', () => {
    const payment = {
        id: 'pay-2',
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_refund_id: null,
        customer_total_cents: 4349
    };
    assert.equal(evaluateRefund(payment, { status: 'FUNDED' }).ok, true);
    assert.equal(refundAmountFromPayment(payment), 4349);
    assert.equal(refundIdempotencyKey(payment.id), 're_payment_pay-2');
    const again = evaluateRefund({
        ...payment,
        payment_status: 'REFUNDED',
        stripe_refund_id: 're_1'
    }, { status: 'CANCELLED' });
    assert.equal(again.code, 'ALREADY_REFUNDED');
    assert.equal(again.idempotent, true);
    const resume = planRefundLock({ ...payment, stripe_refund_id: refundReservationId('pay-2') }, { status: 'FUNDED' });
    assert.equal(resume.action, 'resume');
    const lost = stripeRefundFailureAction(null);
    assert.equal(lost.releaseReservation, false);
    assert.equal(lost.action, 'keep');
    const recovered = stripeRefundFailureAction({ id: 're_recovered' });
    assert.equal(recovered.action, 'complete');
    assert.equal(evaluateRefund({
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_1'
    }, { status: 'RELEASED' }).code, 'ALREADY_TRANSFERRED');
});

test('A B and C cannot refund or dispute another user’s payment', () => {
    const A = 'requester-a';
    const B = 'provider-b';
    const C = 'third-c';
    const payment = {
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        customer_total_cents: 4349
    };
    const milestone = { status: 'FUNDED' };
    assert.equal(refundAccessDecision({ authUid: A, requesterId: A, payment, milestone }).action, 'acquire');
    assert.equal(refundAccessDecision({ authUid: B, requesterId: A, payment, milestone }).http, 403);
    assert.equal(refundAccessDecision({ authUid: C, requesterId: A, payment, milestone }).exposePayment, false);
    const completed = { status: 'COMPLETED' };
    assert.equal(raiseDisputeDecision({ authUid: A, requesterId: A, milestone: completed, payment }).action, 'freeze');
    assert.equal(raiseDisputeDecision({ authUid: B, requesterId: A, milestone: completed, payment }).http, 403);
    assert.equal(raiseDisputeDecision({ authUid: C, requesterId: A, milestone: completed, payment }).freeze, false);
});

test('a late payment_failed webhook cannot overwrite SUCCEEDED and charge.refunded does not create a refund', () => {
    assert.equal(applyPaymentFailed({ payment_status: 'SUCCEEDED' }).apply, false);
    assert.equal(applyPaymentFailed({ payment_status: 'REFUNDED' }).apply, false);
    assert.equal(applyPaymentFailed({ payment_status: 'CREATED', transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_1' }).apply, false);
    assert.equal(applyPaymentFailed({ payment_status: 'PROCESSING' }).payment_status, 'FAILED');
    const replay = applyPaymentSucceeded({
        customer_total_cents: 4349,
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_keep'
    }, { amount: 4349 });
    assert.equal(replay.preserve_transfer, true);
    const observed = applyChargeRefunded({
        payment_status: 'SUCCEEDED',
        stripe_refund_id: null
    }, { refunds: { data: [{ id: 're_ext' }] } });
    assert.equal(observed.createRefund, false);
    assert.equal(observed.action, 'observe');
    const sync = applyChargeRefunded({
        payment_status: 'SUCCEEDED',
        stripe_refund_id: refundReservationId('pay-3')
    }, { refunds: { data: [{ id: 're_done' }] } });
    assert.equal(sync.apply, true);
    assert.equal(sync.createRefund, false);
    assert.equal(sync.stripe_refund_id, 're_done');
});

test('a dispute freezes transfer and admin resolution stays a proposal', () => {
    const payment = {
        payment_status: 'DISPUTED',
        transfer_status: 'PENDING_VALIDATION'
    };
    assert.equal(evaluateTransfer({
        payment,
        milestone: { status: 'DISPUTED' },
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_b'
    }).code, 'DISPUTED');
    assert.equal(evaluateRefund(payment, { status: 'DISPUTED' }).code, 'DISPUTED');
    const draft = disputeDraftRow({
        milestoneId: 'm1',
        paymentId: 'p1',
        requesterId: 'A',
        reason: 'qa'
    });
    assert.equal(draft.status, 'OPEN');
    assert.equal(resolveDisputeDecision({ adminOk: false, action: 'refund_untransferred', payment }).http, 403);
    assert.equal(resolveDisputeDecision({
        adminOk: true,
        action: 'refund_untransferred',
        payment: { stripe_transfer_id: 'tr_1', transfer_status: 'TRANSFERRED' }
    }).code, 'POST_TRANSFER_REFUND_NOT_IN_SCOPE');
    assert.equal(resolveDisputeDecision({ adminOk: true, action: 'keep_frozen', payment }).execute, false);
});

test('SQL refund and transfer predicates cannot both match one row', () => {
    const refund = refundReservePredicates();
    const transfer = transferAcquirePredicates();
    assert.equal(financeLockPredicatesExclusive(refund, transfer), true);
    assert.equal(refund.client_validated_at, null);
    assert.equal(transfer.client_validated_at_required, true);
    assert.equal(refund.stripe_refund_id, null);
    assert.equal(transfer.stripe_refund_id, null);
    const reserved = {
        id: 'pay-lock',
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_refund_id: refundReservationId('pay-lock'),
        client_validated_at: null,
        stripe_transfer_id: null
    };
    assert.equal(isRefundReservation(reserved.stripe_refund_id), true);
    assert.equal(planRefundLock(reserved, { status: 'FUNDED' }).action, 'resume');
    assert.equal(planRefundLock(reserved, { status: 'FUNDED' }).code, 'RESUME');
    assert.notEqual(planRefundLock(reserved, { status: 'FUNDED' }).action, 'already');
    assert.equal(transferLockAllows(reserved), false);
    assert.equal(evaluateRefund({
        ...reserved,
        payment_status: 'REFUNDED',
        stripe_refund_id: 're_real'
    }, { status: 'CANCELLED' }).code, 'ALREADY_REFUNDED');
    assert.equal(releasePaymentDecision({
        authUid: 'A',
        requesterId: 'A',
        milestone: { status: 'COMPLETED' },
        payment: reserved
    }).code, 'REFUND_IN_PROGRESS');
    const secondAcquire = planRefundLock({
        ...reserved,
        stripe_refund_id: refundReservationId('pay-lock')
    }, { status: 'FUNDED' });
    assert.equal(secondAcquire.action, 'resume');
    assert.equal(refundIdempotencyKey('pay-lock'), refundIdempotencyKey('pay-lock'));
});

test('timeout and webhook during refund reservation never unlock a transfer', () => {
    const reserved = {
        id: 'pay-to',
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_refund_id: refundReservationId('pay-to'),
        client_validated_at: 'later-validation-must-not-block-resume',
        stripe_transfer_id: null,
        customer_total_cents: 4349
    };
    assert.equal(planRefundLock(reserved, { status: 'FUNDED' }).action, 'resume');
    assert.equal(refundTransferExclusion(reserved, { status: 'FUNDED' }).transferMayMove, false);
    const uncertain = reconcileRefundAfterFailure({ recoveredRefund: null, listRetrieved: false });
    assert.equal(uncertain.releaseReservation, false);
    const emptyList = reconcileRefundAfterFailure({
        recoveredRefund: null,
        listedRefunds: [],
        listRetrieved: true
    });
    assert.equal(emptyList.releaseReservation, false);
    const found = reconcileRefundAfterFailure({
        recoveredRefund: null,
        listedRefunds: [{ id: 're_from_list' }],
        listRetrieved: true
    });
    assert.equal(found.action, 'complete');
    assert.equal(found.refundId, 're_from_list');
    const webhook = applyChargeRefunded(reserved, { refunds: { data: [{ id: 're_hook' }] } });
    assert.equal(webhook.createRefund, false);
    assert.equal(webhook.apply, true);
    assert.equal(applyPaymentFailed(reserved).apply, false);
    const processing = {
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFER_PROCESSING',
        client_validated_at: 't',
        stripe_refund_id: null,
        stripe_transfer_id: null
    };
    assert.equal(planRefundLock(processing, { status: 'COMPLETED' }).code, 'TRANSFER_IN_PROGRESS');
    assert.equal(refundTransferExclusion(processing, { status: 'COMPLETED' }).exclusive, true);
});

test('write paths include refund-untransferred and CLI webhook secret is extra not a replacement', () => {
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-untransferred'), true);
    assert.equal(paymentWritePaths().includes('/v1/milestones/raise-dispute'), true);
    const secrets = webhookSigningSecrets({
        STRIPE_WEBHOOK_SECRET: 'whsec_dashboard',
        STRIPE_CLI_WEBHOOK_SECRET: 'whsec_cli'
    });
    assert.deepEqual(secrets, ['whsec_dashboard', 'whsec_cli']);
    assert.equal(webhookSigningSecrets({ STRIPE_WEBHOOK_SECRET: 'whsec_dashboard' })[0], 'whsec_dashboard');
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

const PROD_ENV = { SUPABASE_URL: 'https://gzispjfoywklpqatjyop.supabase.co' };
const STAGING_ENV = { SUPABASE_URL: 'https://tdktfbtqceldlaeqjtow.supabase.co' };

test('onboarding return urls stay on LYANN', () => {
    assert.equal(safeStripeReturnUrl('https://lyann.app/feed', PROD_ENV), 'https://lyann.app/feed');
    assert.equal(safeStripeReturnUrl('https://evil.example/steal', PROD_ENV), 'https://lyann.app/');
    assert.equal(safeStripeReturnUrl('http://127.0.0.1:8098/feed.html', PROD_ENV), 'https://lyann.app/');
});

test('staging V2 return urls allow only 127.0.0.1:8098 and refuse lyann.app', () => {
    assert.equal(safeStripeReturnUrl('http://127.0.0.1:8098/feed.html', STAGING_ENV), 'http://127.0.0.1:8098/feed.html');
    assert.equal(safeStripeReturnUrl('http://127.0.0.1:8098/?action=finances&connect=return', STAGING_ENV), 'http://127.0.0.1:8098/?action=finances&connect=return');
    assert.equal(safeStripeReturnUrl('capacitor://localhost/finances', STAGING_ENV), 'capacitor://localhost/finances');
    assert.equal(safeStripeReturnUrl('https://lyann.app/feed', STAGING_ENV), 'http://127.0.0.1:8098/feed.html');
    assert.equal(safeStripeReturnUrl('https://www.lyann.app/?action=finances', STAGING_ENV), 'http://127.0.0.1:8098/feed.html');
    assert.equal(safeStripeReturnUrl('http://127.0.0.1:8080/feed.html', STAGING_ENV), 'http://127.0.0.1:8098/feed.html');
    assert.equal(safeStripeReturnUrl('http://localhost:8098/feed.html', STAGING_ENV), 'http://127.0.0.1:8098/feed.html');
    assert.equal(safeStripeReturnUrl('https://evil.example/steal', STAGING_ENV), 'http://127.0.0.1:8098/feed.html');
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

function transferred42(overrides) {
    return {
        id: 'pay-610b-isolated',
        payment_status: 'SUCCEEDED',
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id: 'tr_610b_isolated',
        stripe_refund_id: null,
        stripe_reversal_id: null,
        client_validated_at: '2026-10-14T00:00:00.000Z',
        service_amount_cents: 4200,
        customer_fee_cents: 149,
        customer_total_cents: 4349,
        provider_fee_cents: 126,
        provider_net_cents: 4074,
        lyann_revenue_cents: 275,
        amount_refunded_cents: 0,
        customer_fee_refunded_cents: 0,
        service_refunded_cents: 0,
        provider_fee_reversed_cents: 0,
        provider_net_reversed_cents: 0,
        ...overrides
    };
}

const ACTOR_A = 'user-a-610b';
const ACTOR_B = 'user-b-610b';
const ACTOR_C = 'user-c-610b';
const FINANCE_ADMIN = { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] };
const RELEASED = { status: 'RELEASED' };

test('6.10B full refund after transfer uses persisted 4349/4074 and last-refund remainder absorption', () => {
    const payment = transferred42();
    const prep = preparePostTransferRefundBreakdown(payment, 4349);
    assert.equal(prep.ok, true);
    assert.equal(prep.is_final_refund, true);
    assert.equal(prep.refund_amount_cents, 4349);
    assert.equal(prep.reversal_amount_cents, 4074);
    assert.equal(prep.breakdown.refunded_service_cents, 4200);
    assert.equal(prep.breakdown.refunded_customer_fee_cents, 149);
    assert.equal(prep.breakdown.reversed_provider_fee_cents, 126);
    assert.equal(prep.requires_reversal, true);
    assert.equal(Number(refundableCustomerCents(payment)), 4349);
    assert.equal(Number(recoverableProviderNetCents(payment)), 4074);
    const browser = { requested_cents: 1, customer_total_cents: 99999, provider_net_cents: 1, breakdown: { refunded_service_cents: 1 } };
    assert.equal(trustedRequestedCents(browser, payment), 1);
    assert.notEqual(trustedRequestedCents(browser, payment), browser.customer_total_cents);
});

test('6.10B partial refund then second successive refund absorbs the remainder', () => {
    const first = preparePostTransferRefundBreakdown(transferred42(), 2000);
    assert.equal(first.ok, true);
    assert.equal(first.is_final_refund, false);
    assert.equal(first.breakdown.refunded_customer_fee_cents, 68);
    assert.equal(first.breakdown.refunded_service_cents, 1932);
    assert.equal(first.breakdown.reversed_provider_fee_cents, 57);
    assert.equal(first.breakdown.reversed_provider_net_cents, 1875);
    const afterFirst = transferred42({
        payment_status: 'PARTIALLY_REFUNDED',
        amount_refunded_cents: 2000,
        customer_fee_refunded_cents: 68,
        service_refunded_cents: 1932,
        provider_fee_reversed_cents: 57,
        provider_net_reversed_cents: 1875,
        stripe_reversal_id: 'trr_partial_1',
        transfer_status: 'PARTIALLY_REVERSED'
    });
    assert.equal(Number(refundableCustomerCents(afterFirst)), 2349);
    const second = preparePostTransferRefundBreakdown(afterFirst, 2349);
    assert.equal(second.ok, true);
    assert.equal(second.is_final_refund, true);
    assert.equal(second.breakdown.refunded_customer_fee_cents, 81);
    assert.equal(second.breakdown.refunded_service_cents, 2268);
    assert.equal(second.breakdown.reversed_provider_fee_cents, 69);
    assert.equal(second.breakdown.reversed_provider_net_cents, 2199);
    assert.equal(first.refund_amount_cents + second.refund_amount_cents, 4349);
    assert.equal(first.reversal_amount_cents + second.reversal_amount_cents, 4074);
    const ledger = sumPaymentAdjustments([
        { refund_amount_cents: 2000, adjusted_service_amount_cents: 1932, adjusted_customer_fee_cents: 68, adjusted_provider_fee_cents: 57, adjusted_provider_net_cents: 1875, stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1' },
        { refund_amount_cents: 2349, adjusted_service_amount_cents: 2268, adjusted_customer_fee_cents: 81, adjusted_provider_fee_cents: 69, adjusted_provider_net_cents: 2199, stripe_refund_id: 're_2', stripe_reversal_id: 'trr_2' }
    ]);
    assert.equal(ledger.refund_amount_cents, 4349);
    assert.equal(ledger.adjusted_provider_net_cents, 4074);
    assert.deepEqual(ledger.stripe_refund_ids, ['re_1', 're_2']);
});

test('6.10B overshoot and non-integer cents are refused', () => {
    assert.equal(preparePostTransferRefundBreakdown(transferred42(), 4350).code, 'EXCEEDS_REFUNDABLE');
    assert.equal(preparePostTransferRefundBreakdown(transferred42(), 0).code, 'AMOUNT_NOT_POSITIVE');
    assert.equal(preparePostTransferRefundBreakdown(transferred42(), -10).code, 'NEGATIVE_CENTS');
    assert.equal(preparePostTransferRefundBreakdown(transferred42(), 20.5).code, 'INVALID_CENTS');
    assert.equal(trustedRequestedCents({ requested_cents: 20.5 }, transferred42()), null);
});

test('6.10B double request is idempotent and never moves money', () => {
    const payment = transferred42();
    const first = postTransferRefundRequestDecision({
        authUid: ACTOR_A,
        requesterId: ACTOR_A,
        payment,
        milestone: RELEASED,
        requestedCents: 4349
    });
    assert.equal(first.action, 'record_request');
    assert.equal(first.execute, false);
    assert.equal(first.createReversal, false);
    const again = postTransferRefundRequestDecision({
        authUid: ACTOR_A,
        requesterId: ACTOR_A,
        payment,
        milestone: RELEASED,
        requestedCents: 4349,
        existingRequest: { id: 'req-1', status: 'OPEN', requested_cents: 4349 }
    });
    assert.equal(again.action, 'already');
    assert.equal(again.idempotent, true);
    assert.equal(again.createRefund, false);
});

test('6.10B reversal timeout keeps the reservation and does not start a refund', () => {
    const reserved = transferred42({
        transfer_status: 'REVERSAL_PROCESSING',
        stripe_reversal_id: reversalReservationId('pay-610b-isolated')
    });
    assert.equal(isReversalReservation(reserved.stripe_reversal_id), true);
    assert.equal(planReversalLock(reserved, RELEASED).action, 'resume');
    const timeout = reconcileReversalAfterFailure({ recoveredReversal: null, listedReversals: [], listRetrieved: false });
    assert.equal(timeout.action, 'keep');
    assert.equal(timeout.releaseReservation, false);
    assert.equal(timeout.createReversal, false);
    assert.equal(timeout.createRefund, false);
    assert.equal(planPostTransferRefundLock(reserved, RELEASED, { requires_reversal: true, reversal_amount_cents: 4074, refund_amount_cents: 4349 }).code, 'REVERSAL_IN_PROGRESS');
});

test('6.10B refund timeout after a confirmed reversal keeps the refund lock', () => {
    const reserved = transferred42({
        transfer_status: 'REVERSED',
        stripe_reversal_id: 'trr_610b',
        stripe_refund_id: postTransferRefundReservationId('pay-610b-isolated')
    });
    assert.equal(isPostTransferRefundReservation(reserved.stripe_refund_id), true);
    assert.equal(planPostTransferRefundLock(reserved, RELEASED, { requires_reversal: false, reversal_amount_cents: 0, refund_amount_cents: 4349 }).action, 'resume');
    const timeout = reconcilePostTransferRefundAfterFailure({ recoveredRefund: null, listedRefunds: [], listRetrieved: false });
    assert.equal(timeout.action, 'keep');
    assert.equal(timeout.releaseReservation, false);
    assert.equal(timeout.createRefund, false);
    assert.equal(timeout.createReversal, false);
});

test('6.10B partial reversal acquire uses a cents-scoped idempotency key', () => {
    const lock = planReversalLock(transferred42(), RELEASED, 1875);
    assert.equal(lock.action, 'acquire');
    assert.equal(lock.code, 'PARTIAL_REVERSAL');
    assert.equal(lock.reversal_amount_cents, 1875);
    assert.equal(lock.idempotencyKey, reversalIdempotencyKey('pay-610b-isolated', 1875));
    assert.notEqual(lock.idempotencyKey, reversalIdempotencyKey('pay-610b-isolated', 4074));
});

test('6.10B impossible reversal fails closed and never refunds the customer', () => {
    const reserved = transferred42({
        transfer_status: 'REVERSAL_PROCESSING',
        stripe_reversal_id: reversalReservationId('pay-610b-isolated')
    });
    const failed = reconcileReversalAfterFailure({
        recoveredReversal: null,
        listedReversals: [],
        listRetrieved: true,
        insufficientConnectBalance: true
    });
    assert.equal(failed.action, 'fail');
    assert.equal(failed.nextStatus, 'REVERSAL_FAILED');
    assert.equal(failed.createRefund, false);
    assert.equal(failed.releaseReservation, false);
    const afterFail = transferred42({ transfer_status: 'REVERSAL_FAILED', stripe_reversal_id: reserved.stripe_reversal_id });
    assert.equal(planPostTransferRefundLock(afterFail, RELEASED, { requires_reversal: true, reversal_amount_cents: 4074, refund_amount_cents: 4349 }).code, 'REVERSAL_FAILED');
});

test('6.10B a Stripe refund already present is reconciled and never created again', () => {
    const reserved = transferred42({
        transfer_status: 'REVERSED',
        stripe_reversal_id: 'trr_610b',
        stripe_refund_id: postTransferRefundReservationId('pay-610b-isolated')
    });
    const found = reconcilePostTransferRefundAfterFailure({
        recoveredRefund: null,
        listedRefunds: [{ id: 're_already' }],
        listRetrieved: true
    });
    assert.equal(found.action, 'complete');
    assert.equal(found.refundId, 're_already');
    assert.equal(found.createRefund, false);
    const already = planPostTransferRefundLock({
        ...reserved,
        payment_status: 'REFUNDED',
        stripe_refund_id: 're_already',
        amount_refunded_cents: 4349
    }, RELEASED, { refund_amount_cents: 4349, requires_reversal: false });
    assert.equal(already.action, 'already');
    assert.equal(already.idempotent, true);
});

test('6.10B a late webhook completes reservations without creating money movement', () => {
    const reversing = transferred42({
        transfer_status: 'REVERSAL_PROCESSING',
        stripe_reversal_id: reversalReservationId('pay-610b-isolated')
    });
    const reversed = applyTransferReversed(reversing, { id: 'trr_late', amount: 4074 });
    assert.equal(reversed.apply, true);
    assert.equal(reversed.action, 'complete_reservation');
    assert.equal(reversed.createReversal, false);
    assert.equal(reversed.createRefund, false);
    assert.equal(reversed.transfer_status, 'REVERSED');
    const refunding = transferred42({
        transfer_status: 'REVERSED',
        stripe_reversal_id: 'trr_late',
        stripe_refund_id: postTransferRefundReservationId('pay-610b-isolated')
    });
    const refunded = applyPostTransferChargeRefunded(refunding, {
        amount_refunded: 4349,
        refunds: { data: [{ id: 're_late' }] }
    });
    assert.equal(refunded.apply, true);
    assert.equal(refunded.createRefund, false);
    assert.equal(refunded.payment_status, 'REFUNDED');
    assert.equal(applyTransferReversed(transferred42({ stripe_reversal_id: 'trr_late' }), { id: 'trr_late' }).action, 'already_synced');
});

test('6.10B post-transfer operations stay exclusive of pre-transfer refund and a new transfer', () => {
    const payment = transferred42();
    const exclusion = postTransferOperationExclusion(payment, RELEASED);
    assert.equal(exclusion.exclusive, true);
    assert.equal(exclusion.preTransferRefundMayMove, false);
    assert.equal(exclusion.transferMayMove, false);
    assert.equal(exclusion.reversalMayMove, true);
    assert.equal(evaluateRefund(payment, RELEASED).code, 'ALREADY_TRANSFERRED');
    assert.equal(evaluateTransfer({
        payment,
        milestone: RELEASED,
        providerAccountId: 'acct_b',
        destinationAccountId: 'acct_b'
    }).code, 'ALREADY_TRANSFERRED');
});

test('6.10B A can request, B can reply, admin can propose, C is forbidden', () => {
    const payment = transferred42();
    const accessA = postTransferRefundAccessDecision({ authUid: ACTOR_A, requesterId: ACTOR_A, providerId: ACTOR_B });
    const accessB = postTransferRefundAccessDecision({ authUid: ACTOR_B, requesterId: ACTOR_A, providerId: ACTOR_B });
    const accessC = postTransferRefundAccessDecision({ authUid: ACTOR_C, requesterId: ACTOR_A, providerId: ACTOR_B });
    const accessAdmin = postTransferRefundAccessDecision({
        authUid: 'admin-1',
        requesterId: ACTOR_A,
        providerId: ACTOR_B,
        admin: FINANCE_ADMIN
    });
    assert.equal(accessA.canRequest, true);
    assert.equal(accessA.canApprove, false);
    assert.equal(accessB.canReply, true);
    assert.equal(accessB.canApprove, false);
    assert.equal(accessC.http, 403);
    assert.equal(accessAdmin.canApprove, true);
    assert.equal(accessAdmin.execute, false);
    assert.equal(canApprovePostTransferRefund({ role: 'SUPPORT', status: 'ACTIVE' }), false);
    assert.equal(canApprovePostTransferRefund({ role: 'FINANCE', status: 'SUSPENDED' }), false);
    assert.equal(canApprovePostTransferRefund({ is_agent: true, role: 'FINANCE' }), false);
    assert.equal(postTransferRefundRequestDecision({
        authUid: ACTOR_B,
        requesterId: ACTOR_A,
        payment,
        milestone: RELEASED,
        requestedCents: 4349
    }).http, 403);
    assert.equal(postTransferRefundReplyDecision({
        authUid: ACTOR_A,
        providerId: ACTOR_B,
        request: { status: 'OPEN' },
        response: 'accept'
    }).http, 403);
    const approve = postTransferRefundApproveDecision({
        admin: FINANCE_ADMIN,
        payment,
        milestone: RELEASED,
        requestedCents: 4349
    });
    assert.equal(approve.action, 'propose');
    assert.equal(approve.execute, false);
    assert.equal(approve.createReversal, false);
    assert.equal(approve.createRefund, false);
    assert.equal(approve.code, 'POST_TRANSFER_EXECUTE_NOT_IN_SCOPE');
    assert.equal(approve.intendedReversal.action, 'acquire');
    assert.equal(approve.intendedRefund.code, 'REVERSAL_REQUIRED');
});

test('6.10B integer-division rounding matches prepare_refund_secure and never goes negative', () => {
    const one = preparePostTransferRefundBreakdown(transferred42(), 1);
    assert.equal(one.ok, true);
    assert.equal(one.breakdown.refunded_customer_fee_cents, 0);
    assert.equal(one.breakdown.refunded_service_cents, 1);
    assert.equal(one.breakdown.reversed_provider_fee_cents, 0);
    assert.equal(one.breakdown.reversed_provider_net_cents, 1);
    const odd = preparePostTransferRefundBreakdown(transferred42(), 149);
    assert.equal(odd.ok, true);
    assert.ok(odd.breakdown.refunded_customer_fee_cents >= 0);
    assert.equal(odd.refund_amount_cents, odd.breakdown.refunded_service_cents + odd.breakdown.refunded_customer_fee_cents);
});

test('6.10B reservations are not ledger rows and execution stays disabled', () => {
    const prep = preparePostTransferRefundBreakdown(transferred42(), 4349);
    const reserved = paymentAdjustmentAppendRow({
        paymentId: 'pay-610b-isolated',
        breakdown: prep,
        stripeRefundId: postTransferRefundReservationId('pay-610b-isolated'),
        stripeReversalId: reversalReservationId('pay-610b-isolated')
    });
    assert.equal(reserved.ok, false);
    assert.equal(reserved.code, 'RESERVATION_NOT_LEDGERABLE');
    const confirmed = paymentAdjustmentAppendRow({
        paymentId: 'pay-610b-isolated',
        breakdown: prep,
        stripeRefundId: 're_confirmed',
        stripeReversalId: 'trr_confirmed',
        operationId: 'op-610b-confirmed'
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.row.refund_amount_cents, 4349);
    assert.equal(isConfirmedRefundId('re_confirmed'), true);
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-after-transfer'), false);
    assert.ok(POST_TRANSFER_REVERSAL_STATUSES.includes('REVERSAL_FAILED'));
    assert.ok(POST_TRANSFER_REFUND_STATUSES.includes('PARTIALLY_REFUNDED'));
    assert.notEqual(refundIdempotencyKey('pay-610b-isolated'), postTransferRefundIdempotencyKey('pay-610b-isolated', 4349));
    const server = require('node:fs').readFileSync(require('node:path').join(__dirname, '../api/server.js'), 'utf8');
    assert.equal(server.includes('/v1/payments/refund-after-transfer'), false);
});

test('6.10C two same-amount partials use distinct operation keys', () => {
    const first = postTransferOperationKeys('op-610c-a');
    const second = postTransferOperationKeys('op-610c-b');
    assert.equal(first.ok, true);
    assert.equal(first.reversalKey, reversalIdempotencyKeyForOperation('op-610c-a'));
    assert.notEqual(first.reversalKey, second.reversalKey);
    assert.notEqual(first.refundKey, second.refundKey);
    const sameAmountA = planReversalLock(transferred42(), RELEASED, 2000, 'op-610c-a');
    const sameAmountB = planReversalLock(transferred42({ provider_net_reversed_cents: 1875 }), RELEASED, 2000, 'op-610c-b');
    assert.equal(sameAmountA.idempotencyKey, 'rv_op_op-610c-a');
    assert.equal(sameAmountB.idempotencyKey, 'rv_op_op-610c-b');
    assert.notEqual(sameAmountA.idempotencyKey, reversalIdempotencyKey('pay-610b-isolated', 2000));
});

test('6.10C two simultaneous requests keep a single open row', () => {
    const payment = transferred42({ id: 'pay-610c-isolated' });
    const first = postTransferRefundRequestRow({
        requestId: 'req-610c-1',
        payment,
        milestone: { id: 'ms-610c', status: 'RELEASED' },
        requesterId: ACTOR_A,
        providerId: ACTOR_B,
        requestedCents: 2000,
        reason: 'trop long'
    });
    const second = postTransferRefundRequestRow({
        requestId: 'req-610c-2',
        payment,
        milestone: { id: 'ms-610c', status: 'RELEASED' },
        requesterId: ACTOR_A,
        providerId: ACTOR_B,
        requestedCents: 2000
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const claimed = claimOpenPostTransferRequest({ existingOpen: [first.row, second.row] });
    assert.equal(claimed.action, 'already');
    assert.equal(claimed.requestId, 'req-610c-1');
    assert.equal(claimed.execute, false);
});

test('6.10C timeout resume reuses the same operation key and keeps the lock', () => {
    const keys = postTransferOperationKeys('op-610c-resume');
    const reserved = transferred42({
        id: 'pay-610c-isolated',
        transfer_status: 'REVERSAL_PROCESSING',
        stripe_reversal_id: reversalReservationId('pay-610c-isolated')
    });
    const resume = planReversalLock(reserved, RELEASED, 4074, keys.operation_id);
    assert.equal(resume.action, 'resume');
    const timeout = reconcileReversalAfterFailure({ recoveredReversal: null, listRetrieved: false });
    assert.equal(timeout.action, 'keep');
    assert.equal(timeout.releaseReservation, false);
    assert.equal(keys.reversalKey, reversalIdempotencyKeyForOperation('op-610c-resume'));
});

test('6.10C reversal confirmed with refund not executed stays awaiting refund', () => {
    const payment = transferred42({
        id: 'pay-610c-isolated',
        transfer_status: 'REVERSED',
        stripe_reversal_id: 'trr_610c',
        provider_net_reversed_cents: 4074
    });
    const state = postTransferConsistency(payment);
    assert.equal(state.ok, true);
    assert.equal(state.code, 'REVERSED_AWAITING_REFUND');
    assert.equal(state.createRefund, false);
    const refundLock = planPostTransferRefundLock(payment, RELEASED, {
        requires_reversal: false,
        reversal_amount_cents: 0,
        refund_amount_cents: 4349
    }, 'op-610c-refund');
    assert.equal(refundLock.action, 'acquire');
    assert.equal(refundLock.idempotencyKey, 're_op_op-610c-refund_after_rv');
});

test('6.10C refund confirmed before reversal is inconsistent and never creates a reversal', () => {
    const payment = transferred42({
        id: 'pay-610c-isolated',
        payment_status: 'REFUNDED',
        stripe_refund_id: 're_610c_orphan',
        amount_refunded_cents: 4349,
        transfer_status: 'TRANSFERRED'
    });
    const state = postTransferConsistency(payment);
    assert.equal(state.ok, false);
    assert.equal(state.code, 'REFUND_WITHOUT_REVERSAL');
    assert.equal(state.createReversal, false);
    assert.equal(state.createRefund, false);
});

test('6.10C late and duplicate webhooks only reconcile known reservations', () => {
    assert.deepEqual(postTransferWebhookEvents(), ['transfer.reversed', 'charge.refunded']);
    const transferObject = {
        object: 'transfer',
        id: 'tr_610c_isolated',
        amount_reversed: 4074,
        reversals: { data: [{ id: 'trr_610c_late' }] }
    };
    assert.equal(reversalIdFromStripeObject(transferObject), 'trr_610c_late');
    const reserved = transferred42({
        id: 'pay-610c-isolated',
        stripe_transfer_id: 'tr_610c_isolated',
        transfer_status: 'REVERSAL_PROCESSING',
        stripe_reversal_id: reversalReservationId('pay-610c-isolated')
    });
    const late = routePostTransferWebhook({ type: 'transfer.reversed', data: { object: transferObject } }, reserved);
    assert.equal(late.action, 'complete_reservation');
    assert.equal(late.persist, false);
    assert.equal(late.createReversal, false);
    const duplicate = routePostTransferWebhook({
        type: 'transfer.reversed',
        data: { object: transferObject }
    }, { ...reserved, stripe_reversal_id: 'trr_610c_late', transfer_status: 'REVERSED' });
    assert.equal(duplicate.action, 'already_synced');
    assert.equal(duplicate.createRefund, false);
    const unknown = routePostTransferWebhook({ type: 'transfer.updated', data: { object: transferObject } }, reserved);
    assert.equal(unknown.code, 'EVENT_NOT_IN_SCOPE');
    const persist = postTransferWebhookPersistDecision(late);
    assert.equal(persist.persist, false);
    assert.equal(postTransferWebhookPersistEnabled(), false);
});

test('6.10C unauthorized admin and provider cannot decide or move money', () => {
    const payment = transferred42({ id: 'pay-610c-isolated' });
    const request = { id: 'req-610c', status: 'OPEN', requested_cents: 4349 };
    assert.equal(postTransferRefundDecideDecision({
        admin: { role: 'SUPPORT', status: 'ACTIVE' },
        payment,
        milestone: RELEASED,
        request,
        requestedCents: 4349,
        operationId: 'op-610c-nope'
    }).http, 403);
    assert.equal(postTransferRefundRejectDecision({
        admin: { role: 'FINANCE', status: 'SUSPENDED' },
        request,
        reason: 'hors délai'
    }).http, 403);
    assert.equal(postTransferRefundReplyDecision({
        authUid: ACTOR_C,
        providerId: ACTOR_B,
        request,
        response: 'accept'
    }).http, 403);
    assert.equal(postTransferRefundAccessDecision({
        authUid: ACTOR_C,
        requesterId: ACTOR_A,
        providerId: ACTOR_B
    }).http, 403);
});

test('6.10C admin can record a full or partial decision and a motivated refusal without Stripe', () => {
    const payment = transferred42({ id: 'pay-610c-isolated' });
    const request = { id: 'req-610c', status: 'OPEN', requested_cents: 4349 };
    const full = postTransferRefundDecideDecision({
        admin: FINANCE_ADMIN,
        payment,
        milestone: RELEASED,
        request,
        requestedCents: 4349,
        actorId: 'admin-finance',
        operationId: 'op-610c-full'
    });
    assert.equal(full.action, 'record_approval');
    assert.equal(full.execute, false);
    assert.equal(full.createReversal, false);
    assert.equal(full.reversalKey, 'rv_op_op-610c-full');
    assert.equal(full.history.action, 'ADMIN_APPROVED');
    const partial = postTransferRefundDecideDecision({
        admin: FINANCE_ADMIN,
        payment,
        milestone: RELEASED,
        request,
        requestedCents: 2000,
        actorId: 'admin-finance',
        operationId: 'op-610c-partial'
    });
    assert.equal(partial.breakdown.refund_amount_cents, 2000);
    assert.equal(partial.execute, false);
    const refused = postTransferRefundRejectDecision({
        admin: FINANCE_ADMIN,
        request,
        reason: 'prestation livrée conforme',
        actorId: 'admin-finance'
    });
    assert.equal(refused.action, 'record_rejection');
    assert.equal(refused.nextStatus, 'ADMIN_REJECTED');
    assert.equal(refused.history.reason, 'prestation livrée conforme');
    assert.equal(postTransferRefundRejectDecision({ admin: FINANCE_ADMIN, request, reason: '   ' }).code, 'REASON_REQUIRED');
});

test('6.10C ledger stays consistent and already TRANSFERRED QA-shaped rows stay eligible for request only', () => {
    const payment = transferred42({
        id: 'pay-610c-isolated',
        amount_refunded_cents: 2000,
        provider_net_reversed_cents: 1875
    });
    const ledger = postTransferLedgerConsistent(payment, [{
        refund_amount_cents: 2000,
        adjusted_provider_net_cents: 1875,
        stripe_refund_id: 're_610c_1',
        stripe_reversal_id: 'trr_610c_1'
    }]);
    assert.equal(ledger.ok, true);
    const request = postTransferRefundRequestDecision({
        authUid: ACTOR_A,
        requesterId: ACTOR_A,
        payment,
        milestone: RELEASED,
        requestedCents: 2000
    });
    assert.equal(request.action, 'record_request');
    assert.equal(request.execute, false);
    assert.equal(evaluateRefund(payment, RELEASED).code, 'ALREADY_TRANSFERRED');
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    const chargeOnTransferred = applyChargeRefunded(payment, { refunds: { data: [{ id: 're_dash' }] } });
    assert.equal(chargeOnTransferred.createRefund, false);
    assert.equal(chargeOnTransferred.persist, false);
});

test('late payment_intent.succeeded does not regress refunded or disputed payments', () => {
    const intent = { amount: 4349, latest_charge: 'ch_late' };
    for (const status of ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED']) {
        const late = applyPaymentSucceeded({
            payment_status: status,
            transfer_status: 'REVERSED',
            customer_total_cents: 4349,
            stripe_charge_id: 'ch_orig'
        }, intent);
        assert.equal(late.ok, true);
        assert.equal(late.apply, false);
        assert.equal(late.preserve_payment, true);
        assert.equal(late.payment_status, status);
        assert.equal(late.milestone_status, null);
    }
});

test('charge.dispute.created freezes succeeded payment without creating money', () => {
    const freeze = applyChargeDisputeCreated({ payment_status: 'SUCCEEDED' });
    assert.equal(freeze.apply, true);
    assert.equal(freeze.payment_status, 'DISPUTED');
    assert.equal(freeze.createRefund, false);
    assert.equal(freeze.createReversal, false);
    const closed = applyChargeDisputeClosed({ payment_status: 'DISPUTED' });
    assert.equal(closed.apply, false);
    assert.equal(closed.createRefund, false);
});

test('stripe/db gap classifier never recommends a Stripe create', () => {
    const gap = classifyStripeDbGap({
        payment: {
            payment_status: 'SUCCEEDED',
            stripe_transfer_id: 'tr_1',
            transfer_status: 'PENDING_VALIDATION',
            stripe_reversal_id: 'rv_op_x'
        },
        listedReversals: [{ id: 'trr_1' }],
        listedRefunds: []
    });
    assert.equal(gap.create, false);
    assert.ok(gap.code);
    const event = financialAuditEvent('post_transfer_execute', {
        payment_id: 'pay',
        operation_id: 'op',
        jwt: 'secret.jwt.token',
        stripe_secret: 'sk_test_xxx'
    });
    assert.equal(event.payment_id, 'pay');
    assert.equal(event.jwt, undefined);
    assert.equal(event.stripe_secret, undefined);
});


