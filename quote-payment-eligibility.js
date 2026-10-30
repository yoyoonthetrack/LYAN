(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_QUOTE_PAYMENT = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Same gate as POST /v1/payments/create-milestone-intent: the requester pays
    // one PENDING milestone of an accepted quote whose mission is still payable,
    // and only when that milestone has no succeeded payment.
    let payoutPromptApi = null;
    try {
        if (typeof require === 'function') payoutPromptApi = require('./payout-prompt.js');
    } catch (_) {}

    function guidanceApi() {
        if (typeof window !== 'undefined' && window.LYANN_PAYOUT_PROMPT) return window.LYANN_PAYOUT_PROMPT;
        return payoutPromptApi;
    }

    const PAYABLE_MISSION_STATUSES = new Set(['AGREED', 'IN_PROGRESS']);
    const SETTLED_PAYMENT_STATUSES = new Set(['SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED']);
    const IN_FLIGHT_PAYMENT_STATUSES = new Set(['CREATED', 'REQUIRES_ACTION', 'PROCESSING']);
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

    function milestonePaymentInFlight(quote, milestone) {
        if (!milestone || milestoneSettled(quote, milestone)) return false;
        return paymentsOf(quote).some((payment) => payment
            && payment.milestone_id === milestone.id
            && IN_FLIGHT_PAYMENT_STATUSES.has(String(payment.payment_status || '').toUpperCase()));
    }

    function activeMilestones(quote) {
        return (quote && quote.milestones || []).filter((milestone) => milestone && milestone.status !== 'CANCELLED');
    }

    /** Tarif Direct = one payable milestone; Devis par jalons = several. No €200 gate. */
    function dealTypeOf(quote) {
        const count = activeMilestones(quote).length;
        if (count > 1) return 'paiements par étape';
        return 'tarif_direct';
    }

    function dealTypeLabel(dealType) {
        return dealType === 'paiements par étape' ? 'Devis avec paiement par étape' : 'Tarif Direct';
    }

    function resolveAnnonceTitle(quote, options) {
        if (options && options.requestTitle) return String(options.requestTitle).trim();
        if (quote && quote.request_title) return String(quote.request_title).trim();
        if (quote && quote.request && quote.request.title) return String(quote.request.title).trim();
        return '';
    }

    function resolveRequestId(quote, options) {
        if (options && options.requestId) return String(options.requestId);
        if (quote && quote.request_id) return String(quote.request_id);
        if (quote && quote.mission_related_request_id) return String(quote.mission_related_request_id);
        return null;
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

    function milestoneStatusLabel(status) {
        const labels = {
            PENDING: 'En attente de paiement',
            FUNDED: 'Paiement sécurisé',
            IN_PROGRESS: 'Travaux en cours',
            COMPLETED: 'Travail déclaré terminé',
            VALIDATED: 'Travail validé',
            RELEASED: 'Paiement libéré',
            CANCELLED: 'Annulé',
            CANCELED: 'Annulé',
            DISPUTED: 'Litige en cours'
        };
        const key = String(status || '').toUpperCase();
        return labels[key] || 'En cours';
    }

    function payButtonLabel(amount, index, total) {
        if (typeof index === 'number' && typeof total === 'number' && total > 1) {
            return 'Payer (Paiement ' + index + ' sur ' + total + ' · ' + amount + ' €)';
        }
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

    function isVisibleDealNotice(type) {
        return type === 'quote_declined'
            || type === 'quote_created'
            || type === 'quote_updated'
            || type === 'quote_accepted'
            || type === 'payment_secured'
            || type === 'milestone_completed'
            || type === 'funds_released';
    }

    function quoteDeclineCopy(quote, userId) {
        const raw = quote && quote.total_amount != null ? Number(quote.total_amount) : NaN;
        const amount = Number.isFinite(raw)
            ? (Math.round(raw * 100) / 100).toLocaleString('fr-FR') + ' €'
            : '';
        const headline = amount ? ('Le devis de ' + amount + ' a été refusé.') : 'Le devis a été refusé.';
        const providerId = quote && (quote.provider_id || quote.helper_id);
        const isProvider = !!(userId && providerId && String(providerId) === String(userId));
        return {
            headline: headline,
            next: isProvider ? 'Vous pouvez envoyer une nouvelle proposition.' : ''
        };
    }

    function hiddenTimelineTypes(messages, quotes) {
        const tracked = (quotes || []).some((quote) => quote && (quote.status === 'SENT' || quote.status === 'ACCEPTED' || quote.status === 'REJECTED'));
        if (!tracked) return new Set();
        return new Set(DEAL_TIMELINE_TYPES.filter((type) => !isVisibleDealNotice(type)));
    }

    const STEP_LABELS = ['Devis', 'Paiement', 'Prestation', 'Validation'];

    function milestonePhase(quote, milestone) {
        if (!quote || quote.status === 'REJECTED') return 'closed';
        if (quote.status === 'SENT') return 'devis';
        const status = milestone && milestone.status;
        if (status === 'RELEASED') return 'done';
        if (status === 'VALIDATED' || status === 'COMPLETED') return 'validation';
        if (status === 'FUNDED' || status === 'IN_PROGRESS') return 'prestation';
        return 'paiement';
    }

    function missionPhase(quote) {
        if (!quote || quote.status === 'REJECTED') return 'closed';
        if (quote.status === 'SENT') return 'devis';
        const milestones = (quote.milestones || []).filter((milestone) => milestone && milestone.status !== 'CANCELLED');
        if (!milestones.length) return 'unavailable';
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

    function centsLabel(cents) {
        if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents < 0) return '';
        return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function succeededPaymentForMilestone(quote, milestone) {
        return ((quote && quote.payments) || []).find((row) => {
            return row && String(row.milestone_id) === String(milestone && milestone.id)
                && String(row.payment_status || '').toUpperCase() === 'SUCCEEDED';
        }) || null;
    }

    function retainRefundView(quote, milestone) {
        const pay = succeededPaymentForMilestone(quote, milestone);
        if (!pay) return null;
        const service = Number(pay.service_amount_cents);
        const fee = Number(pay.customer_fee_cents);
        const total = Number(pay.customer_total_cents);
        const refundedTotal = Number(pay.amount_refunded_cents) || 0;
        const refundedFee = Number(pay.customer_fee_refunded_cents) || 0;
        if (![service, fee, total, refundedTotal, refundedFee].every((value) => Number.isInteger(value) && value >= 0)) return null;
        if (total !== service + fee || refundedFee > fee || refundedTotal < refundedFee || refundedTotal > total) return null;
        const refundedService = refundedTotal - refundedFee;
        const remainingService = service - refundedService;
        const remainingTotal = total - refundedTotal;
        if (remainingService <= 0 || remainingService > remainingTotal) return null;
        const refundLabel = centsLabel(remainingService);
        const feeLabel = centsLabel(fee);
        const paidLabel = centsLabel(total);
        return {
            amount_cents: remainingService,
            label: 'Demander l’annulation (' + refundLabel + ')',
            confirmCopy: [
                'Montant de prestation concerné : ' + refundLabel + '.',
                'Frais de service LYANN conservés : ' + feeLabel + '.',
                'Total payé : ' + paidLabel + '.',
                'Aucun remboursement automatique n’est lancé.',
                'L’équipe LYANN traite les fonds après validation (assistance).'
            ].join('\n')
        };
    }

    function actorCopy(actorToAct, role) {
        if (!actorToAct) return { actorLabel: '', waitingLabel: '' };
        if (actorToAct === role) {
            return {
                actorLabel: 'À vous d’agir',
                waitingLabel: role === 'requester' ? 'Le Lyanneur attend votre action.' : 'Le demandeur attend votre action.'
            };
        }
        if (actorToAct === 'requester') {
            return { actorLabel: 'Au demandeur', waitingLabel: 'En attente du demandeur.' };
        }
        return { actorLabel: 'Au Lyanneur', waitingLabel: 'En attente du Lyanneur.' };
    }

    /**
     * ActionPanel view model (E3) — single source of truth for missionCard chrome.
     * Maps server-confirmed quote/milestone/payment fields → display state + CTAs.
     * options: { requestTitle?, requestId?, reviseOk? }
     */
    function missionCard(quote, userId, readiness, options) {
        if (!quote || !userId) return null;
        if (quote.status !== 'SENT' && quote.status !== 'ACCEPTED' && quote.status !== 'REJECTED') return null;
        const providerId = quote.provider_id || quote.helper_id;
        const role = String(providerId) === String(userId) ? 'provider' : (String(quote.requester_id) === String(userId) ? 'requester' : '');
        if (!role) return null;
        const opts = options && typeof options === 'object' ? options : {};
        const phase = missionPhase(quote);
        const dealType = dealTypeOf(quote);
        const title = String(quote.description || (quote.milestones && quote.milestones[0] && quote.milestones[0].title) || 'Prestation').trim();
        const amount = euros(quote.total_amount);
        const annonceTitle = resolveAnnonceTitle(quote, opts);
        const requestId = resolveRequestId(quote, opts);
        const ready = readiness === 'active';
        const payoutBlocked = !ready && (readiness === 'none' || readiness === 'incomplete' || readiness === 'pending' || readiness === 'unknown' || readiness === 'error' || !readiness);
        const milestones = activeMilestones(quote);
        let status = 'Devis accepté';
        let context = '';
        let actorToAct = null;
        const actions = [];
        let paymentInFlight = false;

        if (quote.status === 'REJECTED') {
            status = 'Devis refusé';
            context = role === 'provider'
                ? 'Vous pouvez envoyer une nouvelle proposition.'
                : 'Ce devis n’a pas été retenu.';
            actorToAct = null;
        } else if (phase === 'devis') {
            status = role === 'requester' ? 'Devis reçu' : 'Devis envoyé';
            if (role === 'requester') {
                actorToAct = 'requester';
                actions.push({ id: 'view', label: 'Voir le devis' });
                context = 'Ouvrez le devis pour lire la prestation, les jalons et les conditions.';
            } else {
                actorToAct = 'requester';
                context = 'En attente de la réponse du demandeur.';
                if (opts.reviseOk) {
                    actions.push({ id: 'revise', label: 'Modifier le devis', tone: 'secondary' });
                }
            }
        } else if (quote.status === 'ACCEPTED' && !milestones.length) {
            status = 'Devis accepté';
            actorToAct = null;
            context = 'Le paiement par étape de paiement n’est plus disponible. Aucun paiement ne peut être lancé.';
        } else if (quote.status === 'ACCEPTED') {
            const payoutWait = phase === 'paiement' && payoutBlocked;
            const prompts = guidanceApi();
            const guidance = prompts && typeof prompts.payoutGuidance === 'function'
                ? prompts.payoutGuidance({
                    role,
                    readiness,
                    requestTitle: annonceTitle
                })
                : null;
            if (payoutWait && role === 'provider') {
                status = (guidance && guidance.status) || 'Devis accepté';
                context = (guidance && guidance.body) || 'Configurez votre compte de versement pour recevoir vos paiements.';
                actorToAct = 'provider';
                if (guidance && guidance.action) {
                    actions.push({ id: guidance.action.id, label: guidance.action.label });
                } else if (readiness === 'none' || readiness === 'incomplete') {
                    actions.push({ id: 'setup', label: 'Configurer mon compte de versement' });
                }
            } else if (payoutWait) {
                status = (guidance && guidance.status) || 'En attente du Lyanneur';
                context = (guidance && guidance.body)
                    || (readiness === 'unknown' || readiness === 'error'
                        ? 'Vérification du compte de versement…'
                        : 'Le compte de versement du Lyanneur doit être finalisé avant la sécurisation du paiement. Vous n’avez aucune action immédiate.');
                actorToAct = readiness === 'unknown' || readiness === 'error' ? null : 'provider';
                if (guidance && guidance.action && guidance.action.id === 'retry') {
                    actions.push({ id: 'retry', label: guidance.action.label, tone: 'secondary' });
                }
            } else {
                const openMilestone = milestones.find((milestone) => milestonePhase(quote, milestone) !== 'done') || null;
                paymentInFlight = !!(openMilestone && openMilestone.status === 'PENDING' && milestonePaymentInFlight(quote, openMilestone));

                if (phase === 'paiement') {
                    if (paymentInFlight) {
                        status = 'Paiement en cours';
                        actorToAct = 'requester';
                        context = role === 'requester'
                            ? 'Finalisez le paiement sécurisé pour bloquer les fonds.'
                            : 'Le demandeur a initié le paiement. Les fonds ne sont pas encore confirmés.';
                        if (role === 'requester' && openMilestone) {
                            actions.push({ id: 'pay', label: 'Finaliser le paiement', milestoneId: openMilestone.id });
                        }
                    } else {
                        status = 'Devis accepté';
                        actorToAct = 'requester';
                        context = role === 'provider'
                            ? 'En attente du paiement du demandeur.'
                            : 'Vous pouvez maintenant sécuriser le paiement.';
                    }
                } else if (phase === 'prestation') {
                    const started = milestones.some((milestone) => milestone && milestone.status === 'IN_PROGRESS');
                    const cancelAsked = milestones.some((milestone) => String(milestone && milestone.cancellation_status || '').toUpperCase() === 'REQUESTED');
                    status = cancelAsked ? 'Annulation demandée' : 'Paiement sécurisé';
                    actorToAct = cancelAsked ? 'provider' : (started ? 'provider' : 'provider');
                    if (cancelAsked && role === 'requester') {
                        context = 'Annulation envoyée. Le Lyanneur doit accepter ou continuer. Un remboursement n’est pas automatique : l’assistance LYANN peut traiter les fonds.';
                    } else if (cancelAsked) {
                        context = 'Le demandeur veut annuler. Accepter l’annulation ouvre le traitement manuel des fonds. Continuer garde la mission.';
                    } else if (!started && role === 'requester') {
                        context = 'Paiement sécurisé. Le Lyanneur n’a pas encore commencé : vous pouvez demander une annulation. Le remboursement n’est pas immédiat.';
                    } else if (!started) {
                        context = 'Le paiement est sécurisé. Touchez J’ai commencé quand vous démarrez : le demandeur ne pourra plus annuler seul.';
                    } else {
                        context = role === 'provider'
                            ? 'Le paiement est sécurisé par LYANN. Réalisez la prestation puis déclarez-la terminée.'
                            : 'Le Lyanneur a commencé. L’argent reste chez LYANN. Une annulation a besoin de son accord.';
                    }
                } else if (phase === 'validation') {
                    const transferPending = milestones.some((milestone) => milestone && milestone.status === 'VALIDATED')
                        && !milestones.some((milestone) => milestone && milestone.status === 'COMPLETED');
                    if (transferPending) {
                        status = 'Versement en cours';
                        actorToAct = null;
                        context = 'La validation est enregistrée. Les fonds restent en sécurité tant que le versement n’est pas confirmé.';
                    } else {
                        status = 'Prestation à valider';
                        actorToAct = 'requester';
                        context = role === 'requester'
                            ? 'Le Lyanneur a déclaré la prestation terminée. Vérifiez le travail avant de confirmer.'
                            : 'En attente de la validation du demandeur.';
                    }
                } else if (phase === 'closed') {
                    status = 'Prestation clôturée';
                    actorToAct = null;
                    context = role === 'provider'
                        ? 'Le paiement a été libéré vers votre compte de versement.'
                        : 'Votre validation est confirmée. Le paiement a été libéré.';
                }

                if (!payoutWait && !paymentInFlight) {
                    milestones.forEach((milestone) => {
                        const step = milestonePhase(quote, milestone);
                        const cancel = String(milestone.cancellation_status || '').toUpperCase();
                        if (step === 'paiement' && role === 'requester' && milestone.status === 'PENDING' && !milestoneSettled(quote, milestone)) {
                            const idx = milestones.indexOf(milestone);
                            const total = milestones.length;
                            const stepPrefix = total > 1 ? 'Paiement ' + (idx + 1) + ' sur ' + total : 'Paiement';
                            const payLabel = total > 1
                                ? 'Sécuriser le ' + stepPrefix + ' (' + euros(milestone.amount) + ')'
                                : 'Sécuriser le paiement';
                            actions.push({ id: 'pay', label: payLabel, milestoneId: milestone.id, stepLabel: stepPrefix });
                        }
                        if (step === 'prestation' && milestone.status === 'FUNDED') {
                            if (role === 'provider') {
                                actions.push({ id: 'start', label: 'J’ai commencé', milestoneId: milestone.id });
                            }
                            if (role === 'requester') {
                                const refundView = retainRefundView(quote, milestone);
                                if (refundView) {
                                    actions.push({
                                        id: 'refund',
                                        label: refundView.label,
                                        milestoneId: milestone.id,
                                        tone: 'secondary',
                                        confirm: true,
                                        confirmCopy: refundView.confirmCopy
                                    });
                                }
                            }
                        }
                        if (step === 'prestation' && milestone.status === 'IN_PROGRESS') {
                            if (cancel === 'REQUESTED') {
                                if (role === 'provider') {
                                    actions.push({
                                        id: 'accept_cancel',
                                        label: 'Accepter l’annulation',
                                        milestoneId: milestone.id,
                                        confirm: true,
                                        confirmCopy: 'Vous acceptez l’annulation. Aucun remboursement Stripe automatique n’est lancé. L’assistance LYANN traite les fonds.'
                                    });
                                    actions.push({ id: 'refuse_cancel', label: 'Je continue', milestoneId: milestone.id, tone: 'secondary' });
                                }
                            } else if (cancel === 'ACCEPTED' && role === 'requester') {
                                const refundView = retainRefundView(quote, milestone);
                                if (refundView) {
                                    actions.push({
                                        id: 'refund',
                                        label: refundView.label,
                                        milestoneId: milestone.id,
                                        confirm: true,
                                        confirmCopy: refundView.confirmCopy
                                    });
                                }
                            } else if (role === 'provider' && cancel !== 'ACCEPTED') {
                                actions.push({ id: 'done', label: 'Déclarer la prestation terminée', milestoneId: milestone.id });
                            } else if (role === 'requester' && cancel !== 'REFUSED' && cancel !== 'ACCEPTED') {
                                actions.push({
                                    id: 'request_cancel',
                                    label: 'Demander l’annulation',
                                    milestoneId: milestone.id,
                                    tone: 'secondary',
                                    confirm: true
                                });
                            }
                        }
                        if (step === 'validation' && role === 'requester' && milestone.status === 'COMPLETED') {
                            actions.push({ id: 'release', label: 'Valider et libérer le paiement', milestoneId: milestone.id, confirm: true });
                        }
                    });
                }
                // Align status / actor with the viewer's primary CTA when jalons are staggered.
                const firstAction = actions.find((action) => action.tone !== 'secondary');
                if (firstAction) {
                    actorToAct = role;
                    if (firstAction.id === 'pay') {
                        status = 'Devis accepté';
                        context = 'Sécurisez le paiement du prochain paiement par étape.';
                    } else if (firstAction.id === 'start') {
                        status = 'Paiement sécurisé';
                        context = 'Le paiement est sécurisé. Touchez J’ai commencé quand vous démarrez : le demandeur ne pourra plus se rembourser tout seul.';
                    } else if (firstAction.id === 'accept_cancel') {
                        status = 'Annulation demandée';
                        context = 'Le demandeur veut annuler. Accepter rembourse les fonds. Continuer garde la mission.';
                    } else if (firstAction.id === 'done') {
                        status = 'Paiement sécurisé';
                        context = role === 'provider'
                            ? 'Le paiement est sécurisé par LYANN. Réalisez la prestation puis déclarez-la terminée.'
                            : 'Paiement sécurisé. L’argent est mis en sécurité par LYANN et n’est pas encore versé au Lyanneur. La mission peut commencer. Quand elle sera terminée, vous la validerez dans ce même chat pour libérer les fonds.';
                    } else if (firstAction.id === 'release') {
                        status = 'Prestation à valider';
                        context = 'Le Lyanneur a déclaré la prestation terminée. Vérifiez le travail avant de confirmer.';
                    }
                } else if (actions.some((action) => action.id === 'refund')) {
                    actorToAct = 'requester';
                    status = 'Paiement sécurisé';
                    context = role === 'requester'
                        ? 'Le Lyanneur n’a pas encore commencé. Vous pouvez annuler et récupérer vos fonds.'
                        : 'Le demandeur peut encore annuler tant que vous n’avez pas touché J’ai commencé.';
                } else if (actions.some((action) => action.id === 'request_cancel')) {
                    context = 'Le Lyanneur a commencé. Une annulation a besoin de son accord.';
                }
            }
        } else if (phase === 'paiement' && payoutBlocked) {
            status = 'Devis accepté';
            actorToAct = 'provider';
        } else {
            status = 'Prestation clôturée';
            actorToAct = null;
            context = role === 'provider'
                ? 'Le paiement a été libéré vers votre compte de versement.'
                : 'Votre validation est confirmée. Le paiement a été libéré.';
        }

        // One jalon family in the header. Paired actions for that same
        // milestone stay together (accept + continue). Later jalons stay in details.
        const headerActions = [];
        actions.forEach((action) => {
            if (!action.milestoneId) {
                headerActions.push(action);
                return;
            }
            const headerMilestone = headerActions.find((item) => item.milestoneId);
            if (!headerMilestone || headerMilestone.milestoneId === action.milestoneId) {
                headerActions.push(action);
            }
        });
        const primaryAction = headerActions.find((action) => action.tone !== 'secondary') || null;
        const secondaryActions = headerActions.filter((action) => action !== primaryAction);
        const details = milestones.map((milestone, idx) => {
            const own = actions.find((action) => action.milestoneId === milestone.id);
            const inHeader = headerActions.some((action) => action.milestoneId === milestone.id);
            const inFlight = milestone.status === 'PENDING' && milestonePaymentInFlight(quote, milestone);
            const total = milestones.length;
            const stepPrefix = total > 1 ? 'Paiement ' + (idx + 1) + ' sur ' + total : 'Paiement';
            const rawTitle = String(milestone.title || 'Paiement par étape').trim();
            const fullTitle = total > 1 ? stepPrefix + ' : ' + rawTitle : rawTitle;
            return {
                id: milestone.id,
                index: idx + 1,
                total: total,
                stepLabel: stepPrefix,
                title: fullTitle,
                rawTitle: rawTitle,
                amount: euros(milestone.amount),
                status: milestone.status,
                statusLabel: milestoneStatusLabel(milestone.status),
                paymentState: milestoneSettled(quote, milestone) || milestone.status === 'FUNDED' || milestone.status === 'IN_PROGRESS' || milestone.status === 'COMPLETED' || milestone.status === 'RELEASED' || milestone.status === 'VALIDATED'
                    ? 'confirmed'
                    : (inFlight ? 'initiated' : (milestone.status === 'PENDING' ? 'awaiting' : 'none')),
                action: own && !inHeader ? own : null
            };
        });
        const closed = phase === 'closed' || quote.status === 'REJECTED';
        const showSteps = quote.status === 'ACCEPTED' || quote.status === 'SENT';
        const actor = actorCopy(actorToAct, role);
        return {
            panelKind: 'action',
            mode: closed ? 'history' : 'active',
            quoteId: quote.id,
            missionId: quote.mission_id || null,
            requestId,
            annonceTitle,
            dealType,
            dealTypeLabel: dealTypeLabel(dealType),
            role,
            phase,
            title,
            amount,
            status,
            context: context || actor.waitingLabel,
            actorToAct,
            actorLabel: actor.actorLabel,
            paymentInFlight,
            showSteps,
            steps: showSteps ? stepStates(phase) : [],
            primaryAction,
            secondaryActions,
            actions: headerActions,
            details,
            closed
        };
    }

    function formatQuoteDate(value) {
        const raw = String(value || '').slice(0, 10);
        const parts = raw.split('-');
        if (parts.length !== 3 || parts.some((part) => !part)) return '';
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function quoteAcceptBlock(quote, userId) {
        if (!quote || !userId) return 'Ce devis ne peut pas être ouvert.';
        const providerId = quote.provider_id || quote.helper_id;
        if (String(providerId) === String(userId) || String(quote.requester_id) !== String(userId)) {
            return 'Seul le demandeur peut accepter ce devis.';
        }
        const status = String(quote.status || '').toUpperCase();
        if (status !== 'SENT') return 'Ce devis ne peut plus être accepté.';
        const until = Date.parse(quote.valid_until);
        if (Number.isFinite(until) && until < Date.now()) return 'Ce devis a expiré.';
        const requestStatus = String(
            quote.request_status
            || (quote.request && quote.request.status)
            || ''
        ).toUpperCase();
        if (requestStatus && requestStatus !== 'OPEN') return 'La demande n’est plus ouverte.';
        const missionId = quote.mission_id || (quote.mission && quote.mission.id) || '';
        const missionStatus = String(
            quote.mission_status
            || (quote.mission && quote.mission.status)
            || ''
        ).toUpperCase();
        if (missionId && missionStatus !== 'CANCELLED' && missionStatus !== 'CANCELED') {
            return 'Une mission existe déjà pour ce devis.';
        }
        return '';
    }

    /**
     * Detail shown before a recipient can accept. Opening it never accepts.
     * The button is hidden unless the same gates as accept_request_quote are already false here.
     * The SQL function remains the authority.
     */
    function quoteReview(quote, userId) {
        if (!quote || !userId) return null;
        const providerId = quote.provider_id || quote.helper_id;
        const role = String(providerId) === String(userId) ? 'provider' : (String(quote.requester_id) === String(userId) ? 'requester' : '');
        if (!role) return null;
        const milestones = activeMilestones(quote)
            .slice()
            .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
            .map((milestone, idx, arr) => {
                const total = arr.length;
                const stepPrefix = total > 1 ? 'Paiement ' + (idx + 1) + ' sur ' + total : 'Paiement';
                const rawTitle = String(milestone.title || 'Paiement par étape').trim();
                return {
                    id: milestone.id,
                    index: idx + 1,
                    total: total,
                    stepLabel: stepPrefix,
                    title: total > 1 ? stepPrefix + ' : ' + rawTitle : rawTitle,
                    rawTitle: rawTitle,
                    detail: String(milestone.description || '').trim(),
                    amount: euros(milestone.amount),
                    status: milestone.status,
                    statusLabel: milestoneStatusLabel(milestone.status)
                };
            });
        const prestation = String(quote.description || (milestones[0] && milestones[0].title) || '').trim();
        const valid = formatQuoteDate(quote.valid_until);
        const version = Number(quote.version) || 1;
        const acceptBlock = quoteAcceptBlock(quote, userId);
        const canAccept = !acceptBlock;
        return {
            quoteId: quote.id,
            version,
            role,
            status: quote.status,
            prestation,
            amount: euros(quote.total_amount != null ? quote.total_amount : quote.amount),
            milestones,
            conditions: valid
                ? 'Valable jusqu’au ' + valid + '. Version ' + version + '.'
                : 'Aucune date de fin n’est indiquée. Version ' + version + '.',
            canAccept,
            acceptBlock,
            acceptLabel: canAccept ? 'Signer et accepter le devis' : '',
            declineLabel: canAccept ? 'Refuser' : '',
            acceptsOnOpen: false
        };
    }

    /** Neutral ActionPanel for ambiguous / loading / error — no inventing an active mission. */
    function actionPanelNeutral(kind, meta) {
        const info = meta && typeof meta === 'object' ? meta : {};
        const panels = {
            ambiguous: {
                status: 'Plusieurs annonces en cours',
                context: 'Choisissez l’annonce concernée pour voir le suivi et les actions de mission.'
            },
            loading: {
                status: 'Chargement du suivi',
                context: 'Récupération de l’état de la mission…'
            },
            error: {
                status: 'Suivi indisponible',
                context: info.message || 'Le suivi de mission n’a pas pu être chargé. Réessayez dans un instant.'
            },
            empty: {
                status: 'Aucune mission active',
                context: 'Quand un devis ou une mission sera en cours, le suivi apparaîtra ici.'
            }
        };
        const copy = panels[kind] || panels.empty;
        return {
            panelKind: kind === 'ambiguous' || kind === 'loading' || kind === 'error' || kind === 'empty' ? kind : 'empty',
            mode: 'neutral',
            quoteId: null,
            missionId: null,
            requestId: info.requestId || null,
            annonceTitle: info.requestTitle || '',
            dealType: null,
            dealTypeLabel: '',
            role: '',
            phase: null,
            title: info.title || 'Suivi de mission',
            amount: '',
            status: copy.status,
            context: copy.context,
            actorToAct: null,
            actorLabel: '',
            paymentInFlight: false,
            showSteps: false,
            steps: [],
            primaryAction: null,
            secondaryActions: [],
            actions: [],
            details: [],
            closed: false
        };
    }

    const actionPanel = missionCard;

    function quoteTime(quote) {
        return Date.parse((quote && (quote.created_at || quote.updated_at)) || '') || 0;
    }

    function missionBoard(quotes) {
        const list = (quotes || []).filter((quote) => quote && (quote.status === 'SENT' || quote.status === 'ACCEPTED' || quote.status === 'REJECTED'));
        const sorted = list.slice().sort((a, b) => quoteTime(a) - quoteTime(b));
        const active = [];
        const history = [];
        sorted.forEach((quote) => {
            // Closed / refused deals stay in history — never re-promoted to the live card.
            if (quote.status === 'ACCEPTED' && missionPhase(quote) !== 'closed') active.push(quote);
            else if (quote.status !== 'SENT') history.push(quote);
        });
        const sent = sorted.filter((quote) => quote.status === 'SENT');
        sent.forEach((quote, index) => {
            if (index === sent.length - 1) active.push(quote);
            else history.push(quote);
        });
        return { active, history };
    }

    function quoteNeedsViewerAction(quote, userId, readiness) {
        const view = missionCard(quote, userId, readiness || 'active');
        if (!view) return false;
        if (view.primaryAction) return true;
        return !!(Array.isArray(view.actions) && view.actions.some((action) => action && action.tone !== 'secondary'));
    }

    function quoteFingerprint(quote) {
        if (!quote || !quote.id) return '';
        const steps = (quote.milestones || []).map((milestone) => milestone && milestone.status ? milestone.status : '').join(',');
        return String(quote.id) + ':' + String(quote.status || '') + ':' + steps;
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
        milestoneStatusLabel,
        hiddenTimelineTypes,
        isDealTimeline,
        isVisibleDealNotice,
        quoteDeclineCopy,
        missionCard,
        quoteReview,
        actionPanel,
        actionPanelNeutral,
        missionBoard,
        missionPhase,
        dealTypeOf,
        dealTypeLabel,
        milestonePaymentInFlight,
        quoteNeedsViewerAction,
        quoteFingerprint,
        quoteTime,
        nextFundingAction,
        providerFundsSecuredNote,
        quoteSettled,
        dealRecap,
        retainRefundView,
        PAYMENT_ROUTE
    };
});
