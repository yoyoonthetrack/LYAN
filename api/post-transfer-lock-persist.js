'use strict';

const {
    postTransferFinancialExecutionEnabled,
    isConfirmedReversalId,
    isConfirmedRefundId
} = require('./stripe-policy');
const { loadServerGrant } = require('./post-transfer-stripe-test-grant');
const {
    ACQUIRE_REVERSAL_SQL,
    RESUME_REVERSAL_SQL,
    CONFIRM_REVERSAL_SQL,
    RESUME_REFUND_SQL
} = require('./post-transfer-lock-sql');
const { CONFIRM_POST_TRANSFER_REFUND_RPC } = require('./post-transfer-finalize');

const LOAD_PAYMENT_SQL = `
SELECT *
FROM payments
WHERE id = $1
`;

const LOAD_REQUEST_SQL = `
SELECT id, payment_id, status, requested_cents, executed_at, execution_operation_id
FROM post_transfer_refund_requests
WHERE id = $1
`;

const LOAD_ADJUSTMENT_SQL = `
SELECT *
FROM payment_adjustments
WHERE operation_id = $1
`;

function moneyOff(extra) {
    return {
        execute: false,
        createReversal: false,
        createRefund: false,
        invoked: false,
        persisted: false,
        engine: postTransferFinancialExecutionEnabled(),
        ...extra
    };
}

function persistGate(options) {
    if (options && options.httpRoute === true) {
        return { ok: false, code: 'PERSIST_FORBIDDEN_ON_HTTP' };
    }
    if (options && options.serverStripeTestGrant === true) {
        const grant = loadServerGrant();
        if (grant.active !== true || grant.stripe_livemode === true) {
            return { ok: false, code: 'GRANT_INACTIVE' };
        }
        if (!options.client && typeof options.query !== 'function') {
            return { ok: false, code: 'QUERY_REQUIRED' };
        }
        return { ok: true, grant: true };
    }
    if (postTransferFinancialExecutionEnabled() !== true && !(options && options.isolatedLocal === true)) {
        return { ok: false, code: 'PERSIST_DISABLED' };
    }
    if (!options || (typeof options.query !== 'function' && !options.client)) {
        return { ok: false, code: 'QUERY_REQUIRED' };
    }
    return { ok: true };
}

function persistLocksActive(store, opts) {
    if (!store || !store.persist) return false;
    if (opts && opts.httpRoute === true) return false;
    if (store.isolatedLocal !== true) return false;
    return true;
}

function createPostTransferLockPersist(options) {
    const stats = { writes: 0, stripeCreates: 0, rpc069: 0 };
    const gate = () => persistGate(options);

    function query(sql, params) {
        return options.query(sql, params || []);
    }

    function loadPayment(paymentId) {
        return (query(LOAD_PAYMENT_SQL, [paymentId]) || [])[0] || null;
    }

    function reject(code, extra) {
        return moneyOff({ action: 'reject', code, persisted: false, ...extra });
    }

    function acquireReversal({ paymentId, operationId }) {
        const allowed = gate();
        if (!allowed.ok) return reject(allowed.code);
        const resumed = query(RESUME_REVERSAL_SQL, [operationId, paymentId]) || [];
        if (resumed.length) {
            return moneyOff({
                action: 'resume',
                persisted: true,
                rowCount: 0,
                payment: loadPayment(paymentId),
                operation_id: operationId
            });
        }
        const refundResume = query(RESUME_REFUND_SQL, [operationId, paymentId]) || [];
        if (refundResume.length) {
            return moneyOff({
                action: 'resume_refund',
                persisted: true,
                rowCount: 0,
                payment: loadPayment(paymentId),
                operation_id: operationId
            });
        }
        const acquired = query(ACQUIRE_REVERSAL_SQL, [operationId, paymentId]) || [];
        if (acquired.length) {
            stats.writes += 1;
            const payment = loadPayment(paymentId);
            return moneyOff({
                action: 'acquire',
                persisted: true,
                rowCount: 1,
                payment,
                operation_id: operationId,
                preserved_stripe_reversal_id: payment && payment.stripe_reversal_id
            });
        }
        const current = loadPayment(paymentId);
        if (!current) return reject('PAYMENT_NOT_FOUND');
        if (current.payment_status === 'REFUNDED') return reject('PAYMENT_ALREADY_REFUNDED', { payment: current });
        if (current.reversal_lock || current.refund_lock) {
            if (current.post_transfer_operation_id && current.post_transfer_operation_id !== operationId) {
                return reject('EXECUTION_IN_PROGRESS', { payment: current });
            }
            return reject('EXECUTION_IN_PROGRESS', { payment: current });
        }
        return reject('NOT_ACQUIRABLE', { payment: current });
    }

    function confirmReversal({ paymentId, operationId, reversalId, nextStatus }) {
        const allowed = gate();
        if (!allowed.ok) return reject(allowed.code);
        if (!isConfirmedReversalId(reversalId)) return reject('CONFIRMATION_REQUIRED');
        const current = loadPayment(paymentId);
        if (!current) return reject('PAYMENT_NOT_FOUND');
        const recorded = (query(LOAD_ADJUSTMENT_SQL, [operationId]) || [])[0];
        if (recorded && recorded.stripe_reversal_id
            && isConfirmedReversalId(recorded.stripe_reversal_id)
            && recorded.stripe_reversal_id !== reversalId) {
            return reject('STRIPE_ID_PRESERVED', { payment: current, lock_kept: true });
        }
        if (current.stripe_reversal_id
            && isConfirmedReversalId(current.stripe_reversal_id)
            && current.stripe_reversal_id !== reversalId
            && current.refund_lock) {
            return reject('STRIPE_ID_PRESERVED', { payment: current, lock_kept: true });
        }
        let updated;
        try {
            updated = query(CONFIRM_REVERSAL_SQL, [
                operationId,
                paymentId,
                reversalId,
                nextStatus || 'REVERSED'
            ]) || [];
        } catch (error) {
            return reject('TX_ABORTED', {
                payment: loadPayment(paymentId) || current,
                lock_kept: true,
                error: String(error && error.message || error).slice(0, 240)
            });
        }
        if (!updated.length) {
            return reject('UNKNOWN_OPERATION', { payment: current, lock_kept: true });
        }
        if (current.stripe_reversal_id
            && isConfirmedReversalId(current.stripe_reversal_id)
            && current.stripe_reversal_id !== reversalId) {
            const after = loadPayment(paymentId);
            if (after && after.stripe_reversal_id !== reversalId) {
                return reject('STRIPE_ID_PRESERVED', { payment: after, lock_kept: true });
            }
        }
        stats.writes += 1;
        return moneyOff({
            action: 'confirm',
            persisted: true,
            rowCount: 1,
            payment: loadPayment(paymentId),
            operation_id: operationId
        });
    }

    function resumeRefund({ paymentId, operationId }) {
        const allowed = gate();
        if (!allowed.ok) return reject(allowed.code);
        const rows = query(RESUME_REFUND_SQL, [operationId, paymentId]) || [];
        if (!rows.length) return reject('UNKNOWN_OPERATION', { payment: loadPayment(paymentId) });
        return moneyOff({
            action: 'resume',
            persisted: true,
            payment: loadPayment(paymentId),
            operation_id: operationId
        });
    }

    function finalize069({
        paymentId,
        requestId,
        operationId,
        refundId,
        reversalId,
        amountCents,
        refundServiceCents,
        refundCustFeeCents,
        refundProvNetCents,
        refundProvFeeCents
    }) {
        const allowed = gate();
        if (!allowed.ok) return reject(allowed.code, { rpc: CONFIRM_POST_TRANSFER_REFUND_RPC, rpcInvoked: false });
        if (!isConfirmedRefundId(refundId) || !isConfirmedReversalId(reversalId)) {
            return reject('CONFIRMATION_REQUIRED', { lock_kept: true, rpcInvoked: false });
        }
        const before = loadPayment(paymentId);
        try {
            const rows = query(
                `SELECT public.${CONFIRM_POST_TRANSFER_REFUND_RPC}($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS result`,
                [
                    paymentId,
                    requestId,
                    operationId,
                    refundId,
                    reversalId,
                    amountCents,
                    refundServiceCents,
                    refundCustFeeCents,
                    refundProvNetCents,
                    refundProvFeeCents
                ]
            ) || [];
            stats.writes += 1;
            stats.rpc069 += 1;
            const result = rows[0] && rows[0].result;
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            return moneyOff({
                action: (parsed && parsed.action) || 'complete',
                persisted: true,
                invoked: true,
                rpcInvoked: true,
                rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
                payment: loadPayment(paymentId),
                request: (query(LOAD_REQUEST_SQL, [requestId]) || [])[0] || null,
                adjustment: (query(LOAD_ADJUSTMENT_SQL, [operationId]) || [])[0] || null,
                result: parsed
            });
        } catch (error) {
            const message = String(error && error.message || error);
            const codeMatch = message.match(/(CONFIRMATION_REQUIRED|UNKNOWN_OPERATION|ALREADY_EXECUTED|DUPLICATE_OPERATION|REQUEST_NOT_APPROVED|AMOUNT_MISMATCH|PAYMENT_STATUS_BLOCKED|EXCEEDS_REFUNDABLE|EXCEEDS_REVERSIBLE|LOCK_LOST|MARK_EXECUTED_FAILED|DECISION_REQUIRED|PAYMENT_NOT_FOUND|REQUEST_NOT_FOUND|FORBIDDEN|AMOUNT_REQUIRED|AMOUNT_COMPONENTS_MISMATCH|REVERSAL_COMPONENTS_MISMATCH|PAYMENT_MISMATCH|REFUND_LOCK_REQUIRED|REVERSAL_STILL_LOCKED)/);
            return moneyOff({
                action: 'reject',
                code: codeMatch ? codeMatch[1] : 'TX_ABORTED',
                persisted: false,
                lock_kept: true,
                rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
                rpcInvoked: false,
                payment: loadPayment(paymentId) || before,
                error: message.slice(0, 240)
            });
        }
    }

    return {
        acquireReversal,
        confirmReversal,
        resumeRefund,
        finalize069,
        loadPayment,
        gate,
        stats,
        ACQUIRE_REVERSAL_SQL,
        RESUME_REVERSAL_SQL,
        CONFIRM_REVERSAL_SQL,
        RESUME_REFUND_SQL,
        CONFIRM_POST_TRANSFER_REFUND_RPC
    };
}

module.exports = {
    persistGate,
    persistLocksActive,
    createPostTransferLockPersist,
    LOAD_PAYMENT_SQL
};
