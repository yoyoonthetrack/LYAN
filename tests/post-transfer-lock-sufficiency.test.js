'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    reversalReservePredicates,
    postTransferRefundReservePredicates,
    sql067LockLimits,
    postTransferFinancialExecutionEnabled,
    paymentWritePaths
} = require('../api/stripe-policy');

test('6.10H SQL 067 lock predicates are first-operation only', () => {
    const reversal = reversalReservePredicates();
    const refund = postTransferRefundReservePredicates();
    const limits = sql067LockLimits();
    assert.equal(reversal.stripe_reversal_id, null);
    assert.equal(reversal.transfer_status, 'TRANSFERRED');
    assert.equal(reversal.successive_partial_safe, false);
    assert.equal(refund.stripe_refund_id, null);
    assert.equal(refund.successive_partial_safe, false);
    assert.equal(limits.atomic_first_reserve, true);
    assert.equal(limits.lock_holder_on_payments, false);
    assert.equal(limits.successive_partial_without_overwrite, false);
    assert.equal(limits.sufficient_for_financial_execution, false);
    assert.equal(limits.proposed_followup, '068');
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(paymentWritePaths().includes('/v1/payments/refund-after-transfer'), false);
});
