/**
 * LYANN 6.26 — Dossier de mission (client).
 * One conversation per pair; many independent dossiers keyed by request + invitation.
 * Never invents a SQL mission. Never auto-picks when several dossiers are open.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_MISSION_DOSSIER = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ACTIVE_MISSION = new Set(['AGREED', 'IN_PROGRESS', 'WORK_MARKED_COMPLETE']);
    const FINISHED_MISSION = new Set(['COMPLETED', 'CANCELLED', 'CANCELED']);
    const DISPUTE_MISSION = new Set(['DISPUTED', 'DISPUTE']);
    const PENDING_QUOTE = new Set(['SENT', 'VIEWED', 'REVISED']);

    function str(value) {
        return value == null ? '' : String(value);
    }

    function dossierKey(input) {
        const requestId = str(input && (input.requestId || input.request_id));
        const invitationId = str(input && (input.invitationId || input.invitation_id));
        if (!requestId && !invitationId) return '';
        return 'req:' + requestId + '|inv:' + invitationId;
    }

    function missionRequestId(mission) {
        if (!mission) return '';
        return str(mission.related_request_id || mission.request_id);
    }

    function quoteRequestId(quote) {
        if (!quote) return '';
        return str(quote.request_id || quote.requestId || quote.mission_related_request_id);
    }

    function roleForViewer(viewerId, requesterId, providerId) {
        const viewer = str(viewerId);
        if (viewer && viewer === str(requesterId)) {
            return { code: 'requester', label: 'Vous demandez' };
        }
        if (viewer && (viewer === str(providerId))) {
            return { code: 'lyanneur', label: 'Vous êtes Lyanneur' };
        }
        return { code: 'unknown', label: '' };
    }

    function dossierStatus(input) {
        const mission = input && input.mission;
        const request = input && input.request;
        const quotes = Array.isArray(input && input.quotes) ? input.quotes : [];
        const missionStatus = str(mission && mission.status).toUpperCase();
        const requestStatus = str(request && request.status).toUpperCase();
        if (DISPUTE_MISSION.has(missionStatus)) return { code: 'dispute', label: 'Litige' };
        if (missionStatus === 'CANCELLED' || missionStatus === 'CANCELED' || requestStatus === 'CANCELLED' || requestStatus === 'CANCELED') {
            return { code: 'cancelled', label: 'Annulé' };
        }
        if (missionStatus === 'COMPLETED' || requestStatus === 'COMPLETED' || requestStatus === 'CLOSED') {
            return { code: 'done', label: 'Terminé' };
        }
        if (ACTIVE_MISSION.has(missionStatus) && missionStatus !== 'AGREED') {
            return { code: 'in_progress', label: 'En cours' };
        }
        const accepted = quotes.some((quote) => quote && str(quote.status) === 'ACCEPTED');
        if (accepted || missionStatus === 'AGREED') return { code: 'quote_accepted', label: 'Devis accepté' };
        if (quotes.some((quote) => quote && PENDING_QUOTE.has(str(quote.status)))) {
            return { code: 'quote_pending', label: 'Devis en attente' };
        }
        return { code: 'discussing', label: 'En discussion' };
    }

    function nextActionLabel(statusCode, roleCode, quote) {
        if (statusCode === 'quote_pending' && roleCode === 'requester') return 'À vous de répondre au devis';
        if (statusCode === 'quote_pending' && roleCode === 'lyanneur') return 'En attente du demandeur';
        if (statusCode === 'discussing' && roleCode === 'lyanneur') return 'Proposer un devis';
        if (statusCode === 'discussing' && roleCode === 'requester') return 'En attente d’un devis';
        if (statusCode === 'dispute') return 'Litige en cours';
        const steps = quote && Array.isArray(quote.milestones) ? quote.milestones : [];
        const stepStatus = (row) => String(row && row.status || '').toUpperCase();
        if (steps.some((row) => stepStatus(row) === 'COMPLETED') && roleCode === 'requester') return 'Valider la prestation';
        if (steps.some((row) => stepStatus(row) === 'FUNDED' || stepStatus(row) === 'IN_PROGRESS') && roleCode === 'lyanneur') return 'Déclarer la prestation terminée';
        if (steps.some((row) => stepStatus(row) === 'PENDING') && roleCode === 'requester') return 'Sécuriser le paiement';
        if (steps.some((row) => stepStatus(row) === 'PENDING') && roleCode === 'lyanneur') return 'En attente du paiement';
        if (statusCode === 'in_progress') return 'Mission en cours';
        return '';
    }

    function explainNextStep(input) {
        const role = str(input && input.roleCode);
        const quote = input && input.quote;
        const view = input && input.view;
        const readiness = str(input && input.readiness);
        if (view && str(view.context).trim()) return str(view.context).trim();
        if (input && input.checking) return 'Vérification du compte de versement du Lyanneur…';
        if (!quote) {
            return role === 'lyanneur'
                ? 'Vous pouvez proposer un devis. Le demandeur attend votre proposition.'
                : 'En attente d’un devis du Lyanneur. Aucun paiement n’est possible pour l’instant.';
        }
        const status = str(quote.status).toUpperCase();
        if (status === 'SENT' || status === 'VIEWED' || status === 'REVISED') {
            return role === 'requester'
                ? 'Acceptez ou refusez ce devis pour continuer.'
                : 'En attente de la réponse du demandeur.';
        }
        if (status === 'REJECTED') {
            return role === 'lyanneur'
                ? 'Ce devis n’a pas été retenu. Vous pouvez envoyer une nouvelle proposition.'
                : 'Ce devis n’a pas été retenu. Le Lyanneur peut proposer une nouvelle offre.';
        }
        if (status === 'ACCEPTED') {
            const milestones = Array.isArray(quote.milestones) ? quote.milestones : [];
            const pending = milestones.some((row) => row && str(row.status).toUpperCase() === 'PENDING');
            if (!milestones.length) {
                return 'Le devis est accepté. Le jalon de paiement n’est pas encore disponible.';
            }
            if (readiness === 'unknown') {
                return 'Vérification du compte de versement… L’état du compte n’est pas encore connu.';
            }
            if (readiness === 'pending') {
                return role === 'lyanneur'
                    ? 'Votre compte de versement est en cours de vérification. Le demandeur pourra payer ensuite.'
                    : 'En attente du Lyanneur. Le compte de versement est en cours de vérification. Vous n’avez aucune action immédiate.';
            }
            if (readiness === 'none' || readiness === 'incomplete' || readiness === 'error') {
                return role === 'lyanneur'
                    ? (readiness === 'error'
                        ? 'Impossible de vérifier votre compte de versement pour le moment.'
                        : 'Configurez votre compte de versement pour recevoir vos paiements.')
                    : (readiness === 'error'
                        ? 'Impossible de vérifier le compte de versement pour le moment. Vous n’avez aucune action immédiate.'
                        : 'En attente du Lyanneur. Le compte de versement doit être finalisé avant la sécurisation du paiement. Vous n’avez aucune action immédiate.');
            }
            if (pending && role === 'requester') {
                return 'Le devis est accepté. Sécurisez le paiement du jalon lorsque le compte de versement est prêt.';
            }
            if (pending && role === 'lyanneur') {
                return 'Le devis est accepté. En attente du paiement du demandeur.';
            }
            return role === 'lyanneur'
                ? 'Le devis est accepté. Le demandeur n’a plus d’action de paiement ici.'
                : 'Le devis est accepté. Aucune action de paiement n’est ouverte pour le moment.';
        }
        return 'Le chat reste disponible pour cette mission.';
    }

    function buildDossier(input) {
        const invitation = input && input.invitation;
        const request = input && input.request;
        const mission = input && input.mission && !FINISHED_MISSION.has(str(input.mission.status).toUpperCase())
            ? input.mission
            : (input && input.mission) || null;
        const quotes = Array.isArray(input && input.quotes) ? input.quotes.filter(Boolean) : [];
        const requestId = str((request && request.id) || (invitation && invitation.request_id) || (input && input.requestId));
        const invitationId = str((invitation && invitation.id) || (input && input.invitationId));
        const requesterId = str((invitation && invitation.requester_id) || (request && request.requester_id) || (mission && mission.requester_id));
        const providerId = str((invitation && invitation.recipient_id) || (mission && (mission.helper_id || mission.provider_id)));
        const viewerId = str(input && input.viewerId);
        const role = roleForViewer(viewerId, requesterId, providerId);
        const status = dossierStatus({ request, quotes, mission: input && input.mission });
        const retained = quotes.find((quote) => str(quote.status) === 'ACCEPTED') || null;
        const otherId = viewerId && viewerId === requesterId ? providerId : requesterId;
        return {
            key: dossierKey({ requestId, invitationId }),
            conversationId: str(input && input.conversationId || (invitation && invitation.conversation_id)),
            requestId: requestId || null,
            invitationId: invitationId || null,
            requesterId: requesterId || null,
            providerId: providerId || null,
            missionId: (input && input.mission && input.mission.id) || null,
            title: str((request && request.title) || (input && input.title) || (mission && mission.title)) || 'Mission',
            description: str((request && request.description) || (input && input.description) || ''),
            otherId: otherId || null,
            roleCode: role.code,
            roleLabel: role.label,
            statusCode: status.code,
            statusLabel: status.label,
            nextAction: nextActionLabel(status.code, role.code, retained || quotes[0] || null),
            quotes: quotes,
            retainedQuote: retained,
            mission: input && input.mission || null,
            request: request || null,
            invitation: invitation || null,
            activityAt: activityTimestamp(quotes, invitation, request, input && input.mission)
        };
    }

    function activityTimestamp(quotes, invitation, request, mission) {
        const stamps = [];
        function push(value) {
            const ms = Date.parse(value || '') || 0;
            if (ms) stamps.push(ms);
        }
        (Array.isArray(quotes) ? quotes : []).forEach((quote) => push(quote && (quote.updated_at || quote.created_at)));
        push(invitation && (invitation.updated_at || invitation.responded_at || invitation.created_at));
        push(request && (request.updated_at || request.created_at));
        push(mission && (mission.updated_at || mission.created_at));
        return stamps.length ? Math.max.apply(null, stamps) : 0;
    }

    function dossierBucket(row) {
        const code = str(row && row.statusCode);
        if (code === 'done' || code === 'cancelled') return 'done';
        if (code === 'in_progress' || code === 'quote_accepted' || code === 'dispute') return 'active';
        return 'waiting';
    }

    function sortDossiers(list) {
        return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
            const tb = Number(b && b.activityAt || 0);
            const ta = Number(a && a.activityAt || 0);
            if (tb !== ta) return tb - ta;
            const title = str(a && a.title).localeCompare(str(b && b.title), 'fr');
            if (title) return title;
            return str(a && a.requestId).localeCompare(str(b && b.requestId));
        });
    }

    function uniqueDossiers(list) {
        const rows = Array.isArray(list) ? list : [];
        const requestHasInvitation = new Set();
        rows.forEach((row) => {
            if (str(row && row.requestId) && str(row && row.invitationId)) {
                requestHasInvitation.add(str(row.requestId));
            }
        });
        const seen = new Set();
        return rows.filter((row) => {
            const requestId = str(row && row.requestId);
            const invitationId = str(row && row.invitationId);
            if (requestId && !invitationId && requestHasInvitation.has(requestId)) return false;
            const key = dossierKey(row) || (row && row.missionId ? ('mis:' + str(row.missionId)) : '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function missionActionKind(row) {
        const label = str(row && row.nextAction);
        if (label === 'À vous de répondre au devis') return 'quote_reply';
        if (label === 'Sécuriser le paiement') return 'payment_due';
        if (label === 'Valider la prestation') return 'client_validation';
        if (label === 'Déclarer la prestation terminée') return 'declare_done';
        if (label === 'En attente du paiement') return 'payment_wait';
        return '';
    }

    function filterDossiers(list, options) {
        const query = str(options && options.query).trim().toLowerCase();
        const bucket = str(options && options.bucket) || 'open';
        const action = str(options && options.action);
        return sortDossiers(uniqueDossiers(list)).filter((row) => {
            const group = dossierBucket(row);
            if (bucket === 'open' && group === 'done') return false;
            if (bucket === 'active' || bucket === 'waiting' || bucket === 'done') {
                if (group !== bucket) return false;
            }
            if (action && missionActionKind(row) !== action) return false;
            if (!query) return true;
            const hay = [row.title, row.statusLabel, row.roleLabel, row.nextAction].map(str).join(' ').toLowerCase();
            return hay.indexOf(query) !== -1;
        });
    }

    function quoteBelongsToDossier(quote, dossier) {
        if (!quote || !dossier) return false;
        const requestId = str(dossier.requestId);
        const invitationId = str(dossier.invitationId);
        const quoteRequest = quoteRequestId(quote);
        const quoteInvitation = str(quote.request_invitation_id);
        if (requestId && quoteRequest && quoteRequest !== requestId) return false;
        if (invitationId && quoteInvitation && quoteInvitation !== invitationId) return false;
        if (requestId && !quoteRequest && quoteInvitation && invitationId && quoteInvitation !== invitationId) return false;
        if (requestId && !quoteRequest && !quoteInvitation) return false;
        return true;
    }

    function listDossiers(input) {
        const viewerId = str(input && input.viewerId);
        const conversationId = str(input && input.conversationId);
        const invitations = Array.isArray(input && input.invitations) ? input.invitations.filter(Boolean) : [];
        const missions = Array.isArray(input && input.missions) ? input.missions.filter(Boolean) : [];
        const quotes = Array.isArray(input && input.quotes) ? input.quotes.filter(Boolean) : [];
        const requests = Array.isArray(input && input.requests) ? input.requests.filter(Boolean) : [];
        const requestById = new Map(requests.map((row) => [str(row.id), row]));
        const missionsByRequest = new Map();
        missions.forEach((mission) => {
            const rid = missionRequestId(mission);
            if (!rid) return;
            const list = missionsByRequest.get(rid) || [];
            list.push(mission);
            missionsByRequest.set(rid, list);
        });
        const seen = new Set();
        const dossiers = [];

        function quotesFor(requestId, invitationId) {
            return quotes.filter((quote) => quoteBelongsToDossier(quote, { requestId, invitationId }));
        }

        function pickMission(requestId, invitationId) {
            const list = missionsByRequest.get(str(requestId)) || [];
            const byInv = invitationId
                ? list.filter((mission) => str(mission.request_invitation_id) === str(invitationId))
                : list;
            const pool = byInv.length ? byInv : list;
            const active = pool.filter((mission) => ACTIVE_MISSION.has(str(mission.status).toUpperCase()));
            if (active.length === 1) return active[0];
            if (active.length > 1) return null;
            return pool[0] || null;
        }

        invitations.forEach((invitation) => {
            const requestId = str(invitation.request_id);
            const key = dossierKey({ requestId, invitationId: invitation.id });
            if (!key || seen.has(key)) return;
            seen.add(key);
            dossiers.push(buildDossier({
                viewerId,
                conversationId: conversationId || invitation.conversation_id,
                invitation,
                request: requestById.get(requestId) || { id: requestId, requester_id: invitation.requester_id },
                mission: pickMission(requestId, invitation.id),
                quotes: quotesFor(requestId, invitation.id)
            }));
        });

        missions.forEach((mission) => {
            const requestId = missionRequestId(mission);
            if (!requestId) return;
            const invitationId = str(mission.request_invitation_id);
            const key = dossierKey({ requestId, invitationId });
            if (seen.has(key)) return;
            seen.add(key);
            const invitation = invitations.find((row) => str(row.id) === invitationId) || null;
            dossiers.push(buildDossier({
                viewerId,
                conversationId,
                invitation,
                request: requestById.get(requestId) || { id: requestId, requester_id: mission.requester_id },
                mission,
                quotes: quotesFor(requestId, invitationId),
                requestId,
                invitationId
            }));
        });

        return sortDossiers(dossiers);
    }

    /**
     * Explicit ids only. Unique dossier may be returned when no hint is given.
     * Never returns "the latest" among several open dossiers.
     */
    function selectActiveDossier(dossiers, hint) {
        const list = Array.isArray(dossiers) ? dossiers : [];
        const requestId = str(hint && hint.requestId);
        const invitationId = str(hint && hint.invitationId);
        const missionId = str(hint && hint.missionId);
        if (missionId) {
            const byMission = list.filter((row) => str(row.missionId) === missionId);
            if (byMission.length === 1) return { ok: true, ambiguous: false, dossier: byMission[0] };
            if (byMission.length > 1) return { ok: false, ambiguous: true, dossier: null, code: 'ambiguous_mission' };
        }
        if (invitationId) {
            const byInv = list.filter((row) => str(row.invitationId) === invitationId);
            if (requestId) {
                const matched = byInv.filter((row) => str(row.requestId) === requestId);
                if (matched.length === 1) return { ok: true, ambiguous: false, dossier: matched[0] };
                if (matched.length > 1) return { ok: false, ambiguous: true, dossier: null, code: 'ambiguous_invitation' };
                return { ok: false, ambiguous: false, dossier: null, code: 'invitation_request_mismatch' };
            }
            if (byInv.length === 1) return { ok: true, ambiguous: false, dossier: byInv[0] };
            if (byInv.length > 1) return { ok: false, ambiguous: true, dossier: null, code: 'ambiguous_invitation' };
            return { ok: false, ambiguous: false, dossier: null, code: 'invitation_missing' };
        }
        if (requestId) {
            const byReq = list.filter((row) => str(row.requestId) === requestId);
            if (byReq.length === 1) return { ok: true, ambiguous: false, dossier: byReq[0] };
            if (byReq.length > 1) return { ok: false, ambiguous: true, dossier: null, code: 'ambiguous_request' };
            return { ok: false, ambiguous: false, dossier: null, code: 'missing' };
        }
        if (list.length === 1) return { ok: true, ambiguous: false, dossier: list[0], code: 'unique' };
        if (list.length > 1) return { ok: false, ambiguous: true, dossier: null, code: 'ambiguous' };
        return { ok: false, ambiguous: false, dossier: null, code: 'none' };
    }

    function dossierActionIds(input) {
        const role = str(input && input.roleCode);
        const quoteStatus = str(input && input.quoteStatus).toUpperCase();
        const pendingQuote = quoteStatus === 'SENT' || quoteStatus === 'VIEWED' || quoteStatus === 'REVISED';
        const ids = Array.isArray(input && input.cardActionIds) ? input.cardActionIds.filter(Boolean).slice() : [];
        if (input && input.canPropose && role === 'lyanneur' && !pendingQuote && !ids.includes('propose')) {
            ids.push('propose');
        }
        if (input && input.reviseOk && role === 'lyanneur' && pendingQuote && !ids.includes('revise')) {
            ids.push('revise');
        }
        if (input && input.hasReportableMilestone && role === 'requester' && !ids.includes('report')) ids.push('report');
        return ids;
    }

    function compactEventLabel(type, title) {
        const labels = {
            quote_created: 'Nouveau devis',
            quote_updated: 'Devis mis à jour',
            quote_replaced: 'Devis remplacé',
            quote_accepted: 'Devis accepté',
            quote_declined: 'Devis refusé',
            mission_completed: 'Mission terminée',
            mission_cancelled: 'Mission annulée',
            payment_secured: 'Fonds sécurisés',
            payment_requested: 'Paiement demandé',
            milestone_completed: 'Prestation terminée'
        };
        const base = labels[type] || 'Mise à jour';
        const suffix = str(title).trim();
        if (type === 'mission_completed') return suffix ? ('Mission terminée — ' + suffix) : 'Mission terminée — Voir le dossier';
        return suffix ? (base + ' — ' + suffix) : base;
    }

    function resolveEventDossier(quote, dossiers) {
        if (!quote) return { ok: false, title: '', requestId: '', invitationId: '', reason: 'no_quote' };
        const requestId = quoteRequestId(quote);
        const invitationId = str(quote.request_invitation_id || quote.invitationId);
        if (!requestId && !invitationId) {
            return { ok: false, title: '', requestId: '', invitationId: '', reason: 'no_id' };
        }
        const list = Array.isArray(dossiers) ? dossiers : [];
        const match = list.find((row) => quoteBelongsToDossier(quote, row));
        if (!match) {
            return { ok: false, title: '', requestId, invitationId, reason: 'inaccessible' };
        }
        return {
            ok: true,
            title: str(match.title),
            requestId: str(match.requestId) || requestId,
            invitationId: str(match.invitationId) || invitationId,
            reason: 'matched'
        };
    }

    function createDossierSession() {
        let generation = 0;
        let activeKey = '';
        function bump() {
            generation += 1;
            return generation;
        }
        return {
            bump,
            generation: () => generation,
            activeKey: () => activeKey,
            isCurrent: (token) => token === generation,
            begin(key) {
                const next = str(key);
                if (next !== activeKey) {
                    activeKey = next;
                    bump();
                }
                return generation;
            },
            clear() {
                activeKey = '';
                return bump();
            }
        };
    }

    return {
        dossierKey,
        roleForViewer,
        dossierStatus,
        buildDossier,
        listDossiers,
        selectActiveDossier,
        quoteBelongsToDossier,
        resolveEventDossier,
        compactEventLabel,
        createDossierSession,
        quoteRequestId,
        dossierBucket,
        missionActionKind,
        sortDossiers,
        filterDossiers,
        uniqueDossiers,
        dossierActionIds,
        explainNextStep,
        nextActionLabel,
        activityTimestamp
    };
});
