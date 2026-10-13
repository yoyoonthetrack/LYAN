(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_QUOTE_REVISION = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const LOCKED_MILESTONE_STATUSES = new Set([
        'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED'
    ]);
    const IGNORED_PAYMENT_STATUSES = new Set();
    const MAX_MILESTONES = 12;

    function moneyCents(value) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) return null;
        return Math.round((amount + Number.EPSILON) * 100);
    }

    function paymentStatus(payment) {
        return String((payment && (payment.payment_status || payment.status)) || '').toUpperCase();
    }

    function assessRevision(quote, callerId) {
        if (!quote || !quote.id) {
            return { ok: false, code: 'missing', message: 'Devis introuvable.' };
        }
        const providerId = quote.provider_id || quote.helper_id;
        if (!callerId || String(providerId) !== String(callerId)) {
            return { ok: false, code: 'forbidden', message: 'Seul l’auteur du devis peut le modifier.' };
        }
        if (String(quote.status || '') !== 'SENT') {
            return { ok: false, code: 'immutable', message: 'Un devis accepté ou déjà clos ne peut pas être modifié.' };
        }
        const milestones = Array.isArray(quote.milestones) ? quote.milestones : [];
        if (milestones.some((milestone) => milestone && LOCKED_MILESTONE_STATUSES.has(String(milestone.status || '').toUpperCase()))) {
            return { ok: false, code: 'locked_milestone', message: 'Un jalon déjà engagé ne peut pas être modifié.' };
        }
        const payments = Array.isArray(quote.payments) ? quote.payments : [];
        if (payments.some((payment) => payment && !IGNORED_PAYMENT_STATUSES.has(paymentStatus(payment)))) {
            return { ok: false, code: 'payment', message: 'Un paiement est déjà engagé sur ce devis.' };
        }
        return { ok: true, version: Number(quote.version) || 1 };
    }

    function validateQuoteAmount(value) {
        const cents = moneyCents(value);
        if (cents == null || cents <= 0) {
            return { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
        }
        return { ok: true, cents, amount: cents / 100, payment: false };
    }

    function validateMilestones(rows) {
        if (!Array.isArray(rows) || rows.length < 1) {
            return { ok: false, code: 'empty', message: 'Indiquez au moins une partie du devis.' };
        }
        if (rows.length > MAX_MILESTONES) {
            return { ok: false, code: 'too_many', message: 'Douze parties maximum.' };
        }
        const milestones = [];
        let totalCents = 0;
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index] || {};
            const title = String(row.title || '').trim();
            const description = String(row.description || '').trim();
            const cents = moneyCents(row.amount);
            if (!title) return { ok: false, code: 'title', message: 'Chaque partie a besoin d’un titre.' };
            if (title.length > 160) return { ok: false, code: 'title', message: 'Un titre est trop long.' };
            if (cents == null || cents <= 0) {
                return { ok: false, code: 'amount', message: 'Chaque montant doit être supérieur à 0 €.' };
            }
            totalCents += cents;
            milestones.push({
                title,
                description: description.slice(0, 1000),
                amount: cents / 100,
                display_order: index + 1
            });
        }
        if (totalCents <= 0) {
            return { ok: false, code: 'amount', message: 'Le montant total du devis doit être supérieur à 0 €.' };
        }
        return { ok: true, milestones, totalCents, totalAmount: totalCents / 100 };
    }

    function validateRevision(input) {
        const quote = input && input.quote;
        const decision = assessRevision(quote, input && input.callerId);
        if (!decision.ok) return decision;
        const description = String((input && input.description) || '').trim();
        if (!description) return { ok: false, code: 'description', message: 'Décrivez la prestation et ses conditions.' };
        if (description.length > 2000) return { ok: false, code: 'description', message: 'La description est trop longue.' };
        const milestones = validateMilestones(input && input.milestones);
        if (!milestones.ok) return milestones;
        const expected = Number(input && input.expectedVersion);
        if (!Number.isInteger(expected) || expected !== decision.version) {
            return { ok: false, code: 'conflict', message: 'Ce devis a été modifié entre-temps. Rechargez la conversation avant de réessayer.' };
        }
        return {
            ok: true,
            version: decision.version,
            description,
            milestones: milestones.milestones,
            totalAmount: milestones.totalAmount
        };
    }

    function milestoneLabel(milestone) {
        const title = String((milestone && milestone.title) || 'Partie').trim() || 'Partie';
        const cents = moneyCents(milestone && milestone.amount);
        return title + (cents == null ? '' : ' · ' + (cents / 100).toFixed(2) + ' €');
    }

    function planQuoteAcceptance(expectedVersion) {
        if (expectedVersion == null || expectedVersion === '') {
            return { ok: false, code: 'version_required', message: 'Rechargez le devis avant de l’accepter.', payment: false };
        }
        const version = Number(expectedVersion);
        if (!Number.isInteger(version) || version < 1) {
            return { ok: false, code: 'version_required', message: 'Rechargez le devis avant de l’accepter.', payment: false };
        }
        return { ok: true, version, payment: false };
    }

    function acceptSignatureFallback(error, version) {
        const text = String((error && (error.message || error.code || error.details)) || '');
        const missing = /PGRST202|could not find the function|42883/i.test(text);
        if (!missing) return { retry: false, payment: false };
        return {
            retry: false,
            payment: false,
            code: 'version_gate_unavailable',
            version: Number(version) || null,
            message: 'La confirmation de version n’est pas encore active. Rechargez la conversation avant d’accepter.'
        };
    }

    const ACTIVE_MISSION = new Set(['AGREED', 'IN_PROGRESS', 'WORK_MARKED_COMPLETE']);

    function missionRequestId(mission) {
        if (!mission) return null;
        return mission.related_request_id || mission.request_id || null;
    }

    function selectThreadContext(input) {
        const missions = Array.isArray(input && input.missions) ? input.missions.filter(Boolean) : [];
        const requestId = input && input.requestId ? String(input.requestId) : '';
        const explicitMissionId = input && input.explicitMissionId ? String(input.explicitMissionId) : '';
        if (explicitMissionId) {
            const chosen = missions.find((mission) => String(mission.id) === explicitMissionId) || null;
            return {
                mission: chosen,
                ambiguous: false,
                requestId: chosen ? (missionRequestId(chosen) || requestId || null) : (requestId || null)
            };
        }
        const matching = requestId
            ? missions.filter((mission) => String(missionRequestId(mission) || '') === requestId)
            : missions;
        const active = matching.filter((mission) => ACTIVE_MISSION.has(String(mission.status || '')));
        if (!requestId && active.length === 1) {
            return { mission: active[0], ambiguous: false, requestId: missionRequestId(active[0]) };
        }
        if (!requestId && active.length > 1) {
            return { mission: null, ambiguous: true, requestId: null };
        }
        if (!requestId) return { mission: null, ambiguous: false, requestId: null };
        if (active.length === 1) return { mission: active[0], ambiguous: false, requestId };
        if (active.length > 1) return { mission: null, ambiguous: true, requestId };
        const completed = matching.filter((mission) => String(mission.status || '') === 'COMPLETED');
        if (completed.length === 1 && matching.length === 1) {
            return { mission: completed[0], ambiguous: false, requestId };
        }
        return { mission: null, ambiguous: false, requestId };
    }

    function selectInvitationForRequest(input) {
        const requestId = input && input.requestId ? String(input.requestId) : '';
        const callerId = input && (input.callerId || input.userA) ? String(input.callerId || input.userA) : '';
        const otherId = input && input.userB ? String(input.userB) : '';
        if (!requestId || !callerId || !otherId) return { ok: false, code: 'request_required', invitation: null };
        const rows = (Array.isArray(input.invitations) ? input.invitations : []).filter((invitation) => {
            return invitation && String(invitation.request_id) === requestId && String(invitation.status || '') === 'ACCEPTED';
        });
        const matches = rows.filter((invitation) => String(invitation.recipient_id || '') === callerId && String(invitation.requester_id || '') === otherId);
        if (matches.length === 1) return { ok: true, code: 'matched', invitation: matches[0] };
        if (matches.length > 1) return { ok: false, code: 'ambiguous', invitation: null };
        if (rows.some((invitation) => String(invitation.requester_id || '') === callerId)) {
            return { ok: false, code: 'not_recipient', invitation: null };
        }
        return { ok: false, code: 'missing', invitation: null };
    }

    function decideAcceptance(input) {
        const status = String((input && input.status) || '');
        const version = Number(input && input.version) || 1;
        const blocked = Boolean(input && input.blocked);
        const alreadyOpen = Boolean(input && input.activeMission);
        const provided = input ? input.expectedVersion : undefined;
        if (status !== 'SENT') return { ok: false, code: 'not_sent', payment: false };
        if (blocked) return { ok: false, code: 'blocked', payment: false };
        if (alreadyOpen) return { ok: false, code: 'already_open', payment: false };
        if (provided == null) {
            if (version > 1) return { ok: false, code: 'legacy_revised', payment: false };
            return { ok: true, code: 'legacy_current', version, payment: false };
        }
        if (Number(provided) !== version) return { ok: false, code: 'stale', payment: false };
        return { ok: true, code: 'versioned', version, payment: false };
    }

    function describeRevision(quote) {
        const previous = quote && quote.previousRevision;
        const nextVersion = Number(quote && quote.version) || 1;
        if (!previous || nextVersion <= Number(previous.version || 0)) {
            return { changed: false, nextVersion };
        }
        const before = Array.isArray(previous.milestones) ? previous.milestones : [];
        const after = Array.isArray(quote.milestones) ? quote.milestones : [];
        const beforeByTitle = new Map(before.map((milestone) => [String(milestone.title || '').trim().toLowerCase(), milestone]));
        const afterByTitle = new Map(after.map((milestone) => [String(milestone.title || '').trim().toLowerCase(), milestone]));
        const lines = [];
        after.forEach((milestone) => {
            const key = String(milestone.title || '').trim().toLowerCase();
            const old = beforeByTitle.get(key);
            if (!old) {
                lines.push({ kind: 'added', text: 'Ajout : ' + milestoneLabel(milestone) });
                return;
            }
            const amountChanged = moneyCents(old.amount) !== moneyCents(milestone.amount);
            const detailChanged = String(old.description || '').trim() !== String(milestone.description || '').trim();
            if (amountChanged || detailChanged) {
                const from = moneyCents(old.amount);
                const to = moneyCents(milestone.amount);
                lines.push({
                    kind: 'changed',
                    text: String(milestone.title || 'Partie') + ' : '
                        + (from == null ? '—' : (from / 100).toFixed(2) + ' €')
                        + ' → '
                        + (to == null ? '—' : (to / 100).toFixed(2) + ' €')
                });
            }
        });
        before.forEach((milestone) => {
            const key = String(milestone.title || '').trim().toLowerCase();
            if (!afterByTitle.has(key)) lines.push({ kind: 'removed', text: 'Retiré : ' + milestoneLabel(milestone) });
        });
        return {
            changed: true,
            title: 'Devis modifié',
            previousVersion: Number(previous.version) || 1,
            nextVersion,
            previousAmount: previous.total_amount,
            nextAmount: quote.total_amount,
            previousDescription: previous.description || '',
            lines
        };
    }

    return {
        LOCKED_MILESTONE_STATUSES,
        MAX_MILESTONES,
        moneyCents,
        validateQuoteAmount,
        assessRevision,
        validateMilestones,
        validateRevision,
        describeRevision,
        planQuoteAcceptance,
        acceptSignatureFallback,
        selectThreadContext,
        selectInvitationForRequest,
        decideAcceptance
    };
});
