'use strict';

// Decisions for Stripe test mode. Never return or log key material.

function keyKind(value, testPrefix, livePrefix) {
    const key = String(value || '');
    if (!key) return 'missing';
    if (key.startsWith(livePrefix)) return 'live';
    if (key.startsWith(testPrefix)) return 'test';
    return 'invalid';
}

function inspectStripeEnv(env = process.env) {
    const liveEnabled = env.STRIPE_LIVE_ENABLED === 'true';
    const secretKind = keyKind(env.STRIPE_SECRET_KEY, 'sk_test_', 'sk_live_');
    const publishableKind = keyKind(env.STRIPE_PUBLISHABLE_KEY, 'pk_test_', 'pk_live_');
    const livePresent = secretKind === 'live' || publishableKind === 'live';
    const liveBlocked = livePresent && !liveEnabled;
    const mismatched = secretKind !== 'missing' && publishableKind !== 'missing'
        && secretKind !== 'invalid' && publishableKind !== 'invalid'
        && secretKind !== publishableKind;
    const invalid = secretKind === 'invalid' || publishableKind === 'invalid' || mismatched || liveBlocked;

    let mode = 'missing';
    if (invalid) mode = 'invalid';
    else if (secretKind === 'live' || publishableKind === 'live') mode = 'live';
    else if (secretKind === 'test' || publishableKind === 'test') mode = 'test';

    return {
        mode,
        liveEnabled,
        liveBlocked,
        secretKind,
        publishableKind,
        allowsSecretUse: secretKind === 'test' || (secretKind === 'live' && liveEnabled),
        allowsPublishableUse: publishableKind === 'test' || (publishableKind === 'live' && liveEnabled)
    };
}

function stripeTransfersCapability(account) {
    return account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers || null;
}

function connectStatus(account) {
    const created = Boolean(account && account.id);
    const capability = stripeTransfersCapability(account);
    const details = Array.isArray(capability?.status_details) ? capability.status_details : [];
    const pastDue = details.some((item) => item && item.code === 'requirements_past_due');
    const transfersActive = capability?.status === 'active';
    const onboardingCompleted = created
        && Boolean(capability)
        && capability.status !== 'unsupported'
        && !pastDue;
    return {
        account_created: created,
        onboarding_completed: onboardingCompleted,
        charges_enabled: false,
        payouts_enabled: false,
        transfers_active: transfersActive
    };
}

function connectPayoutReady(account) {
    const status = connectStatus(account);
    if (!status.account_created) return { ok: false, code: 'CONNECT_REQUIRED', status };
    if (!(status.onboarding_completed && status.transfers_active)) {
        return { ok: false, code: 'CONNECT_NOT_READY', status };
    }
    return { ok: true, code: 'READY', status };
}

function shouldCreateConnectAccount(profile) {
    return !profile || !profile.stripe_account_id;
}

function buildConnectAccountParams(email) {
    return {
        contact_email: email || undefined,
        dashboard: 'express',
        identity: { country: 'fr' },
        configuration: {
            recipient: {
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: { requested: true }
                    }
                }
            }
        },
        defaults: {
            currency: 'eur',
            responsibilities: {
                fees_collector: 'application',
                losses_collector: 'application'
            }
        },
        include: ['configuration.recipient']
    };
}

function buildAccountLinkParams(accountId, returnUrl, refreshUrl) {
    return {
        account: accountId,
        use_case: {
            type: 'account_onboarding',
            account_onboarding: {
                return_url: returnUrl,
                refresh_url: refreshUrl
            }
        }
    };
}

function providerCanBePaid(profile, account) {
    const kind = String(profile?.account_type || '');
    if (kind === 'seed' || kind === 'system') return { ok: false, code: 'PROVIDER_NOT_PAYABLE' };
    if (!profile?.stripe_account_id) return { ok: false, code: 'CONNECT_REQUIRED' };
    if (account && account.id && account.id !== profile.stripe_account_id) {
        return { ok: false, code: 'WRONG_CONNECT_ACCOUNT' };
    }
    return connectPayoutReady(account);
}

function canDeclareWorkDone(authUid, assignedHelperId) {
    return Boolean(authUid && assignedHelperId && String(authUid) === String(assignedHelperId));
}

function canValidateRelease(authUid, requesterId) {
    return Boolean(authUid && requesterId && String(authUid) === String(requesterId));
}

function canClaimTransfer(authUid, providerId) {
    return Boolean(authUid && providerId && String(authUid) === String(providerId));
}

function transferIdempotencyKey(milestoneId) {
    return 'tr_milestone_' + String(milestoneId || '');
}

function transferLockAcquireFrom() {
    return ['PENDING_VALIDATION', 'TRANSFER_FAILED'];
}

function transferLockAllows(payment) {
    if (!payment || payment.payment_status !== 'SUCCEEDED') return false;
    if (payment.stripe_transfer_id) return false;
    if (payment.stripe_refund_id) return false;
    const status = String(payment.transfer_status || '');
    if (status === 'TRANSFER_PROCESSING') return true;
    if (!payment.client_validated_at) return false;
    return transferLockAcquireFrom().includes(status);
}

function planTransferLock(transferStatus) {
    const status = String(transferStatus || '');
    if (status === 'PENDING_VALIDATION' || status === 'TRANSFER_FAILED') {
        return { action: 'acquire', revertTo: status };
    }
    if (status === 'TRANSFER_PROCESSING') {
        return { action: 'resume', revertTo: 'PENDING_VALIDATION' };
    }
    return { action: 'reject', code: 'INVALID_TRANSFER_STATUS' };
}

function stripeTransferFailureAction(recoveredTransfer) {
    if (recoveredTransfer && recoveredTransfer.id) {
        return { action: 'complete', transferId: recoveredTransfer.id };
    }
    return { action: 'fail', nextStatus: 'TRANSFER_FAILED' };
}

function alreadyTransferredPayment(milestone, payment) {
    const transferId = payment && payment.stripe_transfer_id;
    if (!transferId) return false;
    if (payment.transfer_status === 'TRANSFERRED') return true;
    return milestone && milestone.status === 'RELEASED';
}

function releasePaymentDecision({ authUid, requesterId, milestone, payment }) {
    if (!canValidateRelease(authUid, requesterId)) {
        return { action: 'forbidden', http: 403, exposePayment: false, createTransfer: false };
    }
    if (!milestone) return { action: 'not_found', http: 404, exposePayment: false, createTransfer: false };
    if (!payment) return { action: 'not_found', http: 404, exposePayment: false, createTransfer: false };
    if (alreadyTransferredPayment(milestone, payment)) {
        return {
            action: 'already_transferred',
            http: 200,
            already_transferred: true,
            idempotent: true,
            status: 'RELEASED',
            transfer_id: payment.stripe_transfer_id,
            exposePayment: true,
            createTransfer: false
        };
    }
    if (milestone.status !== 'COMPLETED') {
        return {
            action: 'reject',
            http: 400,
            code: 'MILESTONE_NOT_COMPLETED',
            createTransfer: false,
            exposePayment: true
        };
    }
    if (isRefundReservation(payment.stripe_refund_id)) {
        return {
            action: 'reject',
            http: 409,
            code: 'REFUND_IN_PROGRESS',
            createTransfer: false,
            exposePayment: true
        };
    }
    if (payment.payment_status !== 'SUCCEEDED') {
        return {
            action: 'reject',
            http: 400,
            code: 'PAYMENT_NOT_SUCCEEDED',
            createTransfer: false,
            exposePayment: true
        };
    }
    return {
        action: 'release',
        http: 200,
        createTransfer: true,
        recordValidation: !payment.client_validated_at,
        exposePayment: true
    };
}

function classifyFinanceCircuit({ milestoneStatus, paymentStatus, transferStatus, clientValidatedAt, stripeTransferId }) {
    const validated = Boolean(clientValidatedAt);
    const hasTransfer = Boolean(stripeTransferId);
    if (paymentStatus === 'SUCCEEDED' && milestoneStatus === 'FUNDED' && transferStatus === 'PENDING_VALIDATION' && !validated && !hasTransfer) {
        return { ok: true, phase: 'FUNDED_HELD' };
    }
    if (paymentStatus === 'SUCCEEDED' && milestoneStatus === 'COMPLETED' && transferStatus === 'PENDING_VALIDATION' && !validated && !hasTransfer) {
        return { ok: true, phase: 'AWAITING_CLIENT' };
    }
    if (paymentStatus === 'SUCCEEDED' && milestoneStatus === 'COMPLETED' && transferStatus === 'TRANSFER_PROCESSING' && validated && !hasTransfer) {
        return { ok: true, phase: 'TRANSFER_IN_FLIGHT' };
    }
    if (paymentStatus === 'SUCCEEDED' && milestoneStatus === 'COMPLETED' && transferStatus === 'TRANSFER_FAILED' && validated && !hasTransfer) {
        return { ok: true, phase: 'TRANSFER_RETRYABLE' };
    }
    if (paymentStatus === 'SUCCEEDED' && milestoneStatus === 'RELEASED' && transferStatus === 'TRANSFERRED' && validated && hasTransfer) {
        return { ok: true, phase: 'RELEASED' };
    }
    return { ok: false, phase: 'INCONSISTENT' };
}

function admitStripeWebhookEvent(event, env = process.env) {
    const ref = envSupabaseRef(env);
    const liveEvent = Boolean(event && event.livemode);
    if (liveEvent && env.STRIPE_LIVE_ENABLED !== 'true') {
        return { ok: false, code: 'LIVE_EVENT_BLOCKED' };
    }
    if (!liveEvent && ref === PRODUCTION_REF) {
        return { ok: false, code: 'TEST_EVENT_ON_PRODUCTION' };
    }
    if (liveEvent && ref === STAGING_V2_REF) {
        return { ok: false, code: 'LIVE_EVENT_ON_STAGING' };
    }
    return { ok: true, code: 'ADMITTED' };
}

function testWebhookFanoutRisk(endpoint) {
    const url = String(endpoint && endpoint.url || '');
    let host = '';
    try { host = new URL(url).hostname; } catch (_) { host = ''; }
    const enabled = endpoint && endpoint.status === 'enabled';
    const testMode = !(endpoint && endpoint.livemode === true);
    const events = Array.isArray(endpoint && endpoint.enabled_events) ? endpoint.enabled_events : [];
    const hitsLyann = host === 'lyann.app' || host === 'www.lyann.app';
    const hasStar = events.includes('*');
    const mutatesIfVerified = hasStar || events.some((name) =>
        name === 'payment_intent.succeeded'
        || name === 'payment_intent.payment_failed'
        || name === 'payment_intent.processing'
    );
    const listensTransfer = hasStar || events.some((name) => String(name).startsWith('transfer.'));
    if (!enabled || !testMode || !hitsLyann) {
        return {
            writesProductionIfSignatureVerifies: false,
            listensTransfer,
            mutatesIfVerified: false,
            host
        };
    }
    return {
        writesProductionIfSignatureVerifies: true,
        listensTransfer,
        mutatesIfVerified,
        host
    };
}

function evaluateTransfer({ payment, milestone, providerAccountId, destinationAccountId }) {
    if (milestone?.status === 'DISPUTED' || payment?.payment_status === 'DISPUTED') {
        return { ok: false, code: 'DISPUTED' };
    }
    if (!payment || payment.payment_status !== 'SUCCEEDED') return { ok: false, code: 'NOT_FUNDED' };
    if (payment.stripe_refund_id) return { ok: false, code: 'REFUND_BLOCKS_TRANSFER' };
    if (payment.transfer_status === 'TRANSFERRED' || payment.stripe_transfer_id) {
        return { ok: false, code: 'ALREADY_TRANSFERRED', idempotent: true, transferId: payment.stripe_transfer_id || null };
    }
    if (!providerAccountId) return { ok: false, code: 'CONNECT_REQUIRED' };
    if (destinationAccountId !== providerAccountId) return { ok: false, code: 'WRONG_CONNECT_ACCOUNT' };
    return {
        ok: true,
        code: 'READY',
        sourceTransaction: stripeChargeId(payment.stripe_charge_id)
    };
}

function refundReservationId(paymentId) {
    return 'pending_re_' + String(paymentId || '');
}

function isRefundReservation(refundId) {
    const id = String(refundId || '');
    return id.startsWith('pending_re_') && !id.startsWith('pending_re_after_');
}

function refundIdempotencyKey(paymentId) {
    return 're_payment_' + String(paymentId || '');
}

function refundAmountFromPayment(payment) {
    return Number(payment && payment.customer_total_cents);
}

function planRefundLock(payment, milestone) {
    if (!payment) return { action: 'reject', code: 'PAYMENT_NOT_FOUND', createRefund: false };
    const realRefund = payment.stripe_refund_id && !isRefundReservation(payment.stripe_refund_id);
    if (payment.payment_status === 'REFUNDED' || realRefund) {
        return {
            action: 'already',
            code: 'ALREADY_REFUNDED',
            idempotent: true,
            refundId: realRefund ? payment.stripe_refund_id : null,
            createRefund: false
        };
    }
    if (milestone?.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { action: 'reject', code: 'DISPUTED', createRefund: false };
    }
    if (payment.payment_status !== 'SUCCEEDED') {
        return { action: 'reject', code: 'NOT_FUNDED', createRefund: false };
    }
    if (payment.transfer_status === 'TRANSFERRED' || payment.stripe_transfer_id) {
        return { action: 'reject', code: 'ALREADY_TRANSFERRED', createRefund: false };
    }
    if (payment.stripe_reversal_id && !isReversalReservation(payment.stripe_reversal_id)) {
        return { action: 'reject', code: 'REVERSAL_PRESENT', createRefund: false };
    }
    if (isRefundReservation(payment.stripe_refund_id)) {
        return { action: 'resume', code: 'RESUME', createRefund: false, reservation: payment.stripe_refund_id };
    }
    if (payment.transfer_status === 'TRANSFER_PROCESSING' || payment.client_validated_at) {
        return { action: 'reject', code: 'TRANSFER_IN_PROGRESS', createRefund: false };
    }
    if (payment.transfer_status !== 'PENDING_VALIDATION') {
        return { action: 'reject', code: 'INVALID_TRANSFER_STATUS', createRefund: false };
    }
    return { action: 'acquire', code: 'READY', createRefund: true, reservation: refundReservationId(payment.id) };
}

function evaluateRefund(payment, milestone) {
    const lock = planRefundLock(payment, milestone);
    if (lock.action === 'already') {
        return { ok: false, code: 'ALREADY_REFUNDED', idempotent: true, refundId: lock.refundId || null };
    }
    if (lock.action === 'resume') return { ok: true, code: 'RESUME', resume: true };
    if (lock.action === 'acquire') return { ok: true, code: 'READY' };
    return { ok: false, code: lock.code };
}

function preTransferRefundExecutionEnabled() {
    return false;
}

function preTransferRefundClientOverride(body, extra) {
    const headers = (extra && extra.headers) || {};
    const query = (extra && extra.query) || {};
    const merged = Object.assign({}, query, body || {});
    if (headers['x-enable-execution'] === 'true' || headers['x-force-refund'] === 'true') {
        return { ok: false, code: 'CLIENT_CANNOT_ENABLE_EXECUTION' };
    }
    if (merged.enable_execution === true || merged.force === true || merged.mode != null || merged.grant === true) {
        return { ok: false, code: 'CLIENT_CANNOT_ENABLE_EXECUTION' };
    }
    if (merged.amount != null || merged.amount_cents != null || merged.requested_cents != null) {
        return { ok: false, code: 'CLIENT_AMOUNT_FORBIDDEN' };
    }
    if (merged.payment_intent || merged.payment_intent_id || merged.stripe_payment_intent_id) {
        return { ok: false, code: 'CLIENT_PI_FORBIDDEN' };
    }
    return { ok: true };
}

function classifyPreTransferRefundBusiness({ payment, milestone, mission }) {
    const lock = planRefundLock(payment, milestone);
    if (lock.action === 'already') {
        return { auto: false, decision: 'IDEMPOTENT', code: 'ALREADY_REFUNDED' };
    }
    if (lock.action === 'reject') {
        return { auto: false, decision: 'REFUSE', code: lock.code };
    }
    if (mission && (mission.status === 'CANCELLED' || mission.status === 'DISPUTED')) {
        return { auto: false, decision: 'NEEDS_ADMIN', code: 'BUSINESS_POLICY_REQUIRED' };
    }
    const status = milestone && milestone.status;
    if (status === 'IN_PROGRESS') {
        return { auto: false, decision: 'NEEDS_PROVIDER_OR_ADMIN', code: 'BUSINESS_POLICY_REQUIRED' };
    }
    if (status === 'COMPLETED') {
        return { auto: false, decision: 'NEEDS_ADMIN', code: 'BUSINESS_POLICY_REQUIRED' };
    }
    if (status === 'FUNDED' || status === 'PENDING') {
        return { auto: true, decision: 'AUTO_ELIGIBLE', code: 'AUTO_ELIGIBLE' };
    }
    return { auto: false, decision: 'NEEDS_ADMIN', code: 'BUSINESS_POLICY_REQUIRED' };
}

function preparePreTransferRefund({
    authUid,
    requesterId,
    payment,
    milestone,
    mission,
    body,
    headers,
    query,
    livemode,
    listedRefunds,
    grantActive,
    grantEvaluation
}) {
    const override = preTransferRefundClientOverride(body, { headers, query });
    if (!override.ok) {
        return { http: 400, execute: false, createRefund: false, persist: false, code: override.code };
    }
    if (livemode === true) {
        return { http: 409, execute: false, createRefund: false, persist: false, code: 'LIVE_REFUND_BLOCKED' };
    }
    if (!authUid) {
        return { http: 401, execute: false, createRefund: false, persist: false, code: 'AUTH_REQUIRED' };
    }
    const access = refundAccessDecision({ authUid, requesterId, payment, milestone });
    if (access.action === 'forbidden') {
        return { http: 403, execute: false, createRefund: false, persist: false, code: 'FORBIDDEN' };
    }
    if (access.action === 'already_refunded') {
        return {
            http: 200,
            execute: false,
            createRefund: false,
            persist: false,
            idempotent: true,
            code: 'ALREADY_REFUNDED',
            refund_id: access.refund_id
        };
    }
    if (access.action === 'reject') {
        return { http: 409, execute: false, createRefund: false, persist: false, code: access.code };
    }
    if (access.action === 'acquire') {
        const business = classifyPreTransferRefundBusiness({ payment, milestone, mission });
        if (business.auto !== true) {
            return { http: 409, execute: false, createRefund: false, persist: false, code: business.code };
        }
    }
    if (!payment || !payment.stripe_payment_intent_id) {
        return { http: 409, execute: false, createRefund: false, persist: false, code: 'PAYMENT_INTENT_MISSING' };
    }
    const amount_cents = refundAmountFromPayment(payment);
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
        return { http: 409, execute: false, createRefund: false, persist: false, code: 'AMOUNT_UNAVAILABLE' };
    }
    const listed = (listedRefunds || []).filter((row) => row && row.id && !isRefundReservation(row.id));
    if (listed.length) {
        return {
            http: 200,
            execute: false,
            createRefund: false,
            persist: true,
            reconcile: true,
            code: 'RECONCILE_EXISTING_REFUND',
            refund_id: listed[0].id,
            amount_cents
        };
    }
    if (preTransferRefundExecutionEnabled() === true) {
        return {
            http: 200,
            execute: true,
            createRefund: access.action === 'acquire' || access.action === 'resume',
            persist: true,
            code: 'READY',
            action: access.action,
            amount_cents,
            payment_intent: payment.stripe_payment_intent_id,
            idempotency_key: refundIdempotencyKey(payment.id)
        };
    }
    if (grantActive === true) {
        const ev = grantEvaluation || { ok: false, code: 'GRANT_INACTIVE' };
        if (!ev.ok || ev.write !== true) {
            return { http: 409, execute: false, createRefund: false, persist: false, code: ev.code || 'GRANT_INACTIVE' };
        }
        return {
            http: 200,
            execute: true,
            createRefund: access.action === 'acquire' || access.action === 'resume',
            persist: true,
            code: 'READY',
            action: access.action,
            amount_cents,
            payment_intent: payment.stripe_payment_intent_id,
            idempotency_key: refundIdempotencyKey(payment.id)
        };
    }
    return {
        http: 409,
        execute: false,
        createRefund: false,
        persist: false,
        code: 'EXECUTION_DISABLED',
        amount_cents,
        payment_intent: payment.stripe_payment_intent_id,
        idempotency_key: refundIdempotencyKey(payment.id)
    };
}

function admitPreTransferRefundDispatch(prepared, stripeRead) {
    if (!prepared || prepared.execute !== true) {
        return { ok: false, createRefund: false, lock_kept: Boolean(prepared && prepared.action === 'resume'), code: (prepared && prepared.code) || 'EXECUTION_DISABLED' };
    }
    if (stripeRead && (stripeRead.timeout === true || stripeRead.uncertain === true || stripeRead.incomplete === true)) {
        return { ok: false, createRefund: false, lock_kept: true, retryBlind: false, code: 'STRIPE_READ_UNCERTAIN' };
    }
    if (stripeRead && stripeRead.found === true && stripeRead.id) {
        return { ok: false, createRefund: false, lock_kept: true, reconcile: true, refund_id: stripeRead.id, code: 'RECONCILED_EXISTING' };
    }
    return { ok: true, createRefund: true, code: 'ADMITTED' };
}

function applyAccountUpdated({ account, payments }) {
    const ready = Boolean(account && connectPayoutReady(account).ok);
    const rows = Array.isArray(payments) ? payments : [];
    const observed = [];
    for (const payment of rows) {
        if (!payment) continue;
        if (payment.transfer_status === 'TRANSFERRED' && payment.stripe_transfer_id) continue;
        if (payment.payment_status === 'DISPUTED' || payment.payment_status === 'REFUNDED') continue;
        if (payment.stripe_refund_id || isRefundReservation(payment.stripe_refund_id)) continue;
        if (payment.transfer_status === 'TRANSFER_FAILED' && !payment.stripe_transfer_id) {
            observed.push(payment.milestone_id || payment.id);
        }
    }
    return {
        announcePayoutReady: ready,
        createTransfer: false,
        retryTransfer: false,
        createRefund: false,
        preserve_transferred: true,
        observed_transfer_failed: observed,
        code: ready ? 'ACCOUNT_READY_NO_TRANSFER' : 'ACCOUNT_NOT_READY'
    };
}

function refundAccessDecision({ authUid, requesterId, payment, milestone }) {
    if (!canValidateRelease(authUid, requesterId)) {
        return { action: 'forbidden', http: 403, createRefund: false, exposePayment: false };
    }
    const lock = planRefundLock(payment, milestone);
    if (lock.action === 'already') {
        return {
            action: 'already_refunded',
            http: 200,
            createRefund: false,
            idempotent: true,
            refund_id: lock.refundId
        };
    }
    if (lock.action === 'reject') {
        return { action: 'reject', http: 409, code: lock.code, createRefund: false };
    }
    return { action: lock.action, http: 200, createRefund: lock.action === 'acquire' || lock.action === 'resume', reservation: lock.reservation };
}

function stripeRefundFailureAction(recoveredRefund) {
    return reconcileRefundAfterFailure({ recoveredRefund });
}

function reconcileRefundAfterFailure({ recoveredRefund, listedRefunds, listRetrieved }) {
    if (recoveredRefund && recoveredRefund.id && !isRefundReservation(recoveredRefund.id)) {
        return { action: 'complete', refundId: recoveredRefund.id, releaseReservation: false };
    }
    const listed = (listedRefunds || []).filter((row) => row && row.id && !isRefundReservation(row.id));
    if (listed.length) {
        return { action: 'complete', refundId: listed[0].id, releaseReservation: false };
    }
    return {
        action: 'keep',
        releaseReservation: false,
        code: listRetrieved === true ? 'NO_REFUND_ON_STRIPE_KEEP_LOCK' : 'STRIPE_UNCERTAIN_KEEP_LOCK'
    };
}

function refundReservePredicates() {
    return {
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        stripe_transfer_id: null,
        client_validated_at: null,
        stripe_refund_id: null
    };
}

function transferAcquirePredicates() {
    return {
        payment_status: 'SUCCEEDED',
        transfer_status_in: ['PENDING_VALIDATION', 'TRANSFER_FAILED'],
        stripe_transfer_id: null,
        stripe_refund_id: null,
        client_validated_at_required: true
    };
}

function financeLockPredicatesExclusive(refundPred, transferPred) {
    const refundNeedsNullValidation = refundPred.client_validated_at === null;
    const transferNeedsValidation = transferPred.client_validated_at_required === true;
    const refundNeedsNullRefundId = refundPred.stripe_refund_id === null;
    const transferNeedsNullRefundId = transferPred.stripe_refund_id === null;
    return Boolean(
        refundNeedsNullValidation
        && transferNeedsValidation
        && refundNeedsNullRefundId
        && transferNeedsNullRefundId
    );
}

function refundTransferExclusion(payment, milestone) {
    const refund = planRefundLock(payment, milestone);
    const transfer = planTransferLock(payment && payment.transfer_status);
    const transferMayMove = transferLockAllows(payment) && (transfer.action === 'acquire' || transfer.action === 'resume');
    const refundMayMove = refund.action === 'acquire' || refund.action === 'resume';
    return {
        exclusive: !(transferMayMove && refundMayMove),
        refundMayMove,
        transferMayMove
    };
}

const POST_TRANSFER_REVERSAL_STATUSES = Object.freeze([
    'REVERSAL_PENDING',
    'REVERSAL_PROCESSING',
    'REVERSED',
    'PARTIALLY_REVERSED',
    'REVERSAL_FAILED'
]);

const POST_TRANSFER_REFUND_STATUSES = Object.freeze([
    'REFUND_PENDING',
    'REFUND_PROCESSING',
    'PARTIALLY_REFUNDED',
    'REFUNDED'
]);

const POST_TRANSFER_REQUEST_STATUSES = Object.freeze([
    'OPEN',
    'PROVIDER_REPLIED',
    'ADMIN_APPROVED',
    'ADMIN_REJECTED',
    'CANCELLED'
]);

function postTransferFinancialExecutionEnabled() {
    return false;
}

function toNonNegativeCents(value) {
    if (value == null || value === '') return 0n;
    try {
        const n = typeof value === 'bigint' ? value : BigInt(String(value).split('.')[0]);
        return n < 0n ? 0n : n;
    } catch (_) {
        return 0n;
    }
}

function parseRequestedCents(value) {
    if (value == null || value === '') return { ok: false, code: 'INVALID_CENTS' };
    if (typeof value === 'number' && (!Number.isFinite(value) || !Number.isInteger(value))) {
        return { ok: false, code: 'INVALID_CENTS' };
    }
    try {
        const n = typeof value === 'bigint' ? value : BigInt(String(value));
        if (n < 0n) return { ok: false, code: 'NEGATIVE_CENTS' };
        return { ok: true, cents: n };
    } catch (_) {
        return { ok: false, code: 'INVALID_CENTS' };
    }
}

function persistedRefundLedger(payment) {
    return {
        customer_total_cents: toNonNegativeCents(payment && payment.customer_total_cents),
        service_amount_cents: toNonNegativeCents(payment && payment.service_amount_cents),
        customer_fee_cents: toNonNegativeCents(payment && payment.customer_fee_cents),
        provider_fee_cents: toNonNegativeCents(payment && payment.provider_fee_cents),
        provider_net_cents: toNonNegativeCents(payment && payment.provider_net_cents),
        amount_refunded_cents: toNonNegativeCents(payment && payment.amount_refunded_cents),
        customer_fee_refunded_cents: toNonNegativeCents(payment && payment.customer_fee_refunded_cents),
        service_refunded_cents: toNonNegativeCents(payment && payment.service_refunded_cents),
        provider_fee_reversed_cents: toNonNegativeCents(payment && payment.provider_fee_reversed_cents),
        provider_net_reversed_cents: toNonNegativeCents(payment && payment.provider_net_reversed_cents)
    };
}

function refundableCustomerCents(payment) {
    const ledger = persistedRefundLedger(payment);
    const left = ledger.customer_total_cents - ledger.amount_refunded_cents;
    return left > 0n ? left : 0n;
}

function recoverableProviderNetCents(payment) {
    const ledger = persistedRefundLedger(payment);
    const left = ledger.provider_net_cents - ledger.provider_net_reversed_cents;
    return left > 0n ? left : 0n;
}

function sumPaymentAdjustments(rows) {
    let refund = 0n;
    let service = 0n;
    let customerFee = 0n;
    let providerFee = 0n;
    let providerNet = 0n;
    const refundIds = [];
    const reversalIds = [];
    for (const row of rows || []) {
        refund += toNonNegativeCents(row && row.refund_amount_cents);
        service += toNonNegativeCents(row && row.adjusted_service_amount_cents);
        customerFee += toNonNegativeCents(row && row.adjusted_customer_fee_cents);
        providerFee += toNonNegativeCents(row && row.adjusted_provider_fee_cents);
        providerNet += toNonNegativeCents(row && row.adjusted_provider_net_cents);
        const refundId = row && row.stripe_refund_id;
        const reversalId = row && row.stripe_reversal_id;
        if (isConfirmedRefundId(refundId) && !refundIds.includes(refundId)) refundIds.push(refundId);
        if (isConfirmedReversalId(reversalId) && !reversalIds.includes(reversalId)) reversalIds.push(reversalId);
    }
    return {
        refund_amount_cents: Number(refund),
        adjusted_service_amount_cents: Number(service),
        adjusted_customer_fee_cents: Number(customerFee),
        adjusted_provider_fee_cents: Number(providerFee),
        adjusted_provider_net_cents: Number(providerNet),
        stripe_refund_ids: refundIds,
        stripe_reversal_ids: reversalIds
    };
}

function trustedRequestedCents(body, payment) {
    const remaining = refundableCustomerCents(payment);
    if (!body || body.requested_cents == null) return Number(remaining);
    const parsed = parseRequestedCents(body.requested_cents);
    if (!parsed.ok) return null;
    return Number(parsed.cents);
}

function preparePostTransferRefundBreakdown(payment, requestedCents) {
    const parsed = parseRequestedCents(requestedCents);
    if (!parsed.ok) return { ok: false, code: parsed.code };
    if (parsed.cents <= 0n) return { ok: false, code: 'AMOUNT_NOT_POSITIVE' };
    if (!payment) return { ok: false, code: 'PAYMENT_NOT_FOUND' };
    const ledger = persistedRefundLedger(payment);
    if (ledger.customer_total_cents <= 0n || ledger.service_amount_cents <= 0n) {
        return { ok: false, code: 'MISSING_PERSISTED_AMOUNTS' };
    }
    const refundable = ledger.customer_total_cents - ledger.amount_refunded_cents;
    if (refundable < 0n) return { ok: false, code: 'LEDGER_INCONSISTENT' };
    if (parsed.cents > refundable) return { ok: false, code: 'EXCEEDS_REFUNDABLE' };
    const isFinal = (ledger.amount_refunded_cents + parsed.cents) === ledger.customer_total_cents;
    let refunded_customer_fee_cents;
    let refunded_service_cents;
    let reversed_provider_fee_cents;
    let reversed_provider_net_cents;
    if (isFinal) {
        refunded_customer_fee_cents = ledger.customer_fee_cents - ledger.customer_fee_refunded_cents;
        refunded_service_cents = ledger.service_amount_cents - ledger.service_refunded_cents;
        reversed_provider_fee_cents = ledger.provider_fee_cents - ledger.provider_fee_reversed_cents;
        reversed_provider_net_cents = ledger.provider_net_cents - ledger.provider_net_reversed_cents;
    } else {
        refunded_customer_fee_cents = (parsed.cents * ledger.customer_fee_cents) / ledger.customer_total_cents;
        refunded_service_cents = parsed.cents - refunded_customer_fee_cents;
        reversed_provider_fee_cents = (refunded_service_cents * ledger.provider_fee_cents) / ledger.service_amount_cents;
        reversed_provider_net_cents = refunded_service_cents - reversed_provider_fee_cents;
    }
    if (
        refunded_customer_fee_cents < 0n
        || refunded_service_cents < 0n
        || reversed_provider_fee_cents < 0n
        || reversed_provider_net_cents < 0n
    ) {
        return { ok: false, code: 'NEGATIVE_BREAKDOWN' };
    }
    const remainingNet = ledger.provider_net_cents - ledger.provider_net_reversed_cents;
    if (reversed_provider_net_cents > remainingNet) {
        return { ok: false, code: 'EXCEEDS_RECOVERABLE_NET' };
    }
    return {
        ok: true,
        code: 'READY',
        refund_amount_cents: Number(parsed.cents),
        is_final_refund: isFinal,
        requires_reversal: reversed_provider_net_cents > 0n,
        reversal_basis: 'PROVIDER_NET',
        reversal_amount_cents: Number(reversed_provider_net_cents),
        breakdown: {
            refunded_service_cents: Number(refunded_service_cents),
            refunded_customer_fee_cents: Number(refunded_customer_fee_cents),
            reversed_provider_net_cents: Number(reversed_provider_net_cents),
            reversed_provider_fee_cents: Number(reversed_provider_fee_cents)
        }
    };
}

function reversalReservationId(paymentId) {
    return 'pending_rv_' + String(paymentId || '');
}

function isReversalReservation(reversalId) {
    return String(reversalId || '').startsWith('pending_rv_');
}

function postTransferRefundReservationId(paymentId) {
    return 'pending_re_after_' + String(paymentId || '');
}

function isPostTransferRefundReservation(refundId) {
    return String(refundId || '').startsWith('pending_re_after_');
}

function isConfirmedRefundId(refundId) {
    const id = String(refundId || '');
    return Boolean(id) && !isRefundReservation(id) && !isPostTransferRefundReservation(id);
}

function isConfirmedReversalId(reversalId) {
    const id = String(reversalId || '');
    return Boolean(id) && !isReversalReservation(id);
}

function reversalIdempotencyKey(paymentId, cents) {
    return 'rv_payment_' + String(paymentId || '') + '_' + String(cents);
}

function postTransferRefundIdempotencyKey(paymentId, cents) {
    return 're_payment_' + String(paymentId || '') + '_after_rv_' + String(cents);
}

function stableOperationId(operationId) {
    const id = String(operationId || '').trim();
    if (!id) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
    return { ok: true, id };
}

function reversalIdempotencyKeyForOperation(operationId) {
    const parsed = stableOperationId(operationId);
    return parsed.ok ? 'rv_op_' + parsed.id : null;
}

function postTransferRefundIdempotencyKeyForOperation(operationId) {
    const parsed = stableOperationId(operationId);
    return parsed.ok ? 're_op_' + parsed.id + '_after_rv' : null;
}

function postTransferOperationKeys(operationId) {
    const parsed = stableOperationId(operationId);
    if (!parsed.ok) return { ok: false, code: parsed.code };
    return {
        ok: true,
        operation_id: parsed.id,
        reversalKey: reversalIdempotencyKeyForOperation(parsed.id),
        refundKey: postTransferRefundIdempotencyKeyForOperation(parsed.id)
    };
}

function paymentHasTransfer(payment) {
    return Boolean(payment && (payment.stripe_transfer_id || payment.transfer_status === 'TRANSFERRED'
        || payment.transfer_status === 'REVERSAL_PROCESSING'
        || payment.transfer_status === 'REVERSED'
        || payment.transfer_status === 'PARTIALLY_REVERSED'
        || payment.transfer_status === 'REVERSAL_FAILED'));
}

function planReversalLock(payment, milestone, reversalCents, operationId) {
    if (!payment) return { action: 'reject', code: 'PAYMENT_NOT_FOUND', createReversal: false };
    if (milestone?.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { action: 'reject', code: 'DISPUTED', createReversal: false };
    }
    if (!paymentHasTransfer(payment)) {
        return { action: 'reject', code: 'NOT_TRANSFERRED', createReversal: false };
    }
    const remainingNet = recoverableProviderNetCents(payment);
    if (remainingNet <= 0n && isConfirmedReversalId(payment.stripe_reversal_id)) {
        return {
            action: 'already',
            code: 'ALREADY_REVERSED',
            idempotent: true,
            reversalId: payment.stripe_reversal_id,
            createReversal: false
        };
    }
    if (isReversalReservation(payment.stripe_reversal_id) || payment.transfer_status === 'REVERSAL_PROCESSING') {
        return {
            action: 'resume',
            code: 'REVERSAL_PROCESSING',
            createReversal: false,
            reservation: payment.stripe_reversal_id || reversalReservationId(payment.id)
        };
    }
    if (payment.transfer_status === 'REVERSAL_FAILED') {
        return {
            action: 'acquire',
            code: 'REVERSAL_FAILED',
            createReversal: true,
            reservation: reversalReservationId(payment.id)
        };
    }
    if (remainingNet <= 0n) {
        return { action: 'already', code: 'ALREADY_REVERSED', idempotent: true, createReversal: false };
    }
    const parsed = reversalCents == null ? { ok: true, cents: remainingNet } : parseRequestedCents(reversalCents);
    if (!parsed.ok) return { action: 'reject', code: parsed.code, createReversal: false };
    if (parsed.cents <= 0n) return { action: 'reject', code: 'AMOUNT_NOT_POSITIVE', createReversal: false };
    if (parsed.cents > remainingNet) return { action: 'reject', code: 'EXCEEDS_RECOVERABLE_NET', createReversal: false };
    return {
        action: 'acquire',
        code: remainingNet === parsed.cents ? 'READY' : 'PARTIAL_REVERSAL',
        createReversal: true,
        reservation: reversalReservationId(payment.id),
        reversal_amount_cents: Number(parsed.cents),
        operation_id: stableOperationId(operationId).ok ? stableOperationId(operationId).id : null,
        idempotencyKey: stableOperationId(operationId).ok
            ? reversalIdempotencyKeyForOperation(operationId)
            : reversalIdempotencyKey(payment.id, Number(parsed.cents))
    };
}

function planPostTransferRefundLock(payment, milestone, breakdown, operationId) {
    if (!payment) return { action: 'reject', code: 'PAYMENT_NOT_FOUND', createRefund: false };
    if (milestone?.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { action: 'reject', code: 'DISPUTED', createRefund: false };
    }
    if (!paymentHasTransfer(payment)) {
        return { action: 'reject', code: 'NOT_TRANSFERRED', createRefund: false };
    }
    const remaining = refundableCustomerCents(payment);
    if (remaining <= 0n && isConfirmedRefundId(payment.stripe_refund_id)) {
        return {
            action: 'already',
            code: 'ALREADY_REFUNDED',
            idempotent: true,
            refundId: payment.stripe_refund_id,
            createRefund: false
        };
    }
    if (isPostTransferRefundReservation(payment.stripe_refund_id)) {
        return {
            action: 'resume',
            code: 'REFUND_PROCESSING',
            createRefund: false,
            reservation: payment.stripe_refund_id
        };
    }
    if (payment.transfer_status === 'REVERSAL_FAILED') {
        return { action: 'reject', code: 'REVERSAL_FAILED', createRefund: false };
    }
    if (payment.transfer_status === 'REVERSAL_PROCESSING' || isReversalReservation(payment.stripe_reversal_id)) {
        return { action: 'reject', code: 'REVERSAL_IN_PROGRESS', createRefund: false };
    }
    const needed = breakdown && breakdown.requires_reversal
        ? toNonNegativeCents(breakdown.reversal_amount_cents)
        : 0n;
    if (needed > 0n && !isConfirmedReversalId(payment.stripe_reversal_id)
        && payment.transfer_status !== 'REVERSED'
        && payment.transfer_status !== 'PARTIALLY_REVERSED') {
        return { action: 'reject', code: 'REVERSAL_REQUIRED', createRefund: false };
    }
    const amount = breakdown && breakdown.refund_amount_cents != null
        ? breakdown.refund_amount_cents
        : Number(remaining);
    if (toNonNegativeCents(amount) <= 0n) return { action: 'reject', code: 'AMOUNT_NOT_POSITIVE', createRefund: false };
    if (toNonNegativeCents(amount) > remaining) return { action: 'reject', code: 'EXCEEDS_REFUNDABLE', createRefund: false };
    return {
        action: 'acquire',
        code: remaining === toNonNegativeCents(amount) ? 'READY' : 'PARTIAL_REFUND',
        createRefund: true,
        reservation: postTransferRefundReservationId(payment.id),
        refund_amount_cents: Number(toNonNegativeCents(amount)),
        operation_id: stableOperationId(operationId).ok ? stableOperationId(operationId).id : null,
        idempotencyKey: stableOperationId(operationId).ok
            ? postTransferRefundIdempotencyKeyForOperation(operationId)
            : postTransferRefundIdempotencyKey(payment.id, Number(toNonNegativeCents(amount)))
    };
}

function reconcileReversalAfterFailure({ recoveredReversal, listedReversals, listRetrieved, insufficientConnectBalance }) {
    if (recoveredReversal && recoveredReversal.id && isConfirmedReversalId(recoveredReversal.id)) {
        return { action: 'complete', reversalId: recoveredReversal.id, releaseReservation: false, createReversal: false, createRefund: false };
    }
    const listed = (listedReversals || []).filter((row) => row && row.id && isConfirmedReversalId(row.id));
    if (listed.length) {
        return { action: 'complete', reversalId: listed[0].id, releaseReservation: false, createReversal: false, createRefund: false };
    }
    if (insufficientConnectBalance === true && listRetrieved === true) {
        return {
            action: 'fail',
            nextStatus: 'REVERSAL_FAILED',
            releaseReservation: false,
            createReversal: false,
            createRefund: false,
            code: 'REVERSAL_IMPOSSIBLE'
        };
    }
    return {
        action: 'keep',
        releaseReservation: false,
        createReversal: false,
        createRefund: false,
        code: listRetrieved === true ? 'NO_REVERSAL_ON_STRIPE_KEEP_LOCK' : 'STRIPE_UNCERTAIN_KEEP_LOCK'
    };
}

function reconcilePostTransferRefundAfterFailure({ recoveredRefund, listedRefunds, listRetrieved }) {
    const result = reconcileRefundAfterFailure({ recoveredRefund, listedRefunds, listRetrieved });
    return { ...result, createRefund: false, createReversal: false };
}

function reversalIdFromStripeObject(object) {
    if (!object) return null;
    if (object.object === 'transfer') {
        const reversals = object.reversals && object.reversals.data;
        if (Array.isArray(reversals) && reversals[0] && reversals[0].id) return reversals[0].id;
        return null;
    }
    return object.id || null;
}

function applyTransferReversed(payment, reversal) {
    const incomingId = reversalIdFromStripeObject(reversal) || (reversal && reversal.id);
    if (isConfirmedReversalId(payment.stripe_reversal_id) && payment.stripe_reversal_id === incomingId) {
        return { apply: false, action: 'already_synced', createReversal: false, createRefund: false };
    }
    if (isReversalReservation(payment.stripe_reversal_id) && incomingId && isConfirmedReversalId(incomingId)) {
        const remaining = recoverableProviderNetCents(payment) - toNonNegativeCents(reversal && (reversal.amount || reversal.amount_reversed));
        return {
            apply: true,
            action: 'complete_reservation',
            createReversal: false,
            createRefund: false,
            stripe_reversal_id: incomingId,
            transfer_status: remaining > 0n ? 'PARTIALLY_REVERSED' : 'REVERSED'
        };
    }
    return { apply: false, action: 'observe', createReversal: false, createRefund: false };
}

function applyPostTransferChargeRefunded(payment, charge) {
    const incomingId = charge && charge.refunds && charge.refunds.data && charge.refunds.data[0] && charge.refunds.data[0].id;
    if (!payment) return { apply: false, action: 'ignore', createRefund: false, createReversal: false };
    if (payment.payment_status === 'REFUNDED' && isConfirmedRefundId(payment.stripe_refund_id)) {
        return { apply: false, action: 'already_synced', createRefund: false, createReversal: false };
    }
    if (isPostTransferRefundReservation(payment.stripe_refund_id) && incomingId && isConfirmedRefundId(incomingId)) {
        const remaining = refundableCustomerCents(payment) - toNonNegativeCents(charge && charge.amount_refunded);
        return {
            apply: true,
            action: 'complete_reservation',
            createRefund: false,
            createReversal: false,
            payment_status: remaining > 0n ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
            stripe_refund_id: incomingId
        };
    }
    return { apply: false, action: 'observe', createRefund: false, createReversal: false };
}

function reversalReservePredicates() {
    return {
        payment_status_in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'],
        transfer_status: 'TRANSFERRED',
        stripe_transfer_id_required: true,
        stripe_reversal_id: null,
        successive_partial_safe: false,
        note: 'SQL 067 first reversal only. A later 068 lock column is required for successive partials.'
    };
}

function postTransferRefundReservePredicates() {
    return {
        payment_status_in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'],
        transfer_status_in: ['REVERSED', 'PARTIALLY_REVERSED'],
        stripe_refund_id: null,
        stripe_reversal_id_confirmed: true,
        successive_partial_safe: false,
        note: 'SQL 067 first post-transfer refund only. Confirmed stripe_refund_id blocks a later partial reserve.'
    };
}

function sql067LockLimits() {
    return {
        atomic_first_reserve: true,
        unique_adjustment_operation_id: true,
        unique_confirmed_stripe_ids_on_adjustments: true,
        lock_holder_on_payments: false,
        successive_partial_without_overwrite: false,
        one_unexecuted_approved_request: false,
        crash_resume_without_guessing: false,
        sufficient_for_financial_execution: false,
        proposed_followup: '068'
    };
}

function postTransferOperationExclusion(payment, milestone) {
    const pre = planRefundLock(payment, milestone);
    const transfer = planTransferLock(payment && payment.transfer_status);
    const transferMayMove = transferLockAllows(payment) && (transfer.action === 'acquire' || transfer.action === 'resume');
    const preMayMove = pre.action === 'acquire' || pre.action === 'resume';
    const reversal = planReversalLock(payment, milestone);
    const reversalMayMove = reversal.action === 'acquire' || reversal.action === 'resume';
    return {
        exclusive: !(preMayMove && reversalMayMove) && !(transferMayMove && reversalMayMove),
        preTransferRefundMayMove: preMayMove,
        transferMayMove,
        reversalMayMove
    };
}

function canApprovePostTransferRefund(admin) {
    if (!admin || admin.is_agent) return false;
    if (admin.status && admin.status !== 'ACTIVE') return false;
    const role = String(admin.role || '');
    if (role === 'OWNER' || role === 'SUPER_ADMIN' || role === 'FINANCE') return true;
    const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
    return permissions.includes('finance.refund');
}

function postTransferRefundAccessDecision({ authUid, requesterId, providerId, admin }) {
    const isA = Boolean(authUid && requesterId && String(authUid) === String(requesterId));
    const isB = Boolean(authUid && providerId && String(authUid) === String(providerId));
    const isAdmin = canApprovePostTransferRefund(admin);
    if (!isA && !isB && !isAdmin) {
        return {
            action: 'forbidden',
            http: 403,
            exposePayment: false,
            canRequest: false,
            canReply: false,
            canApprove: false,
            execute: false,
            createReversal: false,
            createRefund: false
        };
    }
    return {
        action: isAdmin ? 'admin_view' : (isA ? 'requester_view' : 'provider_view'),
        http: 200,
        exposePayment: true,
        canRequest: isA,
        canReply: isB,
        canApprove: isAdmin,
        execute: false,
        createReversal: false,
        createRefund: false
    };
}

function postTransferRefundRequestDecision({ authUid, requesterId, payment, milestone, requestedCents, existingRequest }) {
    if (!canValidateRelease(authUid, requesterId)) {
        return { action: 'forbidden', http: 403, execute: false, createReversal: false, createRefund: false };
    }
    if (!payment || !milestone) return { action: 'not_found', http: 404, execute: false, createReversal: false, createRefund: false };
    if (milestone.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { action: 'reject', http: 409, code: 'DISPUTED', execute: false, createReversal: false, createRefund: false };
    }
    if (isRefundReservation(payment.stripe_refund_id) || isPostTransferRefundReservation(payment.stripe_refund_id)) {
        return { action: 'reject', http: 409, code: 'REFUND_IN_PROGRESS', execute: false, createReversal: false, createRefund: false };
    }
    if (!paymentHasTransfer(payment)) {
        return { action: 'reject', http: 409, code: 'NOT_TRANSFERRED', execute: false, createReversal: false, createRefund: false };
    }
    const prep = preparePostTransferRefundBreakdown(payment, requestedCents);
    if (!prep.ok) return { action: 'reject', http: 400, code: prep.code, execute: false, createReversal: false, createRefund: false };
    const openStatuses = existingRequest && (existingRequest.status === 'OPEN' || existingRequest.status === 'PROVIDER_REPLIED');
    if (openStatuses && Number(existingRequest.requested_cents) === prep.refund_amount_cents) {
        return {
            action: 'already',
            http: 200,
            idempotent: true,
            requestId: existingRequest.id,
            execute: false,
            createReversal: false,
            createRefund: false
        };
    }
    if (openStatuses) {
        return { action: 'reject', http: 409, code: 'REQUEST_ALREADY_OPEN', execute: false, createReversal: false, createRefund: false };
    }
    return {
        action: 'record_request',
        http: 200,
        execute: false,
        createReversal: false,
        createRefund: false,
        breakdown: prep
    };
}

function postTransferRefundReplyDecision({ authUid, providerId, request, response }) {
    if (!canClaimTransfer(authUid, providerId)) {
        return { action: 'forbidden', http: 403, execute: false, createReversal: false, createRefund: false };
    }
    if (!request || (request.status !== 'OPEN' && request.status !== 'PROVIDER_REPLIED')) {
        return { action: 'reject', http: 409, code: 'REQUEST_NOT_OPEN', execute: false, createReversal: false, createRefund: false };
    }
    if (response !== 'accept' && response !== 'decline') {
        return { action: 'reject', http: 400, code: 'INVALID_REPLY', execute: false, createReversal: false, createRefund: false };
    }
    return {
        action: 'record_reply',
        http: 200,
        execute: false,
        createReversal: false,
        createRefund: false,
        nextStatus: 'PROVIDER_REPLIED',
        provider_response: response
    };
}

function forbidPreparedStripeInvoke() {
    return {
        invoke: false,
        invoked: false,
        execute: false,
        createReversal: false,
        createRefund: false
    };
}

function admitPostTransferExecution({ admin, request, decision, payment, milestone }) {
    const denied = forbidPreparedStripeInvoke();
    if (!canApprovePostTransferRefund(admin)) {
        return { action: 'forbidden', http: 403, ...denied };
    }
    if (!request || request.status !== 'ADMIN_APPROVED') {
        return { action: 'reject', http: 409, code: 'REQUEST_NOT_APPROVED', ...denied };
    }
    if (!decision || decision.action !== 'ADMIN_APPROVED') {
        return { action: 'reject', http: 409, code: 'DECISION_NOT_APPROVED', ...denied };
    }
    const amount = decision.decided_amount_cents != null ? decision.decided_amount_cents : request.requested_cents;
    const breakdown = preparePostTransferRefundBreakdown(payment, amount);
    if (!breakdown.ok) {
        return { action: 'reject', http: 400, code: breakdown.code, ...denied };
    }
    const operationId = decision.operation_id || request.operation_id;
    const keys = postTransferOperationKeys(operationId);
    if (!keys.ok) {
        return { action: 'reject', http: 400, code: keys.code, ...denied };
    }
    return {
        action: 'admit',
        http: 200,
        ...denied,
        operation_id: keys.operation_id,
        reversalKey: keys.reversalKey,
        refundKey: keys.refundKey,
        breakdown,
        decided_amount_cents: breakdown.refund_amount_cents,
        milestone_ok: Boolean(milestone)
    };
}

function claimPostTransferExecutionLock({ payment, milestone, breakdown, operationId, holderOperationId }) {
    const denied = forbidPreparedStripeInvoke();
    const keys = postTransferOperationKeys(operationId);
    if (!keys.ok) return { action: 'reject', code: keys.code, ...denied };
    const liveHolder = payment && (payment.reversal_lock || payment.refund_lock)
        ? payment.post_transfer_operation_id
        : holderOperationId;
    if (liveHolder && liveHolder !== keys.operation_id) {
        return { action: 'reject', code: 'EXECUTION_IN_PROGRESS', ...denied };
    }
    if (payment && payment.reversal_lock && payment.post_transfer_operation_id === keys.operation_id) {
        return {
            action: 'resume',
            code: 'REVERSAL_PROCESSING',
            ...denied,
            operation_id: keys.operation_id,
            reversalKey: keys.reversalKey,
            refundKey: keys.refundKey,
            reservation: payment.reversal_lock
        };
    }
    if (payment && payment.refund_lock && payment.post_transfer_operation_id === keys.operation_id) {
        return {
            action: 'resume',
            code: 'REFUND_PROCESSING',
            ...denied,
            operation_id: keys.operation_id,
            reversalKey: keys.reversalKey,
            refundKey: keys.refundKey,
            reservation: payment.refund_lock
        };
    }
    const reversal = planReversalLock(
        payment,
        milestone,
        breakdown && breakdown.reversal_amount_cents,
        keys.operation_id
    );
    return {
        ...reversal,
        ...denied,
        createReversal: false,
        action: reversal.action === 'resume' ? 'resume' : reversal.action,
        operation_id: keys.operation_id,
        reversalKey: keys.reversalKey,
        refundKey: keys.refundKey,
        reservation: (payment && payment.reversal_lock) || reversalReservationId(payment && payment.id)
    };
}

function prepareTransfersCreateReversal({ payment, breakdown, operationId }) {
    const keys = postTransferOperationKeys(operationId);
    const denied = forbidPreparedStripeInvoke();
    if (!keys.ok) return { ok: false, code: keys.code, ...denied };
    if (!payment || !payment.stripe_transfer_id) {
        return { ok: false, code: 'TRANSFER_ID_REQUIRED', ...denied };
    }
    return {
        ok: true,
        ...denied,
        method: 'transfers.createReversal',
        transfer: payment.stripe_transfer_id,
        amount: breakdown && breakdown.reversal_amount_cents,
        idempotencyKey: keys.reversalKey,
        operation_id: keys.operation_id
    };
}

function prepareRefundsCreate({ payment, breakdown, operationId }) {
    const keys = postTransferOperationKeys(operationId);
    const denied = forbidPreparedStripeInvoke();
    if (!keys.ok) return { ok: false, code: keys.code, ...denied };
    if (!payment || (!payment.stripe_payment_intent_id && !payment.stripe_charge_id)) {
        return { ok: false, code: 'CHARGE_OR_INTENT_REQUIRED', ...denied };
    }
    return {
        ok: true,
        ...denied,
        method: 'refunds.create',
        payment_intent: payment.stripe_payment_intent_id || null,
        charge: payment.stripe_charge_id || null,
        amount: breakdown && breakdown.refund_amount_cents,
        idempotencyKey: keys.refundKey,
        operation_id: keys.operation_id
    };
}

function invokePreparedStripeCall(prepared) {
    return {
        invoked: false,
        execute: false,
        createReversal: false,
        createRefund: false,
        method: prepared && prepared.method,
        idempotencyKey: prepared && prepared.idempotencyKey,
        code: 'STRIPE_INVOKE_FORBIDDEN'
    };
}

function applyConfirmedFinancialCounters(payment, breakdown, { stripeRefundId, stripeReversalId }) {
    if (!breakdown || !breakdown.ok) return { ok: false, code: 'BREAKDOWN_REQUIRED' };
    if (!isConfirmedRefundId(stripeRefundId) || !isConfirmedReversalId(stripeReversalId)) {
        return { ok: false, code: 'CONFIRMATION_REQUIRED' };
    }
    const ledger = persistedRefundLedger(payment);
    const amountRefunded = Number(ledger.amount_refunded_cents) + breakdown.refund_amount_cents;
    const netReversed = Number(ledger.provider_net_reversed_cents) + breakdown.reversal_amount_cents;
    const remainingCustomer = Number(ledger.customer_total_cents) - amountRefunded;
    const remainingNet = Number(ledger.provider_net_cents) - netReversed;
    return {
        ok: true,
        patch: {
            amount_refunded_cents: amountRefunded,
            customer_fee_refunded_cents: Number(ledger.customer_fee_refunded_cents) + breakdown.breakdown.refunded_customer_fee_cents,
            service_refunded_cents: Number(ledger.service_refunded_cents) + breakdown.breakdown.refunded_service_cents,
            provider_fee_reversed_cents: Number(ledger.provider_fee_reversed_cents) + breakdown.breakdown.reversed_provider_fee_cents,
            provider_net_reversed_cents: netReversed,
            stripe_refund_id: stripeRefundId,
            stripe_reversal_id: stripeReversalId,
            payment_status: remainingCustomer > 0 ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
            transfer_status: remainingNet > 0 ? 'PARTIALLY_REVERSED' : 'REVERSED'
        }
    };
}

function postTransferExecutionCompleted({ payment, adjustment, operationId }) {
    const keys = postTransferOperationKeys(operationId);
    if (!keys.ok || !adjustment) return false;
    return adjustment.operation_id === keys.operation_id
        && isConfirmedRefundId(adjustment.stripe_refund_id)
        && isConfirmedReversalId(adjustment.stripe_reversal_id)
        && Boolean(payment && payment.stripe_refund_id === adjustment.stripe_refund_id);
}

function claimPostTransferAdminDecision(request) {
    if (!request) return { action: 'not_found', http: 404, execute: false, createReversal: false, createRefund: false };
    if (request.status === 'ADMIN_APPROVED' || request.status === 'ADMIN_REJECTED') {
        return {
            action: 'already',
            http: 200,
            idempotent: true,
            nextStatus: request.status,
            execute: false,
            createReversal: false,
            createRefund: false
        };
    }
    if (request.status !== 'OPEN' && request.status !== 'PROVIDER_REPLIED') {
        return { action: 'reject', http: 409, code: 'REQUEST_NOT_OPEN', execute: false, createReversal: false, createRefund: false };
    }
    return { action: 'acquire', http: 200, execute: false, createReversal: false, createRefund: false };
}

function postTransferRefundApproveDecision({ admin, payment, milestone, requestedCents }) {
    if (!canApprovePostTransferRefund(admin)) {
        return { action: 'forbidden', http: 403, execute: false, createReversal: false, createRefund: false };
    }
    if (!payment || !milestone) return { action: 'not_found', http: 404, execute: false, createReversal: false, createRefund: false };
    if (milestone.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { action: 'reject', http: 409, code: 'DISPUTED', execute: false, createReversal: false, createRefund: false };
    }
    const prep = preparePostTransferRefundBreakdown(payment, requestedCents);
    if (!prep.ok) return { action: 'reject', http: 400, code: prep.code, execute: false, createReversal: false, createRefund: false };
    const reversal = planReversalLock(payment, milestone, prep.reversal_amount_cents);
    const refund = planPostTransferRefundLock(payment, milestone, prep);
    return {
        action: 'propose',
        http: 200,
        execute: false,
        createReversal: false,
        createRefund: false,
        intendedReversal: reversal,
        intendedRefund: refund,
        breakdown: prep,
        code: 'POST_TRANSFER_EXECUTE_NOT_IN_SCOPE'
    };
}

function paymentAdjustmentAppendRow({ paymentId, breakdown, stripeRefundId, stripeReversalId, disputeId, operationId }) {
    if (!breakdown || !breakdown.ok) return { ok: false, code: 'BREAKDOWN_REQUIRED' };
    if (isRefundReservation(stripeRefundId) || isPostTransferRefundReservation(stripeRefundId) || isReversalReservation(stripeReversalId)) {
        return { ok: false, code: 'RESERVATION_NOT_LEDGERABLE' };
    }
    const operation = stableOperationId(operationId);
    if (!operation.ok) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
    return {
        ok: true,
        row: {
            payment_id: paymentId,
            dispute_id: disputeId || null,
            operation_id: operation.id,
            refund_amount_cents: breakdown.refund_amount_cents,
            adjusted_service_amount_cents: breakdown.breakdown.refunded_service_cents,
            adjusted_customer_fee_cents: breakdown.breakdown.refunded_customer_fee_cents,
            adjusted_customer_total_cents: breakdown.refund_amount_cents,
            adjusted_provider_fee_cents: breakdown.breakdown.reversed_provider_fee_cents,
            adjusted_provider_net_cents: breakdown.breakdown.reversed_provider_net_cents,
            stripe_refund_id: stripeRefundId || null,
            stripe_reversal_id: stripeReversalId || null
        }
    };
}

function postTransferWebhookPersistEnabled() {
    return false;
}

function postTransferWebhookEvents() {
    return ['transfer.reversed', 'charge.refunded'];
}

function claimOpenPostTransferRequest({ existingOpen }) {
    const open = (existingOpen || []).filter((row) => row && (row.status === 'OPEN' || row.status === 'PROVIDER_REPLIED'));
    if (open.length) {
        return {
            action: 'already',
            http: 200,
            idempotent: true,
            requestId: open[0].id,
            rejectedDuplicates: Math.max(0, open.length),
            execute: false,
            createReversal: false,
            createRefund: false
        };
    }
    return { action: 'insert', http: 200, execute: false, createReversal: false, createRefund: false };
}

function postTransferRefundRequestRow({
    requestId,
    payment,
    milestone,
    requesterId,
    providerId,
    requestedCents,
    reason
}) {
    const prep = preparePostTransferRefundBreakdown(payment, requestedCents);
    if (!prep.ok) return { ok: false, code: prep.code };
    const id = String(requestId || '').trim();
    if (!id) return { ok: false, code: 'REQUEST_ID_REQUIRED' };
    return {
        ok: true,
        row: {
            id,
            payment_id: payment && payment.id,
            milestone_id: milestone && milestone.id,
            requester_id: requesterId,
            provider_id: providerId,
            requested_cents: prep.refund_amount_cents,
            reason: reason || null,
            status: 'OPEN',
            provider_response: null,
            decided_by: null,
            decided_at: null
        },
        breakdown: prep
    };
}

function postTransferDecisionHistoryEntry({
    actorId,
    action,
    requestId,
    operationId,
    reason,
    requestedCents,
    decidedAmountCents
}) {
    return {
        actor_id: actorId || null,
        action: action || null,
        request_id: requestId || null,
        operation_id: operationId || null,
        reason: reason || null,
        requested_cents: requestedCents == null ? null : Number(requestedCents),
        decided_amount_cents: decidedAmountCents == null ? null : Number(decidedAmountCents),
        execute: false,
        createReversal: false,
        createRefund: false
    };
}

function postTransferRefundRejectDecision({ admin, request, reason, actorId }) {
    if (!canApprovePostTransferRefund(admin)) {
        return { action: 'forbidden', http: 403, execute: false, createReversal: false, createRefund: false };
    }
    if (!request || (request.status !== 'OPEN' && request.status !== 'PROVIDER_REPLIED')) {
        return { action: 'reject', http: 409, code: 'REQUEST_NOT_OPEN', execute: false, createReversal: false, createRefund: false };
    }
    const note = String(reason || '').trim();
    if (!note) {
        return { action: 'reject', http: 400, code: 'REASON_REQUIRED', execute: false, createReversal: false, createRefund: false };
    }
    return {
        action: 'record_rejection',
        http: 200,
        execute: false,
        createReversal: false,
        createRefund: false,
        nextStatus: 'ADMIN_REJECTED',
        history: postTransferDecisionHistoryEntry({
            actorId,
            action: 'ADMIN_REJECTED',
            requestId: request.id,
            reason: note,
            requestedCents: request.requested_cents
        })
    };
}

function postTransferRefundDecideDecision({ admin, payment, milestone, request, requestedCents, actorId, operationId }) {
    const approve = postTransferRefundApproveDecision({ admin, payment, milestone, requestedCents });
    if (approve.action !== 'propose') return approve;
    const keys = postTransferOperationKeys(operationId);
    if (!keys.ok) {
        return { action: 'reject', http: 400, code: keys.code, execute: false, createReversal: false, createRefund: false };
    }
    if (request && request.status !== 'OPEN' && request.status !== 'PROVIDER_REPLIED') {
        return { action: 'reject', http: 409, code: 'REQUEST_NOT_OPEN', execute: false, createReversal: false, createRefund: false };
    }
    const intendedReversal = planReversalLock(payment, milestone, approve.breakdown.reversal_amount_cents, keys.operation_id);
    const intendedRefund = planPostTransferRefundLock(payment, milestone, approve.breakdown, keys.operation_id);
    return {
        ...approve,
        action: 'record_approval',
        execute: false,
        createReversal: false,
        createRefund: false,
        nextStatus: 'ADMIN_APPROVED',
        operation_id: keys.operation_id,
        reversalKey: keys.reversalKey,
        refundKey: keys.refundKey,
        intendedReversal,
        intendedRefund,
        history: postTransferDecisionHistoryEntry({
            actorId,
            action: 'ADMIN_APPROVED',
            requestId: request && request.id,
            operationId: keys.operation_id,
            requestedCents: request && request.requested_cents,
            decidedAmountCents: approve.breakdown.refund_amount_cents
        })
    };
}

function postTransferLedgerConsistent(payment, adjustments) {
    const ledger = persistedRefundLedger(payment);
    const summed = sumPaymentAdjustments(adjustments);
    return {
        ok: Number(ledger.amount_refunded_cents) === summed.refund_amount_cents
            && Number(ledger.provider_net_reversed_cents) === summed.adjusted_provider_net_cents,
        payment_refunded_cents: Number(ledger.amount_refunded_cents),
        ledger_refunded_cents: summed.refund_amount_cents,
        payment_reversed_net_cents: Number(ledger.provider_net_reversed_cents),
        ledger_reversed_net_cents: summed.adjusted_provider_net_cents
    };
}

function postTransferConsistency(payment) {
    if (!payment || !paymentHasTransfer(payment)) return { ok: true, code: 'NOT_TRANSFERRED' };
    const refundConfirmed = isConfirmedRefundId(payment.stripe_refund_id)
        || payment.payment_status === 'REFUNDED'
        || payment.payment_status === 'PARTIALLY_REFUNDED';
    const reversalConfirmed = isConfirmedReversalId(payment.stripe_reversal_id)
        || payment.transfer_status === 'REVERSED'
        || payment.transfer_status === 'PARTIALLY_REVERSED';
    const reversalInFlight = isReversalReservation(payment.stripe_reversal_id)
        || payment.transfer_status === 'REVERSAL_PROCESSING';
    if (refundConfirmed && recoverableProviderNetCents(payment) > 0n && !reversalConfirmed) {
        return {
            ok: false,
            code: reversalInFlight ? 'REFUND_AHEAD_OF_REVERSAL' : 'REFUND_WITHOUT_REVERSAL',
            createReversal: false,
            createRefund: false
        };
    }
    if (reversalConfirmed && !refundConfirmed && refundableCustomerCents(payment) > 0n) {
        return { ok: true, code: 'REVERSED_AWAITING_REFUND', createReversal: false, createRefund: false };
    }
    return { ok: true, code: 'CONSISTENT', createReversal: false, createRefund: false };
}

function routePostTransferWebhook(event, payment) {
    const type = event && event.type;
    const admitted = ['transfer.reversed', 'charge.refunded'].includes(String(type || ''));
    if (!admitted) {
        return { action: 'ignore', persist: false, createReversal: false, createRefund: false, code: 'EVENT_NOT_IN_SCOPE' };
    }
    if (type === 'transfer.reversed') {
        const synced = applyTransferReversed(payment, event.data && event.data.object);
        return { ...synced, persist: false, createReversal: false, createRefund: false };
    }
    const synced = applyPostTransferChargeRefunded(payment, event.data && event.data.object);
    const consistency = postTransferConsistency({
        ...payment,
        stripe_refund_id: synced.stripe_refund_id || (payment && payment.stripe_refund_id),
        payment_status: synced.payment_status || (payment && payment.payment_status)
    });
    return {
        ...synced,
        persist: false,
        createReversal: false,
        createRefund: false,
        consistency
    };
}

function postTransferWebhookPersistDecision(decision) {
    return {
        persist: false,
        apply: false,
        createReversal: false,
        createRefund: false,
        intended: decision || null
    };
}

function raiseDisputeDecision({ authUid, requesterId, milestone, payment }) {
    if (!canValidateRelease(authUid, requesterId)) {
        return { action: 'forbidden', http: 403, freeze: false };
    }
    if (!milestone || !payment) return { action: 'not_found', http: 404, freeze: false };
    if (milestone.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { action: 'already', http: 200, freeze: true, idempotent: true };
    }
    if (milestone.status !== 'COMPLETED') {
        return { action: 'reject', http: 400, code: 'MILESTONE_NOT_COMPLETED', freeze: false };
    }
    if (payment.client_validated_at) {
        return { action: 'reject', http: 400, code: 'ALREADY_VALIDATED', freeze: false };
    }
    if (payment.payment_status !== 'SUCCEEDED' || payment.transfer_status !== 'PENDING_VALIDATION' || payment.stripe_transfer_id) {
        return { action: 'reject', http: 400, code: 'NOT_FREEZABLE', freeze: false };
    }
    return { action: 'freeze', http: 200, freeze: true };
}

function disputeDraftRow({ milestoneId, paymentId, requesterId, reason }) {
    return {
        milestone_id: milestoneId || null,
        payment_id: paymentId || null,
        opened_by: requesterId || null,
        reason: reason || null,
        status: 'OPEN',
        resolution: null
    };
}

function resolveDisputeDecision({ adminOk, action, payment }) {
    if (!adminOk) return { action: 'forbidden', http: 403 };
    const allowed = new Set(['refund_untransferred', 'resume_release_after_mediation', 'keep_frozen']);
    if (!allowed.has(String(action || ''))) {
        return { action: 'reject', http: 400, code: 'UNSUPPORTED_RESOLUTION' };
    }
    if (action === 'refund_untransferred' && (payment && (payment.stripe_transfer_id || payment.transfer_status === 'TRANSFERRED'))) {
        return { action: 'reject', http: 409, code: 'POST_TRANSFER_REFUND_NOT_IN_SCOPE' };
    }
    return { action: 'propose', http: 200, resolution: action, execute: false };
}

function stripeChargeId(value) {
    if (typeof value === 'string') {
        const id = value.trim();
        if (id.startsWith('ch_') || id.startsWith('py_')) return id;
        return null;
    }
    if (value && typeof value === 'object' && typeof value.id === 'string') {
        return stripeChargeId(value.id);
    }
    return null;
}

function persistableStripeChargeId(existing, incoming) {
    return stripeChargeId(existing) || stripeChargeId(incoming);
}

function canWebhookFundMilestone(status) {
    return status == null || status === 'PENDING' || status === 'IN_PROGRESS' || status === 'FUNDED';
}

function applyPaymentProcessing(payment) {
    const status = payment && payment.payment_status;
    const transfer = payment && payment.transfer_status;
    const terminal = status === 'SUCCEEDED' || status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED'
        || status === 'FAILED' || status === 'DISPUTED';
    const transferred = transfer === 'TRANSFERRED' || transfer === 'REVERSED' || transfer === 'PARTIALLY_REVERSED'
        || Boolean(payment && payment.stripe_transfer_id);
    if (!payment || terminal || transferred) {
        return { apply: false, preserve: true, payment_status: status || null };
    }
    if (status && status !== 'CREATED' && status !== 'REQUIRES_ACTION') {
        return { apply: false, preserve: true, payment_status: status };
    }
    return { apply: true, preserve: false, payment_status: 'PROCESSING' };
}

function applyPaymentFailed(payment) {
    const status = payment && payment.payment_status;
    const transfer = payment && payment.transfer_status;
    const terminal = status === 'SUCCEEDED' || status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED' || status === 'DISPUTED';
    const transferred = transfer === 'TRANSFERRED' || Boolean(payment && payment.stripe_transfer_id);
    if (!payment || terminal || transferred) {
        return { apply: false, preserve: true, payment_status: status || null };
    }
    return { apply: true, preserve: false, payment_status: 'FAILED' };
}

function applyChargeRefunded(payment, charge) {
    if (paymentHasTransfer(payment)) {
        const post = applyPostTransferChargeRefunded(payment, charge);
        return { ...post, persist: postTransferWebhookPersistEnabled() && post.apply };
    }
    const incomingId = charge && charge.refunds && charge.refunds.data && charge.refunds.data[0] && charge.refunds.data[0].id;
    if (!payment) return { apply: false, action: 'ignore', createRefund: false };
    if (payment.payment_status === 'REFUNDED' && payment.stripe_refund_id && !isRefundReservation(payment.stripe_refund_id)) {
        return { apply: false, action: 'already_synced', createRefund: false };
    }
    if (isRefundReservation(payment.stripe_refund_id) && incomingId) {
        return {
            apply: true,
            action: 'complete_reservation',
            createRefund: false,
            payment_status: 'REFUNDED',
            stripe_refund_id: incomingId
        };
    }
    return { apply: false, action: 'observe', createRefund: false };
}

function webhookSigningSecrets(env = process.env) {
    const secrets = [];
    for (const name of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_CLI_WEBHOOK_SECRET']) {
        const value = env && env[name];
        if (value && !secrets.includes(value)) secrets.push(value);
    }
    return secrets;
}

function constructStripeWebhookEvent(stripe, rawBody, signature, env = process.env) {
    const secrets = webhookSigningSecrets(env);
    if (!stripe || !secrets.length) {
        return { ok: false, code: 'STRIPE_WEBHOOK_CONFIG_MISSING' };
    }
    let lastError = null;
    for (const secret of secrets) {
        try {
            return { ok: true, event: stripe.webhooks.constructEvent(rawBody, signature, secret) };
        } catch (error) {
            lastError = error;
        }
    }
    return { ok: false, code: 'STRIPE_SIGNATURE_INVALID', error: lastError };
}

function paymentWritePaths() {
    return [
        '/v1/payments/create-milestone-intent',
        '/v1/payments/customer-session',
        '/v1/payments/saved-cards',
        '/v1/payments/refund-untransferred',
        '/v1/payments/post-transfer-refund-requests',
        '/v1/admin/post-transfer-refund-requests',
        '/v1/admin/post-transfer-refund-requests/:id/execute',
        '/v1/milestones/start-work',
        '/v1/milestones/submit-completion',
        '/v1/milestones/release-payment',
        '/v1/milestones/claim-transfer',
        '/v1/milestones/raise-dispute',
        '/v1/payments/webhook',
        '/v1/webhooks/stripe',
        '/payments/webhook',
        '/webhooks/stripe'
    ];
}

function applyPaymentSucceeded(payment, intent) {
    const charged = Number(intent?.amount);
    const expected = Number(payment?.customer_total_cents);
    if (!Number.isFinite(charged) || charged !== expected) return { ok: false, code: 'AMOUNT_MISMATCH' };
    const status = payment && payment.payment_status;
    if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED' || status === 'DISPUTED') {
        return {
            ok: true,
            idempotent: true,
            apply: false,
            preserve_payment: true,
            preserve_transfer: true,
            payment_status: status,
            transfer_status: payment.transfer_status || null,
            milestone_status: null,
            stripe_charge_id: payment.stripe_charge_id || null,
            code: 'TERMINAL_PAYMENT_PRESERVED'
        };
    }
    if (status === 'SUCCEEDED') {
        return {
            ok: true,
            idempotent: true,
            payment_status: 'SUCCEEDED',
            transfer_status: payment.transfer_status || 'PENDING_VALIDATION',
            milestone_status: canWebhookFundMilestone(payment.milestone_status) ? 'FUNDED' : null,
            stripe_charge_id: persistableStripeChargeId(payment.stripe_charge_id, intent && intent.latest_charge),
            preserve_transfer: true
        };
    }
    return {
        ok: true,
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        milestone_status: 'FUNDED',
        stripe_charge_id: persistableStripeChargeId(payment.stripe_charge_id, intent && intent.latest_charge)
    };
}

function applyChargeDisputeCreated(payment) {
    if (!payment) return { apply: false, action: 'ignore', createRefund: false, createReversal: false };
    if (payment.payment_status === 'DISPUTED') {
        return { apply: false, action: 'already', createRefund: false, createReversal: false };
    }
    if (payment.payment_status === 'REFUNDED') {
        return { apply: false, action: 'observe_refunded', createRefund: false, createReversal: false };
    }
    if (isRefundReservation(payment.stripe_refund_id)) {
        return {
            apply: true,
            action: 'freeze_refund_in_flight',
            payment_status: 'DISPUTED',
            freeze_transfer: true,
            createRefund: false,
            createReversal: false
        };
    }
    if (payment.transfer_status === 'TRANSFERRED' || payment.stripe_transfer_id) {
        return {
            apply: true,
            action: 'freeze_after_transfer',
            payment_status: 'DISPUTED',
            freeze_transfer: true,
            createRefund: false,
            createReversal: false
        };
    }
    return {
        apply: true,
        action: 'freeze',
        payment_status: 'DISPUTED',
        freeze_transfer: true,
        createRefund: false,
        createReversal: false
    };
}

function applyChargeDisputeUpdated(payment) {
    return applyChargeDisputeCreated(payment);
}

function applyChargeDisputeClosed(payment) {
    if (!payment) return { apply: false, action: 'ignore', createRefund: false, createReversal: false };
    return {
        apply: false,
        action: 'observe',
        payment_status: payment.payment_status || null,
        createRefund: false,
        createReversal: false,
        code: 'DISPUTE_CLOSE_REQUIRES_OPERATOR'
    };
}

function classifyStripeDbGap({ payment, request, listedReversals, listedRefunds }) {
    if (!payment) return { code: 'PAYMENT_MISSING', create: false };
    const reversals = listedReversals || [];
    const refunds = listedRefunds || [];
    if (payment.payment_status !== 'SUCCEEDED' && !payment.stripe_charge_id && payment.stripe_payment_intent_id) {
        return { code: 'INTENT_MAY_NEED_WEBHOOK', create: false };
    }
    if (payment.stripe_transfer_id && payment.transfer_status !== 'TRANSFERRED' && payment.transfer_status !== 'REVERSED' && payment.transfer_status !== 'PARTIALLY_REVERSED') {
        return { code: 'TRANSFER_DB_NOT_FINALIZED', create: false };
    }
    if (reversals.length === 1 && !isConfirmedReversalId(payment.stripe_reversal_id)) {
        return { code: 'REVERSAL_SQL_CONFIRM_MISSING', create: false, stripe_reversal_id: reversals[0].id };
    }
    if (refunds.length === 1 && !isConfirmedRefundId(payment.stripe_refund_id) && paymentHasTransfer(payment)) {
        return { code: 'REFUND_SQL_069_MISSING', create: false, stripe_refund_id: refunds[0].id };
    }
    if ((payment.reversal_lock || payment.refund_lock) && !request) {
        return { code: 'LOCK_KEPT_AFTER_TIMEOUT', create: false };
    }
    if (payment.stripe_reversal_id && reversals.length && reversals.every((row) => row.id !== payment.stripe_reversal_id)) {
        return { code: 'STRIPE_ID_FOREIGN', create: false };
    }
    return { code: 'CONSISTENT', create: false };
}

function financialAuditEvent(kind, fields) {
    const src = fields || {};
    return {
        kind: String(kind || 'financial'),
        at: src.at || new Date().toISOString(),
        payment_id: src.payment_id || null,
        request_id: src.request_id || null,
        operation_id: src.operation_id || null,
        stripe_pi: src.stripe_pi || src.stripe_payment_intent_id || null,
        stripe_charge: src.stripe_charge || src.stripe_charge_id || null,
        stripe_transfer: src.stripe_transfer || src.stripe_transfer_id || null,
        stripe_reversal: src.stripe_reversal || src.stripe_reversal_id || null,
        stripe_refund: src.stripe_refund || src.stripe_refund_id || null,
        sql_state: src.sql_state || null,
        error_code: src.error_code || null
    };
}

function webhookEventWriteRow(event) {
    const object = event && event.data ? event.data.object : null;
    return {
        stripe_event_id: event && event.id,
        event_type: event && event.type,
        status: 'processing',
        payload_summary: {
            object_id: object && object.id || null,
            object: object && object.object || null,
            amount: object && object.amount != null ? object.amount : null
        }
    };
}

function webhookEventLegacyPayloadRow(row) {
    return {
        stripe_event_id: row.stripe_event_id,
        event_type: row.event_type,
        status: row.status,
        payload: row.payload_summary
    };
}

function shouldFallbackWebhookPayloadColumn(error) {
    const message = String(error && error.message || '');
    return Boolean(error && (error.code === 'PGRST204' || /payload_summary/.test(message)));
}

function claimWebhookDecision(existing) {
    if (!existing) return { action: 'insert' };
    if (existing.status === 'processed') return { action: 'duplicate' };
    if (existing.status === 'failed' || existing.status === 'processing') return { action: 'retry' };
    // Rows written before the status column are already finished work.
    return { action: 'duplicate' };
}

function quoteFullyReleased(milestones) {
    return Array.isArray(milestones)
        && milestones.length > 0
        && milestones.every((milestone) => milestone && (milestone.status === 'RELEASED' || milestone.status === 'CANCELLED'));
}

const CUSTOMER_FEE_MINIMUM_CENTS = 149n;
const SETTLED_PAYMENT_STATUSES = new Set(['SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'REFUNDED']);

function serviceCentsFromAmount(amount) {
    const numStr = String(amount == null ? '' : amount).trim();
    const parts = numStr.split('.');
    const euros = BigInt(parts[0] || '0');
    const centsPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    const cents = BigInt(centsPart || '0');
    return euros * 100n + cents;
}

function halfUpPercent(cents, percent) {
    return (cents * BigInt(percent) + 50n) / 100n;
}

function calculateMilestonePricing(amount) {
    const service_amount_cents = typeof amount === 'bigint' ? amount : serviceCentsFromAmount(amount);
    if (service_amount_cents <= 0n) {
        throw new Error('Le montant de la partie doit être supérieur à 0 centime.');
    }
    const provider_fee_cents = halfUpPercent(service_amount_cents, 3);
    const customer_fee_cents = (() => {
        const raw = halfUpPercent(service_amount_cents, 3);
        return raw > CUSTOMER_FEE_MINIMUM_CENTS ? raw : CUSTOMER_FEE_MINIMUM_CENTS;
    })();
    const customer_total_cents = service_amount_cents + customer_fee_cents;
    const provider_net_cents = service_amount_cents - provider_fee_cents;
    const lyann_revenue_cents = customer_fee_cents + provider_fee_cents;
    return {
        service_amount_cents,
        customer_fee_cents,
        customer_total_cents,
        provider_fee_cents,
        provider_net_cents,
        lyann_revenue_cents
    };
}

function paymentAmountSnapshot(source) {
    if (!source) return null;
    return {
        service_amount_cents: Number(source.service_amount_cents),
        customer_fee_cents: Number(source.customer_fee_cents),
        customer_total_cents: Number(source.customer_total_cents),
        provider_fee_cents: Number(source.provider_fee_cents),
        provider_net_cents: Number(source.provider_net_cents),
        lyann_revenue_cents: Number(source.lyann_revenue_cents)
    };
}

function resumePaymentDecision(payment) {
    if (!payment) return { action: 'create' };
    const settled = SETTLED_PAYMENT_STATUSES.has(payment.payment_status)
        || payment.transfer_status === 'TRANSFERRED'
        || Boolean(payment.stripe_transfer_id);
    if (settled) return { action: 'refuse', code: 'PAIEMENT_DEJA_SECURISE' };
    if (payment.stripe_payment_intent_id) return { action: 'reuse', code: 'EXISTING_INTENT' };
    if (payment.payment_status === 'CREATED' || payment.payment_status === 'REQUIRES_ACTION' || payment.payment_status === 'PROCESSING') {
        return { action: 'attach', code: 'ORPHAN_CREATED' };
    }
    return { action: 'refuse', code: 'PAIEMENT_DEJA_SECURISE' };
}

function legacyPaymentColumns(financials) {
    return {
        amount_gross_cents: Number(financials.customer_total_cents),
        amount_platform_fee_cents: Number(financials.lyann_revenue_cents),
        amount_provider_net_cents: Number(financials.provider_net_cents)
    };
}

const STAGING_V2_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const STAGING_RETURN_FALLBACK = 'http://127.0.0.1:8098/feed.html?action=finances&connect=return';
const PRODUCTION_RETURN_FALLBACK = 'https://lyann.app/';

function envSupabaseRef(env) {
    const raw = (env && (env.LYANN_SUPABASE_URL || env.SUPABASE_URL)) || '';
    try {
        return new URL(String(raw).replace(/\/$/, '')).hostname.replace(/\.supabase\.co$/i, '');
    } catch (_) {
        return '';
    }
}

function isStagingV2ReturnEnv(env) {
    return envSupabaseRef(env) === STAGING_V2_REF;
}

function stagingPublicOrigin(env) {
    const raw = String((env && env.LYANN_STAGING_PUBLIC_ORIGIN) || '').trim().replace(/\/$/, '');
    if (!raw) return '';
    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:') return '';
        if (host === 'lyann.app' || host === 'www.lyann.app' || host === 'admin.lyann.app') return '';
        return url.origin;
    } catch (_) {
        return '';
    }
}

function stagingBrowserOriginAllowed(origin, env) {
    if (!origin) return true;
    const allowed = new Set([
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
        'https://localhost',
        'http://127.0.0.1:8098'
    ]);
    const pub = stagingPublicOrigin(env);
    if (pub) allowed.add(pub);
    if (env && (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development')) {
        [env.VERCEL_URL, env.VERCEL_BRANCH_URL].forEach((host) => {
            const name = String(host || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (name && name.endsWith('.vercel.app')) allowed.add('https://' + name);
        });
    }
    return allowed.has(String(origin));
}

function safeStripeReturnUrl(value, env) {
    const runtime = env || {};
    if (isStagingV2ReturnEnv(runtime)) {
        try {
            const url = new URL(String(value || STAGING_RETURN_FALLBACK));
            if (url.hostname === 'lyann.app' || url.hostname === 'www.lyann.app') {
                const mode = url.searchParams.get('connect') === 'refresh' ? 'refresh' : 'return';
                return 'http://127.0.0.1:8098/feed.html?action=finances&connect=' + mode;
            }
            const pub = stagingPublicOrigin(runtime);
            if (pub && url.origin === pub && (url.pathname === '/' || url.pathname === '/feed.html')) {
                const connect = url.searchParams.get('connect');
                if (!connect || connect === 'return' || connect === 'refresh') return url.toString();
            }
            const port = url.port || (url.protocol === 'http:' ? '80' : '443');
            const localOk = url.protocol === 'http:' && url.hostname === '127.0.0.1' && port === '8098';
            const nativeOk = url.protocol === 'capacitor:' || url.protocol === 'ionic:';
            if (localOk || nativeOk) return url.toString();
        } catch (_) {}
        return STAGING_RETURN_FALLBACK;
    }
    try {
        const url = new URL(String(value || PRODUCTION_RETURN_FALLBACK));
        const hostOk = url.protocol === 'https:' && (url.hostname === 'lyann.app' || url.hostname === 'www.lyann.app');
        const nativeOk = url.protocol === 'capacitor:' || url.protocol === 'ionic:';
        if (hostOk || nativeOk) return url.toString();
    } catch (_) {}
    return PRODUCTION_RETURN_FALLBACK;
}

module.exports = {
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
    canDeclareWorkDone,
    canValidateRelease,
    canClaimTransfer,
    transferIdempotencyKey,
    transferLockAcquireFrom,
    transferLockAllows,
    planTransferLock,
    stripeTransferFailureAction,
    refundReservationId,
    isRefundReservation,
    refundIdempotencyKey,
    refundAmountFromPayment,
    planRefundLock,
    refundAccessDecision,
    stripeRefundFailureAction,
    reconcileRefundAfterFailure,
    refundReservePredicates,
    transferAcquirePredicates,
    financeLockPredicatesExclusive,
    refundTransferExclusion,
    POST_TRANSFER_REVERSAL_STATUSES,
    POST_TRANSFER_REFUND_STATUSES,
    POST_TRANSFER_REQUEST_STATUSES,
    postTransferFinancialExecutionEnabled,
    persistedRefundLedger,
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
    isConfirmedReversalId,
    reversalIdempotencyKey,
    postTransferRefundIdempotencyKey,
    planReversalLock,
    planPostTransferRefundLock,
    reconcileReversalAfterFailure,
    reconcilePostTransferRefundAfterFailure,
    applyTransferReversed,
    applyPostTransferChargeRefunded,
    reversalReservePredicates,
    postTransferRefundReservePredicates,
    sql067LockLimits,
    postTransferOperationExclusion,
    canApprovePostTransferRefund,
    postTransferRefundAccessDecision,
    postTransferRefundRequestDecision,
    postTransferRefundReplyDecision,
    postTransferRefundApproveDecision,
    paymentAdjustmentAppendRow,
    stableOperationId,
    reversalIdempotencyKeyForOperation,
    postTransferRefundIdempotencyKeyForOperation,
    postTransferOperationKeys,
    postTransferWebhookPersistEnabled,
    postTransferWebhookEvents,
    claimOpenPostTransferRequest,
    postTransferRefundRequestRow,
    postTransferDecisionHistoryEntry,
    postTransferRefundRejectDecision,
    postTransferRefundDecideDecision,
    claimPostTransferAdminDecision,
    forbidPreparedStripeInvoke,
    admitPostTransferExecution,
    claimPostTransferExecutionLock,
    prepareTransfersCreateReversal,
    prepareRefundsCreate,
    invokePreparedStripeCall,
    applyConfirmedFinancialCounters,
    postTransferExecutionCompleted,
    postTransferLedgerConsistent,
    postTransferConsistency,
    routePostTransferWebhook,
    postTransferWebhookPersistDecision,
    reversalIdFromStripeObject,
    raiseDisputeDecision,
    disputeDraftRow,
    resolveDisputeDecision,
    stripeChargeId,
    persistableStripeChargeId,
    canWebhookFundMilestone,
    applyPaymentProcessing,
    applyPaymentFailed,
    applyChargeRefunded,
    webhookSigningSecrets,
    constructStripeWebhookEvent,
    paymentWritePaths,
    alreadyTransferredPayment,
    releasePaymentDecision,
    classifyFinanceCircuit,
    admitStripeWebhookEvent,
    testWebhookFanoutRisk,
    evaluateTransfer,
    evaluateRefund,
    applyPaymentSucceeded,
    applyChargeDisputeCreated,
    applyChargeDisputeUpdated,
    applyChargeDisputeClosed,
    applyAccountUpdated,
    preTransferRefundExecutionEnabled,
    preTransferRefundClientOverride,
    preparePreTransferRefund,
    classifyPreTransferRefundBusiness,
    admitPreTransferRefundDispatch,
    classifyStripeDbGap,
    financialAuditEvent,
    webhookEventWriteRow,
    webhookEventLegacyPayloadRow,
    shouldFallbackWebhookPayloadColumn,
    claimWebhookDecision,
    safeStripeReturnUrl,
    stagingPublicOrigin,
    stagingBrowserOriginAllowed,
    STAGING_V2_REF,
    PRODUCTION_REF,
    STAGING_RETURN_FALLBACK,
    PRODUCTION_RETURN_FALLBACK,
    isStagingV2ReturnEnv
};
