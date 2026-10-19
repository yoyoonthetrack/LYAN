'use strict';

const {
    postTransferFinancialExecutionEnabled,
    canApprovePostTransferRefund,
    stripeChargeId,
    postTransferExecutionCompleted,
    preparePostTransferRefundBreakdown,
    isConfirmedReversalId
} = require('./stripe-policy');
const { adminContext } = require('./post-transfer-refund-flow');
const { createExecutionStore, startExecution } = require('./post-transfer-execution');
const { planReversalCall, planRefundCall } = require('./post-transfer-stripe-adapter');
const {
    loadServerGrant,
    evaluateStripeTestGrant,
    grantFactsFromValidated,
    decideStripeWriteAfterReconcile,
    STRIPE_TEST_GRANT
} = require('./post-transfer-stripe-test-grant');

const MODES = {
    DISABLED: 'DISABLED',
    SIMULATED: 'SIMULATED',
    STRIPE_TEST: 'STRIPE_TEST'
};

const STRIPE_TEST_ACTIVATION = Object.freeze({
    allowed: false,
    grant_active: STRIPE_TEST_GRANT.active
});

function moneyOff(extra) {
    return {
        execute: false,
        createReversal: false,
        createRefund: false,
        invoked: false,
        engine: postTransferFinancialExecutionEnabled(),
        retryBlind: false,
        ...extra
    };
}

function jsonResult(http, body) {
    return { http, body: moneyOff(body) };
}

function guardAdminExecute(adminResult) {
    if (!adminResult || adminResult.authorized !== true) {
        const status = (adminResult && adminResult.status) || 401;
        return jsonResult(status, {
            success: false,
            code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN',
            error: (adminResult && adminResult.error) || 'Authentification administrative requise.'
        });
    }
    const ctx = adminContext(adminResult);
    if (!canApprovePostTransferRefund(ctx)) {
        return jsonResult(403, { success: false, code: 'FORBIDDEN', error: 'Droits insuffisants.' });
    }
    return { ok: true, admin: adminResult, ctx };
}

function authoritativeAmount(request, decision) {
    if (decision && decision.decided_amount_cents != null) return Number(decision.decided_amount_cents);
    return Number(request && request.requested_cents);
}

function validateRequestedCents(bodyCents, request, decision) {
    const trusted = authoritativeAmount(request, decision);
    if (bodyCents == null) return { ok: true, cents: trusted };
    if (Number(bodyCents) !== trusted) return { ok: false, code: 'AMOUNT_MISMATCH' };
    return { ok: true, cents: trusted };
}

function validateExpectedParents(payment, expected) {
    if (!expected || typeof expected !== 'object') return { ok: true };
    if (expected.payment_intent && payment.stripe_payment_intent_id !== expected.payment_intent) {
        return { ok: false, code: 'PAYMENT_INTENT_MISMATCH' };
    }
    if (expected.transfer && payment.stripe_transfer_id !== expected.transfer) {
        return { ok: false, code: 'TRANSFER_MISMATCH' };
    }
    const chargeId = stripeChargeId(payment.stripe_charge_id);
    if (expected.charge && chargeId !== expected.charge && payment.stripe_charge_id !== expected.charge) {
        return { ok: false, code: 'CHARGE_MISMATCH' };
    }
    if (expected.connectAccount) {
        const connect = payment.stripe_connect_account_id || payment.connect_account_id;
        if (!connect || connect !== expected.connectAccount) {
            return { ok: false, code: 'CONNECT_ACCOUNT_MISMATCH' };
        }
    }
    return { ok: true };
}

function latestApprovedDecision(decisions, requestId) {
    return [...(decisions || [])].reverse().find((row) => row.request_id === requestId && row.action === 'ADMIN_APPROVED') || null;
}

function inspectPaymentReady(payment) {
    if (!payment) return { ok: false, code: 'PAYMENT_NOT_FOUND' };
    if (payment.payment_status === 'DISPUTED') return { ok: false, code: 'DISPUTED' };
    if (payment.payment_status === 'REFUNDED') return { ok: false, code: 'PAYMENT_ALREADY_REFUNDED' };
    if (payment.reversal_lock && payment.refund_lock) return { ok: false, code: 'AMBIGUOUS_LOCK_STATE' };
    if ((payment.reversal_lock || payment.refund_lock) && !payment.post_transfer_operation_id) {
        return { ok: false, code: 'AMBIGUOUS_LOCK_STATE' };
    }
    if (payment.stripe_reversal_id && String(payment.stripe_reversal_id).startsWith('pending_rv_')) {
        return { ok: false, code: 'AMBIGUOUS_REVERSAL_ID' };
    }
    return { ok: true };
}

function looksLikeHttpInput(value) {
    return Boolean(value && (value.req || value.body || value.query || value.headers || value.httpRoute === true));
}

function resolvePostTransferExecutionMode(trustedConfig, context) {
    if (looksLikeHttpInput(trustedConfig) || looksLikeHttpInput(trustedConfig && trustedConfig.grant)) {
        return { mode: MODES.DISABLED, reason: 'HTTP_UNTRUSTED' };
    }
    if (postTransferFinancialExecutionEnabled() === true) {
        return { mode: MODES.DISABLED, reason: 'REAL_ENGINE_STILL_FORBIDDEN' };
    }
    const httpish = Boolean(context && (context.httpRoute === true || context.req || context.body || context.query || context.headers));
    if (
        !httpish
        && trustedConfig
        && trustedConfig.mode === MODES.SIMULATED
        && trustedConfig.isolatedLocal === true
        && trustedConfig.simulationHarness === true
        && trustedConfig.adapter
        && trustedConfig.stripeDispatch
    ) {
        return { mode: MODES.SIMULATED, reason: 'ISOLATED_HARNESS' };
    }
    const grant = loadServerGrant();
    const evaluated = evaluateStripeTestGrant(grant, context && context.facts);
    if (evaluated.ok) {
        return { mode: MODES.STRIPE_TEST, reason: 'SERVER_GRANT' };
    }
    if (trustedConfig && trustedConfig.mode === MODES.STRIPE_TEST) {
        return {
            mode: MODES.DISABLED,
            reason: evaluated.code || 'STRIPE_TEST_NOT_ACTIVATED',
            stripe_test_allowed: false
        };
    }
    return {
        mode: MODES.DISABLED,
        reason: httpish ? 'HTTP_UNTRUSTED' : (evaluated.code || 'DEFAULT'),
        stripe_test_allowed: false
    };
}

function buildServerAttestation(mode, stripeOutcome) {
    if (!stripeOutcome || stripeOutcome.ok !== true || stripeOutcome.livemode === true) {
        return { attested: false, attestation_kind: 'NONE', stripe_proof: false };
    }
    if (mode === MODES.SIMULATED) {
        return { attested: true, attestation_kind: 'SIMULATED_SERVER', stripe_proof: false };
    }
    if (mode === MODES.STRIPE_TEST) {
        return {
            attested: true,
            attestation_kind: 'STRIPE_TEST_SERVER',
            stripe_proof: stripeOutcome.real === true && stripeOutcome.stripe_proof === true
        };
    }
    return { attested: false, attestation_kind: 'NONE', stripe_proof: false };
}

function nextTransferStatus(payment, refundProvNet) {
    const remaining = Number(payment.provider_net_cents || 0)
        - Number(payment.provider_net_reversed_cents || 0)
        - Number(refundProvNet || 0);
    return remaining > 0 ? 'PARTIALLY_REVERSED' : 'REVERSED';
}

async function validateExecuteContext(store, options) {
    void (options.body && options.body.enable_execution);
    void (options.body && options.body.force);
    void (options.body && options.body.attested);
    void (options.body && options.body.p_server_attested);
    void (options.body && options.body.mode);
    void (options.body && options.body.simulationHarness);
    void (options.body && options.body.execution_mode);

    const guarded = guardAdminExecute(options.admin && options.admin.authorized != null ? options.admin : { authorized: true, ...options.admin });
    if (!guarded.ok) return { ok: false, result: guarded };

    if (postTransferFinancialExecutionEnabled() === true) {
        return {
            ok: false,
            result: jsonResult(409, {
                success: false,
                code: 'EXECUTION_STILL_FORBIDDEN',
                error: 'Le moteur financier post-Transfer reste interdit.'
            })
        };
    }

    const request = await store.getRequest(options.requestId);
    if (!request) return { ok: false, result: jsonResult(404, { success: false, code: 'REQUEST_NOT_FOUND' }) };
    const payment = await store.getPayment({ id: request.payment_id });
    if (!payment) return { ok: false, result: jsonResult(404, { success: false, code: 'PAYMENT_NOT_FOUND' }) };
    const milestone = await store.getMilestone(payment.milestone_id);
    const decisions = await store.listDecisions(options.requestId);
    const decision = latestApprovedDecision(decisions, options.requestId);

    if (request.executed_at || postTransferExecutionCompleted({
        payment,
        adjustment: store.adjustmentFor ? store.adjustmentFor(decision && decision.operation_id) : null,
        operationId: decision && decision.operation_id
    })) {
        return {
            ok: false,
            result: jsonResult(200, {
                success: true,
                idempotent: true,
                code: 'ALREADY_EXECUTED',
                operation_id: decision && decision.operation_id || null
            })
        };
    }
    if (request.status !== 'ADMIN_APPROVED') {
        return { ok: false, result: jsonResult(409, { success: false, code: 'REQUEST_NOT_APPROVED' }) };
    }
    if (!decision) {
        return { ok: false, result: jsonResult(409, { success: false, code: 'DECISION_REQUIRED' }) };
    }
    const amount = validateRequestedCents(options.requestedCents, request, decision);
    if (!amount.ok) return { ok: false, result: jsonResult(400, { success: false, code: amount.code }) };
    const ready = inspectPaymentReady(payment);
    if (!ready.ok) return { ok: false, result: jsonResult(409, { success: false, code: ready.code, retryBlind: false }) };
    if (!payment.stripe_payment_intent_id) return { ok: false, result: jsonResult(409, { success: false, code: 'PAYMENT_INTENT_REQUIRED' }) };
    if (!payment.stripe_transfer_id) return { ok: false, result: jsonResult(409, { success: false, code: 'TRANSFER_REQUIRED' }) };
    if (!stripeChargeId(payment.stripe_charge_id)) return { ok: false, result: jsonResult(409, { success: false, code: 'CHARGE_REQUIRED' }) };
    const parents = validateExpectedParents(payment, options.expected);
    if (!parents.ok) return { ok: false, result: jsonResult(409, { success: false, code: parents.code }) };

    if (typeof options.stripeRead === 'function') {
        const read = options.stripeRead({ payment, request, decision }) || {};
        if (read.livemode === true || read.status === 'blocked') {
            return { ok: false, result: jsonResult(409, { success: false, code: read.code || 'STRIPE_LIVE_BLOCKED', lock_kept: true }) };
        }
        if (read.status === 'uncertain' || read.timeout === true) {
            return {
                ok: false,
                result: jsonResult(409, {
                    success: false,
                    code: read.code || 'STRIPE_READ_UNCERTAIN',
                    lock_kept: true,
                    retryBlind: false
                })
            };
        }
    }

    return {
        ok: true,
        guarded,
        request,
        payment,
        milestone,
        decisions,
        decision,
        amount
    };
}

function disabledPrepare(ctx) {
    const execStore = createExecutionStore({
        payments: [{ ...ctx.payment }],
        milestones: ctx.milestone ? [ctx.milestone] : [],
        requests: [ctx.request],
        decisions: ctx.decisions,
        adjustments: []
    });
    execStore.persist = null;
    const started = startExecution(execStore, { admin: ctx.guarded.ctx, requestId: ctx.request.id, httpRoute: true });
    if (started.action === 'forbidden') {
        return jsonResult(403, { success: false, code: 'FORBIDDEN', phase: started.phase });
    }
    if (started.action === 'already' || started.idempotent) {
        return jsonResult(200, {
            success: true,
            idempotent: true,
            code: 'ALREADY_EXECUTED',
            operation_id: started.operation_id || null
        });
    }
    if (started.action === 'reject') {
        return jsonResult(started.http || 409, {
            success: false,
            code: started.code || 'REJECTED',
            phase: started.phase
        });
    }
    return jsonResult(409, {
        success: false,
        code: 'EXECUTION_DISABLED',
        mode: MODES.DISABLED,
        phase: started.phase,
        action: started.action,
        operation_id: started.operation_id || ctx.decision.operation_id,
        reversal_key: started.reversalCall && started.reversalCall.idempotencyKey || null,
        refund_key: started.refundCall && started.refundCall.idempotencyKey || null,
        prepared: Boolean(started.reversalCall && started.reversalCall.ok !== false),
        decided_amount_cents: ctx.amount.cents,
        persist_used: false,
        lock_persisted: false,
        stripe: started.stripe || { invoked: false }
    });
}

async function runSimulated(ctx, trusted) {
    const breakdown = preparePostTransferRefundBreakdown(ctx.payment, ctx.amount.cents);
    if (!breakdown.ok) return jsonResult(400, { success: false, code: breakdown.code, lock_kept: true });
    const operationId = ctx.decision.operation_id;
    const adapter = trusted.adapter;
    const stripeDispatch = trusted.stripeDispatch;
    const acquired = await adapter.acquireReversalLock({
        paymentId: ctx.payment.id,
        operationId,
        requestId: ctx.request.id
    });
    if (acquired.action === 'reject') {
        return jsonResult(409, {
            success: false,
            code: acquired.code,
            lock_kept: Boolean(acquired.lock_kept),
            persist_used: true,
            mode: MODES.SIMULATED
        });
    }

    let reversalId = ctx.payment.stripe_reversal_id || null;
    let attestation = { attested: false, attestation_kind: 'NONE', stripe_proof: false };

    if (acquired.action === 'resume_refund') {
        const state = await adapter.readExecutionState({
            paymentId: ctx.payment.id,
            requestId: ctx.request.id,
            operationId
        });
        reversalId = state.payment && state.payment.stripe_reversal_id || reversalId;
        if (!isConfirmedReversalId(reversalId) || !String(reversalId).startsWith('trr_')) {
            return jsonResult(409, {
                success: false,
                code: 'AMBIGUOUS_REVERSAL_ID',
                lock_kept: true,
                persist_used: true,
                retryBlind: false,
                mode: MODES.SIMULATED
            });
        }
        attestation = { attested: true, attestation_kind: 'SIMULATED_SERVER', stripe_proof: false };
    } else {
        const reversalCall = planReversalCall({ payment: ctx.payment, breakdown, operationId });
        const reversalSim = await stripeDispatch.dispatch(reversalCall);
        if (!reversalSim.ok) {
            return jsonResult(409, {
                success: false,
                code: reversalSim.code,
                lock_kept: true,
                persist_used: true,
                retryBlind: false,
                phase: 'stripe_sim_reversal',
                operation_id: operationId,
                mode: MODES.SIMULATED,
                stripe_sim_calls: stripeDispatch.calls && stripeDispatch.calls.length
            });
        }
        attestation = buildServerAttestation(MODES.SIMULATED, reversalSim);
        if (attestation.attested !== true || attestation.stripe_proof !== false) {
            return jsonResult(409, { success: false, code: 'CONFIRMATION_REQUIRED', lock_kept: true, retryBlind: false });
        }
        const confirmed = await adapter.confirmReversal({
            paymentId: ctx.payment.id,
            operationId,
            requestId: ctx.request.id,
            reversalId: reversalSim.id,
            nextStatus: nextTransferStatus(ctx.payment, breakdown.breakdown.reversed_provider_net_cents),
            attested: attestation.attested
        });
        if (confirmed.action === 'reject') {
            return jsonResult(409, {
                success: false,
                code: confirmed.code,
                lock_kept: true,
                persist_used: true,
                retryBlind: false,
                mode: MODES.SIMULATED,
                attestation_kind: attestation.attestation_kind
            });
        }
        reversalId = reversalSim.id;
    }

    const refundCall = planRefundCall({ payment: ctx.payment, breakdown, operationId });
    const refundSim = await stripeDispatch.dispatch(refundCall);
    if (!refundSim.ok) {
        return jsonResult(409, {
            success: false,
            code: refundSim.code,
            lock_kept: true,
            persist_used: true,
            retryBlind: false,
            phase: 'stripe_sim_refund',
            operation_id: operationId,
            mode: MODES.SIMULATED
        });
    }
    const finalized = await adapter.finalizeRefund({
        paymentId: ctx.payment.id,
        requestId: ctx.request.id,
        operationId,
        refundId: refundSim.id,
        reversalId,
        amountCents: Number(breakdown.refund_amount_cents),
        refundServiceCents: Number(breakdown.breakdown.refunded_service_cents),
        refundCustFeeCents: Number(breakdown.breakdown.refunded_customer_fee_cents),
        refundProvNetCents: Number(breakdown.breakdown.reversed_provider_net_cents),
        refundProvFeeCents: Number(breakdown.breakdown.reversed_provider_fee_cents)
    });
    if (finalized.action === 'reject') {
        return jsonResult(409, {
            success: false,
            code: finalized.code,
            lock_kept: true,
            persist_used: true,
            retryBlind: false,
            mode: MODES.SIMULATED,
            phase: 'sql_069'
        });
    }
    return jsonResult(200, {
        success: true,
        code: 'SIMULATION_COMPLETE',
        simulated: true,
        persist_used: true,
        lock_persisted: false,
        operation_id: operationId,
        payment_status: finalized.result && finalized.result.payment_status,
        transfer_status: finalized.result && finalized.result.transfer_status,
        stripe_sim_calls: stripeDispatch.calls && stripeDispatch.calls.length,
        stripe_real: 0,
        mode: MODES.SIMULATED,
        attestation_kind: attestation.attestation_kind,
        stripe_proof: false
    });
}

async function orchestratePostTransferRefund(store, options) {
    const optionsSafe = options || {};
    const validated = await validateExecuteContext(store, optionsSafe);
    if (!validated.ok) return validated.result;
    const facts = grantFactsFromValidated(validated, optionsSafe);
    const resolved = resolvePostTransferExecutionMode(optionsSafe.trustedConfig, {
        httpRoute: optionsSafe.httpRoute,
        req: optionsSafe.req,
        body: optionsSafe.body,
        query: optionsSafe.query,
        headers: optionsSafe.headers,
        facts
    });
    if (resolved.mode === MODES.SIMULATED) {
        return runSimulated(validated, optionsSafe.trustedConfig);
    }
    if (resolved.mode === MODES.STRIPE_TEST) {
        return runStripeTestPath(validated, {
            grant: loadServerGrant(),
            adapter: optionsSafe.serverAdapter,
            stripeDispatch: optionsSafe.serverStripeDispatch,
            facts
        });
    }
    return disabledPrepare(validated);
}

function runStripeTest() {
    return jsonResult(409, {
        success: false,
        code: 'STRIPE_TEST_NOT_ACTIVATED',
        mode: MODES.STRIPE_TEST,
        stripe_test_allowed: STRIPE_TEST_ACTIVATION.allowed,
        grant_active: STRIPE_TEST_GRANT.active,
        stripe_real: 0,
        execute: false
    });
}

async function reconcileOrReuse(stripeDispatch, prepared, expected) {
    if (!stripeDispatch || typeof stripeDispatch.reconcile !== 'function') {
        return decideStripeWriteAfterReconcile({ found: false, searchComplete: false, incomplete: true, code: 'STRIPE_READ_UNCERTAIN' });
    }
    const read = await stripeDispatch.reconcile(prepared, expected);
    return decideStripeWriteAfterReconcile({ ...expected, ...(read || {}) });
}

async function runStripeTestPath(ctx, options) {
    const grant = (options && options.grant) || loadServerGrant();
    const facts = (options && options.facts) || grantFactsFromValidated(ctx, options);
    const admitted = evaluateStripeTestGrant(grant, facts);
    if (!admitted.ok) {
        return jsonResult(409, {
            success: false,
            code: admitted.code,
            mode: MODES.STRIPE_TEST,
            stripe_test_allowed: false,
            persist_used: false,
            stripe_real: 0
        });
    }
    const adapter = options && options.adapter;
    const stripeDispatch = options && options.stripeDispatch;
    if (!adapter || !stripeDispatch || typeof stripeDispatch.dispatch !== 'function') {
        return jsonResult(409, {
            success: false,
            code: 'STRIPE_CLIENT_REQUIRED',
            persist_used: false,
            stripe_real: 0,
            lock_kept: false
        });
    }

    const breakdown = preparePostTransferRefundBreakdown(ctx.payment, ctx.amount.cents);
    if (!breakdown.ok) return jsonResult(400, { success: false, code: breakdown.code, lock_kept: true });
    const operationId = ctx.decision.operation_id;
    const acquired = await adapter.acquireReversalLock({
        paymentId: ctx.payment.id,
        operationId,
        requestId: ctx.request.id
    });
    if (acquired.action === 'reject') {
        return jsonResult(409, {
            success: false,
            code: acquired.code,
            lock_kept: Boolean(acquired.lock_kept),
            persist_used: true,
            mode: MODES.STRIPE_TEST
        });
    }

    let reversalId = ctx.payment.stripe_reversal_id || null;
    let attestation = { attested: false, attestation_kind: 'NONE', stripe_proof: false };

    if (acquired.action === 'resume_refund') {
        const state = await adapter.readExecutionState({
            paymentId: ctx.payment.id,
            requestId: ctx.request.id,
            operationId
        });
        reversalId = state.payment && state.payment.stripe_reversal_id || reversalId;
        if (!isConfirmedReversalId(reversalId) || !String(reversalId).startsWith('trr_')) {
            return jsonResult(409, {
                success: false,
                code: 'AMBIGUOUS_REVERSAL_ID',
                lock_kept: true,
                persist_used: true,
                retryBlind: false
            });
        }
    } else {
        const reversalCall = planReversalCall({ payment: ctx.payment, breakdown, operationId });
        if (!reversalCall.ok || reversalCall.idempotencyKey !== admitted.reversalKey) {
            return jsonResult(409, {
                success: false,
                code: reversalCall.ok ? 'IDEMPOTENCY_KEY_MISMATCH' : reversalCall.code,
                lock_kept: true,
                persist_used: true
            });
        }
        const reversalDecision = await reconcileOrReuse(stripeDispatch, reversalCall, {
            expectedAmount: reversalCall.amount,
            expectedParent: ctx.payment.stripe_transfer_id
        });
        if (reversalDecision.write !== true && !reversalDecision.reuse) {
            return jsonResult(409, {
                success: false,
                code: reversalDecision.code,
                lock_kept: true,
                persist_used: true,
                retryBlind: false,
                phase: 'stripe_test_reversal_reconcile'
            });
        }
        let reversalOutcome;
        if (reversalDecision.reuse) {
            reversalOutcome = { ok: true, id: reversalDecision.reuse, livemode: false, real: false };
        } else {
            reversalOutcome = await stripeDispatch.dispatch(reversalCall);
        }
        if (!reversalOutcome || !reversalOutcome.ok || reversalOutcome.livemode === true) {
            return jsonResult(409, {
                success: false,
                code: (reversalOutcome && reversalOutcome.code) || 'STRIPE_LIVE_BLOCKED',
                lock_kept: true,
                persist_used: true,
                retryBlind: false,
                phase: 'stripe_test_reversal'
            });
        }
        attestation = buildServerAttestation(MODES.STRIPE_TEST, reversalOutcome);
        if (attestation.attested !== true) {
            return jsonResult(409, { success: false, code: 'CONFIRMATION_REQUIRED', lock_kept: true, retryBlind: false });
        }
        const confirmed = await adapter.confirmReversal({
            paymentId: ctx.payment.id,
            operationId,
            requestId: ctx.request.id,
            reversalId: reversalOutcome.id,
            nextStatus: nextTransferStatus(ctx.payment, breakdown.breakdown.reversed_provider_net_cents),
            attested: attestation.attested
        });
        if (confirmed.action === 'reject') {
            return jsonResult(409, {
                success: false,
                code: confirmed.code,
                lock_kept: true,
                persist_used: true,
                retryBlind: false
            });
        }
        reversalId = reversalOutcome.id;
    }

    const refundCall = planRefundCall({ payment: ctx.payment, breakdown, operationId });
    if (!refundCall.ok || refundCall.idempotencyKey !== admitted.refundKey) {
        return jsonResult(409, {
            success: false,
            code: refundCall.ok ? 'IDEMPOTENCY_KEY_MISMATCH' : refundCall.code,
            lock_kept: true,
            persist_used: true
        });
    }
    const refundDecision = await reconcileOrReuse(stripeDispatch, refundCall, {
        expectedAmount: refundCall.amount,
        expectedParent: ctx.payment.stripe_payment_intent_id
    });
    if (refundDecision.write !== true && !refundDecision.reuse) {
        return jsonResult(409, {
            success: false,
            code: refundDecision.code,
            lock_kept: true,
            persist_used: true,
            retryBlind: false,
            phase: 'stripe_test_refund_reconcile'
        });
    }
    let refundOutcome;
    if (refundDecision.reuse) {
        refundOutcome = { ok: true, id: refundDecision.reuse, livemode: false, real: false };
    } else {
        refundOutcome = await stripeDispatch.dispatch(refundCall);
    }
    if (!refundOutcome || !refundOutcome.ok || refundOutcome.livemode === true) {
        return jsonResult(409, {
            success: false,
            code: (refundOutcome && refundOutcome.code) || 'STRIPE_LIVE_BLOCKED',
            lock_kept: true,
            persist_used: true,
            retryBlind: false,
            phase: 'stripe_test_refund'
        });
    }
    const finalized = await adapter.finalizeRefund({
        paymentId: ctx.payment.id,
        requestId: ctx.request.id,
        operationId,
        refundId: refundOutcome.id,
        reversalId,
        amountCents: Number(breakdown.refund_amount_cents),
        refundServiceCents: Number(breakdown.breakdown.refunded_service_cents),
        refundCustFeeCents: Number(breakdown.breakdown.refunded_customer_fee_cents),
        refundProvNetCents: Number(breakdown.breakdown.reversed_provider_net_cents),
        refundProvFeeCents: Number(breakdown.breakdown.reversed_provider_fee_cents)
    });
    if (finalized.action === 'reject') {
        return jsonResult(409, {
            success: false,
            code: finalized.code,
            lock_kept: true,
            persist_used: true,
            retryBlind: false,
            phase: 'sql_069'
        });
    }
    return jsonResult(200, {
        success: true,
        code: 'STRIPE_TEST_COMPLETE',
        mode: MODES.STRIPE_TEST,
        persist_used: true,
        operation_id: operationId,
        payment_status: finalized.result && finalized.result.payment_status,
        transfer_status: finalized.result && finalized.result.transfer_status,
        attestation_kind: attestation.attestation_kind || 'STRIPE_TEST_SERVER',
        stripe_proof: attestation.stripe_proof === true,
        stripe_real: 0
    });
}

async function executeAdminPostTransfer(store, options) {
    return orchestratePostTransferRefund(store, {
        ...(options || {}),
        httpRoute: options && options.httpRoute === false ? false : true
    });
}

executeAdminPostTransfer.orchestrate = orchestratePostTransferRefund;

module.exports = {
    MODES,
    STRIPE_TEST_ACTIVATION,
    orchestratePostTransferRefund,
    executeAdminPostTransfer,
    resolvePostTransferExecutionMode,
    buildServerAttestation,
    runStripeTest,
    runStripeTestPath,
    validateExecuteContext,
    guardAdminExecute,
    validateExpectedParents,
    validateRequestedCents,
    inspectPaymentReady,
    EXECUTE_ROUTE: '/v1/admin/post-transfer-refund-requests/:id/execute'
};
