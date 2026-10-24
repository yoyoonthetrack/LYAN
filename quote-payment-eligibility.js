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
                actions.push({ id: 'accept', label: 'Accepter le devis' });
                actions.push({ id: 'decline', label: 'Refuser', tone: 'secondary' });
                context = 'Acceptez ou refusez ce devis pour continuer.';
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
                    status = 'Paiement sécurisé';
                    actorToAct = 'provider';
                    context = role === 'provider'
                        ? 'Le paiement est sécurisé par LYANN. Réalisez la prestation puis déclarez-la terminée.'
                        : 'Paiement sécurisé. L’argent est mis en sécurité par LYANN et n’est pas encore versé au Lyanneur. La mission peut commencer. Quand elle sera terminée, vous la validerez dans ce même chat pour libérer les fonds.';
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
                        if (step === 'paiement' && role === 'requester' && milestone.status === 'PENDING' && !milestoneSettled(quote, milestone)) {
                            actions.push({ id: 'pay', label: 'Sécuriser le paiement', milestoneId: milestone.id });
                        }
                        if (step === 'prestation' && role === 'provider') {
                            actions.push({ id: 'done', label: 'Déclarer la prestation terminée', milestoneId: milestone.id });
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
                    } else if (firstAction.id === 'done') {
                        status = 'Paiement sécurisé';
                        context = role === 'provider'
                            ? 'Le paiement est sécurisé par LYANN. Réalisez la prestation puis déclarez-la terminée.'
                            : 'Paiement sécurisé. L’argent est mis en sécurité par LYANN et n’est pas encore versé au Lyanneur. La mission peut commencer. Quand elle sera terminée, vous la validerez dans ce même chat pour libérer les fonds.';
                    } else if (firstAction.id === 'release') {
                        status = 'Prestation à valider';
                        context = 'Le Lyanneur a déclaré la prestation terminée. Vérifiez le travail avant de confirmer.';
                    }
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

        // At most one primary deal action in the header; extra milestone actions stay in details.
        const headerActions = [];
        actions.forEach((action) => {
            if (!action.milestoneId || !headerActions.some((item) => item.milestoneId)) headerActions.push(action);
        });
        const primaryAction = headerActions.find((action) => action.tone !== 'secondary') || null;
        const secondaryActions = headerActions.filter((action) => action !== primaryAction);
        const details = milestones.map((milestone) => {
            const own = actions.find((action) => action.milestoneId === milestone.id);
            const inHeader = headerActions.some((action) => action.milestoneId === milestone.id);
            const inFlight = milestone.status === 'PENDING' && milestonePaymentInFlight(quote, milestone);
            return {
                id: milestone.id,
                title: milestone.title || 'Paiement par étape',
                amount: euros(milestone.amount),
                status: milestone.status,
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
        hiddenTimelineTypes,
        isDealTimeline,
        isVisibleDealNotice,
        quoteDeclineCopy,
        missionCard,
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
        PAYMENT_ROUTE
    };
});
