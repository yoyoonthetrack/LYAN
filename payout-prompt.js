(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_PAYOUT_PROMPT = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const OPEN_QUOTE = new Set(['SENT', 'ACCEPTED']);
    const MOVED_MILESTONE = new Set(['FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED']);
    const SETTLED_PAYMENT = new Set(['SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'REFUNDED']);

    function cleanName(value, fallback) {
        const name = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
        if (!name || name.indexOf('@') !== -1 || name.length > 48) return fallback;
        return name;
    }

    function quoteStillNeedsPayout(quote) {
        if (!quote || !OPEN_QUOTE.has(quote.status)) return false;
        const milestones = Array.isArray(quote.milestones) ? quote.milestones : [];
        if (milestones.some((milestone) => milestone && MOVED_MILESTONE.has(milestone.status))) return false;
        const payments = Array.isArray(quote.payments) ? quote.payments : [];
        if (payments.some((payment) => payment && SETTLED_PAYMENT.has(payment.payment_status))) return false;
        return true;
    }

    function payoutPrompt(input) {
        const role = input && input.role;
        const status = input && input.status;
        const readiness = input && input.readiness;
        if (role !== 'provider' && role !== 'requester') return null;
        if (status !== 'SENT' && status !== 'ACCEPTED') return null;
        if (readiness === 'active') return null;

        if (readiness === 'unknown') {
            return {
                title: 'Vérification du compte de versement…',
                body: 'L’état du compte n’est pas encore connu. Aucune action de paiement n’est ouverte pour l’instant.',
                action: '',
                intent: '',
                blockPay: true
            };
        }
        if (readiness === 'pending') {
            return role === 'provider'
                ? {
                    title: 'Votre compte de versement est en cours de vérification.',
                    body: 'Le demandeur pourra sécuriser le paiement dès que la vérification sera terminée.',
                    action: '',
                    intent: '',
                    blockPay: true
                }
                : {
                    title: 'En attente du Lyanneur',
                    body: 'Le compte de versement est en cours de vérification. Vous n’avez aucune action immédiate.',
                    action: '',
                    intent: '',
                    blockPay: true
                };
        }
        if (readiness === 'error') {
            const providerName = cleanName(input.providerName, 'votre interlocuteur');
            return role === 'provider'
                ? {
                    title: 'Impossible de vérifier votre compte de versement.',
                    body: '',
                    action: 'Réessayer',
                    intent: 'retry',
                    blockPay: true
                }
                : {
                    title: 'Impossible de vérifier le compte de versement de ' + providerName + ' pour le moment.',
                    body: '',
                    action: 'Réessayer',
                    intent: 'retry',
                    blockPay: true
                };
        }
        if (readiness !== 'none' && readiness !== 'incomplete') return null;

        const action = readiness === 'incomplete' ? 'Continuer' : 'Configurer';
        if (role === 'provider' && status === 'ACCEPTED') {
            const requesterName = cleanName(input.requesterName, 'Le demandeur');
            return {
                title: requesterName + ' a accepté votre devis.',
                body: 'Configurez votre compte de versement pour qu’il puisse vous payer.',
                action: action,
                intent: 'setup',
                blockPay: true
            };
        }
        if (role === 'provider') {
            return {
                title: 'Pour recevoir ce paiement, configurez votre compte de versement.',
                body: 'Les coordonnées bancaires se renseignent dans Finances. Le demandeur ne pourra pas payer tant que ce n’est pas fait.',
                action: action,
                intent: 'setup',
                blockPay: true
            };
        }
        const providerName = cleanName(input.providerName, 'Le Lyanneur');
        return {
            title: providerName + ' doit configurer son compte de versement avant que vous puissiez payer.',
            body: status === 'ACCEPTED'
                ? 'Vous pourrez payer dès que c’est fait. Aucune carte n’est demandée pour l’instant.'
                : '',
            action: '',
            intent: '',
            blockPay: true
        };
    }

    function payoutReadyCopy(providerName) {
        const name = cleanName(providerName, 'Votre interlocuteur');
        const sentence = name + ' a configuré son compte de versement. Le paiement peut maintenant être effectué.';
        return {
            message: sentence,
            notificationTitle: 'Compte de versement prêt',
            notificationBody: sentence
        };
    }

    function payoutGuidance(input) {
        const role = input && input.role;
        const readiness = input && input.readiness;
        const title = String((input && input.requestTitle) || '').trim();
        const dossier = title ? ('Mission « ' + title + ' ». ') : '';
        if (readiness === 'active') {
            return { kind: 'ready', headline: '', body: '', action: null, alert: false, blockPay: false, status: '' };
        }
        if (readiness === 'unknown') {
            return {
                kind: 'unknown',
                status: 'Devis accepté',
                headline: 'Vérification du compte de versement…',
                body: dossier + 'L’état du compte n’est pas encore connu. Aucune action de paiement n’est ouverte pour l’instant.',
                action: null,
                alert: false,
                blockPay: true
            };
        }
        if (readiness === 'error') {
            return {
                kind: 'error',
                status: 'Devis accepté',
                headline: 'Impossible de vérifier le compte de versement',
                body: dossier + 'Réessayez dans un instant. Ce n’est pas une preuve que le compte n’est pas configuré.',
                action: { id: 'retry', label: 'Réessayer' },
                alert: true,
                blockPay: true
            };
        }
        if (readiness === 'pending') {
            if (role === 'provider') {
                return {
                    kind: 'pending',
                    status: 'Devis accepté',
                    headline: 'Vérification en cours',
                    body: dossier + 'Votre compte de versement est en cours de vérification. Le demandeur pourra sécuriser le paiement ensuite.',
                    action: null,
                    alert: true,
                    blockPay: true
                };
            }
            return {
                kind: 'pending',
                status: 'En attente du Lyanneur',
                headline: 'En attente du Lyanneur',
                body: dossier + 'Le compte de versement du Lyanneur est en cours de vérification avant la sécurisation du paiement. Vous n’avez aucune action immédiate.',
                action: null,
                alert: true,
                blockPay: true
            };
        }
        if (readiness === 'none' || readiness === 'incomplete') {
            if (role === 'provider') {
                return {
                    kind: readiness,
                    status: 'Devis accepté',
                    headline: readiness === 'incomplete' ? 'Terminez la configuration' : 'Compte de versement à configurer',
                    body: dossier + 'Le devis est accepté. Configurez votre compte de versement pour que le demandeur puisse sécuriser le paiement.',
                    action: { id: 'setup', label: 'Configurer mon compte de versement' },
                    alert: true,
                    blockPay: true
                };
            }
            return {
                kind: readiness,
                status: 'En attente du Lyanneur',
                headline: 'En attente du Lyanneur',
                body: dossier + 'Le compte de versement du Lyanneur doit être finalisé avant la sécurisation du paiement. Vous n’avez aucune action immédiate.',
                action: null,
                alert: true,
                blockPay: true
            };
        }
        return {
            kind: String(readiness || 'unknown'),
            headline: 'Vérification du compte de versement…',
            body: dossier + 'L’état du compte n’est pas encore connu.',
            action: null,
            alert: false,
            blockPay: true,
            status: 'Devis accepté'
        };
    }

    function payoutChatNotice(input) {
        const kind = input && input.kind;
        const title = String((input && input.requestTitle) || '').trim() || 'cette mission';
        const role = input && input.role;
        if (kind === 'accepted_wait') {
            return role === 'provider'
                ? {
                    title: 'Devis accepté — compte de versement',
                    body: 'Le devis de « ' + title + ' » est accepté. Configurez votre compte de versement pour recevoir le paiement.',
                    open: 'Voir le dossier'
                }
                : {
                    title: 'Devis accepté — en attente du Lyanneur',
                    body: 'Le devis de « ' + title + ' » est accepté. Le Lyanneur doit finaliser son compte de versement avant la sécurisation du paiement.',
                    open: 'Voir le dossier'
                };
        }
        if (kind === 'payout_ready') {
            return {
                title: 'Compte de versement prêt',
                body: 'Le compte de versement est prêt pour « ' + title + ' ». Le paiement peut maintenant être sécurisé.',
                open: 'Voir le dossier'
            };
        }
        if (kind === 'payment_secured') {
            if (role === 'requester') {
                return {
                    title: 'Paiement sécurisé',
                    body: 'Le paiement de « ' + title + ' » est mis en sécurité par LYANN. Il n’est pas versé tout de suite au Lyanneur. La mission peut commencer. Quand elle sera terminée, vous la validerez dans ce chat pour libérer les fonds.',
                    open: 'Voir le dossier'
                };
            }
            return {
                title: 'Paiement sécurisé',
                body: 'Le paiement de « ' + title + ' » est sécurisé par LYANN. Vous pouvez réaliser la prestation, puis la déclarer terminée.',
                open: 'Voir le dossier'
            };
        }
        return null;
    }

    return { cleanName, quoteStillNeedsPayout, payoutPrompt, payoutReadyCopy, payoutGuidance, payoutChatNotice };
});
