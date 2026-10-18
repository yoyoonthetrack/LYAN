'use strict';

const {
    postTransferFinancialExecutionEnabled,
    inspectStripeEnv,
    prepareTransfersCreateReversal,
    prepareRefundsCreate,
    invokePreparedStripeCall,
    reconcileReversalAfterFailure,
    reconcilePostTransferRefundAfterFailure,
    isConfirmedReversalId,
    isConfirmedRefundId,
    stripeChargeId,
    routePostTransferWebhook
} = require('./stripe-policy');

const METHOD = {
    CREATE_REVERSAL: 'transfers.createReversal',
    CREATE_REFUND: 'refunds.create',
    RETRIEVE_TRANSFER: 'transfers.retrieve',
    LIST_REVERSALS: 'transfers.listReversals',
    RETRIEVE_REFUND: 'refunds.retrieve',
    LIST_REFUNDS: 'refunds.list',
    RETRIEVE_INTENT: 'paymentIntents.retrieve',
    RETRIEVE_CHARGE: 'charges.retrieve'
};

const WRITE_METHODS = new Set([METHOD.CREATE_REVERSAL, METHOD.CREATE_REFUND]);
const READ_METHODS = new Set([
    METHOD.RETRIEVE_TRANSFER,
    METHOD.LIST_REVERSALS,
    METHOD.RETRIEVE_REFUND,
    METHOD.LIST_REFUNDS,
    METHOD.RETRIEVE_INTENT,
    METHOD.RETRIEVE_CHARGE
]);

const POST_TRANSFER_STRIPE_CONTRACTS = {
    [METHOD.CREATE_REVERSAL]: {
        parent: 'transfer',
        parentPrefix: 'tr_',
        resultPrefix: 'trr_',
        amountField: 'reversal_amount_cents',
        idempotency: 'rv_op_<operation_id>',
        account: 'platform_test',
        timeout: 'transfers.retrieve + transfers.listReversals; keep lock if uncertain'
    },
    [METHOD.CREATE_REFUND]: {
        parent: 'payment_intent_or_charge',
        parentPrefix: 'pi_|ch_',
        resultPrefix: 're_',
        amountField: 'refund_amount_cents',
        idempotency: 're_op_<operation_id>_after_rv',
        account: 'platform_test',
        timeout: 'refunds.retrieve or refunds.list; keep lock if uncertain'
    },
    [METHOD.RETRIEVE_TRANSFER]: {
        parent: 'transfer',
        parentPrefix: 'tr_',
        resultPrefix: 'tr_',
        account: 'platform_test'
    },
    [METHOD.LIST_REVERSALS]: {
        parent: 'transfer',
        parentPrefix: 'tr_',
        resultPrefix: 'trr_'
    },
    [METHOD.RETRIEVE_REFUND]: {
        parent: 'refund',
        parentPrefix: 're_',
        resultPrefix: 're_'
    },
    [METHOD.LIST_REFUNDS]: {
        parent: 'payment_intent_or_charge',
        parentPrefix: 'pi_|ch_',
        resultPrefix: 're_'
    },
    [METHOD.RETRIEVE_INTENT]: {
        parent: 'payment_intent',
        parentPrefix: 'pi_',
        resultPrefix: 'pi_'
    },
    [METHOD.RETRIEVE_CHARGE]: {
        parent: 'charge',
        parentPrefix: 'ch_',
        resultPrefix: 'ch_'
    }
};

function isReadMethod(method) {
    return READ_METHODS.has(method);
}

function isWriteMethod(method) {
    return WRITE_METHODS.has(method);
}

function moneyOff(extra) {
    return {
        ok: false,
        invoked: false,
        execute: false,
        createReversal: false,
        createRefund: false,
        engine: postTransferFinancialExecutionEnabled(),
        ...extra
    };
}

function rejectLiveStripe(env, object) {
    const inspected = inspectStripeEnv(env || process.env);
    if (inspected.mode === 'live' || inspected.liveBlocked || inspected.secretKind === 'live') {
        return moneyOff({ code: 'STRIPE_LIVE_BLOCKED' });
    }
    if (object && object.livemode === true) {
        return moneyOff({ code: 'STRIPE_LIVE_BLOCKED' });
    }
    return { ok: true, inspected };
}

function validatePreparedAgainstPayment(prepared, payment, expected) {
    if (!prepared || !prepared.ok) return moneyOff({ code: (prepared && prepared.code) || 'PREPARE_REQUIRED' });
    if (!payment) return moneyOff({ code: 'PAYMENT_NOT_FOUND' });
    if (prepared.method === METHOD.CREATE_REVERSAL || prepared.method === METHOD.RETRIEVE_TRANSFER || prepared.method === METHOD.LIST_REVERSALS) {
        if (!payment.stripe_transfer_id) return moneyOff({ code: 'TRANSFER_ID_REQUIRED' });
        if (prepared.transfer !== payment.stripe_transfer_id) return moneyOff({ code: 'TRANSFER_MISMATCH' });
        if (expected && expected.transfer && expected.transfer !== prepared.transfer) {
            return moneyOff({ code: 'TRANSFER_MISMATCH' });
        }
    }
    if (prepared.method === METHOD.CREATE_REFUND || prepared.method === METHOD.LIST_REFUNDS || prepared.method === METHOD.RETRIEVE_INTENT) {
        if (prepared.payment_intent && payment.stripe_payment_intent_id
            && prepared.payment_intent !== payment.stripe_payment_intent_id) {
            return moneyOff({ code: 'PAYMENT_INTENT_MISMATCH' });
        }
        if (expected && expected.payment_intent && prepared.payment_intent !== expected.payment_intent) {
            return moneyOff({ code: 'PAYMENT_INTENT_MISMATCH' });
        }
    }
    if (prepared.method === METHOD.RETRIEVE_CHARGE || (expected && expected.charge)) {
        if (prepared.charge && payment.stripe_charge_id
            && prepared.charge !== stripeChargeId(payment.stripe_charge_id)
            && prepared.charge !== payment.stripe_charge_id) {
            return moneyOff({ code: 'CHARGE_MISMATCH' });
        }
        if (expected && expected.charge && prepared.charge && prepared.charge !== expected.charge) {
            return moneyOff({ code: 'CHARGE_MISMATCH' });
        }
    }
    if (expected && expected.connectAccount && payment.stripe_connect_account_id
        && expected.connectAccount !== payment.stripe_connect_account_id) {
        return moneyOff({ code: 'CONNECT_ACCOUNT_MISMATCH' });
    }
    if (expected && expected.amount != null && Number(prepared.amount) !== Number(expected.amount)) {
        return moneyOff({ code: 'AMOUNT_MISMATCH' });
    }
    return { ok: true };
}

function admitStripeDispatch(prepared, context) {
    const live = rejectLiveStripe(context && context.env, prepared && prepared.object);
    if (!live.ok) return live;
    if (postTransferFinancialExecutionEnabled() !== true) {
        return moneyOff({ code: 'STRIPE_INVOKE_FORBIDDEN', method: prepared && prepared.method });
    }
    if (!context || context.allowReal !== true) {
        return moneyOff({ code: 'STRIPE_REAL_DISPATCH_DISABLED', method: prepared && prepared.method });
    }
    const against = validatePreparedAgainstPayment(prepared, context.payment, context.expected);
    if (!against.ok) return against;
    return moneyOff({
        ok: false,
        code: 'STRIPE_INVOKE_FORBIDDEN',
        method: prepared && prepared.method,
        note: 'financial dispatch remains closed'
    });
}

function admitStripeRead(prepared, context) {
    if (isWriteMethod(prepared && prepared.method)) {
        return moneyOff({ code: 'STRIPE_WRITE_FORBIDDEN_ON_READ_PATH', method: prepared.method });
    }
    if (!isReadMethod(prepared && prepared.method)) {
        return moneyOff({ code: 'STRIPE_READ_METHOD_UNKNOWN', method: prepared && prepared.method });
    }
    const live = rejectLiveStripe(context && context.env, prepared && prepared.object);
    if (!live.ok) return live;
    if (context && context.payment) {
        const against = validatePreparedAgainstPayment(prepared, context.payment, context.expected);
        if (!against.ok) return against;
    }
    if (context && context.expected) {
        if (context.expected.platformAccount && prepared.platformAccount
            && context.expected.platformAccount !== prepared.platformAccount) {
            return moneyOff({ code: 'PLATFORM_ACCOUNT_MISMATCH' });
        }
    }
    return { ok: true, read: true, execute: false, createReversal: false, createRefund: false };
}

function classifyStripeRead({ found, searchComplete, candidates, timeout, incomplete, livemode }) {
    if (livemode === true) {
        return { status: 'blocked', code: 'STRIPE_LIVE_BLOCKED', createReversal: false, createRefund: false };
    }
    if (timeout === true || incomplete === true) {
        return { status: 'uncertain', code: 'STRIPE_READ_UNCERTAIN', createReversal: false, createRefund: false };
    }
    if (Number(candidates || 0) > 1) {
        return { status: 'uncertain', code: 'MULTIPLE_CANDIDATES', createReversal: false, createRefund: false };
    }
    if (found === true && searchComplete === true) {
        return { status: 'confirmed', code: 'CONFIRMED', createReversal: false, createRefund: false };
    }
    if (found === false && searchComplete === true) {
        return { status: 'absent', code: 'NOT_FOUND', createReversal: false, createRefund: false };
    }
    return { status: 'uncertain', code: 'STRIPE_READ_UNCERTAIN', createReversal: false, createRefund: false };
}

function planReversalCall({ payment, breakdown, operationId }) {
    return prepareTransfersCreateReversal({ payment, breakdown, operationId });
}

function planRefundCall({ payment, breakdown, operationId }) {
    return prepareRefundsCreate({ payment, breakdown, operationId });
}

function planTransferRetrieve(payment) {
    return {
        ok: Boolean(payment && payment.stripe_transfer_id),
        invoke: false,
        execute: false,
        method: METHOD.RETRIEVE_TRANSFER,
        transfer: payment && payment.stripe_transfer_id
    };
}

function planListReversals(payment) {
    return {
        ok: Boolean(payment && payment.stripe_transfer_id),
        invoke: false,
        execute: false,
        method: METHOD.LIST_REVERSALS,
        transfer: payment && payment.stripe_transfer_id
    };
}

function planRefundRetrieve(refundId) {
    return {
        ok: isConfirmedRefundId(refundId),
        invoke: false,
        execute: false,
        method: METHOD.RETRIEVE_REFUND,
        refund: refundId
    };
}

function planListRefunds(payment) {
    return {
        ok: Boolean(payment && (payment.stripe_payment_intent_id || payment.stripe_charge_id)),
        invoke: false,
        execute: false,
        method: METHOD.LIST_REFUNDS,
        payment_intent: payment && payment.stripe_payment_intent_id,
        charge: payment && stripeChargeId(payment.stripe_charge_id)
    };
}

function planPaymentIntentRetrieve(payment) {
    return {
        ok: Boolean(payment && payment.stripe_payment_intent_id),
        invoke: false,
        execute: false,
        method: METHOD.RETRIEVE_INTENT,
        payment_intent: payment && payment.stripe_payment_intent_id
    };
}

function planChargeRetrieve(payment) {
    return {
        ok: Boolean(payment && payment.stripe_charge_id),
        invoke: false,
        execute: false,
        method: METHOD.RETRIEVE_CHARGE,
        charge: payment && payment.stripe_charge_id
    };
}

async function invokeStripeRead(stripeClient, prepared) {
    if (!stripeClient) {
        return { found: false, searchComplete: false, incomplete: true, timeout: false, object: null };
    }
    try {
        if (prepared.method === METHOD.RETRIEVE_TRANSFER) {
            const object = await stripeClient.transfers.retrieve(prepared.transfer);
            return { found: Boolean(object && object.id), searchComplete: true, object, candidates: object ? 1 : 0, livemode: object && object.livemode };
        }
        if (prepared.method === METHOD.LIST_REVERSALS) {
            const listed = await stripeClient.transfers.listReversals(prepared.transfer, { limit: 100 });
            const data = (listed && listed.data) || [];
            return {
                found: data.length > 0,
                searchComplete: listed && listed.has_more !== true,
                incomplete: Boolean(listed && listed.has_more === true),
                candidates: data.length,
                object: listed,
                livemode: data[0] && data[0].livemode
            };
        }
        if (prepared.method === METHOD.RETRIEVE_REFUND) {
            const object = await stripeClient.refunds.retrieve(prepared.refund);
            return { found: Boolean(object && object.id), searchComplete: true, object, candidates: 1, livemode: object && object.livemode };
        }
        if (prepared.method === METHOD.LIST_REFUNDS) {
            const query = { limit: 100 };
            if (prepared.payment_intent) query.payment_intent = prepared.payment_intent;
            else if (prepared.charge) query.charge = prepared.charge;
            const listed = await stripeClient.refunds.list(query);
            const data = (listed && listed.data) || [];
            return {
                found: data.length > 0,
                searchComplete: listed && listed.has_more !== true,
                incomplete: Boolean(listed && listed.has_more === true),
                candidates: data.length,
                object: listed,
                livemode: data[0] && data[0].livemode
            };
        }
        if (prepared.method === METHOD.RETRIEVE_INTENT) {
            const object = await stripeClient.paymentIntents.retrieve(prepared.payment_intent);
            return { found: Boolean(object && object.id), searchComplete: true, object, candidates: 1, livemode: object && object.livemode };
        }
        if (prepared.method === METHOD.RETRIEVE_CHARGE) {
            const object = await stripeClient.charges.retrieve(prepared.charge);
            return { found: Boolean(object && object.id), searchComplete: true, object, candidates: 1, livemode: object && object.livemode };
        }
        return { found: false, searchComplete: false, incomplete: true };
    } catch (error) {
        if (error && (error.code === 'ETIMEDOUT' || error.type === 'StripeConnectionError')) {
            return { found: false, searchComplete: false, timeout: true, incomplete: true };
        }
        if (error && (error.code === 'resource_missing' || error.statusCode === 404)) {
            return { found: false, searchComplete: true, object: null, candidates: 0 };
        }
        return { found: false, searchComplete: false, incomplete: true, error: String(error && error.code || 'read_failed') };
    }
}

async function dispatchStripeRead(prepared, stripeClient, context) {
    const admitted = admitStripeRead(prepared, context || {});
    if (!admitted.ok) {
        return moneyOff({ ...admitted, classification: 'blocked' });
    }
    const raw = await invokeStripeRead(stripeClient, prepared);
    const classification = classifyStripeRead(raw);
    return {
        ok: classification.status === 'confirmed',
        invoked: Boolean(stripeClient),
        read: true,
        write: false,
        execute: false,
        createReversal: false,
        createRefund: false,
        method: prepared.method,
        classification: classification.status,
        code: classification.code,
        object: raw.object || null,
        candidates: raw.candidates || 0,
        livemode: raw.livemode === true
    };
}

function dispatchPreparedStripeCall(prepared, stripeClient, context) {
    const admitted = admitStripeDispatch(prepared, context || {});
    if (stripeClient && typeof stripeClient === 'object' && context && context.recordClient) {
        context.recordClient({ attempted: true, invoked: false, method: prepared && prepared.method });
    }
    if (prepared && prepared.ok === false) {
        return moneyOff({ ...admitted, code: admitted.code || prepared.code, method: prepared.method });
    }
    return {
        ...invokePreparedStripeCall(prepared),
        ...admitted,
        invoked: false,
        stripeClientUsed: false
    };
}

function interpretMockOutcome(kind, payload) {
    if (kind === 'reversal_success') {
        if (!isConfirmedReversalId(payload && payload.id)) return moneyOff({ code: 'CONFIRMATION_REQUIRED' });
        return { ok: true, invoked: false, action: 'reversal_confirmed', reversalId: payload.id, livemode: false };
    }
    if (kind === 'reversal_refused') {
        return moneyOff({ action: 'reversal_failed', code: payload && payload.code || 'REVERSAL_REFUSED' });
    }
    if (kind === 'reversal_timeout') {
        return {
            ok: true,
            invoked: false,
            action: 'keep',
            retryBlind: false,
            ...reconcileReversalAfterFailure({
                recoveredReversal: payload && payload.recoveredReversal || null,
                listedReversals: payload && payload.listedReversals || [],
                listRetrieved: payload && payload.listRetrieved === true,
                insufficientConnectBalance: payload && payload.insufficientConnectBalance === true
            })
        };
    }
    if (kind === 'reversal_already') {
        if (!isConfirmedReversalId(payload && payload.id)) return moneyOff({ code: 'CONFIRMATION_REQUIRED' });
        return { ok: true, invoked: false, action: 'already', reversalId: payload.id };
    }
    if (kind === 'refund_success') {
        if (!isConfirmedRefundId(payload && payload.id)) return moneyOff({ code: 'CONFIRMATION_REQUIRED' });
        return { ok: true, invoked: false, action: 'refund_confirmed', refundId: payload.id, livemode: false };
    }
    if (kind === 'refund_refused') {
        return moneyOff({ action: 'refund_failed', code: payload && payload.code || 'REFUND_REFUSED' });
    }
    if (kind === 'refund_timeout') {
        return {
            ok: true,
            invoked: false,
            retryBlind: false,
            ...reconcilePostTransferRefundAfterFailure({
                recoveredRefund: payload && payload.recoveredRefund || null,
                listedRefunds: payload && payload.listedRefunds || [],
                listRetrieved: payload && payload.listRetrieved === true
            })
        };
    }
    if (kind === 'refund_already') {
        if (!isConfirmedRefundId(payload && payload.id)) return moneyOff({ code: 'CONFIRMATION_REQUIRED' });
        return { ok: true, invoked: false, action: 'already', refundId: payload.id };
    }
    if (kind === 'webhook') {
        return { invoked: false, persist: false, ...routePostTransferWebhook(payload.event, payload.payment) };
    }
    return moneyOff({ code: 'UNKNOWN_MOCK' });
}

function createMockPostTransferStripe(behavior) {
    const calls = [];
    function run(method, args) {
        calls.push({ method, args, invoke: true });
        const spec = behavior && behavior[method];
        if (spec === 'timeout') {
            const error = new Error('timeout');
            error.code = 'ETIMEDOUT';
            throw error;
        }
        if (spec === 'refuse') {
            const error = new Error('refused');
            error.code = spec === 'refuse' && method === METHOD.CREATE_REVERSAL ? 'balance_insufficient' : 'resource_missing';
            throw error;
        }
        if (typeof spec === 'function') return spec(...args);
        if (spec && (spec.id || spec.data || spec.object === 'list')) return { livemode: false, ...spec };
        return { livemode: false, id: method === METHOD.CREATE_REVERSAL ? 'trr_mock' : 're_mock' };
    }
    return {
        calls,
        livemode: false,
        transfers: {
            createReversal(id, params, opts) { return run(METHOD.CREATE_REVERSAL, [id, params, opts]); },
            retrieve(id) { return run(METHOD.RETRIEVE_TRANSFER, [id]); },
            listReversals(id) { return run(METHOD.LIST_REVERSALS, [id]); }
        },
        refunds: {
            create(params, opts) { return run(METHOD.CREATE_REFUND, [params, opts]); },
            retrieve(id) { return run(METHOD.RETRIEVE_REFUND, [id]); },
            list(params) { return run(METHOD.LIST_REFUNDS, [params]); }
        },
        paymentIntents: {
            retrieve(id) { return run(METHOD.RETRIEVE_INTENT, [id]); }
        },
        charges: {
            retrieve(id) { return run(METHOD.RETRIEVE_CHARGE, [id]); }
        }
    };
}

function createPostTransferStripeAdapter() {
    return {
        planReversalCall,
        planRefundCall,
        planTransferRetrieve,
        planListReversals,
        planRefundRetrieve,
        planListRefunds,
        planPaymentIntentRetrieve,
        planChargeRetrieve,
        admitStripeDispatch,
        admitStripeRead,
        dispatchPreparedStripeCall,
        dispatchStripeRead,
        classifyStripeRead,
        interpretMockOutcome
    };
}

module.exports = {
    METHOD,
    READ_METHODS,
    WRITE_METHODS,
    POST_TRANSFER_STRIPE_CONTRACTS,
    isReadMethod,
    isWriteMethod,
    rejectLiveStripe,
    validatePreparedAgainstPayment,
    admitStripeDispatch,
    admitStripeRead,
    classifyStripeRead,
    planReversalCall,
    planRefundCall,
    planTransferRetrieve,
    planListReversals,
    planRefundRetrieve,
    planListRefunds,
    planPaymentIntentRetrieve,
    planChargeRetrieve,
    dispatchPreparedStripeCall,
    dispatchStripeRead,
    interpretMockOutcome,
    createMockPostTransferStripe,
    createPostTransferStripeAdapter
};
