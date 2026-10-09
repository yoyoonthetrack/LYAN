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
                body: '',
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

    return { cleanName, quoteStillNeedsPayout, payoutPrompt, payoutReadyCopy };
});
