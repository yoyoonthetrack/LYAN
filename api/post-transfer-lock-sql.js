'use strict';

const { isConfirmedReversalId, isConfirmedRefundId } = require('./stripe-policy');

const ACQUIRE_REVERSAL_SQL = `
UPDATE payments
SET reversal_lock = 'pending_rv_' || id::text,
    post_transfer_operation_id = $1,
    transfer_status = 'REVERSAL_PROCESSING'
WHERE id = $2
  AND reversal_lock IS NULL
  AND refund_lock IS NULL
  AND transfer_status IN ('TRANSFERRED', 'PARTIALLY_REVERSED', 'REVERSAL_FAILED')
  AND payment_status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
  AND stripe_transfer_id IS NOT NULL
RETURNING id, reversal_lock, refund_lock, post_transfer_operation_id, stripe_reversal_id, transfer_status
`;

const RESUME_REVERSAL_SQL = `
SELECT id, reversal_lock, refund_lock, post_transfer_operation_id, stripe_reversal_id, transfer_status
FROM payments
WHERE id = $2
  AND post_transfer_operation_id = $1
  AND reversal_lock = ('pending_rv_' || id::text)
`;

const CONFIRM_REVERSAL_SQL = `
UPDATE payments
SET stripe_reversal_id = $3,
    transfer_status = $4,
    reversal_lock = NULL,
    refund_lock = 'pending_re_after_' || id::text
WHERE id = $2
  AND post_transfer_operation_id = $1
  AND reversal_lock = ('pending_rv_' || id::text)
  AND refund_lock IS NULL
  AND $3 NOT LIKE 'pending_rv_%'
RETURNING id, reversal_lock, refund_lock, post_transfer_operation_id, stripe_reversal_id, transfer_status
`;

const RESUME_REFUND_SQL = `
SELECT id, reversal_lock, refund_lock, post_transfer_operation_id, stripe_refund_id, stripe_reversal_id
FROM payments
WHERE id = $2
  AND post_transfer_operation_id = $1
  AND refund_lock = ('pending_re_after_' || id::text)
`;

const CONFIRM_REFUND_SQL = `
UPDATE payments
SET stripe_refund_id = $3,
    payment_status = $4,
    amount_refunded_cents = amount_refunded_cents + $5,
    customer_fee_refunded_cents = customer_fee_refunded_cents + $6,
    service_refunded_cents = service_refunded_cents + $7,
    provider_fee_reversed_cents = provider_fee_reversed_cents + $8,
    provider_net_reversed_cents = provider_net_reversed_cents + $9,
    refund_lock = NULL,
    post_transfer_operation_id = NULL
WHERE id = $2
  AND post_transfer_operation_id = $1
  AND refund_lock = ('pending_re_after_' || id::text)
  AND (amount_refunded_cents + $5) <= customer_total_cents
  AND $3 NOT LIKE 'pending_re_%'
RETURNING id, stripe_refund_id, stripe_reversal_id, payment_status, amount_refunded_cents, refund_lock, post_transfer_operation_id
`;

const MARK_EXECUTED_SQL = `
UPDATE post_transfer_refund_requests
SET executed_at = now(),
    execution_operation_id = $1
WHERE id = $2
  AND status = 'ADMIN_APPROVED'
  AND executed_at IS NULL
RETURNING id, executed_at, execution_operation_id
`;

function inflightHolder(payment) {
    if (!payment) return null;
    if (payment.reversal_lock || payment.refund_lock) return payment.post_transfer_operation_id || null;
    return null;
}

function applyAcquireReversal(payment, operationId) {
    if (!payment) return { action: 'reject', code: 'PAYMENT_NOT_FOUND', rowCount: 0 };
    const expected = 'pending_rv_' + payment.id;
    if (payment.reversal_lock === expected && payment.post_transfer_operation_id === operationId) {
        return { action: 'resume', rowCount: 0, payment };
    }
    if (payment.reversal_lock || payment.refund_lock) {
        if (payment.post_transfer_operation_id && payment.post_transfer_operation_id !== operationId) {
            return { action: 'reject', code: 'EXECUTION_IN_PROGRESS', rowCount: 0, payment };
        }
        if (payment.post_transfer_operation_id === operationId && payment.refund_lock) {
            return { action: 'resume_refund', rowCount: 0, payment };
        }
        return { action: 'reject', code: 'EXECUTION_IN_PROGRESS', rowCount: 0, payment };
    }
    if (!['TRANSFERRED', 'PARTIALLY_REVERSED', 'REVERSAL_FAILED'].includes(payment.transfer_status)) {
        return { action: 'reject', code: 'NOT_ACQUIRABLE', rowCount: 0, payment };
    }
    if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.payment_status)) {
        return { action: 'reject', code: 'NOT_ACQUIRABLE', rowCount: 0, payment };
    }
    if (!payment.stripe_transfer_id) return { action: 'reject', code: 'NOT_ACQUIRABLE', rowCount: 0, payment };
    const previousStripe = payment.stripe_reversal_id;
    payment.reversal_lock = expected;
    payment.post_transfer_operation_id = operationId;
    payment.transfer_status = 'REVERSAL_PROCESSING';
    return {
        action: 'acquire',
        rowCount: 1,
        payment,
        preserved_stripe_reversal_id: previousStripe
    };
}

function applyConfirmReversal(payment, operationId, reversalId, nextStatus) {
    if (!isConfirmedReversalId(reversalId)) {
        return { action: 'reject', code: 'CONFIRMATION_REQUIRED', rowCount: 0, payment };
    }
    if (!payment || payment.post_transfer_operation_id !== operationId || !payment.reversal_lock) {
        return { action: 'reject', code: 'UNKNOWN_OPERATION', rowCount: 0, payment };
    }
    payment.stripe_reversal_id = reversalId;
    payment.transfer_status = nextStatus || (payment.transfer_status === 'REVERSAL_PROCESSING' ? 'REVERSED' : payment.transfer_status);
    payment.reversal_lock = null;
    payment.refund_lock = 'pending_re_after_' + payment.id;
    return { action: 'confirm', rowCount: 1, payment };
}

function applyConfirmRefund(payment, operationId, refundId, patch) {
    if (!isConfirmedRefundId(refundId)) {
        return { action: 'reject', code: 'CONFIRMATION_REQUIRED', rowCount: 0, payment };
    }
    if (!payment || payment.post_transfer_operation_id !== operationId || !payment.refund_lock) {
        return { action: 'reject', code: 'UNKNOWN_OPERATION', rowCount: 0, payment };
    }
    const nextRefunded = Number(patch.amount_refunded_cents);
    if (nextRefunded > Number(payment.customer_total_cents || 0)) {
        return { action: 'reject', code: 'EXCEEDS_REFUNDABLE', rowCount: 0, payment };
    }
    Object.assign(payment, patch);
    payment.stripe_refund_id = refundId;
    payment.refund_lock = null;
    payment.post_transfer_operation_id = null;
    return { action: 'confirm', rowCount: 1, payment };
}

module.exports = {
    ACQUIRE_REVERSAL_SQL,
    RESUME_REVERSAL_SQL,
    CONFIRM_REVERSAL_SQL,
    RESUME_REFUND_SQL,
    CONFIRM_REFUND_SQL,
    MARK_EXECUTED_SQL,
    inflightHolder,
    applyAcquireReversal,
    applyConfirmReversal,
    applyConfirmRefund
};
