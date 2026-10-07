(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_QUOTE_PAYMENT = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Same gate as POST /v1/payments/create-milestone-intent: the requester pays
    // one PENDING milestone of an accepted quote whose mission is still payable,
    // and only when that milestone has no succeeded payment.
    const PAYABLE_MISSION_STATUSES = new Set(['AGREED', 'IN_PROGRESS']);
    const SETTLED_PAYMENT_STATUSES = new Set(['SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED']);
    const PAYMENT_ROUTE = '/v1/payments/create-milestone-intent';

    function missionStatusOf(quote) {
        if (!quote) return '';
        if (quote.mission_status) return String(quote.mission_status);
        if (quote.mission && quote.mission.status) return String(quote.mission.status);
        return '';
    }

    function paymentsOf(quote) {
        return Array.isArray(quote && quote.payments) ? quote.payments : [];
    }

    function milestoneSettled(quote, milestone) {
        return paymentsOf(quote).some((payment) => payment
            && payment.milestone_id === milestone.id
            && SETTLED_PAYMENT_STATUSES.has(payment.payment_status));
    }

    function payableMilestoneForQuote(quote, userId) {
        if (!quote || !userId) return null;
        if (String(quote.requester_id) !== String(userId)) return null;
        if (quote.status !== 'ACCEPTED') return null;
        if (!quote.mission_id) return null;
        const missionStatus = missionStatusOf(quote);
        if (missionStatus && !PAYABLE_MISSION_STATUSES.has(missionStatus)) return null;
        const pending = (quote.milestones || []).find((milestone) => {
            if (!milestone || milestone.status !== 'PENDING') return false;
            const amount = Number(milestone.amount);
            if (!Number.isFinite(amount) || amount <= 0) return false;
            return !milestoneSettled(quote, milestone);
        });
        return pending || null;
    }

    function payButtonLabel(amount) {
        return 'Payer & Bloquer (' + amount + ' €)';
    }

    function payMissionPayload(quote, milestone) {
        return {
            action: 'PAY_MISSION',
            route: PAYMENT_ROUTE,
            title: (milestone && milestone.title) || (quote && quote.description) || 'Intervention LYANN',
            agreed_price: Number(milestone && milestone.amount),
            id: quote && quote.mission_id,
            milestoneId: milestone && milestone.id
        };
    }

    function hiddenTimelineTypes(messages) {
        const types = (messages || []).map((message) => message && (message.messageType || message.type));
        const hidden = new Set(['payment_requested']);
        if (types.indexOf('payment_secured') !== -1) hidden.add('quote_accepted');
        return hidden;
    }

    function nextFundingAction(quote, userId) {
        if (!quote || !userId) return null;
        const milestones = quote.milestones || [];
        const isRequester = String(quote.requester_id) === String(userId);
        const isProvider = String(quote.provider_id || quote.helper_id) === String(userId);
        const completed = milestones.find((milestone) => milestone && milestone.status === 'COMPLETED');
        const funded = milestones.find((milestone) => milestone && (milestone.status === 'FUNDED' || milestone.status === 'IN_PROGRESS'));
        if (isRequester && completed) {
            return {
                action: 'CONFIRM_DONE',
                label: 'Libérer les fonds',
                milestone: completed,
                missionId: quote.mission_id
            };
        }
        if (isProvider && funded && !completed) {
            return {
                action: 'MARK_DONE',
                label: 'J’ai terminé',
                milestone: funded,
                missionId: quote.mission_id
            };
        }
        if (isRequester && funded) {
            return {
                action: null,
                waiting: 'Fonds sécurisés. Vous pourrez les libérer quand la prestation sera déclarée terminée.'
            };
        }
        if (isProvider && completed) {
            return { action: null, waiting: 'En attente de la validation du demandeur.' };
        }
        return null;
    }

    function dispatchQuotePay(quote, userId, dispatch) {
        const milestone = payableMilestoneForQuote(quote, userId);
        if (!milestone || typeof dispatch !== 'function') return null;
        const payload = payMissionPayload(quote, milestone);
        dispatch(payload.action, payload);
        return payload;
    }

    return {
        payableMilestoneForQuote,
        payButtonLabel,
        payMissionPayload,
        dispatchQuotePay,
        hiddenTimelineTypes,
        nextFundingAction,
        PAYMENT_ROUTE
    };
});
