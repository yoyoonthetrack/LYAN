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

function connectStatus(account) {
    const created = Boolean(account && account.id);
    const detailsSubmitted = account?.details_submitted === true;
    const chargesEnabled = account?.charges_enabled === true;
    const payoutsEnabled = account?.payouts_enabled === true;
    const transfersActive = account?.capabilities?.transfers === 'active';
    return {
        account_created: created,
        onboarding_completed: detailsSubmitted,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        transfers_active: transfersActive
    };
}

function connectPayoutReady(account) {
    const status = connectStatus(account);
    if (!status.account_created) return { ok: false, code: 'CONNECT_REQUIRED', status };
    if (!status.transfers_active || !status.payouts_enabled || !status.onboarding_completed) {
        return { ok: false, code: 'CONNECT_NOT_READY', status };
    }
    return { ok: true, code: 'READY', status };
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

function evaluateTransfer({ payment, milestone, providerAccountId, destinationAccountId }) {
    if (milestone?.status === 'DISPUTED' || payment?.payment_status === 'DISPUTED') {
        return { ok: false, code: 'DISPUTED' };
    }
    if (!payment || payment.payment_status !== 'SUCCEEDED') return { ok: false, code: 'NOT_FUNDED' };
    if (payment.transfer_status === 'TRANSFERRED' || payment.stripe_transfer_id) {
        return { ok: false, code: 'ALREADY_TRANSFERRED', idempotent: true, transferId: payment.stripe_transfer_id || null };
    }
    if (!providerAccountId) return { ok: false, code: 'CONNECT_REQUIRED' };
    if (destinationAccountId !== providerAccountId) return { ok: false, code: 'WRONG_CONNECT_ACCOUNT' };
    return {
        ok: true,
        code: 'READY',
        sourceTransaction: payment.stripe_charge_id || null
    };
}

function evaluateRefund(payment, milestone) {
    if (!payment) return { ok: false, code: 'PAYMENT_NOT_FOUND' };
    if (payment.payment_status === 'REFUNDED' || payment.stripe_refund_id) {
        return { ok: false, code: 'ALREADY_REFUNDED', idempotent: true, refundId: payment.stripe_refund_id || null };
    }
    if (milestone?.status === 'DISPUTED' || payment.payment_status === 'DISPUTED') {
        return { ok: false, code: 'DISPUTED' };
    }
    if (payment.payment_status !== 'SUCCEEDED') return { ok: false, code: 'NOT_FUNDED' };
    if (payment.transfer_status === 'TRANSFERRED' || payment.stripe_transfer_id) {
        return { ok: false, code: 'ALREADY_TRANSFERRED' };
    }
    if (payment.transfer_status === 'TRANSFER_PROCESSING') return { ok: false, code: 'TRANSFER_IN_PROGRESS' };
    return { ok: true, code: 'READY' };
}

function applyPaymentSucceeded(payment, intent) {
    const charged = Number(intent?.amount);
    const expected = Number(payment?.customer_total_cents);
    if (!Number.isFinite(charged) || charged !== expected) return { ok: false, code: 'AMOUNT_MISMATCH' };
    return {
        ok: true,
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        milestone_status: 'FUNDED',
        stripe_charge_id: intent.latest_charge || null
    };
}

function claimWebhookDecision(existing) {
    if (!existing) return { action: 'insert' };
    if (existing.status === 'processed') return { action: 'duplicate' };
    if (existing.status === 'failed' || existing.status === 'processing') return { action: 'retry' };
    // Rows written before the status column are already finished work.
    return { action: 'duplicate' };
}

function safeStripeReturnUrl(value) {
    const fallback = 'https://lyann.app/';
    try {
        const url = new URL(String(value || fallback));
        const hostOk = url.protocol === 'https:' && (url.hostname === 'lyann.app' || url.hostname === 'www.lyann.app');
        const nativeOk = url.protocol === 'capacitor:' || url.protocol === 'ionic:';
        if (hostOk || nativeOk) return url.toString();
    } catch (_) {}
    return fallback;
}

module.exports = {
    inspectStripeEnv,
    connectStatus,
    connectPayoutReady,
    providerCanBePaid,
    evaluateTransfer,
    evaluateRefund,
    applyPaymentSucceeded,
    claimWebhookDecision,
    safeStripeReturnUrl
};
