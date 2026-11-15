(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_QUOTE_REVISION = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const LOCKED_MILESTONE_STATUSES = new Set([
        'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED'
    ]);
    const OPEN_PAYMENT_STATUSES = new Set([
        'CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'REFUNDED'
    ]);
    const STARTED_MISSION = new Set(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'CANCELED', 'DISPUTED']);
    const IGNORED_PAYMENT_STATUSES = new Set();
    const MAX_MILESTONES = 12;
    const DEFAULT_CAP_EUR = 1000;
    const DEFAULT_CAP_MESSAGE = 'Pour le moment, les missions sur LYANN sont limitées à 1 000 €. Ajustez votre devis pour continuer.';
    let configuredCapEur = DEFAULT_CAP_EUR;

    function setMissionCapEur(value) {
        const cents = moneyCents(value);
        if (cents == null || cents < 100 || cents > 10000000) return configuredCapEur;
        configuredCapEur = cents / 100;
        return configuredCapEur;
    }

    function missionCapEur() {
        return configuredCapEur;
    }

    function capMessage(cap) {
        const cents = moneyCents(cap == null ? configuredCapEur : cap);
        if (cents == null) return DEFAULT_CAP_MESSAGE;
        if (cents === 100000) return DEFAULT_CAP_MESSAGE;
        const euros = (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
        return 'Pour le moment, les missions sur LYANN sont limitées à ' + euros + ' €. Ajustez votre devis pour continuer.';
    }

    function withinMissionCap(amountEur, capEur) {
        const amount = moneyDecision(amountEur);
        const limitDecision = moneyDecision(capEur == null ? configuredCapEur : capEur);
        if (!amount.ok) return amount;
        if (!limitDecision.ok) return limitDecision;
        const cents = amount.cents;
        const limit = limitDecision.cents;
        if (cents <= 0) {
            return { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
        }
        if (cents > limit) {
            return { ok: false, code: 'mission_cap', message: capMessage(limit / 100), cents, limitCents: limit };
        }
        return { ok: true, cents, limitCents: limit };
    }

    function paymentContractDecision(input) {
        const contractual = moneyDecision(input && input.contractualEur);
        const sum = moneyDecision(input && input.milestoneSumEur);
        if (!contractual.ok || !sum.ok) {
            return { ok: false, code: contractual.code === 'money_scale' || sum.code === 'money_scale' ? 'money_scale' : 'CONTRACT_MISMATCH' };
        }
        if (sum.cents > contractual.cents) return { ok: false, code: 'CONTRACT_MISMATCH' };
        const rawSnapshot = input ? input.acceptedSnapshotEur : null;
        if (rawSnapshot == null || rawSnapshot === '') return { ok: true, grandfathered: true };
        const snapshot = moneyDecision(rawSnapshot);
        if (!snapshot.ok || snapshot.cents !== contractual.cents) return { ok: false, code: snapshot.code === 'money_scale' ? 'money_scale' : 'CONTRACT_MISMATCH' };
        return { ok: true, grandfathered: false };
    }

    const MONEY_SCALE_MESSAGE = 'Le montant doit être exprimé en euros avec deux décimales au plus.';

    function moneyDecision(value) {
        if (typeof value === 'string') {
            const text = value.trim().replace(',', '.');
            if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
            if ((text.split('.')[1] || '').length > 2) {
                return { ok: false, code: 'money_scale', message: MONEY_SCALE_MESSAGE };
            }
        }
        const amount = Number(value);
        if (!Number.isFinite(amount)) {
            return { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
        }
        const scaled = amount * 100;
        const cents = Math.round(scaled);
        if (Math.abs(scaled - cents) > 1e-6) {
            return { ok: false, code: 'money_scale', message: MONEY_SCALE_MESSAGE };
        }
        return { ok: true, cents };
    }

    function moneyCents(value) {
        const decision = moneyDecision(value);
        return decision.ok ? decision.cents : null;
    }

    // Deferred check, after the quote row is locked. Each batch is one transaction.
    // Batches run one after another, which is what FOR UPDATE forces on concurrent writers.
    function settleLockedMilestoneBatches(input) {
        const cap = moneyDecision(input && input.capEur != null ? input.capEur : configuredCapEur);
        const accepted = input && input.acceptedEur != null && input.acceptedEur !== ''
            ? moneyDecision(input.acceptedEur)
            : null;
        if (!cap.ok) return cap;
        if (accepted && !accepted.ok) return accepted;
        const status = String((input && input.status) || 'SENT');
        let committed = 0;
        const batches = Array.isArray(input && input.batches) ? input.batches : [];
        for (let i = 0; i < batches.length; i += 1) {
            let next = committed;
            const rows = batches[i];
            for (let j = 0; j < rows.length; j += 1) {
                const row = moneyDecision(rows[j]);
                if (!row.ok) return row;
                if (row.cents <= 0) return { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
                next += row.cents;
            }
            if ((status === 'SENT' || status === 'DRAFT') && next > cap.cents) {
                return { ok: false, code: 'mission_cap', message: capMessage(cap.cents / 100), cents: next };
            }
            if (status === 'ACCEPTED' && accepted && next > accepted.cents) {
                return { ok: false, code: 'CONTRACT_MISMATCH', cents: next };
            }
            committed = next;
        }
        return { ok: true, cents: committed };
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
            return { ok: false, code: 'locked_milestone', message: 'Un paiement par étape déjà engagé ne peut pas être modifié.' };
        }
        const payments = Array.isArray(quote.payments) ? quote.payments : [];
        if (payments.some((payment) => payment && !IGNORED_PAYMENT_STATUSES.has(paymentStatus(payment)))) {
            return { ok: false, code: 'payment', message: 'Un paiement est déjà engagé sur ce devis.' };
        }
        return { ok: true, version: Number(quote.version) || 1 };
    }

    function assessAmendment(quote, callerId) {
        if (!quote || !quote.id) return { ok: false, code: 'missing', message: 'Devis introuvable.' };
        const providerId = quote.provider_id || quote.helper_id;
        if (!callerId || String(providerId) !== String(callerId)) {
            return { ok: false, code: 'forbidden', message: 'Seul l’auteur du devis peut proposer un avenant.' };
        }
        if (String(quote.status || '') !== 'ACCEPTED') {
            return { ok: false, code: 'immutable', message: 'Un avenant concerne un devis déjà accepté.' };
        }
        const mission = String(quote.mission_status || (quote.mission && quote.mission.status) || '').toUpperCase();
        if (STARTED_MISSION.has(mission)) {
            return { ok: false, code: 'started', message: 'Une mission commencée ne se modifie pas par un simple avenant.' };
        }
        const milestones = Array.isArray(quote.milestones) ? quote.milestones : [];
        if (milestones.some((milestone) => milestone && LOCKED_MILESTONE_STATUSES.has(String(milestone.status || '').toUpperCase()))) {
            return {
                ok: false,
                code: 'payment_secured',
                message: 'Un paiement est déjà sécurisé. Un avenant qui modifie le montant ne peut pas être appliqué automatiquement. Contactez l’Aide LYANN.'
            };
        }
        const payments = Array.isArray(quote.payments) ? quote.payments : [];
        if (payments.some((payment) => payment && OPEN_PAYMENT_STATUSES.has(paymentStatus(payment)))) {
            return {
                ok: false,
                code: 'payment_secured',
                message: 'Un paiement est déjà sécurisé. Un avenant qui modifie le montant ne peut pas être appliqué automatiquement. Contactez l’Aide LYANN.'
            };
        }
        return { ok: true, version: Number(quote.version) || 1 };
    }

    function validateQuoteAmount(value, capEur) {
        const decision = moneyDecision(value);
        if (!decision.ok) {
            return decision.code === 'money_scale'
                ? decision
                : { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
        }
        const cents = decision.cents;
        if (cents <= 0) {
            return { ok: false, code: 'amount', message: 'Indiquez un montant supérieur à 0 €.' };
        }
        const capped = withinMissionCap(cents / 100, capEur);
        if (!capped.ok) return Object.assign({ payment: false }, capped);
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
            const decision = moneyDecision(row.amount);
            if (!title) return { ok: false, code: 'title', message: 'Chaque partie a besoin d’un titre.' };
            if (title.length > 160) return { ok: false, code: 'title', message: 'Un titre est trop long.' };
            if (!decision.ok) {
                return decision.code === 'money_scale'
                    ? decision
                    : { ok: false, code: 'amount', message: 'Chaque montant doit être supérieur à 0 €.' };
            }
            if (decision.cents <= 0) {
                return { ok: false, code: 'amount', message: 'Chaque montant doit être supérieur à 0 €.' };
            }
            const cents = decision.cents;
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
        const capped = withinMissionCap(totalCents / 100);
        if (!capped.ok) return capped;
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

    function validateAmendment(input) {
        const quote = input && input.quote;
        const decision = assessAmendment(quote, input && input.callerId);
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
    const FINISHED_MISSION = new Set(['COMPLETED', 'CANCELLED', 'CANCELED']);

    function missionRequestId(mission) {
        if (!mission) return null;
        return mission.related_request_id || mission.request_id || null;
    }

    function isFinishedMission(mission) {
        return FINISHED_MISSION.has(String((mission && mission.status) || '').toUpperCase());
    }

    function isActiveMission(mission) {
        return ACTIVE_MISSION.has(String((mission && mission.status) || ''));
    }

    /**
     * Resolve which request/invitation/mission should drive quote context for a pair.
     * Prefer explicit ids; pair-only fallback only when the deal context is unique.
     * Never promote a finished mission from another annonce as the active deal.
     */
    function resolveQuoteContextSelection(input) {
        const invitations = Array.isArray(input && input.invitations) ? input.invitations.filter(Boolean) : [];
        const missions = Array.isArray(input && input.missions) ? input.missions.filter(Boolean) : [];
        const requestId = input && input.requestId ? String(input.requestId) : '';
        const invitationId = input && input.invitationId ? String(input.invitationId) : '';
        const missionId = input && input.missionId ? String(input.missionId) : '';

        function acceptedForRequest(rid) {
            return invitations.filter((invitation) => {
                return invitation
                    && String(invitation.request_id || '') === String(rid)
                    && String(invitation.status || '') === 'ACCEPTED';
            });
        }

        function pack(code, fields) {
            return {
                ok: Boolean(fields && fields.ok),
                ambiguous: Boolean(fields && fields.ambiguous),
                code: code,
                requestId: (fields && fields.requestId) || null,
                invitationId: (fields && fields.invitationId) || null,
                invitationIds: Array.isArray(fields && fields.invitationIds) ? fields.invitationIds : [],
                missionId: (fields && fields.missionId) || null
            };
        }

        function fromRequest(rid, code) {
            const matchedInvs = acceptedForRequest(rid);
            const matchedMissions = missions.filter((mission) => String(missionRequestId(mission) || '') === String(rid));
            const active = matchedMissions.filter(isActiveMission);
            const invitationIds = matchedInvs.map((invitation) => invitation.id).filter(Boolean);
            if (!matchedInvs.length && !matchedMissions.length) {
                return pack('missing', { ok: false, ambiguous: false, requestId: rid });
            }
            return pack(code || 'matched_request', {
                ok: true,
                ambiguous: false,
                requestId: rid,
                invitationId: invitationIds[0] || null,
                invitationIds: invitationIds,
                missionId: active.length === 1 ? active[0].id : null
            });
        }

        if (missionId) {
            const mission = missions.find((row) => String(row.id) === missionId) || null;
            if (!mission) {
                return pack('mission_missing', { ok: false, ambiguous: false, requestId: requestId || null, missionId: missionId });
            }
            const linkedRequest = missionRequestId(mission);
            if (requestId && linkedRequest && String(linkedRequest) !== requestId) {
                return pack('mission_request_mismatch', {
                    ok: false,
                    ambiguous: false,
                    requestId: requestId,
                    missionId: missionId
                });
            }
            const resolvedRequest = requestId || (linkedRequest ? String(linkedRequest) : '');
            const linkedInvitation = mission.request_invitation_id ? String(mission.request_invitation_id) : '';
            let matchedInvs = invitations.filter((invitation) => {
                if (!invitation) return false;
                if (linkedInvitation && String(invitation.id) === linkedInvitation) return true;
                if (resolvedRequest && String(invitation.request_id) === resolvedRequest) return true;
                return false;
            });
            matchedInvs = matchedInvs.filter((invitation) => {
                const status = String(invitation.status || '');
                return !status || status === 'ACCEPTED';
            });
            if (invitationId) {
                matchedInvs = matchedInvs.filter((invitation) => String(invitation.id) === invitationId);
                if (!matchedInvs.length) {
                    return pack('invitation_mismatch', {
                        ok: false,
                        ambiguous: false,
                        requestId: resolvedRequest || null,
                        missionId: missionId
                    });
                }
            }
            const invitationIds = matchedInvs.map((invitation) => invitation.id).filter(Boolean);
            if (linkedInvitation && !invitationIds.includes(linkedInvitation)) invitationIds.unshift(linkedInvitation);
            return pack('matched_mission', {
                ok: true,
                ambiguous: false,
                requestId: resolvedRequest || null,
                invitationId: invitationIds[0] || linkedInvitation || null,
                invitationIds: invitationIds,
                missionId: missionId
            });
        }

        if (invitationId) {
            const invitation = invitations.find((row) => String(row.id) === invitationId) || null;
            if (!invitation) {
                return pack('invitation_missing', { ok: false, ambiguous: false, requestId: requestId || null, invitationId: invitationId });
            }
            if (requestId && String(invitation.request_id || '') !== requestId) {
                return pack('invitation_request_mismatch', {
                    ok: false,
                    ambiguous: false,
                    requestId: requestId,
                    invitationId: invitationId
                });
            }
            const resolvedRequest = String(invitation.request_id || requestId || '') || null;
            const linkedMission = missions.find((mission) => {
                return String(mission.request_invitation_id || '') === invitationId
                    || (resolvedRequest && String(missionRequestId(mission) || '') === resolvedRequest && isActiveMission(mission));
            }) || null;
            if (linkedMission && requestId && missionRequestId(linkedMission)
                && String(missionRequestId(linkedMission)) !== requestId) {
                return pack('mission_request_mismatch', {
                    ok: false,
                    ambiguous: false,
                    requestId: requestId,
                    invitationId: invitationId
                });
            }
            return pack('matched_invitation', {
                ok: true,
                ambiguous: false,
                requestId: resolvedRequest,
                invitationId: invitationId,
                invitationIds: [invitationId],
                missionId: linkedMission && isActiveMission(linkedMission) ? linkedMission.id : null
            });
        }

        if (requestId) return fromRequest(requestId, 'matched_request');

        const accepted = invitations.filter((invitation) => String((invitation && invitation.status) || '') === 'ACCEPTED');
        const uniqueRequests = [...new Set([
            ...accepted.map((invitation) => String(invitation.request_id || '')).filter(Boolean),
            ...missions.map((mission) => {
                const rid = missionRequestId(mission);
                return rid ? String(rid) : '';
            }).filter(Boolean)
        ])];

        const openRequestIds = uniqueRequests.filter((rid) => {
            const forRequest = missions.filter((mission) => String(missionRequestId(mission) || '') === rid);
            if (forRequest.some(isActiveMission)) return true;
            if (forRequest.length && forRequest.every(isFinishedMission)) return false;
            return accepted.some((invitation) => String(invitation.request_id || '') === rid);
        });

        if (openRequestIds.length === 1) return fromRequest(openRequestIds[0], 'unique_open');
        if (openRequestIds.length > 1) {
            return pack('ambiguous', { ok: false, ambiguous: true });
        }
        // No open deal: allow fallback only when a single request context is verifiable.
        if (uniqueRequests.length === 1) return fromRequest(uniqueRequests[0], 'unique_finished');
        if (uniqueRequests.length > 1) {
            return pack('ambiguous_finished', { ok: false, ambiguous: true });
        }
        return pack('missing', { ok: false, ambiguous: false });
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
        // Missions terminées : pas de bandeau / chrome en tête de conversation.
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
        DEFAULT_CAP_EUR,
        DEFAULT_CAP_MESSAGE,
        moneyCents,
        moneyDecision,
        settleLockedMilestoneBatches,
        setMissionCapEur,
        missionCapEur,
        capMessage,
        withinMissionCap,
        paymentContractDecision,
        validateQuoteAmount,
        assessRevision,
        assessAmendment,
        validateMilestones,
        validateRevision,
        validateAmendment,
        describeRevision,
        planQuoteAcceptance,
        acceptSignatureFallback,
        selectThreadContext,
        selectInvitationForRequest,
        resolveQuoteContextSelection,
        decideAcceptance
    };
});
