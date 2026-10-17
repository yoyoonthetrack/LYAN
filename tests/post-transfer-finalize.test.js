'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    postTransferFinancialExecutionEnabled,
    preparePostTransferRefundBreakdown
} = require('../api/stripe-policy');
const {
    applyFinalizePostTransfer,
    invokeConfirmPostTransferRefundRpc,
    prepareConfirmPostTransferRefundRpc,
    CONFIRM_POST_TRANSFER_REFUND_RPC
} = require('../api/post-transfer-finalize');
const { createExecutionStore, startExecution, applyOutcome } = require('../api/post-transfer-execution');

const ADMIN = { role: 'FINANCE', status: 'ACTIVE', permissions: ['finance.refund'] };

function payment(overrides) {
    return {
        id: 'pay-610k',
        milestone_id: 'ms-610k',
        payment_status: 'SUCCEEDED',
        transfer_status: 'REVERSED',
        stripe_transfer_id: 'tr_610k',
        stripe_refund_id: null,
        stripe_reversal_id: 'trr_610k',
        reversal_lock: null,
        refund_lock: 'pending_re_after_pay-610k',
        post_transfer_operation_id: 'op-610k',
        service_amount_cents: 4200,
        customer_fee_cents: 149,
        customer_total_cents: 4349,
        provider_fee_cents: 126,
        provider_net_cents: 4074,
        amount_refunded_cents: 0,
        customer_fee_refunded_cents: 0,
        service_refunded_cents: 0,
        provider_fee_reversed_cents: 0,
        provider_net_reversed_cents: 0,
        ...overrides
    };
}

function refsFor(cents, overrides) {
    const pay = payment(overrides);
    const breakdown = preparePostTransferRefundBreakdown(pay, cents);
    return {
        refs: {
            payment: pay,
            request: {
                id: 'req-610k',
                payment_id: 'pay-610k',
                status: 'ADMIN_APPROVED',
                requested_cents: cents
            },
            adjustments: []
        },
        breakdown
    };
}

test('6.10K finalize is one transaction and never invokes Stripe or the RPC', () => {
    const { refs, breakdown } = refsFor(4349);
    const result = applyFinalizePostTransfer(refs, {
        operationId: 'op-610k',
        refundId: 're_610k',
        reversalId: 'trr_610k',
        breakdown
    });
    assert.equal(result.action, 'complete');
    assert.equal(refs.payment.amount_refunded_cents, 4349);
    assert.equal(refs.payment.refund_lock, null);
    assert.equal(refs.request.executed_at != null, true);
    assert.equal(refs.adjustments.length, 1);
    assert.equal(invokeConfirmPostTransferRefundRpc().invoked, false);
    assert.equal(prepareConfirmPostTransferRefundRpc({}).invoke, false);
    assert.equal(CONFIRM_POST_TRANSFER_REFUND_RPC, 'confirm_post_transfer_refund_secure');
    assert.equal(postTransferFinancialExecutionEnabled(), false);
});

test('6.10K double finalize is idempotent and does not duplicate ledger', () => {
    const { refs, breakdown } = refsFor(4349);
    const input = { operationId: 'op-610k', refundId: 're_610k', reversalId: 'trr_610k', breakdown };
    applyFinalizePostTransfer(refs, input);
    const again = applyFinalizePostTransfer(refs, input);
    assert.equal(again.idempotent, true);
    assert.equal(refs.adjustments.length, 1);
});

test('6.10K fail before ledger leaves payment and request unchanged', () => {
    const { refs, breakdown } = refsFor(4349);
    const result = applyFinalizePostTransfer(refs, {
        operationId: 'op-610k',
        refundId: 're_610k',
        reversalId: 'trr_610k',
        breakdown
    }, { failAfter: 'before_ledger' });
    assert.equal(result.rolledBack, true);
    assert.equal(refs.adjustments.length, 0);
    assert.equal(refs.payment.refund_lock, 'pending_re_after_pay-610k');
    assert.equal(refs.request.executed_at == null, true);
});

test('6.10K fail after ledger rolls back the adjustment', () => {
    const { refs, breakdown } = refsFor(4349);
    const result = applyFinalizePostTransfer(refs, {
        operationId: 'op-610k',
        refundId: 're_610k',
        reversalId: 'trr_610k',
        breakdown
    }, { failAfter: 'after_ledger' });
    assert.equal(result.code, 'TEST_FAIL_AFTER_LEDGER');
    assert.equal(refs.adjustments.length, 0);
    assert.equal(refs.payment.amount_refunded_cents, 0);
    assert.equal(refs.payment.refund_lock, 'pending_re_after_pay-610k');
});

test('6.10K fail before executed_at rolls back counters and ledger', () => {
    const { refs, breakdown } = refsFor(4349);
    const result = applyFinalizePostTransfer(refs, {
        operationId: 'op-610k',
        refundId: 're_610k',
        reversalId: 'trr_610k',
        breakdown
    }, { failAfter: 'before_executed' });
    assert.equal(result.rolledBack, true);
    assert.equal(refs.adjustments.length, 0);
    assert.equal(refs.payment.amount_refunded_cents, 0);
    assert.equal(refs.request.executed_at == null, true);
});

test('6.10K unknown operation and missing stripe id abort without writes', () => {
    const unknown = refsFor(4349);
    const badOp = applyFinalizePostTransfer(unknown.refs, {
        operationId: 'op-other',
        refundId: 're_610k',
        reversalId: 'trr_610k',
        breakdown: unknown.breakdown
    });
    assert.equal(badOp.code, 'UNKNOWN_OPERATION');
    const missing = refsFor(4349);
    const noStripe = applyFinalizePostTransfer(missing.refs, {
        operationId: 'op-610k',
        refundId: 'pending_re_after_pay-610k',
        reversalId: 'trr_610k',
        breakdown: missing.breakdown
    });
    assert.equal(noStripe.code, 'CONFIRMATION_REQUIRED');
    assert.equal(missing.refs.adjustments.length, 0);
});

test('6.10K excess amount is refused and lock stays', () => {
    const { refs } = refsFor(4349);
    const breakdown = preparePostTransferRefundBreakdown(payment({
        amount_refunded_cents: 0,
        refund_lock: null,
        post_transfer_operation_id: null,
        transfer_status: 'TRANSFERRED'
    }), 2000);
    breakdown.ok = true;
    breakdown.refund_amount_cents = 99999;
    const result = applyFinalizePostTransfer(refs, {
        operationId: 'op-610k',
        refundId: 're_610k',
        reversalId: 'trr_610k',
        breakdown
    });
    assert.equal(result.code, 'EXCEEDS_REFUNDABLE');
    assert.equal(refs.payment.refund_lock, 'pending_re_after_pay-610k');
});

test('6.10K two successive partials then a third excess', () => {
    const first = refsFor(2000);
    const a = applyFinalizePostTransfer(first.refs, {
        operationId: 'op-610k',
        refundId: 're_1',
        reversalId: 'trr_610k',
        breakdown: first.breakdown
    });
    assert.equal(a.action, 'complete');
    first.refs.payment.refund_lock = 'pending_re_after_pay-610k';
    first.refs.payment.post_transfer_operation_id = 'op-610k-2';
    first.refs.payment.stripe_reversal_id = 'trr_2';
    first.refs.request.executed_at = null;
    first.refs.request.execution_operation_id = null;
    first.refs.request.execution_status = null;
    const secondBreakdown = preparePostTransferRefundBreakdown(first.refs.payment, 2349);
    const b = applyFinalizePostTransfer(first.refs, {
        operationId: 'op-610k-2',
        refundId: 're_2',
        reversalId: 'trr_2',
        breakdown: secondBreakdown
    });
    assert.equal(b.action, 'complete');
    assert.equal(first.refs.payment.amount_refunded_cents, 4349);
    assert.equal(first.refs.adjustments.length, 2);
    first.refs.payment.refund_lock = 'pending_re_after_pay-610k';
    first.refs.payment.post_transfer_operation_id = 'op-610k-3';
    first.refs.payment.stripe_reversal_id = 'trr_3';
    first.refs.request.executed_at = null;
    first.refs.request.execution_operation_id = null;
    const thirdBreakdown = preparePostTransferRefundBreakdown(payment({
        amount_refunded_cents: 0,
        refund_lock: null,
        post_transfer_operation_id: null,
        transfer_status: 'TRANSFERRED'
    }), 1);
    thirdBreakdown.refund_amount_cents = 1;
    const c = applyFinalizePostTransfer(first.refs, {
        operationId: 'op-610k-3',
        refundId: 're_3',
        reversalId: 'trr_3',
        breakdown: thirdBreakdown
    });
    assert.equal(c.code, 'EXCEEDS_REFUNDABLE');
    assert.equal(first.refs.adjustments.length, 2);
});

test('6.10K orchestrator finalize stays prepare-only and rpcInvoked false', () => {
    const store = createExecutionStore({
        payments: [payment({
            transfer_status: 'TRANSFERRED',
            stripe_reversal_id: null,
            refund_lock: null,
            reversal_lock: null,
            post_transfer_operation_id: null
        })],
        milestones: [{ id: 'ms-610k', status: 'RELEASED' }],
        requests: [{ id: 'req-610k', payment_id: 'pay-610k', status: 'ADMIN_APPROVED', requested_cents: 4349 }],
        decisions: [{ request_id: 'req-610k', action: 'ADMIN_APPROVED', operation_id: 'op-610k', decided_amount_cents: 4349 }]
    });
    startExecution(store, { admin: ADMIN, requestId: 'req-610k' });
    applyOutcome(store, {
        type: 'reversal_confirmed',
        paymentId: 'pay-610k',
        operationId: 'op-610k',
        reversalId: 'trr_610k',
        amount: 4074
    });
    const finished = applyOutcome(store, {
        type: 'refund_confirmed',
        paymentId: 'pay-610k',
        requestId: 'req-610k',
        operationId: 'op-610k',
        refundId: 're_610k',
        reversalId: 'trr_610k'
    });
    assert.equal(finished.executed, true);
    assert.equal(finished.rpcInvoked, false);
    assert.equal(store.adjustments.length, 1);
});
