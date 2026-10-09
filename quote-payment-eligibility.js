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

    const DEAL_TIMELINE_TYPES = [
        'quote_created',
        'quote_updated',
        'quote_accepted',
        'quote_declined',
        'payment_requested',
        'payment_secured',
        'payment_failed',
        'milestone_created',
        'milestone_completed',
        'milestone_approved',
        'funds_released'
    ];

    function hiddenTimelineTypes(messages, quotes) {
        const accepted = (quotes || []).some((quote) => quote && quote.status === 'ACCEPTED');
        if (!accepted) return new Set();
        const hidden = new Set(DEAL_TIMELINE_TYPES);
        // These two cards stay: the payment request without its raw status,
        // and the secured-funds note for the Lyanneur.
        hidden.delete('payment_requested');
        hidden.delete('payment_secured');
        return hidden;
    }

    function quoteSettled(milestones) {
        return Array.isArray(milestones)
            && milestones.length > 0
            && milestones.every((milestone) => milestone && (milestone.status === 'RELEASED' || milestone.status === 'CANCELLED'));
    }

    function dealRecap(quote) {
        const milestones = (quote && quote.milestones) || [];
        const statuses = milestones.map((milestone) => milestone && milestone.status);
        const released = quoteSettled(milestones);
        const done = statuses.some((status) => status === 'COMPLETED' || status === 'VALIDATED' || status === 'RELEASED');
        const funded = statuses.some((status) => status === 'FUNDED' || status === 'IN_PROGRESS' || done);
        const lines = [];
        if (quote && quote.status === 'ACCEPTED') lines.push({ label: 'Devis', value: 'Accepté' });
        else if (quote && quote.status) lines.push({ label: 'Devis', value: String(quote.status) });
        if (quote && quote.total_amount != null) lines.push({ label: 'Montant', value: String(quote.total_amount) + ' €' });
        if (funded) lines.push({ label: 'Paiement', value: 'Encaissé' });
        if (done && !released) lines.push({ label: 'Prestation', value: 'Déclarée terminée' });
        if (released) {
            lines.push({ label: 'Prestation', value: 'Terminée' });
            lines.push({ label: 'Versement', value: 'Libéré' });
            lines.push({ label: 'Annonce', value: 'Fermée' });
        }
        return { title: 'Récapitulatif', lines, released };
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

    function providerFundsSecuredNote(name) {
        const who = String(name || '').replace(/[\r\n\t]+/g, ' ').trim() || 'votre interlocuteur';
        return [
            'Vous pouvez dès maintenant prendre rendez-vous avec ' + who + ' afin d’effectuer votre mission.',
            'Une fois votre mission réalisée, ' + who + ' libèrera vos fonds, qui vous seront versés immédiatement.',
            'Nous comptons sur vous pour mener cette mission avec soin. Merci de votre confiance.'
        ];
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
        providerFundsSecuredNote,
        quoteSettled,
        dealRecap,
        PAYMENT_ROUTE
    };
});
