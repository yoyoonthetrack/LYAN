'use strict';

const { isConfirmedRefundId, isConfirmedReversalId, paymentAdjustmentAppendRow } = require('./stripe-policy');

const CONFIRM_POST_TRANSFER_REFUND_RPC = 'confirm_post_transfer_refund_secure';

function moneyOff(extra) {
    return {
        execute: false,
        createReversal: false,
        createRefund: false,
        invoked: false,
        ...extra
    };
}

function snapshotRefs(refs) {
    return {
        payment: { ...refs.payment },
        request: { ...refs.request },
        adjustments: (refs.adjustments || []).map((row) => ({ ...row }))
    };
}

function restoreRefs(refs, snap) {
    Object.keys(refs.payment).forEach((key) => {
        delete refs.payment[key];
    });
    Object.assign(refs.payment, snap.payment);
    Object.keys(refs.request).forEach((key) => {
        delete refs.request[key];
    });
    Object.assign(refs.request, snap.request);
    refs.adjustments.length = 0;
    snap.adjustments.forEach((row) => refs.adjustments.push(row));
}

function abort(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
}

function existingAdjustment(adjustments, operationId) {
    return (adjustments || []).find((row) => row.operation_id === operationId) || null;
}

function runFinalizeSteps(refs, input, failAfter) {
    const payment = refs.payment;
    const request = refs.request;
    const operationId = String(input.operationId || '').trim();
    const refundId = input.refundId;
    const reversalId = input.reversalId;
    const breakdown = input.breakdown;

    if (!operationId) abort('OPERATION_ID_REQUIRED');
    if (!isConfirmedRefundId(refundId) || !isConfirmedReversalId(reversalId)) abort('CONFIRMATION_REQUIRED');
    if (!payment) abort('PAYMENT_NOT_FOUND');
    if (!request) abort('REQUEST_NOT_FOUND');
    if (request.payment_id && request.payment_id !== payment.id) abort('PAYMENT_MISMATCH');
    if (request.status !== 'ADMIN_APPROVED') abort('REQUEST_NOT_APPROVED');

    const prior = existingAdjustment(refs.adjustments, operationId);
    if (prior && request.executed_at && request.execution_operation_id === operationId
        && prior.stripe_refund_id === refundId && prior.stripe_reversal_id === reversalId) {
        return moneyOff({
            action: 'already',
            idempotent: true,
            executed: true,
            operation_id: operationId,
            adjustment: prior,
            rolledBack: false
        });
    }
    if (prior) abort('DUPLICATE_OPERATION');
    if (request.executed_at) abort('ALREADY_EXECUTED');
    if (payment.post_transfer_operation_id !== operationId) abort('UNKNOWN_OPERATION');
    if (payment.refund_lock !== ('pending_re_after_' + payment.id)) abort('REFUND_LOCK_REQUIRED');
    if (payment.reversal_lock) abort('REVERSAL_STILL_LOCKED');
    if (payment.stripe_reversal_id !== reversalId) abort('CONFIRMATION_REQUIRED');
    if (!breakdown || !breakdown.ok) abort('BREAKDOWN_REQUIRED');

    const increment = Number(breakdown.refund_amount_cents);
    const nextRefunded = Number(payment.amount_refunded_cents || 0) + increment;
    const nextNet = Number(payment.provider_net_reversed_cents || 0) + Number(breakdown.reversal_amount_cents || 0);
    if (increment <= 0) abort('AMOUNT_REQUIRED');
    if (nextRefunded > Number(payment.customer_total_cents || 0)) abort('EXCEEDS_REFUNDABLE');
    if (nextNet > Number(payment.provider_net_cents || 0)) abort('EXCEEDS_REVERSIBLE');

    if (failAfter === 'before_ledger') abort('TEST_FAIL_BEFORE_LEDGER');

    const row = paymentAdjustmentAppendRow({
        paymentId: payment.id,
        breakdown,
        stripeRefundId: refundId,
        stripeReversalId: reversalId,
        operationId
    });
    if (!row.ok) abort(row.code);
    refs.adjustments.push(row.row);

    if (failAfter === 'after_ledger') abort('TEST_FAIL_AFTER_LEDGER');

    payment.stripe_refund_id = refundId;
    payment.amount_refunded_cents = nextRefunded;
    payment.customer_fee_refunded_cents = Number(payment.customer_fee_refunded_cents || 0)
        + Number(breakdown.breakdown.refunded_customer_fee_cents || 0);
    payment.service_refunded_cents = Number(payment.service_refunded_cents || 0)
        + Number(breakdown.breakdown.refunded_service_cents || 0);
    payment.provider_fee_reversed_cents = Number(payment.provider_fee_reversed_cents || 0)
        + Number(breakdown.breakdown.reversed_provider_fee_cents || 0);
    payment.provider_net_reversed_cents = nextNet;
    payment.payment_status = nextRefunded >= Number(payment.customer_total_cents || 0)
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED';
    payment.transfer_status = nextNet >= Number(payment.provider_net_cents || 0)
        ? 'REVERSED'
        : 'PARTIALLY_REVERSED';
    payment.refund_lock = null;
    payment.post_transfer_operation_id = null;

    if (failAfter === 'before_executed') abort('TEST_FAIL_BEFORE_EXECUTED');

    request.executed_at = new Date().toISOString();
    request.execution_operation_id = operationId;
    request.execution_status = 'EXECUTED';

    return moneyOff({
        action: 'complete',
        phase: 'executed',
        idempotent: false,
        executed: true,
        operation_id: operationId,
        adjustment: row.row,
        request_status: request.status,
        rowCount: 1,
        rolledBack: false
    });
}

function applyFinalizePostTransfer(refs, input, options) {
    const failAfter = options && options.failAfter;
    const snap = snapshotRefs(refs);
    try {
        return runFinalizeSteps(refs, input, failAfter);
    } catch (error) {
        restoreRefs(refs, snap);
        return moneyOff({
            action: 'reject',
            phase: 'finalize',
            code: error.code || 'TX_ABORTED',
            rolledBack: true,
            executed: false
        });
    }
}

function prepareConfirmPostTransferRefundRpc(args) {
    return {
        rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
        args: args || {},
        invoke: false,
        execute: false
    };
}

function invokeConfirmPostTransferRefundRpc() {
    return {
        invoked: false,
        execute: false,
        rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
        code: 'POST_TRANSFER_RPC_NOT_INVOKED'
    };
}

module.exports = {
    CONFIRM_POST_TRANSFER_REFUND_RPC,
    applyFinalizePostTransfer,
    prepareConfirmPostTransferRefundRpc,
    invokeConfirmPostTransferRefundRpc
};
