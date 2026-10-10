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

    function isDealTimeline(type) {
        return DEAL_TIMELINE_TYPES.indexOf(type) !== -1;
    }

    function hiddenTimelineTypes(messages, quotes) {
        const tracked = (quotes || []).some((quote) => quote && (quote.status === 'SENT' || quote.status === 'ACCEPTED' || quote.status === 'REJECTED'));
        if (!tracked) return new Set();
        return new Set(DEAL_TIMELINE_TYPES);
    }

    const STEP_LABELS = ['Devis', 'Paiement', 'Prestation', 'Validation'];

    function milestonePhase(quote, milestone) {
        if (!quote || quote.status === 'REJECTED') return 'closed';
        if (quote.status === 'SENT') return 'devis';
        const status = milestone && milestone.status;
        if (status === 'RELEASED' || status === 'VALIDATED') return 'done';
        if (status === 'COMPLETED') return 'validation';
        if (status === 'FUNDED' || status === 'IN_PROGRESS') return 'prestation';
        return 'paiement';
    }

    function missionPhase(quote) {
        if (!quote || quote.status === 'REJECTED') return 'closed';
        if (quote.status === 'SENT') return 'devis';
        const milestones = (quote.milestones || []).filter((milestone) => milestone && milestone.status !== 'CANCELLED');
        if (!milestones.length) return 'paiement';
        const open = milestones.find((milestone) => milestonePhase(quote, milestone) !== 'done');
        return open ? milestonePhase(quote, open) : 'closed';
    }

    function stepStates(phase) {
        const order = ['devis', 'paiement', 'prestation', 'validation', 'closed'];
        const index = order.indexOf(phase);
        return STEP_LABELS.map((label, step) => ({
            label,
            state: phase === 'closed' || step < index ? 'done' : step === index ? 'current' : 'todo'
        }));
    }

    function euros(amount) {
        const value = Number(amount);
        if (!Number.isFinite(value)) return '';
        return (Math.round(value * 100) / 100).toLocaleString('fr-FR') + ' €';
    }

    function missionCard(quote, userId, readiness) {
        if (!quote || !userId) return null;
        if (quote.status !== 'SENT' && quote.status !== 'ACCEPTED' && quote.status !== 'REJECTED') return null;
        const providerId = quote.provider_id || quote.helper_id;
        const role = String(providerId) === String(userId) ? 'provider' : (String(quote.requester_id) === String(userId) ? 'requester' : '');
        if (!role) return null;
        const phase = missionPhase(quote);
        const title = String(quote.description || (quote.milestones && quote.milestones[0] && quote.milestones[0].title) || 'Prestation').trim();
        const amount = euros(quote.total_amount);
        const ready = readiness === 'active';
        const payoutBlocked = !ready && (readiness === 'none' || readiness === 'incomplete' || readiness === 'unknown' || readiness === 'error' || !readiness);
        const milestones = (quote.milestones || []).filter((milestone) => milestone && milestone.status !== 'CANCELLED');
        let status = 'Devis accepté';
        let context = '';
        const actions = [];
        if (quote.status === 'REJECTED') {
            status = 'Devis refusé';
            context = 'Ce devis n’a pas été retenu.';
        } else if (phase === 'devis') {
            status = role === 'requester' ? 'Devis reçu' : 'Devis envoyé';
            if (role === 'requester') {
                actions.push({ id: 'accept', label: 'Accepter le devis' });
                actions.push({ id: 'decline', label: 'Refuser', tone: 'secondary' });
            } else {
                context = 'En attente de la réponse du demandeur.';
            }
        } else if (quote.status === 'ACCEPTED') {
            const payoutWait = phase === 'paiement' && payoutBlocked;
            if (payoutWait && role === 'provider') {
                status = 'Devis accepté';
                context = 'Configurez votre compte de versement pour recevoir vos paiements.';
                if (readiness !== 'unknown') actions.push({ id: 'setup', label: 'Configurer mon compte' });
            } else if (payoutWait) {
                status = 'Devis accepté';
                context = 'Le Lyanneur doit finaliser son compte de versement avant le paiement.';
            } else {
                if (phase === 'paiement') {
                    status = 'Devis accepté';
                    context = role === 'provider' ? 'En attente du paiement du demandeur.' : 'Vous pouvez maintenant sécuriser le paiement.';
                } else if (phase === 'prestation') {
                    status = 'Paiement sécurisé';
                    context = 'Le paiement est sécurisé par LYANN. La prestation peut commencer.';
                } else if (phase === 'validation') {
                    status = 'Prestation à valider';
                    context = role === 'requester'
                        ? 'Le Lyanneur a déclaré la prestation terminée. Vérifiez le travail avant de confirmer.'
                        : 'En attente de la validation du demandeur.';
                } else if (phase === 'closed') {
                    status = 'Prestation clôturée';
                    context = role === 'provider'
                        ? 'Le paiement a été libéré vers votre compte de versement.'
                        : 'Votre validation est confirmée. Le paiement a été libéré.';
                }
                milestones.forEach((milestone) => {
                    const step = milestonePhase(quote, milestone);
                    if (step === 'paiement' && role === 'requester' && milestone.status === 'PENDING' && !milestoneSettled(quote, milestone)) {
                        actions.push({ id: 'pay', label: 'Sécuriser le paiement', milestoneId: milestone.id });
                    }
                    if (step === 'prestation' && role === 'provider') {
                        actions.push({ id: 'done', label: 'Déclarer la prestation terminée', milestoneId: milestone.id });
                    }
                    if (step === 'validation' && role === 'requester') {
                        actions.push({ id: 'release', label: 'Valider et libérer le paiement', milestoneId: milestone.id, confirm: true });
                    }
                });
            }
        } else if (phase === 'paiement' && payoutBlocked) {
            status = 'Devis accepté';
        } else {
            status = 'Prestation clôturée';
            context = role === 'provider'
                ? 'Le paiement a été libéré vers votre compte de versement.'
                : 'Votre validation est confirmée. Le paiement a été libéré.';
        }
        const headerActions = [];
        actions.forEach((action) => {
            if (!action.milestoneId || !headerActions.some((item) => item.milestoneId)) headerActions.push(action);
        });
        const details = milestones.map((milestone) => {
            const own = actions.find((action) => action.milestoneId === milestone.id);
            const inHeader = headerActions.some((action) => action.milestoneId === milestone.id);
            return {
                id: milestone.id,
                title: milestone.title || 'Jalon',
                amount: euros(milestone.amount),
                status: milestone.status,
                action: own && !inHeader ? own : null
            };
        });
        return {
            quoteId: quote.id,
            missionId: quote.mission_id || null,
            title,
            amount,
            status,
            context,
            steps: stepStates(phase),
            actions: headerActions,
            details,
            closed: phase === 'closed' || quote.status === 'REJECTED'
        };
    }

    function quoteTime(quote) {
        return Date.parse((quote && (quote.created_at || quote.updated_at)) || '') || 0;
    }

    function missionBoard(quotes) {
        const list = (quotes || []).filter((quote) => quote && (quote.status === 'SENT' || quote.status === 'ACCEPTED' || quote.status === 'REJECTED'));
        const sorted = list.slice().sort((a, b) => quoteTime(a) - quoteTime(b));
        const active = [];
        const history = [];
        sorted.forEach((quote) => {
            if (quote.status === 'ACCEPTED' && missionPhase(quote) !== 'closed') active.push(quote);
            else if (quote.status !== 'SENT') history.push(quote);
        });
        const sent = sorted.filter((quote) => quote.status === 'SENT');
        sent.forEach((quote, index) => {
            if (index === sent.length - 1) active.push(quote);
            else history.push(quote);
        });
        if (!active.length && history.length) {
            history.sort((a, b) => quoteTime(a) - quoteTime(b));
            active.push(history.pop());
        }
        return { active, history };
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
        isDealTimeline,
        missionCard,
        missionBoard,
        nextFundingAction,
        providerFundsSecuredNote,
        quoteSettled,
        dealRecap,
        PAYMENT_ROUTE
    };
});
