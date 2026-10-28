/**
 * E6 — Deal notification policy.
 * Keep dedicated deal actions. Skip NEW_MESSAGE push/chime for timeline
 * events already covered by a dedicated deal type or the ActionPanel.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_DEAL_NOTIFICATION_POLICY = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const KEEP_IN_APP_AND_PUSH = [
        'QUOTE_RECEIVED',
        'MISSION_ACCEPTED',
        'WORK_TO_VALIDATE',
        'PAYOUT_READY',
        'PAYMENT_FAILED'
    ];

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
        'funds_released',
        'mission_started',
        'mission_completed',
        'mission_cancelled'
    ];

    const DEAL_TIMELINE_BODIES = [
        '📄 Devis proposé',
        '✅ Devis accepté',
        'Devis refusé',
        '💳 Paiement demandé',
        '🔒 Fonds sécurisés',
        '❌ Paiement échoué',
        '🔨 Paiement par étape',
        '✓ Travail déclaré terminé',
        '✅ Paiement par étape validé',
        '💶 Fonds libérés',
        'Mission commencée',
        'Mission terminée',
        'Mission annulée'
    ];

    const ACTOR_SUCCESS_ALERTS = [
        'Devis accepté. La mission a été créée.',
        'Devis refusé.',
        '🚀 Mission démarrée ! Les travaux sont désormais en cours.',
        '✅ Paiement par étape marqué comme effectué ! Le demandeur a été notifié pour validation.',
        '🎉 Félicitations ! Tous les paiements par étape ont été validés. La mission est désormais TERMINÉE !',
        '👍 Paiement par étape validé avec succès !'
    ];

    function isKeptDealType(type) {
        return KEEP_IN_APP_AND_PUSH.indexOf(String(type || '').toUpperCase()) !== -1;
    }

    function isDealTimelineType(type) {
        return DEAL_TIMELINE_TYPES.indexOf(String(type || '')) !== -1;
    }

    function isDealTimelineBody(body) {
        const text = String(body || '').trim();
        if (!text) return false;
        if (DEAL_TIMELINE_BODIES.indexOf(text) !== -1) return true;
        return text.indexOf('a configuré son compte de versement') !== -1;
    }

    function shouldSkipNewMessagePush(event) {
        if (!event || String(event.type || '') !== 'NEW_MESSAGE') return false;
        return isDealTimelineType(event.messageType || event.message_type) || isDealTimelineBody(event.body);
    }

    function contactIdFromNotification(notif) {
        const type = String(notif && notif.type || '').toUpperCase();
        const entityId = notif && notif.entity_id != null ? String(notif.entity_id) : '';
        if (type === 'NEW_MESSAGE') return entityId || null;
        if (type === 'PAYOUT_READY') return null;
        if (isKeptDealType(type) && entityId) return entityId.split(':')[0] || null;
        return null;
    }

    function requestIdFromNotification(notif) {
        const parts = String(notif && notif.entity_id || '').split(':');
        return parts.length >= 3 ? parts[2] : null;
    }

    function isActorSuccessAlert(message) {
        return ACTOR_SUCCESS_ALERTS.indexOf(String(message || '')) !== -1;
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const CLOSED_REQUEST = ['CLOSED', 'ASSIGNED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'COMPLETED', 'DONE'];

    function isUuid(value) {
        return UUID_RE.test(String(value || ''));
    }

    function asUuid(value) {
        const text = value == null ? '' : String(value).trim();
        return isUuid(text) ? text : null;
    }

    function emptyTarget(type, extra) {
        const extras = extra || {};
        return {
            version: 1,
            type: String(type || '').toUpperCase(),
            route: extras.route != null ? extras.route : null,
            contactId: extras.contactId || null,
            requestId: extras.requestId || null,
            invitationId: extras.invitationId || null,
            quoteId: extras.quoteId || null,
            missionId: extras.missionId || null,
            milestoneId: extras.milestoneId || null,
            postId: extras.postId || null,
            scopeSource: extras.scopeSource || 'legacy',
            resolution: extras.resolution || 'missing',
            navigate: extras.navigate === true,
            code: extras.code || null
        };
    }

    function dealRouteForType(type) {
        const key = String(type || '').toUpperCase();
        if (key === 'PAYOUT_READY') return 'finances';
        if (key === 'OPPORTUNITY') return 'mission';
        if (key === 'BOKANTAJ') return 'bokantaj';
        if (key === 'REQUEST_CLOSING') return null;
        if (
            key === 'NEW_MESSAGE'
            || key === 'QUOTE_RECEIVED'
            || key === 'MISSION_ACCEPTED'
            || key === 'WORK_TO_VALIDATE'
            || key.indexOf('QUOTE') === 0
            || key.indexOf('MISSION') === 0
        ) return 'messages';
        return null;
    }

    function pickStructuredId(input, key) {
        if (!input || typeof input !== 'object') return null;
        const snake = key.replace(/Id$/, '_id');
        return asUuid(input[key] || input[snake]);
    }

    function parseLegacyEntityId(notif, type, entityType) {
        const raw = notif && notif.entity_id != null ? String(notif.entity_id) : '';
        const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
        const uuids = parts.map(asUuid);
        const first = uuids[0] || null;
        const second = uuids[1] || null;
        const third = uuids[2] || null;
        const parsed = {
            contactId: null,
            requestId: null,
            quoteId: null,
            missionId: null,
            milestoneId: null,
            postId: null,
            scopeSource: parts.length >= 3 ? 'notification' : 'legacy'
        };

        if (type === 'BOKANTAJ' || entityType === 'post' || entityType === 'bokantaj_post') {
            parsed.postId = first;
            parsed.scopeSource = first ? 'notification' : 'legacy';
            return parsed;
        }
        if (type === 'NEW_MESSAGE' || entityType === 'conversation') {
            parsed.contactId = first;
            return parsed;
        }
        if (type === 'PAYOUT_READY') return parsed;
        if (type === 'OPPORTUNITY' || type === 'REQUEST_CLOSING' || entityType === 'request') {
            parsed.requestId = first;
            parsed.scopeSource = first ? 'notification' : 'legacy';
            return parsed;
        }
        if (entityType === 'mission' && first && !second) {
            parsed.missionId = first;
            return parsed;
        }
        if (type === 'PAYMENT_FAILED') {
            if (parts[0] === 'finances') {
                parsed.quoteId = second;
                parsed.scopeSource = 'notification';
                return parsed;
            }
            parsed.contactId = first;
            parsed.quoteId = second;
            parsed.requestId = third;
            parsed.scopeSource = first && second && third ? 'notification' : 'notification';
            return parsed;
        }
        if (type === 'WORK_TO_VALIDATE' || entityType === 'milestone') {
            parsed.contactId = first;
            parsed.milestoneId = second;
            parsed.requestId = third;
            return parsed;
        }
        if (isKeptDealType(type) || entityType === 'quote' || type.indexOf('QUOTE') === 0) {
            parsed.contactId = first;
            parsed.quoteId = second;
            parsed.requestId = third;
            return parsed;
        }
        if (first && !second) parsed.contactId = first;
        return parsed;
    }

    /**
     * E6-1a — LyannNotifTarget v1.
     * Never reads localStorage / last-active request. Payload is not authorization.
     */
    function parseNotificationTarget(input, options) {
        const opts = options || {};
        const viewerId = asUuid(opts.viewerId) || null;
        if (!input || typeof input !== 'object') return emptyTarget('', { code: 'invalid' });

        const type = String(input.type || '').toUpperCase();
        const entityType = String(input.entity_type || input.entityType || '').toLowerCase();
        const structured = input.version === 1
            || input.contactId
            || input.requestId
            || input.route
            || input.quoteId
            || input.missionId
            || input.milestoneId
            || input.invitationId
            || input.postId
            || input.post_id;

        let contactId = pickStructuredId(input, 'contactId');
        let requestId = pickStructuredId(input, 'requestId');
        let invitationId = pickStructuredId(input, 'invitationId');
        let quoteId = pickStructuredId(input, 'quoteId');
        let missionId = pickStructuredId(input, 'missionId');
        let milestoneId = pickStructuredId(input, 'milestoneId');
        let postId = pickStructuredId(input, 'postId');
        let conversationId = pickStructuredId(input, 'conversationId');
        let scopeSource = structured && (requestId || invitationId || missionId || quoteId || milestoneId || contactId)
            ? 'notification'
            : 'legacy';
        let route = input.route === 'messages' || input.route === 'mission'
            || input.route === 'finances' || input.route === 'bokantaj'
            ? input.route
            : dealRouteForType(type);

        const legacy = parseLegacyEntityId(input, type, entityType);
        contactId = contactId || legacy.contactId;
        requestId = requestId || legacy.requestId;
        quoteId = quoteId || legacy.quoteId;
        missionId = missionId || legacy.missionId;
        milestoneId = milestoneId || legacy.milestoneId;
        postId = postId || legacy.postId;
        if (!structured) scopeSource = legacy.scopeSource;
        else if (!requestId && legacy.requestId) scopeSource = 'notification';

        let paymentFailedFallback = false;
        if (type === 'PAYMENT_FAILED') {
            const complete = Boolean(contactId && requestId && quoteId);
            if (complete) {
                route = 'messages';
            } else {
                route = 'finances';
                contactId = null;
                requestId = null;
                scopeSource = 'notification';
                paymentFailedFallback = true;
            }
        }
        if (type === 'PAYOUT_READY') {
            contactId = null;
            requestId = null;
            route = 'finances';
            scopeSource = 'notification';
        }
        if (type === 'REQUEST_CLOSING') {
            route = null;
            contactId = null;
        }
        if ((type === 'OPPORTUNITY' || entityType === 'request') && type !== 'REQUEST_CLOSING') {
            route = 'mission';
        }
        if (type === 'BOKANTAJ' || entityType === 'post' || entityType === 'bokantaj_post') {
            route = 'bokantaj';
            postId = postId || asUuid(input.entity_id || input.entityId);
            contactId = null;
            requestId = null;
        }
        if (!route) route = dealRouteForType(type) || (contactId ? 'messages' : null);

        let resolution = 'missing';
        let navigate = false;
        let code = null;
        if (viewerId && contactId && String(contactId) === String(viewerId)) {
            return emptyTarget(type, { code: 'self', scopeSource: 'notification' });
        }
        if (type === 'REQUEST_CLOSING') {
            resolution = requestId ? 'exact' : 'missing';
            navigate = false;
            code = 'request_closing';
        } else if (type === 'PAYOUT_READY' || (type === 'PAYMENT_FAILED' && route === 'finances')) {
            resolution = 'exact';
            navigate = true;
            if (paymentFailedFallback) code = 'payment_failed_finances';
        } else if (route === 'mission' && requestId) {
            resolution = 'exact';
            navigate = true;
        } else if (route === 'bokantaj') {
            resolution = 'exact';
            navigate = true;
        } else if (route === 'messages' && contactId && requestId) {
            resolution = 'exact';
            navigate = true;
        } else if (route === 'messages' && contactId) {
            resolution = 'missing';
            navigate = true;
            code = 'pair_only';
        } else if (quoteId && (type === 'QUOTE_RECEIVED' || route === 'messages' || !route)) {
            route = 'messages';
            resolution = 'missing';
            navigate = true;
            code = 'quote_lookup';
        } else if (requestId || missionId || invitationId) {
            resolution = 'exact';
            navigate = route === 'messages' || route === 'mission';
        }

        return {
            version: 1,
            type,
            route,
            contactId,
            requestId,
            invitationId,
            quoteId,
            missionId,
            milestoneId,
            postId,
            conversationId,
            scopeSource,
            resolution,
            navigate,
            code
        };
    }

    function getQuoteRevisionApi() {
        if (typeof require === 'function') {
            try { return require('./quote-revision'); } catch (_) { /* browser script */ }
        }
        const root = typeof window !== 'undefined' ? window : globalThis;
        return root.LYANN_QUOTE_REVISION || null;
    }

    function isClosedRequestStatus(status) {
        return CLOSED_REQUEST.indexOf(String(status || '').toUpperCase()) !== -1;
    }

    function accessCheckPlan(target) {
        const route = target && target.route;
        const checks = [];
        if (route === 'messages') {
            checks.push('auth', 'conversation_participant');
            if (target.requestId) checks.push('request_visible');
            if (target.quoteId) checks.push('quote_visible');
            if (target.missionId) checks.push('mission_visible');
            if (target.milestoneId) checks.push('milestone_visible');
        } else if (route === 'mission') checks.push('auth', 'request_visible');
        else if (route === 'finances') checks.push('auth');
        else if (route === 'bokantaj') checks.push(target && target.postId ? 'post_visible' : 'feed');
        return {
            authorized: false,
            payloadIsNotAuthorization: true,
            needsServerCheck: checks.length > 0,
            checks
        };
    }

    function quoteRequestId(quote) {
        if (!quote) return null;
        return quote.request_id || quote.requestId || null;
    }

    function resolveNotificationContext(input, context) {
        const ctx = context && typeof context === 'object' ? context : {};
        const parsed = input && input.version === 1 && Object.prototype.hasOwnProperty.call(input, 'scopeSource')
            ? Object.assign({}, input)
            : parseNotificationTarget(input, { viewerId: ctx.viewerId });
        parsed.access = accessCheckPlan(parsed);
        void ctx.lastActiveRequestId;

        if (parsed.code === 'self') return parsed;

        if (parsed.type === 'PAYOUT_READY') {
            parsed.route = 'finances';
            parsed.requestId = null;
            parsed.contactId = null;
            parsed.resolution = 'exact';
            parsed.navigate = true;
            parsed.access = accessCheckPlan(parsed);
            return parsed;
        }
        if (parsed.type === 'PAYMENT_FAILED') {
            const quotes = Array.isArray(ctx.quotes) ? ctx.quotes : [];
            const quote = parsed.quoteId && quotes.find((row) => row && String(row.id) === String(parsed.quoteId));
            const linked = quote ? quoteRequestId(quote) : null;
            if (parsed.requestId && linked && String(linked) !== String(parsed.requestId)) {
                parsed.route = 'finances';
                parsed.contactId = null;
                parsed.requestId = null;
                parsed.resolution = 'exact';
                parsed.navigate = true;
                parsed.code = 'payment_failed_finances';
                parsed.access = accessCheckPlan(parsed);
                return parsed;
            }
            if (parsed.contactId && parsed.requestId && parsed.quoteId) {
                parsed.route = 'messages';
                parsed.resolution = 'exact';
                parsed.navigate = true;
                parsed.access = accessCheckPlan(parsed);
                return parsed;
            }
            parsed.route = 'finances';
            parsed.contactId = null;
            parsed.requestId = null;
            parsed.resolution = 'exact';
            parsed.navigate = true;
            parsed.code = 'payment_failed_finances';
            parsed.access = accessCheckPlan(parsed);
            return parsed;
        }
        if (parsed.type === 'REQUEST_CLOSING') {
            parsed.route = null;
            parsed.navigate = false;
            parsed.resolution = parsed.requestId ? 'exact' : 'missing';
            parsed.code = 'request_closing';
            return parsed;
        }
        if (parsed.route === 'bokantaj') {
            parsed.resolution = 'exact';
            parsed.navigate = true;
            return parsed;
        }
        if (parsed.route === 'mission' || parsed.type === 'OPPORTUNITY') {
            if (!parsed.requestId) {
                parsed.resolution = 'missing';
                parsed.navigate = false;
                return parsed;
            }
            if (isClosedRequestStatus(ctx.requestStatus)) {
                parsed.resolution = 'closed';
                parsed.navigate = false;
                parsed.code = 'request_closed';
                return parsed;
            }
            parsed.resolution = 'exact';
            parsed.navigate = true;
            return parsed;
        }

        let requestId = parsed.requestId;
        const quotes = Array.isArray(ctx.quotes) ? ctx.quotes : [];
        if (parsed.quoteId && quotes.length) {
            const quote = quotes.find((row) => row && String(row.id) === String(parsed.quoteId));
            if (quote) {
                const linked = quoteRequestId(quote);
                if (requestId && linked && String(linked) !== String(requestId)) {
                    parsed.resolution = 'mismatch';
                    parsed.requestId = null;
                    parsed.navigate = false;
                    parsed.code = 'quote_request_mismatch';
                    return parsed;
                }
                if (!requestId && linked && isUuid(linked)) requestId = String(linked);
            }
        }

        const revision = getQuoteRevisionApi();
        const resolve = revision && typeof revision.resolveQuoteContextSelection === 'function'
            ? revision.resolveQuoteContextSelection
            : null;

        if (!resolve) {
            parsed.requestId = requestId || null;
            parsed.resolution = requestId ? 'exact' : (parsed.contactId ? 'ambiguous' : 'missing');
            parsed.navigate = parsed.route === 'messages' && !!parsed.contactId;
            parsed.code = parsed.code || 'resolver_unavailable';
            return parsed;
        }

        const selection = resolve({
            invitations: ctx.invitations || [],
            missions: ctx.missions || [],
            requestId: requestId || '',
            invitationId: parsed.invitationId || '',
            missionId: parsed.missionId || ''
        });

        const mismatchCodes = [
            'mission_request_mismatch',
            'invitation_request_mismatch',
            'invitation_mismatch'
        ];
        if (mismatchCodes.indexOf(selection.code) !== -1) {
            parsed.resolution = 'mismatch';
            parsed.requestId = null;
            parsed.invitationId = null;
            parsed.missionId = null;
            parsed.navigate = false;
            parsed.code = selection.code;
            return parsed;
        }

        if (selection.ambiguous) {
            parsed.resolution = 'ambiguous';
            parsed.requestId = null;
            parsed.invitationId = null;
            parsed.missionId = null;
            parsed.navigate = parsed.route === 'messages' && !!parsed.contactId;
            parsed.code = selection.code || 'ambiguous';
            return parsed;
        }

        if (selection.ok) {
            const hadExplicit = Boolean(requestId || parsed.invitationId || parsed.missionId);
            parsed.requestId = selection.requestId || requestId || null;
            parsed.invitationId = selection.invitationId || parsed.invitationId || null;
            parsed.missionId = selection.missionId || parsed.missionId || null;
            parsed.resolution = hadExplicit ? 'exact' : 'unique';
            parsed.scopeSource = hadExplicit ? parsed.scopeSource : 'legacy';
            parsed.navigate = parsed.route === 'messages';
            parsed.code = selection.code || null;
            parsed.access = accessCheckPlan(parsed);
            return parsed;
        }

        if (selection.code === 'mission_missing' || selection.code === 'invitation_missing') {
            parsed.resolution = 'missing';
            parsed.requestId = null;
            parsed.navigate = false;
            parsed.code = selection.code;
            return parsed;
        }

        parsed.requestId = null;
        parsed.resolution = 'missing';
        parsed.navigate = parsed.route === 'messages' && !!parsed.contactId && parsed.type === 'NEW_MESSAGE';
        parsed.code = selection.code || 'missing';
        return parsed;
    }

    function normalizeActiveSurface(active) {
        if (!active) return { contactId: null, requestId: null, chatOpen: false };
        if (typeof active === 'string') {
            return { contactId: active, requestId: null, chatOpen: true };
        }
        return {
            contactId: active.contactId || active.id || null,
            requestId: active.requestId || null,
            chatOpen: active.chatOpen !== false
        };
    }

    function isTargetDisplayed(target, active, context) {
        if (!target || !active) return false;
        const surface = normalizeActiveSurface(active);
        if (surface.chatOpen === false) return false;
        if (!surface.contactId || !target.contactId) return false;
        if (String(target.contactId) !== String(surface.contactId)) return false;
        if (target.requestId) {
            return Boolean(surface.requestId) && String(target.requestId) === String(surface.requestId);
        }
        if (hasDealContext(context)) {
            const resolved = resolveNotificationContext(target, context);
            if (resolved.resolution === 'ambiguous') return false;
            if (resolved.resolution === 'unique' || resolved.resolution === 'exact') {
                if (!resolved.requestId) return true;
                return Boolean(surface.requestId) && String(resolved.requestId) === String(surface.requestId);
            }
            return false;
        }
        return false;
    }

    function shouldSkipChime(notif, active, context) {
        if (!notif || notif.read) return true;
        if (shouldSkipNewMessagePush(notif)) return true;
        const ctx = context && typeof context === 'object' ? context : {};
        if (ctx.appVisible === false) return false;
        const target = parseNotificationTarget(notif);
        if (target.route && target.route !== 'messages') return false;
        const surface = normalizeActiveSurface(active);
        if (!surface.chatOpen || !surface.contactId) return false;
        return isTargetDisplayed(target, surface, ctx);
    }

    function shouldSkipForegroundToast(data, active, context) {
        const ctx = context && typeof context === 'object' ? context : {};
        if (ctx.appVisible === false) return false;
        if (shouldSkipChime(data, active, ctx)) return true;
        if (ctx.realtimeLive === true) return true;
        return false;
    }

    function routerPayloadFromTarget(target) {
        if (!target || !target.route) return { scopeSource: 'notification' };
        if (target.route === 'finances') {
            return { scopeSource: 'notification' };
        }
        if (target.route === 'bokantaj') {
            const payload = { scopeSource: 'notification' };
            if (target.postId) payload.postId = target.postId;
            return payload;
        }
        if (target.route === 'mission') {
            return { requestId: target.requestId || null, scopeSource: 'notification' };
        }
        const payload = {
            contactId: target.contactId || null,
            scopeSource: 'notification'
        };
        if (target.conversationId) payload.conversationId = target.conversationId;
        if (target.quoteId) payload.quoteId = target.quoteId;
        if (target.resolution === 'exact' || target.resolution === 'unique') {
            if (target.requestId) payload.requestId = target.requestId;
            if (target.invitationId) payload.invitationId = target.invitationId;
            if (target.missionId) payload.missionId = target.missionId;
            if (target.quoteId) payload.quoteId = target.quoteId;
            if (target.milestoneId) payload.milestoneId = target.milestoneId;
        }
        return payload;
    }

    function hasDealContext(context) {
        const ctx = context || {};
        return Boolean(
            (ctx.invitations && ctx.invitations.length)
            || (ctx.missions && ctx.missions.length)
            || (ctx.quotes && ctx.quotes.length)
            || ctx.requestStatus
        );
    }

    function planNotificationNavigation(input, context) {
        const ctx = context && typeof context === 'object' ? context : {};
        const target = hasDealContext(ctx)
            ? resolveNotificationContext(input, ctx)
            : parseNotificationTarget(input, { viewerId: ctx.viewerId });
        if (!target.access) target.access = accessCheckPlan(target);
        if (target.code === 'self' || target.code === 'request_closing') {
            return { open: false, target: target, reason: target.code, route: null, payload: null };
        }
        if (target.resolution === 'mismatch' || target.resolution === 'closed') {
            return { open: false, target: target, reason: target.resolution, route: null, payload: null };
        }
        if (!target.navigate || !target.route) {
            return { open: false, target: target, reason: target.code || target.resolution || 'no_route', route: null, payload: null };
        }
        return {
            open: true,
            target: target,
            reason: target.resolution,
            route: target.route,
            payload: routerPayloadFromTarget(target)
        };
    }

    function serializePendingPushTarget(input) {
        const target = input && input.version === 1 && Object.prototype.hasOwnProperty.call(input, 'scopeSource')
            ? input
            : parseNotificationTarget(input);
        return JSON.stringify({
            version: 1,
            type: target.type || '',
            route: target.route || '',
            contactId: target.contactId || '',
            requestId: target.requestId || '',
            invitationId: target.invitationId || '',
            quoteId: target.quoteId || '',
            conversationId: target.conversationId || '',
            missionId: target.missionId || '',
            milestoneId: target.milestoneId || '',
            postId: target.postId || '',
            scopeSource: 'notification'
        });
    }

    function parsePendingPushTarget(raw) {
        let data = raw;
        if (typeof raw === 'string') {
            try { data = JSON.parse(raw); } catch (_) { return null; }
        }
        if (!data || typeof data !== 'object' || !data.route) return null;
        return parseNotificationTarget(data);
    }

    const VISIT_TYPES = ['visit_proposed', 'visit_accepted', 'visit_declined', 'visit_rescheduled'];
    const HUMAN_ATTACHMENT_TYPES = ['text', 'photo', 'document', 'video', ''];

    function messageTypeOf(event) {
        if (!event) return '';
        if (event.type === 'NEW_MESSAGE') return String(event.messageType || event.message_type || '');
        return String(event.messageType || event.message_type || event.type || '');
    }

    function isVisitType(type) {
        return VISIT_TYPES.indexOf(String(type || '')) !== -1;
    }

    function isHumanChatMessage(event) {
        if (!event) return false;
        if (event.metadata && event.metadata.kind === 'payout_ready') return false;
        const type = messageTypeOf(event);
        if (isDealTimelineType(type) || isVisitType(type)) return false;
        if (isDealTimelineBody(event.body || event.content)) return false;
        if (event.type === 'NEW_MESSAGE') return true;
        return HUMAN_ATTACHMENT_TYPES.indexOf(type) !== -1;
    }

    /**
     * Target inbox policy (Phase 2). Not wired to SQL producers.
     * createNewMessage describes the desired row after a safe 54 apply.
     */
    function eventNotificationPolicy(event) {
        const type = messageTypeOf(event);
        if (event && event.metadata && event.metadata.kind === 'payout_ready') {
            return {
                kind: 'deal',
                createNewMessage: false,
                dedicatedType: 'PAYOUT_READY',
                wakeE4: false,
                decision: 'dedicated'
            };
        }
        if (type === 'quote_created' || type === 'quote_updated') {
            return { kind: 'deal', createNewMessage: false, dedicatedType: 'QUOTE_RECEIVED', wakeE4: true, decision: 'dedicated' };
        }
        if (type === 'quote_accepted') {
            return { kind: 'deal', createNewMessage: false, dedicatedType: 'MISSION_ACCEPTED', wakeE4: true, decision: 'dedicated' };
        }
        if (type === 'milestone_completed') {
            return { kind: 'deal', createNewMessage: false, dedicatedType: 'WORK_TO_VALIDATE', wakeE4: true, decision: 'dedicated' };
        }
        if (type === 'quote_declined') {
            return { kind: 'deal', createNewMessage: false, dedicatedType: null, wakeE4: true, decision: 'timeline_only' };
        }
        if (type === 'payment_failed') {
            return {
                kind: 'deal',
                createNewMessage: false,
                dedicatedType: 'PAYMENT_FAILED',
                wakeE4: true,
                recipient: 'requester',
                decision: 'dedicated'
            };
        }
        if (isVisitType(type)) {
            return { kind: 'coordination', createNewMessage: true, dedicatedType: null, wakeE4: false, decision: 'keep_new_message' };
        }
        if (isDealTimelineType(type)) {
            return { kind: 'deal', createNewMessage: false, dedicatedType: null, wakeE4: true, decision: 'timeline_only' };
        }
        return { kind: 'human', createNewMessage: true, dedicatedType: 'NEW_MESSAGE', wakeE4: false, decision: 'human' };
    }

    /**
     * PAYMENT_FAILED contract. Navigation (LyannNotifTarget) is the first
     * three UUIDs. Idempotence is paymentId + attempt and must not drive routing.
     */
    function paymentFailedRecipient(payment) {
        if (!payment || typeof payment !== 'object') return null;
        const requester = asUuid(payment.requester_id || payment.requesterId);
        const provider = asUuid(payment.provider_id || payment.providerId);
        if (!requester || (provider && String(requester) === String(provider))) return null;
        return requester;
    }

    function paymentFailedAttempt(input) {
        const raw = input && (input.attempt != null ? input.attempt : input.failure_seq);
        const n = Number(raw);
        return Number.isInteger(n) && n >= 1 ? n : 1;
    }

    function buildPaymentFailedNavigation(input) {
        const row = input && typeof input === 'object' ? input : {};
        const contactId = asUuid(row.contactId || row.provider_id || row.providerId);
        const requestId = asUuid(row.requestId || row.request_id);
        const quoteId = asUuid(row.quoteId || row.quote_id);
        const missionId = asUuid(row.missionId || row.mission_id);
        if (contactId && requestId && quoteId) {
            return {
                route: 'messages',
                contactId,
                requestId,
                quoteId,
                missionId: missionId || null,
                scopeSource: 'notification',
                fallback: false
            };
        }
        return {
            route: 'finances',
            contactId: null,
            requestId: null,
            quoteId: quoteId || null,
            missionId: missionId || null,
            scopeSource: 'notification',
            fallback: true
        };
    }

    function buildPaymentFailedIdempotenceKey(input) {
        const row = input && typeof input === 'object' ? input : {};
        const paymentId = asUuid(row.paymentId || row.payment_id || row.id);
        if (!paymentId) return null;
        return paymentId + ':a' + paymentFailedAttempt(row);
    }

    function buildPaymentFailedEntityId(input) {
        const nav = buildPaymentFailedNavigation(input);
        const idem = buildPaymentFailedIdempotenceKey(input);
        if (!nav || !idem) return null;
        if (nav.fallback || nav.route === 'finances') {
            return ['finances', nav.quoteId || 'none', idem].join(':');
        }
        return [nav.contactId, nav.quoteId, nav.requestId, idem].join(':');
    }

    function paymentStatusOf(row) {
        return String(row && (row.payment_status || row.status) || '').toUpperCase();
    }

    function shouldEmitPaymentFailed(previous, next) {
        if (!next || paymentStatusOf(next) !== 'FAILED') return false;
        if (!previous) return false;
        return paymentStatusOf(previous) !== 'FAILED';
    }

    function isTechnicalPaymentRetry(previous, next) {
        if (!previous || !next) return false;
        const prevPi = String(previous.stripe_payment_intent_id || previous.stripePaymentIntentId || '');
        const nextPi = String(next.stripe_payment_intent_id || next.stripePaymentIntentId || '');
        const prevPay = asUuid(previous.paymentId || previous.payment_id || previous.id);
        const nextPay = asUuid(next.paymentId || next.payment_id || next.id);
        const prevStatus = String(previous.payment_status || previous.status || '').toUpperCase();
        const nextStatus = String(next.payment_status || next.status || '').toUpperCase();
        return Boolean(prevPay && nextPay && prevPay === nextPay)
            && Boolean(prevPi && nextPi && prevPi === nextPi)
            && prevStatus === 'FAILED'
            && nextStatus === 'FAILED'
            && paymentFailedAttempt(previous) === paymentFailedAttempt(next);
    }

    function isDistinctPaymentFailure(previous, next) {
        if (!next) return false;
        if (!previous) return true;
        if (isTechnicalPaymentRetry(previous, next)) return false;
        const prevPay = asUuid(previous.paymentId || previous.payment_id || previous.id);
        const nextPay = asUuid(next.paymentId || next.payment_id || next.id);
        if (prevPay && nextPay && prevPay !== nextPay) return true;
        return paymentFailedAttempt(next) > paymentFailedAttempt(previous);
    }

    function buildPaymentFailedNotification(input) {
        const row = input && typeof input === 'object' ? input : {};
        const recipientId = paymentFailedRecipient(row);
        const paymentId = asUuid(row.paymentId || row.payment_id || row.id);
        const nav = buildPaymentFailedNavigation(row);
        const idempotenceKey = buildPaymentFailedIdempotenceKey(row);
        const entityId = buildPaymentFailedEntityId(row);
        if (!recipientId || !idempotenceKey || !entityId) {
            return { create: false, reason: 'INCOMPLETE', type: 'PAYMENT_FAILED' };
        }
        if (nav.contactId && String(recipientId) === String(nav.contactId)) {
            return { create: false, reason: 'WRONG_RECIPIENT', type: 'PAYMENT_FAILED' };
        }
        return {
            create: true,
            type: 'PAYMENT_FAILED',
            userId: recipientId,
            recipientRole: 'requester',
            notifyProvider: false,
            entityType: 'payment',
            entityId,
            navigation: nav,
            idempotenceKey,
            contactId: nav.contactId,
            requestId: nav.requestId,
            quoteId: nav.quoteId,
            missionId: nav.missionId,
            paymentId,
            attempt: paymentFailedAttempt(row),
            route: nav.route,
            title: 'LYANN',
            body: 'Une action est nécessaire sur un paiement.'
        };
    }

    function resolveQuoteThread(quote, viewerId) {
        const viewer = asUuid(viewerId);
        const requester = asUuid(quote && (quote.requester_id || quote.requesterId));
        const provider = asUuid(quote && (quote.provider_id || quote.providerId));
        const conversationId = asUuid(quote && (quote.conversation_id || quote.conversationId));
        const quoteId = asUuid(quote && (quote.id || quote.quoteId));
        if (!viewer || !requester || !provider || !quoteId) return { ok: false, code: 'quote_unavailable' };
        if (viewer !== requester && viewer !== provider) return { ok: false, code: 'quote_unavailable' };
        const contactId = viewer === requester ? provider : requester;
        if (!contactId || contactId === viewer) return { ok: false, code: 'self' };
        if (!conversationId) return { ok: false, code: 'conversation_unavailable' };
        return {
            ok: true,
            contactId,
            conversationId,
            requestId: asUuid(quote.request_id || quote.requestId),
            quoteId
        };
    }

    function notificationUnavailableMessage(target) {
        const route = target && target.route;
        const code = String((target && (target.code || target.resolution)) || '');
        if (code === 'session_mismatch') return 'Cette notification ne correspond plus à votre session.';
        if (route === 'bokantaj' || code === 'post_unavailable') return 'Cette publication n’est plus disponible.';
        if (route === 'mission' || code === 'request_closed' || code === 'request_unavailable') {
            return 'Cette annonce n’est plus disponible.';
        }
        if (code === 'quote_unavailable') return 'Cette proposition n’est plus disponible.';
        if (route === 'messages' || code === 'conversation_unavailable') return 'Cette conversation n’est plus accessible.';
        return 'Ce contenu n’est plus accessible.';
    }

    function paymentFailedTransitionGate(state) {
        const hasProducer = Boolean(state && state.hasDedicatedProducer);
        const skipFailed = Boolean(state && state.skipPaymentFailedNewMessage);
        if (skipFailed && !hasProducer) {
            return { ready: false, code: 'SILENCE_RISK', keepNewMessage: true, applySkip: false };
        }
        if (!hasProducer) {
            return { ready: true, code: 'KEEP_NEW_MESSAGE', keepNewMessage: true, applySkip: false };
        }
        return { ready: true, code: 'SWITCH_TO_DEDICATED', keepNewMessage: false, applySkip: true };
    }

    return {
        KEEP_IN_APP_AND_PUSH,
        DEAL_TIMELINE_TYPES,
        DEAL_TIMELINE_BODIES,
        VISIT_TYPES,
        isKeptDealType,
        isDealTimelineType,
        isDealTimelineBody,
        shouldSkipNewMessagePush,
        contactIdFromNotification,
        requestIdFromNotification,
        shouldSkipChime,
        isActorSuccessAlert,
        isUuid,
        parseNotificationTarget,
        resolveNotificationContext,
        accessCheckPlan,
        isTargetDisplayed,
        shouldSkipForegroundToast,
        routerPayloadFromTarget,
        planNotificationNavigation,
        resolveQuoteThread,
        notificationUnavailableMessage,
        serializePendingPushTarget,
        parsePendingPushTarget,
        isHumanChatMessage,
        eventNotificationPolicy,
        paymentFailedRecipient,
        buildPaymentFailedNavigation,
        buildPaymentFailedIdempotenceKey,
        buildPaymentFailedEntityId,
        shouldEmitPaymentFailed,
        isTechnicalPaymentRetry,
        isDistinctPaymentFailure,
        buildPaymentFailedNotification,
        paymentFailedTransitionGate
    };
});
