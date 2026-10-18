'use strict';

const crypto = require('crypto');
const {
    postTransferFinancialExecutionEnabled,
    trustedRequestedCents,
    postTransferRefundRequestDecision,
    postTransferRefundRequestRow,
    postTransferRefundReplyDecision,
    postTransferRefundDecideDecision,
    postTransferRefundRejectDecision,
    postTransferRefundAccessDecision,
    claimOpenPostTransferRequest,
    claimPostTransferAdminDecision,
    canApprovePostTransferRefund,
    postTransferDecisionHistoryEntry
} = require('./stripe-policy');

function forbiddenMoney() {
    return { execute: false, createReversal: false, createRefund: false };
}

function jsonResult(http, body) {
    return { http, body: { ...body, ...forbiddenMoney() } };
}

function newId() {
    return crypto.randomUUID();
}

function adminContext(member) {
    if (!member) return null;
    const nested = member.member && typeof member.member === 'object' ? member.member : member;
    const permissions = Array.isArray(member.permissions) && member.permissions.length
        ? member.permissions
        : (Array.isArray(nested.permissions) ? nested.permissions : []);
    return {
        role: member.role || (nested.admin_roles && nested.admin_roles.code) || nested.role || null,
        status: member.status || nested.status || 'ACTIVE',
        permissions,
        is_agent: Boolean(member.is_agent || nested.is_agent)
    };
}

async function createRequest(store, { authUid, paymentId, milestoneId, requestedCents, reason }) {
    if (postTransferFinancialExecutionEnabled()) {
        return jsonResult(409, { code: 'EXECUTION_DISABLED_REQUIRED', error: 'Moteur financier post-Transfer encore désactivé.' });
    }
    const payment = await store.getPayment({ id: paymentId, milestoneId });
    if (!payment) return jsonResult(404, { code: 'PAYMENT_NOT_FOUND', error: 'Paiement introuvable.' });
    const milestone = await store.getMilestone(payment.milestone_id || milestoneId);
    const cents = trustedRequestedCents({ requested_cents: requestedCents }, payment);
    const open = await store.listOpenRequests(payment.id);
    const claimed = claimOpenPostTransferRequest({ existingOpen: open });
    if (claimed.action === 'already') {
        const decision = postTransferRefundRequestDecision({
            authUid,
            requesterId: payment.requester_id,
            payment,
            milestone,
            requestedCents: cents,
            existingRequest: open[0]
        });
        if (decision.action === 'already') {
            return jsonResult(200, { success: true, idempotent: true, request_id: decision.requestId, code: 'ALREADY_OPEN' });
        }
        return jsonResult(decision.http, { success: false, code: decision.code || 'REQUEST_ALREADY_OPEN', error: 'Une demande est déjà en cours.' });
    }
    const decision = postTransferRefundRequestDecision({
        authUid,
        requesterId: payment.requester_id,
        payment,
        milestone,
        requestedCents: cents,
        existingRequest: null
    });
    if (decision.action !== 'record_request') {
        return jsonResult(decision.http, { success: false, code: decision.code || decision.action, error: 'Demande impossible.' });
    }
    const requestId = newId();
    const built = postTransferRefundRequestRow({
        requestId,
        payment,
        milestone,
        requesterId: payment.requester_id,
        providerId: payment.provider_id,
        requestedCents: decision.breakdown.refund_amount_cents,
        reason
    });
    const inserted = await store.insertRequest(built.row);
    if (!inserted.ok) {
        if (inserted.code === '23505') {
            return jsonResult(200, { success: true, idempotent: true, code: 'ALREADY_OPEN', request_id: inserted.requestId || null });
        }
        return jsonResult(409, { success: false, code: inserted.code || 'CONCURRENCY_LOCK_FAILED', error: 'Demande concurrente refusée.' });
    }
    await store.insertDecision(postTransferDecisionHistoryEntry({
        actorId: authUid,
        action: 'REQUESTED',
        requestId,
        reason: reason || null,
        requestedCents: built.row.requested_cents
    }), { payment_id: payment.id });
    return jsonResult(200, {
        success: true,
        request_id: requestId,
        status: 'OPEN',
        requested_cents: built.row.requested_cents,
        code: 'REQUEST_RECORDED'
    });
}

async function replyRequest(store, { authUid, requestId, response, reason }) {
    if (postTransferFinancialExecutionEnabled()) {
        return jsonResult(409, { code: 'EXECUTION_DISABLED_REQUIRED' });
    }
    const request = await store.getRequest(requestId);
    if (!request) return jsonResult(404, { code: 'REQUEST_NOT_FOUND', error: 'Demande introuvable.' });
    const payment = await store.getPayment({ id: request.payment_id });
    const decision = postTransferRefundReplyDecision({
        authUid,
        providerId: payment && payment.provider_id,
        request,
        response
    });
    if (decision.action !== 'record_reply') {
        return jsonResult(decision.http, { success: false, code: decision.code || decision.action, error: 'Réponse impossible.' });
    }
    const claimed = await store.transitionRequest(requestId, ['OPEN', 'PROVIDER_REPLIED'], {
        status: 'PROVIDER_REPLIED',
        provider_response: response
    });
    if (!claimed.ok) {
        return jsonResult(409, { success: false, code: 'CONCURRENCY_LOCK_FAILED', error: 'Réponse concurrente refusée.' });
    }
    await store.insertDecision(postTransferDecisionHistoryEntry({
        actorId: authUid,
        action: 'PROVIDER_REPLIED',
        requestId,
        reason: reason || null,
        requestedCents: request.requested_cents
    }), { payment_id: request.payment_id });
    return jsonResult(200, {
        success: true,
        request_id: requestId,
        status: 'PROVIDER_REPLIED',
        provider_response: response,
        code: 'PROVIDER_REPLIED'
    });
}

async function listMyRequests(store, { authUid }) {
    const rows = await store.listRequestsForUser(authUid);
    return jsonResult(200, { success: true, requests: rows || [] });
}

async function viewRequest(store, { authUid, requestId, admin }) {
    const request = await store.getRequest(requestId);
    if (!request) return jsonResult(404, { code: 'REQUEST_NOT_FOUND', error: 'Demande introuvable.' });
    const payment = await store.getPayment({ id: request.payment_id });
    const access = postTransferRefundAccessDecision({
        authUid,
        requesterId: payment && payment.requester_id,
        providerId: payment && payment.provider_id,
        admin: adminContext(admin)
    });
    if (access.action === 'forbidden') {
        return jsonResult(403, { success: false, code: 'FORBIDDEN', error: 'Accès refusé.' });
    }
    return jsonResult(200, { success: true, request, exposePayment: access.exposePayment });
}

async function decideRequest(store, { requestId, action, requestedCents, reason, admin }) {
    if (postTransferFinancialExecutionEnabled()) {
        return jsonResult(409, { code: 'EXECUTION_DISABLED_REQUIRED' });
    }
    const ctx = adminContext(admin);
    if (!canApprovePostTransferRefund(ctx)) {
        return jsonResult(403, { success: false, code: 'FORBIDDEN', error: 'Administrateur non autorisé.' });
    }
    const request = await store.getRequest(requestId);
    if (!request) return jsonResult(404, { code: 'REQUEST_NOT_FOUND', error: 'Demande introuvable.' });
    const claim = claimPostTransferAdminDecision(request);
    if (claim.action === 'already') {
        return jsonResult(200, { success: true, idempotent: true, status: request.status, code: 'ALREADY_DECIDED' });
    }
    if (claim.action !== 'acquire') {
        return jsonResult(claim.http, { success: false, code: claim.code || claim.action, error: 'Décision impossible.' });
    }
    const payment = await store.getPayment({ id: request.payment_id });
    const milestone = await store.getMilestone(request.milestone_id);
    const cents = action === 'reject'
        ? request.requested_cents
        : trustedRequestedCents({ requested_cents: requestedCents == null ? request.requested_cents : requestedCents }, payment);
    const decided = action === 'reject'
        ? postTransferRefundRejectDecision({ admin: ctx, request, reason, actorId: admin && admin.userId })
        : postTransferRefundDecideDecision({
            admin: ctx,
            payment,
            milestone,
            request,
            requestedCents: cents,
            actorId: admin && admin.userId,
            operationId: newId()
        });
    if (decided.action !== 'record_rejection' && decided.action !== 'record_approval') {
        return jsonResult(decided.http || 400, { success: false, code: decided.code || decided.action, error: 'Décision refusée.' });
    }
    if (decided.execute || decided.createReversal || decided.createRefund) {
        return jsonResult(409, { success: false, code: 'EXECUTION_BLOCKED', error: 'Aucun mouvement Stripe n’est autorisé.' });
    }
    const nextStatus = decided.nextStatus;
    const claimed = await store.transitionRequest(requestId, ['OPEN', 'PROVIDER_REPLIED'], {
        status: nextStatus,
        decided_by: admin && admin.userId,
        decided_at: new Date().toISOString()
    });
    if (!claimed.ok) {
        return jsonResult(409, { success: false, code: 'CONCURRENCY_LOCK_FAILED', error: 'Une autre décision a déjà été enregistrée.' });
    }
    await store.insertDecision({
        ...decided.history,
        operation_id: decided.operation_id || (decided.history && decided.history.operation_id) || null
    }, { payment_id: request.payment_id });
    return jsonResult(200, {
        success: true,
        request_id: requestId,
        status: nextStatus,
        operation_id: decided.operation_id || null,
        decided_amount_cents: decided.breakdown ? decided.breakdown.refund_amount_cents : null,
        code: nextStatus,
        stripe: forbiddenMoney()
    });
}

async function listHistory(store, { authUid, requestId, admin }) {
    const viewed = await viewRequest(store, { authUid, requestId, admin });
    if (viewed.http !== 200) return viewed;
    const rows = await store.listDecisions(requestId);
    return jsonResult(200, { success: true, request_id: requestId, history: rows, execute: false });
}

function createSupabaseStore(admin) {
    return {
        async getPayment({ id, milestoneId }) {
            if (id) {
                const { data } = await admin.from('payments').select('*').eq('id', id).maybeSingle();
                return data || null;
            }
            if (milestoneId) {
                const { data } = await admin.from('payments').select('*').eq('milestone_id', milestoneId).maybeSingle();
                return data || null;
            }
            return null;
        },
        async getMilestone(id) {
            if (!id) return null;
            const { data } = await admin.from('milestones').select('*').eq('id', id).maybeSingle();
            return data || null;
        },
        async listRequestsForUser(userId) {
            const { data } = await admin
                .from('post_transfer_refund_requests')
                .select('*')
                .or('requester_id.eq.' + userId + ',provider_id.eq.' + userId);
            return data || [];
        },
        async listOpenRequests(paymentId) {
            const { data } = await admin
                .from('post_transfer_refund_requests')
                .select('*')
                .eq('payment_id', paymentId)
                .in('status', ['OPEN', 'PROVIDER_REPLIED']);
            return data || [];
        },
        async insertRequest(row) {
            const { data, error } = await admin.from('post_transfer_refund_requests').insert(row).select('id').maybeSingle();
            if (error && error.code === '23505') return { ok: false, code: '23505' };
            if (error || !data) return { ok: false, code: error && error.code };
            return { ok: true };
        },
        async getRequest(id) {
            const { data } = await admin.from('post_transfer_refund_requests').select('*').eq('id', id).maybeSingle();
            return data || null;
        },
        async transitionRequest(id, fromStatuses, patch) {
            const { data, error } = await admin
                .from('post_transfer_refund_requests')
                .update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', id)
                .in('status', fromStatuses)
                .select('id')
                .maybeSingle();
            if (error || !data) return { ok: false };
            return { ok: true };
        },
        async insertDecision(row, extra) {
            const { error } = await admin.from('post_transfer_refund_decisions').insert({
                request_id: row.request_id,
                payment_id: extra && extra.payment_id,
                actor_id: row.actor_id,
                action: row.action,
                operation_id: row.operation_id || null,
                reason: row.reason,
                requested_cents: row.requested_cents,
                decided_amount_cents: row.decided_amount_cents
            });
            return { ok: !error };
        },
        async listDecisions(requestId) {
            const { data } = await admin
                .from('post_transfer_refund_decisions')
                .select('*')
                .eq('request_id', requestId)
                .order('created_at', { ascending: true });
            return data || [];
        }
    };
}

function memoryStore(seed) {
    const payments = new Map((seed.payments || []).map((row) => [row.id, { ...row }]));
    const milestones = new Map((seed.milestones || []).map((row) => [row.id, { ...row }]));
    const requests = new Map();
    const decisions = [];
    return {
        async getPayment({ id, milestoneId }) {
            if (id && payments.has(id)) return payments.get(id);
            if (milestoneId) return [...payments.values()].find((row) => row.milestone_id === milestoneId) || null;
            return null;
        },
        async getMilestone(id) {
            return milestones.get(id) || null;
        },
        async listRequestsForUser(userId) {
            return [...requests.values()].filter((row) => row.requester_id === userId || row.provider_id === userId);
        },
        async listOpenRequests(paymentId) {
            return [...requests.values()].filter((row) => row.payment_id === paymentId && (row.status === 'OPEN' || row.status === 'PROVIDER_REPLIED'));
        },
        async insertRequest(row) {
            const clash = [...requests.values()].find((existing) => existing.payment_id === row.payment_id && (existing.status === 'OPEN' || existing.status === 'PROVIDER_REPLIED'));
            if (clash) return { ok: false, code: '23505', requestId: clash.id };
            requests.set(row.id, { ...row });
            return { ok: true };
        },
        async getRequest(id) {
            return requests.get(id) || null;
        },
        async transitionRequest(id, fromStatuses, patch) {
            const row = requests.get(id);
            if (!row || !fromStatuses.includes(row.status)) return { ok: false };
            requests.set(id, { ...row, ...patch });
            return { ok: true };
        },
        async insertDecision(row, extra) {
            decisions.push({ ...row, payment_id: extra && extra.payment_id, id: newId() });
            return { ok: true };
        },
        async listDecisions(requestId) {
            return decisions.filter((row) => row.request_id === requestId);
        },
        _requests: requests,
        _decisions: decisions
    };
}

module.exports = {
    createRequest,
    replyRequest,
    viewRequest,
    decideRequest,
    listHistory,
    listMyRequests,
    memoryStore,
    createSupabaseStore,
    adminContext
};
