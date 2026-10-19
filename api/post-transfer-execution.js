'use strict';

const {
    postTransferFinancialExecutionEnabled,
    admitPostTransferExecution,
    claimPostTransferExecutionLock,
    applyConfirmedFinancialCounters,
    postTransferExecutionCompleted,
    planPostTransferRefundLock,
    reconcileReversalAfterFailure,
    reconcilePostTransferRefundAfterFailure,
    routePostTransferWebhook,
    postTransferConsistency,
    reversalReservationId,
    postTransferRefundReservationId,
    isConfirmedReversalId,
} = require('./stripe-policy');
const {
    applyAcquireReversal,
    applyConfirmReversal,
    inflightHolder,
    ACQUIRE_REVERSAL_SQL,
    RESUME_REVERSAL_SQL,
    CONFIRM_REVERSAL_SQL,
    RESUME_REFUND_SQL,
    CONFIRM_REFUND_SQL,
    MARK_EXECUTED_SQL
} = require('./post-transfer-lock-sql');
const {
    applyFinalizePostTransfer,
    invokeConfirmPostTransferRefundRpc,
    CONFIRM_POST_TRANSFER_REFUND_RPC
} = require('./post-transfer-finalize');
const {
    dispatchPreparedStripeCall,
    planReversalCall,
    planRefundCall
} = require('./post-transfer-stripe-adapter');
const { persistLocksActive } = require('./post-transfer-lock-persist');

function moneyOff(extra) {
    return {
        execute: false,
        createReversal: false,
        createRefund: false,
        invoked: false,
        engine: postTransferFinancialExecutionEnabled(),
        ...extra
    };
}

function createExecutionStore(seed) {
    const payments = new Map((seed.payments || []).map((row) => [row.id, { ...row }]));
    const milestones = new Map((seed.milestones || []).map((row) => [row.id, { ...row }]));
    const requests = new Map((seed.requests || []).map((row) => [row.id, { ...row }]));
    const decisions = [...(seed.decisions || [])];
    const adjustments = [...(seed.adjustments || [])];
    const stripeCalls = [];
    return {
        payments,
        milestones,
        requests,
        decisions,
        adjustments,
        stripeCalls,
        getPayment(id) { return payments.get(id) || null; },
        getMilestone(id) { return milestones.get(id) || null; },
        getRequest(id) { return requests.get(id) || null; },
        latestApproved(requestId) {
            return [...decisions].reverse().find((row) => row.request_id === requestId && row.action === 'ADMIN_APPROVED') || null;
        },
        adjustmentFor(operationId) {
            return adjustments.find((row) => row.operation_id === operationId) || null;
        }
    };
}

function neverCallStripe(store, prepared, payment) {
    if (!store.stripeCalls) store.stripeCalls = [];
    store.stripeCalls.push({
        method: prepared && prepared.method,
        idempotencyKey: prepared && prepared.idempotencyKey,
        invoke: false
    });
    return dispatchPreparedStripeCall(prepared, null, { payment, allowReal: false });
}

function syncPayment(store, payment, next) {
    if (payment && next) Object.assign(payment, next);
    return payment;
}

function startExecution(store, { admin, requestId, stripe, httpRoute }) {
    if (stripe) {
        neverCallStripe(store, { method: 'guard.stripe_adapter_present' });
    }
    const request = store.getRequest(requestId);
    const decision = request ? store.latestApproved(requestId) : null;
    const payment = request ? store.getPayment(request.payment_id) : null;
    const milestone = payment ? store.getMilestone(payment.milestone_id) : null;
    const priorOp = decision && decision.operation_id;
    if (priorOp && store.adjustmentFor(priorOp) && postTransferExecutionCompleted({
        payment,
        adjustment: store.adjustmentFor(priorOp),
        operationId: priorOp
    })) {
        return moneyOff({
            phase: 'already_executed',
            action: 'already',
            idempotent: true,
            operation_id: priorOp,
            executed: true
        });
    }
    const admitted = admitPostTransferExecution({ admin, request, decision, payment, milestone });
    if (admitted.action !== 'admit') {
        return moneyOff({ phase: 'admit', ...admitted });
    }
    const claimed = claimPostTransferExecutionLock({
        payment,
        milestone,
        breakdown: admitted.breakdown,
        operationId: admitted.operation_id,
        holderOperationId: inflightHolder(payment)
    });
    if (claimed.action === 'reject') {
        return moneyOff({ phase: 'lock', ...claimed });
    }
    const reversalCall = planReversalCall({
        payment,
        breakdown: admitted.breakdown,
        operationId: admitted.operation_id
    });
    const refundCall = planRefundCall({
        payment,
        breakdown: admitted.breakdown,
        operationId: admitted.operation_id
    });
    if (httpRoute) {
        const attempted = neverCallStripe(store, reversalCall, payment);
        return moneyOff({
            phase: claimed.action === 'resume' ? 'reversal_resume' : 'reversal_prepared',
            action: claimed.action === 'resume' ? 'resume' : 'prepared',
            operation_id: admitted.operation_id,
            breakdown: admitted.breakdown,
            reversalCall,
            refundCall,
            stripe: attempted,
            persist_used: false,
            lock_persisted: false,
            executed: false
        });
    }
    const persistOn = persistLocksActive(store, { httpRoute });
    const locked = persistOn
        ? store.persist.acquireReversal({ paymentId: payment.id, operationId: admitted.operation_id })
        : applyAcquireReversal(payment, admitted.operation_id);
    if (locked.action === 'reject') {
        return moneyOff({ phase: 'lock', ...locked, persist_used: persistOn });
    }
    if (persistOn) syncPayment(store, payment, locked.payment);
    const attempted = neverCallStripe(store, reversalCall, payment);
    return moneyOff({
        phase: locked.action === 'resume' || locked.action === 'resume_refund' ? 'reversal_resume' : 'reversal_prepared',
        action: locked.action === 'acquire' ? 'prepared' : 'resume',
        operation_id: admitted.operation_id,
        breakdown: admitted.breakdown,
        reversalCall,
        refundCall,
        stripe: attempted,
        reservation: payment.reversal_lock || payment.refund_lock,
        rowCount: locked.rowCount,
        preserved_stripe_reversal_id: payment.stripe_reversal_id,
        persist_used: persistOn,
        executed: false
    });
}

function confirmReversal(store, { paymentId, operationId, reversalId, amount, httpRoute }) {
    const payment = store.getPayment(paymentId);
    if (!payment) return moneyOff({ action: 'reject', code: 'PAYMENT_NOT_FOUND' });
    const remaining = Number(payment.provider_net_cents || 0) - Number(payment.provider_net_reversed_cents || 0) - Number(amount || 0);
    const nextStatus = remaining > 0 ? 'PARTIALLY_REVERSED' : 'REVERSED';
    const persistOn = persistLocksActive(store, { httpRoute });
    const confirmed = persistOn
        ? store.persist.confirmReversal({ paymentId, operationId, reversalId, nextStatus })
        : applyConfirmReversal(payment, operationId, reversalId, nextStatus);
    if (confirmed.action === 'reject') return moneyOff({ phase: 'reversal_confirmed', ...confirmed, persist_used: persistOn });
    if (persistOn) syncPayment(store, payment, confirmed.payment);
    return moneyOff({
        phase: 'reversal_confirmed',
        action: 'complete_reservation',
        consistency: postTransferConsistency(payment),
        operation_id: operationId,
        stripe_reversal_id: payment.stripe_reversal_id,
        refund_lock: payment.refund_lock,
        reversal_lock: payment.reversal_lock,
        rowCount: confirmed.rowCount,
        persist_used: persistOn
    });
}

function prepareRefundStep(store, { admin, requestId }) {
    const request = store.getRequest(requestId);
    const decision = request ? store.latestApproved(requestId) : null;
    const payment = request ? store.getPayment(request.payment_id) : null;
    const milestone = payment ? store.getMilestone(payment.milestone_id) : null;
    const admitted = admitPostTransferExecution({ admin, request, decision, payment, milestone });
    if (admitted.action !== 'admit') return moneyOff({ phase: 'admit', ...admitted });
    if (payment.refund_lock && payment.post_transfer_operation_id === admitted.operation_id) {
        const refundCall = planRefundCall({
            payment,
            breakdown: admitted.breakdown,
            operationId: admitted.operation_id
        });
        const attempted = neverCallStripe(store, refundCall, payment);
        return moneyOff({
            phase: 'refund_prepared',
            action: 'resume',
            operation_id: admitted.operation_id,
            refundCall,
            stripe: attempted,
            reservation: payment.refund_lock
        });
    }
    const refundLock = planPostTransferRefundLock(payment, milestone, admitted.breakdown, admitted.operation_id);
    if (refundLock.action === 'reject') {
        return moneyOff({ phase: 'refund_lock', ...refundLock, createRefund: false });
    }
    const refundCall = planRefundCall({
        payment,
        breakdown: admitted.breakdown,
        operationId: admitted.operation_id
    });
    const attempted = neverCallStripe(store, refundCall, payment);
    return moneyOff({
        phase: refundLock.action === 'resume' ? 'refund_resume' : 'refund_prepared',
        action: refundLock.action,
        operation_id: admitted.operation_id,
        refundCall,
        stripe: attempted,
        reservation: payment.refund_lock || payment.stripe_refund_id
    });
}

function confirmRefundAndLedger(store, { paymentId, requestId, operationId, refundId, reversalId, httpRoute }) {
    const payment = store.getPayment(paymentId);
    const request = store.getRequest(requestId);
    const decision = request ? store.latestApproved(requestId) : null;
    if (!payment || !decision) return moneyOff({ action: 'reject', code: 'NOT_FOUND' });
    if (request.executed_at || store.adjustmentFor(operationId)) {
        return moneyOff({
            phase: 'ledger',
            action: 'already',
            idempotent: true,
            executed: Boolean(request.executed_at) || postTransferExecutionCompleted({
                payment,
                adjustment: store.adjustmentFor(operationId),
                operationId
            })
        });
    }
    const admitted = admitPostTransferExecution({
        admin: { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] },
        request,
        decision,
        payment,
        milestone: store.getMilestone(payment.milestone_id)
    });
    if (admitted.action !== 'admit') return moneyOff({ phase: 'admit', ...admitted });
    const confirmedReversal = reversalId || payment.stripe_reversal_id;
    const live = applyConfirmedFinancialCounters(payment, admitted.breakdown, {
        stripeRefundId: refundId,
        stripeReversalId: confirmedReversal
    });
    if (!live.ok) {
        return moneyOff({
            phase: 'ledger',
            action: 'reject',
            code: live.code,
            consistency: postTransferConsistency(payment)
        });
    }
    const persistOn = persistLocksActive(store, { httpRoute });
    const rpcGuard = persistOn
        ? { invoked: false, rpc: CONFIRM_POST_TRANSFER_REFUND_RPC }
        : invokeConfirmPostTransferRefundRpc();
    const finalized = persistOn
        ? store.persist.finalize069({
            paymentId,
            requestId,
            operationId,
            refundId,
            reversalId: confirmedReversal,
            amountCents: admitted.breakdown.refund_amount_cents,
            refundServiceCents: admitted.breakdown.breakdown.refunded_service_cents,
            refundCustFeeCents: admitted.breakdown.breakdown.refunded_customer_fee_cents,
            refundProvNetCents: admitted.breakdown.breakdown.reversed_provider_net_cents,
            refundProvFeeCents: admitted.breakdown.breakdown.reversed_provider_fee_cents
        })
        : applyFinalizePostTransfer({
            payment,
            request,
            adjustments: store.adjustments
        }, {
            operationId,
            refundId,
            reversalId: confirmedReversal,
            breakdown: admitted.breakdown
        });
    if (persistOn && finalized.payment) syncPayment(store, payment, finalized.payment);
    if (persistOn && finalized.request) Object.assign(request, finalized.request);
    if (persistOn && finalized.adjustment && !store.adjustmentFor(operationId)) {
        store.adjustments.push(finalized.adjustment);
    }
    if (finalized.action === 'reject') {
        return moneyOff({
            phase: 'finalize',
            ...finalized,
            rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
            rpcInvoked: persistOn ? Boolean(finalized.rpcInvoked) : rpcGuard.invoked,
            persist_used: persistOn
        });
    }
    return moneyOff({
        phase: finalized.action === 'already' ? 'ledger' : 'executed',
        action: finalized.action,
        idempotent: Boolean(finalized.idempotent),
        operation_id: operationId,
        adjustment: finalized.adjustment,
        executed: postTransferExecutionCompleted({
            payment,
            adjustment: finalized.adjustment,
            operationId
        }),
        request_status: request.status,
        rowCount: finalized.rowCount || 0,
        rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
        rpcInvoked: persistOn ? Boolean(finalized.rpcInvoked) : rpcGuard.invoked,
        persist_used: persistOn
    });
}

function applyOutcome(store, event) {
    const payment = store.getPayment(event.paymentId);
    if (!payment && event.type !== 'concurrent_start') {
        return moneyOff({ action: 'reject', code: 'PAYMENT_NOT_FOUND' });
    }
    if (event.type === 'reversal_timeout') {
        const result = reconcileReversalAfterFailure({
            recoveredReversal: event.recoveredReversal || null,
            listedReversals: event.listedReversals || [],
            listRetrieved: event.listRetrieved === true,
            insufficientConnectBalance: event.insufficientConnectBalance === true
        });
        return moneyOff({
            phase: 'reversal_timeout',
            ...result,
            reservation: payment.reversal_lock,
            stripe_reversal_id: payment.stripe_reversal_id,
            retryBlind: false
        });
    }
    if (event.type === 'reversal_failed') {
        const result = reconcileReversalAfterFailure({
            recoveredReversal: null,
            listedReversals: [],
            listRetrieved: true,
            insufficientConnectBalance: true
        });
        if (result.nextStatus) payment.transfer_status = result.nextStatus;
        return moneyOff({ phase: 'reversal_failed', ...result, createRefund: false });
    }
    if (event.type === 'reversal_confirmed') {
        return confirmReversal(store, event);
    }
    if (event.type === 'refund_timeout') {
        const result = reconcilePostTransferRefundAfterFailure({
            recoveredRefund: event.recoveredRefund || null,
            listedRefunds: event.listedRefunds || [],
            listRetrieved: event.listRetrieved === true
        });
        return moneyOff({
            phase: 'refund_timeout',
            ...result,
            reservation: payment.refund_lock,
            retryBlind: false
        });
    }
    if (event.type === 'refund_failed') {
        const result = reconcilePostTransferRefundAfterFailure({
            recoveredRefund: null,
            listedRefunds: [],
            listRetrieved: true
        });
        return moneyOff({ phase: 'refund_failed', ...result });
    }
    if (event.type === 'refund_confirmed') {
        return confirmRefundAndLedger(store, event);
    }
    if (event.type === 'refund_already') {
        return confirmRefundAndLedger(store, {
            ...event,
            refundId: event.refundId
        });
    }
    if (event.type === 'webhook') {
        let routed = routePostTransferWebhook(event.event, payment);
        if (routed.action === 'observe' && payment.reversal_lock) {
            routed = routePostTransferWebhook(event.event, {
                ...payment,
                stripe_reversal_id: payment.reversal_lock
            });
        }
        if (routed.apply && event.event.type === 'transfer.reversed' && routed.stripe_reversal_id) {
            payment.stripe_reversal_id = routed.stripe_reversal_id;
        }
        if (routed.apply && event.event.type === 'charge.refunded' && routed.stripe_refund_id) {
            payment.stripe_refund_id = routed.stripe_refund_id;
        }
        return moneyOff({
            phase: 'webhook',
            persist: false,
            ...routed,
            reversal_lock: payment.reversal_lock,
            refund_lock: payment.refund_lock
        });
    }
    return moneyOff({ action: 'reject', code: 'UNKNOWN_EVENT' });
}

function runHappyPath(store, { admin, requestId, reversalId, refundId }) {
    const started = startExecution(store, { admin, requestId });
    if (started.action !== 'prepared' && started.action !== 'resume') return started;
    const request = store.getRequest(requestId);
    const reversed = applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: request.payment_id,
        operationId: started.operation_id,
        reversalId,
        amount: started.breakdown.reversal_amount_cents
    });
    const refundPrepared = prepareRefundStep(store, { admin, requestId });
    const finished = applyOutcome(store, {
        type: 'refund_confirmed',
        paymentId: request.payment_id,
        requestId,
        operationId: started.operation_id,
        refundId,
        reversalId
    });
    return moneyOff({
        phase: 'happy_path',
        started,
        reversed,
        refundPrepared,
        finished,
        executed: Boolean(finished.executed),
        stripeCalls: store.stripeCalls.length
    });
}

module.exports = {
    createExecutionStore,
    startExecution,
    prepareRefundStep,
    applyOutcome,
    runHappyPath,
    neverCallStripe,
    persistLocksActive,
    ACQUIRE_REVERSAL_SQL,
    RESUME_REVERSAL_SQL,
    CONFIRM_REVERSAL_SQL,
    RESUME_REFUND_SQL,
    CONFIRM_REFUND_SQL,
    MARK_EXECUTED_SQL,
    CONFIRM_POST_TRANSFER_REFUND_RPC,
    dispatchPreparedStripeCall
};
