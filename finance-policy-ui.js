'use strict';

(function (root) {
    function cents(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '—';
        return (n / 100).toFixed(2).replace('.', ',') + ' €';
    }

    function classifyFinanceDisplay({ payment, milestone, mission }) {
        const pay = payment || {};
        const ms = milestone || {};
        const missionStatus = mission && mission.status;
        if (!pay.id) {
            return { code: 'ABSENT', title: 'Aucun paiement', autoRefund: false, path: 'NONE', funds: 'inconnu' };
        }
        if (pay.payment_status === 'REFUNDED') {
            return { code: 'REFUNDED', title: 'Remboursé', autoRefund: false, path: 'DONE', funds: 'rendus au client' };
        }
        if (ms.status === 'DISPUTED' || pay.payment_status === 'DISPUTED') {
            return { code: 'DISPUTED', title: 'Litige — fonds bloqués', autoRefund: false, path: 'DISPUTE', funds: 'gelés' };
        }
        if (pay.transfer_status === 'TRANSFERRED' || pay.stripe_transfer_id) {
            return {
                code: 'POST_TRANSFER',
                title: 'Transfer Stripe créé',
                autoRefund: false,
                path: 'POST_TRANSFER',
                funds: 'Transfer Stripe enregistré — le versement bancaire n’est pas confirmé comme réalisé'
            };
        }
        if (pay.client_validated_at) {
            return { code: 'VALIDATED', title: 'Validation client enregistrée', autoRefund: false, path: 'HOLD', funds: 'conservés par Stripe' };
        }
        if (ms.status === 'COMPLETED') {
            return { code: 'WORK_DONE', title: 'Prestation déclarée terminée', autoRefund: false, path: 'NEEDS_ADMIN', funds: 'conservés par Stripe' };
        }
        if (ms.status === 'IN_PROGRESS') {
            return { code: 'WORK_STARTED', title: 'Prestation commencée', autoRefund: false, path: 'NEEDS_PROVIDER_OR_ADMIN', funds: 'conservés par Stripe' };
        }
        if (missionStatus === 'CANCELLED' || missionStatus === 'CANCELED') {
            return { code: 'MISSION_CANCELLED', title: 'Mission annulée', autoRefund: false, path: 'NEEDS_ADMIN', funds: 'conservés par Stripe' };
        }
        if (pay.payment_status === 'SUCCEEDED' && (ms.status === 'FUNDED' || ms.status === 'PENDING')) {
            return {
                code: 'FUNDED_NOT_STARTED',
                title: 'Fonds reçus, prestation non commencée',
                autoRefund: true,
                path: 'AUTO_ELIGIBLE',
                funds: 'reçus par Stripe',
                note: 'FUNDED est un état technique. Un remboursement automatique n’est possible que si les conditions d’annulation sont remplies. L’exécution Stripe reste désactivée dans cet aperçu.'
            };
        }
        if (pay.payment_status === 'SUCCEEDED') {
            return { code: 'FUNDED_HOLD', title: 'Fonds reçus', autoRefund: false, path: 'HOLD', funds: 'reçus par Stripe' };
        }
        return { code: 'OTHER', title: 'État à instruire', autoRefund: false, path: 'NEEDS_ADMIN', funds: 'en attente' };
    }

    function policyCopy(code) {
        const map = {
            FUNDED_NOT_STARTED: 'Remboursement automatique possible seulement si les conditions d’annulation sont remplies. Pas de droit automatique du seul fait que le jalon est FUNDED.',
            FUNDED_HOLD: 'Les fonds sont reçus et conservés. Ce n’est pas un versement au prestataire.',
            WORK_STARTED: 'Accord du prestataire ou arbitrage LYANN obligatoire.',
            WORK_DONE: 'Pas de remboursement automatique.',
            DISPUTED: 'Les fonds restent bloqués jusqu’à résolution.',
            POST_TRANSFER: 'Un Transfer Stripe existe. Cela ne confirme pas un virement bancaire reçu.',
            REFUNDED: 'Le client a déjà été remboursé.',
            VALIDATED: 'Le client a validé la partie : le versement n’est plus une annulation simple.',
            MISSION_CANCELLED: 'Arbitrage LYANN requis.',
            ABSENT: 'Aucun dossier paiement pour cette mission.',
            OTHER: 'Ce cas n’est pas couvert par un remboursement automatique.'
        };
        return map[code] || map.OTHER;
    }

    function fundLabel(code) {
        const map = {
            FUNDED_NOT_STARTED: 'Fonds reçus',
            FUNDED_HOLD: 'Fonds reçus',
            WORK_STARTED: 'Fonds en attente du transfert',
            WORK_DONE: 'Fonds en attente du transfert',
            VALIDATED: 'Fonds en attente du transfert',
            POST_TRANSFER: 'Transfer Stripe créé — versement bancaire non confirmé',
            REFUNDED: 'Remboursement confirmé',
            DISPUTED: 'Litige ouvert — fonds bloqués',
            MISSION_CANCELLED: 'Fonds en attente',
            ABSENT: 'Aucun paiement',
            OTHER: 'Fonds en attente'
        };
        return map[code] || map.OTHER;
    }

    function missionBucket(mission, classified) {
        const status = String((mission && mission.status) || '').toUpperCase();
        if ((classified && classified.code) === 'DISPUTED' || status === 'DISPUTED') return 'dispute';
        if (status === 'CANCELLED' || status === 'CANCELED') return 'cancelled';
        if (status === 'COMPLETED' || status === 'RELEASED' || status === 'CLOSED') return 'done';
        if (status === 'IN_PROGRESS' || status === 'AGREED' || status === 'FUNDED' || status === 'WORK_MARKED_COMPLETE' || status === 'ASSIGNED') return 'active';
        return 'pending';
    }

    function euroOrDash(value) {
        if (value == null || value === '') return '—';
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value);
        return String(n).replace('.', ',') + ' €';
    }

    function rowAmounts(row) {
        const pay = (row && row.payment) || {};
        const quote = (row && row.quote) || {};
        if (pay.id && Number.isFinite(Number(pay.customer_total_cents))) {
            return {
                service: cents(pay.service_amount_cents),
                fee: cents(pay.customer_fee_cents),
                total: cents(pay.customer_total_cents),
                sourced: 'payment'
            };
        }
        if (quote.total_amount != null && quote.total_amount !== '') {
            return {
                service: euroOrDash(quote.total_amount),
                fee: '—',
                total: euroOrDash(quote.total_amount),
                sourced: 'quote'
            };
        }
        return { service: '—', fee: '—', total: '—', sourced: 'absent' };
    }

    function eventTimeline(row) {
        const events = [];
        const quote = (row && row.quote) || {};
        const pay = (row && row.payment) || {};
        const ms = (row && row.milestone) || {};
        const cls = classifyFinanceDisplay(row || {});
        if (quote.status === 'ACCEPTED') events.push({ at: 'Devis accepté', detail: quote.description || '' });
        if (pay.payment_status === 'SUCCEEDED' || pay.payment_status === 'REFUNDED' || pay.payment_status === 'DISPUTED') {
            events.push({ at: 'Paiement confirmé', detail: cents(pay.customer_total_cents) });
        }
        events.push({ at: 'État des fonds', detail: fundLabel(cls.code) });
        if (ms.status === 'IN_PROGRESS') events.push({ at: 'Début de prestation', detail: '' });
        if (ms.status === 'COMPLETED' || ms.status === 'VALIDATED' || ms.status === 'RELEASED') {
            events.push({ at: 'Fin de prestation', detail: '' });
        }
        if (pay.client_validated_at) events.push({ at: 'Validation client', detail: '' });
        if (pay.stripe_transfer_id || pay.transfer_status === 'TRANSFERRED') {
            events.push({ at: 'Versement déclenché', detail: 'Transfer Stripe créé — pas un virement bancaire confirmé' });
        }
        if (row && row.cancellation && row.cancellation.requested) {
            events.push({ at: 'Demande d’annulation', detail: row.cancellation.accepted ? 'acceptée' : 'demandée' });
        }
        if (row && row.refundRequest && row.refundRequest.status) {
            const st = row.refundRequest.status;
            events.push({
                at: st === 'CONFIRMED' ? 'Remboursement confirmé' : 'Remboursement demandé',
                detail: cents(row.refundRequest.amount_cents)
            });
        }
        if (row && row.dispute) events.push({ at: 'Litige ouvert', detail: row.dispute.status || 'OPEN' });
        return events;
    }

    function trackingNextStep(row) {
        const quote = (row && row.quote) || {};
        const pay = (row && row.payment) || {};
        const ms = (row && row.milestone) || {};
        if (quote.status === 'REJECTED') return 'Le devis a été refusé. Une nouvelle proposition peut être envoyée.';
        if (quote.status !== 'ACCEPTED') return 'En attente d’un devis accepté.';
        if (!(pay.id && (pay.payment_status === 'SUCCEEDED' || pay.payment_status === 'REFUNDED' || pay.payment_status === 'DISPUTED'))) {
            return 'Prochaine étape : sécuriser le paiement.';
        }
        if (ms.status === 'PENDING' || ms.status === 'FUNDED' || !ms.status) return 'Paiement reçu. La prestation peut commencer.';
        if (ms.status === 'IN_PROGRESS') return 'Prestation en cours.';
        if (ms.status === 'COMPLETED') return 'Prestation déclarée terminée — en attente de validation.';
        if (ms.status === 'VALIDATED' || ms.status === 'RELEASED') return 'Mission validée.';
        return 'Suivi de la mission.';
    }

    function trackingSteps(row) {
        const quote = (row && row.quote) || {};
        const pay = (row && row.payment) || {};
        const ms = (row && row.milestone) || {};
        const paid = !!(pay.id && (pay.payment_status === 'SUCCEEDED' || pay.payment_status === 'REFUNDED' || pay.payment_status === 'DISPUTED'));
        const work = ['IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED'].indexOf(String(ms.status || '')) >= 0;
        const done = ['VALIDATED', 'RELEASED'].indexOf(String(ms.status || '')) >= 0 || !!pay.client_validated_at;
        return [
            { label: 'Devis', detail: quote.status === 'ACCEPTED' ? 'Accepté' : (quote.status === 'REJECTED' ? 'Refusé' : (quote.status ? 'Envoyé' : 'En attente')) },
            { label: 'Paiement', detail: paid ? 'Sécurisé' : 'À faire' },
            { label: 'Prestation', detail: work ? (ms.status === 'IN_PROGRESS' ? 'En cours' : 'Réalisée') : 'Pas commencée' },
            { label: 'Validation', detail: done ? 'Validée' : 'Ensuite' }
        ];
    }

    function renderMissionTracking(row) {
        const quote = (row && row.quote) || {};
        const mission = (row && row.mission) || {};
        const amounts = rowAmounts(row);
        const title = String(quote.description || mission.title || 'Mission').replace(/[<>]/g, '');
        const status = trackingNextStep(row);
        const steps = trackingSteps(row);
        const amountLine = amounts.sourced === 'absent'
            ? ''
            : '<p class="lyann-tracking-amount">' + (amounts.total !== '—' ? amounts.total : amounts.service) + '</p>';
        return (
            '<div class="lyann-tracking-card">' +
            '<p class="lyann-tracking-kicker">Suivi</p>' +
            '<h3 class="lyann-tracking-title">' + title + '</h3>' +
            amountLine +
            '<p class="lyann-tracking-next">' + status + '</p>' +
            '<ol class="lyann-tracking-steps">' +
            steps.map(function (step) {
                return '<li><strong>' + step.label + '</strong> — ' + step.detail + '</li>';
            }).join('') +
            '</ol>' +
            '</div>'
        );
    }

    function renderCompactStrip(row, options) {
        const opts = options || {};
        const cls = classifyFinanceDisplay(row || {});
        const amounts = rowAmounts(row);
        const events = eventTimeline(row).slice(0, 8);
        const demo = Boolean(row && row.demo);
        const banner = demo || opts.demo
            ? '<p class="lyann-finance-strip-demo" role="status">Démonstration — données fictives. Aucune écriture, aucun Stripe.</p>'
            : (amounts.sourced === 'absent'
                ? '<p class="lyann-finance-strip-demo" role="status">Montants indisponibles pour le moment. Rien n’est inventé.</p>'
                : '');
        const feeLine = amounts.sourced === 'payment'
            ? '<span>Protection ' + amounts.fee + '</span>'
            : '<span>Frais de protection : non calculés ici</span>';
        return (
            '<div class="lyann-finance-strip-card">' +
            banner +
            '<p class="lyann-finance-strip-status">' + cls.title + '</p>' +
            '<div class="lyann-finance-strip-amounts">' +
            '<span>Prestation ' + amounts.service + '</span>' +
            feeLine +
            '<span>Total ' + amounts.total + '</span>' +
            '</div>' +
            '<p class="lyann-finance-strip-funds">' + fundLabel(cls.code) + '</p>' +
            '<p class="lyann-finance-strip-copy">' + policyCopy(cls.code) + '</p>' +
            (events.length
                ? ('<ol class="lyann-finance-strip-events">' + events.map(function (ev) {
                    return '<li><strong>' + ev.at + '</strong>' + (ev.detail ? ' — ' + ev.detail : '') + '</li>';
                }).join('') + '</ol>')
                : '') +
            '</div>'
        );
    }

    function rowFromQuoteContext(quotes, mission, request) {
        const list = Array.isArray(quotes) ? quotes : [];
        const accepted = list.find(function (q) { return q && q.status === 'ACCEPTED'; }) || list[0] || null;
        const payments = (accepted && Array.isArray(accepted.payments)) ? accepted.payments : [];
        const payment = payments.find(function (p) {
            return p && ['SUCCEEDED', 'REFUNDED', 'DISPUTED', 'PARTIALLY_REFUNDED'].includes(p.payment_status);
        }) || payments[0] || {};
        const milestones = (accepted && Array.isArray(accepted.milestones)) ? accepted.milestones : [];
        const milestone = milestones.find(function (m) { return m && m.status === 'DISPUTED'; })
            || milestones[milestones.length - 1]
            || {};
        return {
            demo: false,
            quote: accepted || {},
            mission: mission || { status: request && request.status, title: request && request.title },
            milestone: milestone,
            payment: payment,
            cancellation: {},
            refundRequest: {},
            dispute: (milestone && milestone.status === 'DISPUTED') ? { status: 'OPEN' } : null
        };
    }

    // Phase 7 — one account. A payment is a gain or an expense, never both, never a net "available" balance.
    function ledgerLines(userId, payments) {
        const me = String(userId || '');
        const seen = new Set();
        const lines = [];
        (payments || []).forEach((pay) => {
            if (!pay || !pay.id || seen.has(String(pay.id))) return;
            const isGain = String(pay.provider_id || '') === me;
            const isExpense = String(pay.requester_id || '') === me;
            if (!isGain && !isExpense) return;
            seen.add(String(pay.id));
            const kind = isGain ? 'gain' : 'expense';
            const service = finiteCents(pay.service_amount_cents);
            const customerFee = finiteCents(pay.customer_fee_cents);
            const customerTotal = finiteCents(pay.customer_total_cents);
            const providerFee = finiteCents(pay.provider_fee_cents);
            const providerNet = finiteCents(pay.provider_net_cents);
            const amount = kind === 'gain' ? (providerNet != null ? providerNet : service) : customerTotal;
            lines.push({
                id: String(pay.id),
                kind: kind,
                cents: amount,
                serviceCents: service,
                customerFeeCents: customerFee,
                customerTotalCents: customerTotal,
                providerFeeCents: providerFee,
                netCents: providerNet,
                label: ledgerStatus(pay, kind),
                at: pay.created_at || null
            });
        });
        return lines;
    }

    function finiteCents(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function euroAmount(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return String(n).replace('.', ',') + ' €';
    }

    function dossierSummary(userId, quote) {
        if (!quote || !userId) return '';
        const me = String(userId);
        const providerId = String(quote.provider_id || quote.helper_id || '');
        const requesterId = String(quote.requester_id || '');
        if (providerId !== me && requesterId !== me) return '';
        const role = providerId === me ? 'gain' : 'expense';
        const steps = Array.isArray(quote.milestones) ? quote.milestones.filter(Boolean) : [];
        const payments = Array.isArray(quote.payments) ? quote.payments : [];
        if (!steps.length) return dossierMoney(userId, payments);
        return steps.map((milestone) => {
            const name = milestone.title || 'Jalon';
            const pay = payments.find((item) => item && String(item.milestone_id) === String(milestone.id)) || null;
            const status = String(milestone.status || '').toUpperCase();
            if (!pay) {
                const amount = euroAmount(milestone.amount);
                if (status === 'PENDING' || !status) return '« ' + name + ' »' + (amount ? ' ' + amount : '') + ' — pas encore payé.';
                return '« ' + name + ' » — en attente.';
            }
            const line = ledgerLines(userId, [pay])[0];
            if (!line) return '';
            if (line.label === 'Remboursé') return '« ' + name + ' » remboursé ' + cents(line.cents) + '. Ce n’est plus un paiement actif.';
            if (role === 'gain') {
                const brut = line.serviceCents != null ? cents(line.serviceCents) : 'montant indisponible';
                const fee = line.providerFeeCents != null ? ', commission ' + cents(line.providerFeeCents) : '';
                const net = line.cents != null ? cents(line.cents) : 'montant indisponible';
                return '« ' + name + ' » : à recevoir ' + net + ' (brut ' + brut + fee + '). ' + line.label + '.';
            }
            const total = line.cents != null ? cents(line.cents) : 'montant indisponible';
            const detail = line.serviceCents != null
                ? ' (prestation ' + cents(line.serviceCents) + (line.customerFeeCents != null ? ', frais ' + cents(line.customerFeeCents) : '') + ')'
                : '';
            const waiting = status === 'COMPLETED' && line.label === 'Paiement sécurisé'
                ? ' Validation attendue. Aucun transfert n’est encore créé.'
                : '';
            return '« ' + name + ' » : payé ' + total + detail + '. ' + line.label + '.' + waiting;
        }).filter(Boolean).join(' ');
    }

    function dossierMoney(userId, payments) {
        const lines = ledgerLines(userId, payments);
        if (!lines.length) return '';
        return lines.map((line) => {
            const title = line.label === 'Remboursé' ? 'Remboursé' : (line.kind === 'gain' ? 'Gain' : 'Payé');
            const amount = line.cents == null ? 'montant indisponible' : cents(line.cents);
            return title + ' ' + amount + ' — ' + line.label;
        }).join(' · ');
    }

    function ledgerStatus(pay, kind) {
        const paymentStatus = String(pay.payment_status || '');
        const transferStatus = String(pay.transfer_status || '');
        if (paymentStatus === 'REFUNDED') return 'Remboursé';
        if (paymentStatus === 'DISPUTED') return 'Litige — fonds bloqués';
        if (kind === 'gain') {
            if (paymentStatus !== 'SUCCEEDED') return 'Gain attendu — paiement pas encore sécurisé';
            if (transferStatus === 'TRANSFERRED' || pay.stripe_transfer_id) {
                return 'Transfert Stripe créé — versement bancaire non confirmé';
            }
            return 'À recevoir — versement pas encore confirmé';
        }
        if (paymentStatus === 'SUCCEEDED') return 'Paiement sécurisé';
        if (paymentStatus === 'FAILED') return 'Paiement échoué';
        return 'Paiement en cours';
    }

    function halfUpPercent(cents, percent) {
        return Math.floor((cents * percent + 50) / 100);
    }

    function forecastMilestoneCharge(amount) {
        const euros = Number(amount);
        if (!Number.isFinite(euros) || euros <= 0) return null;
        const serviceCents = Math.round(euros * 100);
        const providerFeeCents = halfUpPercent(serviceCents, 3);
        const rawCustomerFee = halfUpPercent(serviceCents, 3);
        const customerFeeCents = rawCustomerFee > 149 ? rawCustomerFee : 149;
        return {
            serviceCents: serviceCents,
            customerFeeCents: customerFeeCents,
            customerTotalCents: serviceCents + customerFeeCents,
            providerFeeCents: providerFeeCents,
            providerNetCents: serviceCents - providerFeeCents,
            minimumApplied: rawCustomerFee < 149
        };
    }

    function forecastQuoteCharges(milestones) {
        const lines = (milestones || []).map((milestone) => {
            const charge = forecastMilestoneCharge(milestone && milestone.amount);
            if (!charge) return null;
            return Object.assign({ title: (milestone && milestone.title) || 'Jalon' }, charge);
        }).filter(Boolean);
        return lines.reduce((sum, line) => {
            sum.lines.push(line);
            sum.serviceCents += line.serviceCents;
            sum.customerFeeCents += line.customerFeeCents;
            sum.customerTotalCents += line.customerTotalCents;
            sum.minimumCount += line.minimumApplied ? 1 : 0;
            return sum;
        }, { lines: [], serviceCents: 0, customerFeeCents: 0, customerTotalCents: 0, minimumCount: 0 });
    }

    const api = {
        cents: cents,
        ledgerLines: ledgerLines,
        dossierMoney: dossierMoney,
        dossierSummary: dossierSummary,
        forecastMilestoneCharge: forecastMilestoneCharge,
        forecastQuoteCharges: forecastQuoteCharges,
        classifyFinanceDisplay: classifyFinanceDisplay,
        policyCopy: policyCopy,
        fundLabel: fundLabel,
        missionBucket: missionBucket,
        rowAmounts: rowAmounts,
        eventTimeline: eventTimeline,
        renderCompactStrip: renderCompactStrip,
        renderMissionTracking: renderMissionTracking,
        rowFromQuoteContext: rowFromQuoteContext
    };
    root.LYANN_FINANCE_POLICY_UI = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
