'use strict';

const {
    postTransferFinancialExecutionEnabled,
    isConfirmedReversalId,
    isConfirmedRefundId
} = require('./stripe-policy');
const { persistGate } = require('./post-transfer-lock-persist');
const { CONFIRM_POST_TRANSFER_REFUND_RPC } = require('./post-transfer-finalize');

const LOCK_STEP_RPC = 'post_transfer_lock_step_secure';
const READ_TABLES = new Set([
    'payments',
    'post_transfer_refund_requests',
    'post_transfer_refund_decisions',
    'payment_adjustments',
    'milestones'
]);

function moneyOff(extra) {
    return {
        execute: false,
        createReversal: false,
        createRefund: false,
        invoked: false,
        persisted: false,
        engine: postTransferFinancialExecutionEnabled(),
        rpc: LOCK_STEP_RPC,
        ...extra
    };
}

function isServerReversalId(reversalId) {
    const id = String(reversalId || '');
    return isConfirmedReversalId(id) && id.startsWith('trr_') && id.length >= 8 && !id.startsWith('pending_');
}

function isTimeoutError(error) {
    const text = String((error && (error.message || error.code || error.details)) || '');
    return error && (
        error.code === 'ETIMEDOUT'
        || error.code === '57014'
        || /timeout|timed out|57014/i.test(text)
    );
}

function mapPostgresError(error) {
    if (isTimeoutError(error)) {
        return { code: 'RPC_TIMEOUT', message: 'timeout', pgCode: error && error.code || 'ETIMEDOUT', retryBlind: false };
    }
    const message = String((error && (error.message || error.details || error.hint)) || error || '');
    const codeMatch = message.match(/(FORBIDDEN|LOCK_STEP_UNKNOWN|OPERATION_ID_REQUIRED|REQUEST_REQUIRED|PAYMENT_NOT_FOUND|UNKNOWN_OPERATION|PAYMENT_ALREADY_REFUNDED|EXECUTION_IN_PROGRESS|NOT_ACQUIRABLE|CONFIRMATION_REQUIRED|TRANSFER_STATUS_REQUIRED|STRIPE_ID_PRESERVED|STRIPE_ID_FOREIGN|ALREADY_EXECUTED|DUPLICATE_OPERATION|REQUEST_NOT_APPROVED|AMOUNT_MISMATCH|PAYMENT_STATUS_BLOCKED|DISPUTED|EXCEEDS_REFUNDABLE|EXCEEDS_REVERSIBLE|LOCK_LOST|MARK_EXECUTED_FAILED|DECISION_REQUIRED|REQUEST_NOT_FOUND|AMOUNT_REQUIRED|AMOUNT_COMPONENTS_MISMATCH|REVERSAL_COMPONENTS_MISMATCH|PAYMENT_MISMATCH|REFUND_LOCK_REQUIRED|REVERSAL_STILL_LOCKED|AMBIGUOUS_RPC|RPC_TIMEOUT)/);
    return {
        code: codeMatch ? codeMatch[1] : ((error && error.code) || 'TX_ABORTED'),
        message: message.slice(0, 240),
        pgCode: error && error.code || null
    };
}

function unwrapRpc(data) {
    if (data == null) return null;
    if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (_) { return { raw: data }; }
    }
    if (Array.isArray(data)) return unwrapRpc(data[0] && (data[0].result != null ? data[0].result : data[0]));
    if (data.result != null && typeof data.result === 'object') return data.result;
    return data;
}

function createPostTransferSupabaseAdapter(options) {
    const client = options && options.client;
    const gateOptions = {
        httpRoute: options && options.httpRoute,
        isolatedLocal: options && options.isolatedLocal,
        serverStripeTestGrant: options && options.serverStripeTestGrant,
        client: options && options.client
    };
    const stats = { rpcCalls: 0, stripeCreates: 0, writes: 0 };

    function reject(code, extra) {
        return moneyOff({ action: 'reject', code, persisted: false, ...extra });
    }

    function allowed() {
        const gate = persistGate(gateOptions);
        if (!gate.ok) return gate;
        if (!client || typeof client.rpc !== 'function') return { ok: false, code: 'SUPABASE_CLIENT_REQUIRED' };
        return { ok: true };
    }

    async function invokeRpc(name, args) {
        stats.rpcCalls += 1;
        const result = await client.rpc(name, args);
        if (result && result.error) {
            const mapped = mapPostgresError(result.error);
            const error = new Error(mapped.message);
            error.code = mapped.code;
            error.pgCode = mapped.pgCode;
            error.retryBlind = false;
            throw error;
        }
        const data = unwrapRpc(result && result.data);
        if (data == null) {
            const error = new Error('AMBIGUOUS_RPC');
            error.code = 'AMBIGUOUS_RPC';
            error.retryBlind = false;
            throw error;
        }
        return data;
    }

    async function acquireReversalLock({ paymentId, operationId, requestId }) {
        const gate = allowed();
        if (!gate.ok) return reject(gate.code);
        if (!requestId) return reject('REQUEST_REQUIRED');
        try {
            const data = await invokeRpc(LOCK_STEP_RPC, {
                p_step: 'acquire',
                p_payment_id: paymentId,
                p_operation_id: operationId,
                p_request_id: requestId
            });
            if (data && data.ok !== true) return reject('AMBIGUOUS_RPC', { retryBlind: false, result: data });
            if (data && data.ok) stats.writes += data.row_count ? 1 : 0;
            return moneyOff({
                action: data && data.action,
                persisted: true,
                operation_id: operationId,
                payment_id: paymentId,
                request_id: requestId,
                result: data,
                retryBlind: false
            });
        } catch (error) {
            return reject(error.code || 'TX_ABORTED', {
                error: String(error.message).slice(0, 240),
                lock_kept: true,
                retryBlind: false
            });
        }
    }

    async function resumeReversalLock({ paymentId, operationId, requestId }) {
        const gate = allowed();
        if (!gate.ok) return reject(gate.code);
        if (!requestId) return reject('REQUEST_REQUIRED');
        try {
            const data = await invokeRpc(LOCK_STEP_RPC, {
                p_step: 'resume_reversal',
                p_payment_id: paymentId,
                p_operation_id: operationId,
                p_request_id: requestId
            });
            return moneyOff({ action: 'resume', persisted: true, operation_id: operationId, result: data, retryBlind: false });
        } catch (error) {
            return reject(error.code || 'TX_ABORTED', { error: String(error.message).slice(0, 240), retryBlind: false });
        }
    }

    async function confirmReversal({ paymentId, operationId, requestId, reversalId, nextStatus, attested, body, httpRoute, fromClient, req }) {
        const gate = allowed();
        if (!gate.ok) return reject(gate.code);
        if (body || httpRoute === true || fromClient === true || req) {
            return reject('CONFIRMATION_REQUIRED', { lock_kept: true, retryBlind: false, code_detail: 'CLIENT_ATTESTATION_FORBIDDEN' });
        }
        if (!requestId) return reject('REQUEST_REQUIRED', { lock_kept: true });
        if (attested !== true) return reject('CONFIRMATION_REQUIRED', { lock_kept: true, retryBlind: false });
        if (!isServerReversalId(reversalId)) return reject('CONFIRMATION_REQUIRED', { lock_kept: true, retryBlind: false });
        try {
            const data = await invokeRpc(LOCK_STEP_RPC, {
                p_step: 'confirm_reversal',
                p_payment_id: paymentId,
                p_operation_id: operationId,
                p_stripe_reversal_id: reversalId,
                p_next_transfer_status: nextStatus || 'REVERSED',
                p_request_id: requestId,
                p_server_attested: true
            });
            if (data && data.ok !== true) return reject('AMBIGUOUS_RPC', { retryBlind: false, lock_kept: true, result: data });
            stats.writes += 1;
            return moneyOff({
                action: data.action,
                persisted: true,
                operation_id: operationId,
                result: data,
                retryBlind: false
            });
        } catch (error) {
            return reject(error.code || 'TX_ABORTED', {
                error: String(error.message).slice(0, 240),
                lock_kept: true,
                retryBlind: false
            });
        }
    }

    async function resumeRefundLock({ paymentId, operationId, requestId }) {
        const gate = allowed();
        if (!gate.ok) return reject(gate.code);
        if (!requestId) return reject('REQUEST_REQUIRED');
        try {
            const data = await invokeRpc(LOCK_STEP_RPC, {
                p_step: 'resume_refund',
                p_payment_id: paymentId,
                p_operation_id: operationId,
                p_request_id: requestId
            });
            return moneyOff({ action: 'resume', persisted: true, operation_id: operationId, result: data, retryBlind: false });
        } catch (error) {
            return reject(error.code || 'TX_ABORTED', {
                error: String(error.message).slice(0, 240),
                lock_kept: true,
                retryBlind: false
            });
        }
    }

    async function finalizeRefund(input) {
        const gate = allowed();
        if (!gate.ok) return reject(gate.code, { rpc: CONFIRM_POST_TRANSFER_REFUND_RPC, rpcInvoked: false });
        if (!isConfirmedRefundId(input.refundId) || !isConfirmedReversalId(input.reversalId)) {
            return reject('CONFIRMATION_REQUIRED', { lock_kept: true, rpc: CONFIRM_POST_TRANSFER_REFUND_RPC, rpcInvoked: false });
        }
        try {
            const data = await invokeRpc(CONFIRM_POST_TRANSFER_REFUND_RPC, {
                p_payment_id: input.paymentId,
                p_request_id: input.requestId,
                p_operation_id: input.operationId,
                p_stripe_refund_id: input.refundId,
                p_stripe_reversal_id: input.reversalId,
                p_amount_cents: input.amountCents,
                p_refund_service_cents: input.refundServiceCents,
                p_refund_cust_fee_cents: input.refundCustFeeCents,
                p_refund_prov_net_cents: input.refundProvNetCents,
                p_refund_prov_fee_cents: input.refundProvFeeCents
            });
            stats.writes += 1;
            return moneyOff({
                action: (data && data.action) || 'complete',
                persisted: true,
                invoked: false,
                rpcInvoked: true,
                rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
                result: data
            });
        } catch (error) {
            return reject(error.code || 'TX_ABORTED', {
                lock_kept: true,
                rpc: CONFIRM_POST_TRANSFER_REFUND_RPC,
                rpcInvoked: false,
                error: String(error.message).slice(0, 240)
            });
        }
    }

    async function readExecutionState({ paymentId, requestId, operationId }) {
        const gate = allowed();
        if (!gate.ok) return reject(gate.code);
        if (typeof client.from !== 'function') return reject('SUPABASE_CLIENT_REQUIRED');
        const payment = await client.from('payments').select('*').eq('id', paymentId).maybeSingle();
        if (payment.error) return reject(mapPostgresError(payment.error).code);
        let request = null;
        let decisions = [];
        let adjustment = null;
        if (requestId) {
            const req = await client.from('post_transfer_refund_requests').select('*').eq('id', requestId).maybeSingle();
            if (req.error) return reject(mapPostgresError(req.error).code);
            request = req.data || null;
            const decBuilder = client.from('post_transfer_refund_decisions').select('*').eq('request_id', requestId);
            const dec = typeof decBuilder.list === 'function'
                ? await decBuilder.list()
                : await decBuilder;
            decisions = (dec && dec.data) || [];
        }
        if (operationId) {
            const adj = await client.from('payment_adjustments').select('*').eq('operation_id', operationId).maybeSingle();
            adjustment = adj && adj.data || null;
        }
        return moneyOff({
            action: 'read',
            payment: payment.data || null,
            request,
            decisions,
            adjustment
        });
    }

    return {
        acquireReversalLock,
        resumeReversalLock,
        confirmReversal,
        resumeRefundLock,
        finalizeRefund,
        readExecutionState,
        stats,
        LOCK_STEP_RPC,
        FINALIZE_RPC: CONFIRM_POST_TRANSFER_REFUND_RPC,
        READ_TABLES
    };
}

function createIsolatedSupabaseShim(query) {
    function rpcResult(sql, params) {
        try {
            const rows = query(sql, params);
            const first = rows && rows[0];
            return { data: first && (first.result != null ? first.result : first), error: null };
        } catch (error) {
            return { data: null, error: { message: String(error.message), code: 'P0001' } };
        }
    }
    return {
        async rpc(name, args) {
            if (name === LOCK_STEP_RPC) {
                return rpcResult(
                    'SELECT public.post_transfer_lock_step_secure($1, $2, $3, $4, $5, $6, $7) AS result',
                    [
                        args.p_step,
                        args.p_payment_id,
                        args.p_operation_id,
                        args.p_stripe_reversal_id || null,
                        args.p_next_transfer_status || null,
                        args.p_request_id || null,
                        args.p_server_attested === true
                    ]
                );
            }
            if (name === CONFIRM_POST_TRANSFER_REFUND_RPC) {
                return rpcResult(
                    'SELECT public.confirm_post_transfer_refund_secure($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS result',
                    [
                        args.p_payment_id,
                        args.p_request_id,
                        args.p_operation_id,
                        args.p_stripe_refund_id,
                        args.p_stripe_reversal_id,
                        args.p_amount_cents,
                        args.p_refund_service_cents,
                        args.p_refund_cust_fee_cents,
                        args.p_refund_prov_net_cents,
                        args.p_refund_prov_fee_cents
                    ]
                );
            }
            return { data: null, error: { message: 'RPC_UNKNOWN', code: 'PGRST202' } };
        },
        from(table) {
            if (!READ_TABLES.has(table)) {
                return {
                    select() {
                        return {
                            eq() { return this; },
                            maybeSingle: async () => ({ data: null, error: { message: 'TABLE_FORBIDDEN' } })
                        };
                    }
                };
            }
            const filters = [];
            const api = {
                select() { return api; },
                eq(column, value) { filters.push({ column, value }); return api; },
                async maybeSingle() {
                    const listed = await api.list();
                    if (listed.error) return listed;
                    return { data: (listed.data && listed.data[0]) || null, error: null };
                },
                async list() {
                    let sql = 'SELECT * FROM ' + table;
                    const params = [];
                    filters.forEach((filter, index) => {
                        sql += (index === 0 ? ' WHERE ' : ' AND ') + filter.column + ' = $' + (index + 1);
                        params.push(filter.value);
                    });
                    try {
                        return { data: query(sql, params), error: null };
                    } catch (error) {
                        return { data: [], error: { message: String(error.message) } };
                    }
                }
            };
            return api;
        }
    };
}

module.exports = {
    LOCK_STEP_RPC,
    mapPostgresError,
    isServerReversalId,
    createPostTransferSupabaseAdapter,
    createIsolatedSupabaseShim
};
