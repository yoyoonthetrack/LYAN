'use strict';

const crypto = require('crypto');
const dealNotificationPolicy = require('../deal-notification-policy');

// Decisions for automatic APNs delivery. This module never opens a network
// connection and never reads secrets. Sending stays behind PUSH_AUTOMATIC_ENABLED.

const SOUND_FILE = 'lyann-notif.caf';
const MESSAGE_WINDOW_MS = 2 * 60 * 1000;
const OPPORTUNITY_WINDOW_MS = 6 * 60 * 60 * 1000;
const MESSAGE_EXPIRY_MS = 15 * 60 * 1000;
const OPPORTUNITY_EXPIRY_MS = 6 * 60 * 60 * 1000;
const ACTION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const PUSH_TYPES = new Set([
    'NEW_MESSAGE',
    'QUOTE_RECEIVED',
    'MISSION_ACCEPTED',
    'WORK_TO_VALIDATE',
    'PAYOUT_READY',
    'PAYMENT_FAILED',
    'OPPORTUNITY'
]);

const PUBLIC_ALERTS = {
    NEW_MESSAGE: ['LYANN', 'Vous avez un nouveau message.'],
    QUOTE_RECEIVED: ['LYANN', 'Vous avez reçu une proposition.'],
    MISSION_ACCEPTED: ['LYANN', 'Une mission a été acceptée.'],
    WORK_TO_VALIDATE: ['LYANN', 'Un travail est à valider.'],
    PAYOUT_READY: ['LYANN', 'Une action est nécessaire sur un versement.'],
    PAYMENT_FAILED: ['LYANN', 'Une action est nécessaire sur un paiement.'],
    OPPORTUNITY: ['LYANN', 'Une annonce correspond à une de vos compétences.']
};

function automaticPushEnabled(env) {
    return Boolean(env && env.PUSH_AUTOMATIC_ENABLED === 'true');
}

function bearerMatches(authorization, secret) {
    if (!secret) return false;
    const expected = Buffer.from('Bearer ' + secret);
    const actual = Buffer.from(String(authorization || ''));
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
}

function cronAuthorized(authorization, env) {
    const configured = [env && env.CRON_SECRET, env && env.PUSH_CRON_SECRET].filter(Boolean);
    if (!configured.length) return false;
    return configured.some((secret) => bearerMatches(authorization, secret));
}

function pushAudience(env) {
    if (!automaticPushEnabled(env)) return { enabled: false, allowlist: null, code: 'PUSH_AUTOMATIC_DISABLED' };
    const staging = String(env && env.LYANN_RUNTIME || '').toLowerCase() === 'staging';
    const restricted = staging || Boolean(env && env.PUSH_QA_ONLY === 'true');
    if (!restricted) return { enabled: true, allowlist: null, code: null };
    const allowlist = String(env && env.PUSH_QA_USER_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^[0-9a-f-]{36}$/i.test(value));
    if (!allowlist.length) return { enabled: false, allowlist: [], code: 'PUSH_QA_REQUIRED' };
    return { enabled: true, allowlist, code: null };
}

function pushSound(customSound) {
    return customSound === false ? 'default' : SOUND_FILE;
}

function sameParty(left, right) {
    return Boolean(left) && Boolean(right) && String(left) === String(right);
}

function recipientsForMessage(participantIds, senderId, supportId) {
    const seen = new Set();
    const recipients = [];
    for (const id of participantIds || []) {
        const value = String(id || '');
        if (!value || seen.has(value)) continue;
        if (sameParty(value, senderId) || sameParty(value, supportId)) continue;
        seen.add(value);
        recipients.push(value);
    }
    return recipients;
}

function publicAlert(type) {
    const pair = PUBLIC_ALERTS[type];
    if (!pair) return null;
    return { title: pair[0], body: pair[1] };
}

function routeIdsFromTarget(target, fallbackRoute) {
    const route = (target && target.route) || fallbackRoute || null;
    return {
        route,
        contactId: route === 'finances' ? null : ((target && target.contactId) || null),
        requestId: (target && target.requestId) || null,
        invitationId: (target && target.invitationId) || null,
        quoteId: (target && target.quoteId) || null,
        missionId: (target && target.missionId) || null,
        milestoneId: (target && target.milestoneId) || null,
        scopeSource: (target && target.scopeSource) || 'legacy'
    };
}

function routeFor(event) {
    if (!event) return routeIdsFromTarget(null, null);
    const type = event.type;
    const parsed = dealNotificationPolicy.parseNotificationTarget({
        version: event.version,
        type,
        route: event.route,
        entity_id: event.entityId || event.entity_id,
        entity_type: event.entityType || event.entity_type,
        contactId: event.contactId || event.peerId || null,
        requestId: event.requestId || event.request_id || null,
        invitationId: event.invitationId || event.invitation_id || null,
        quoteId: event.quoteId || event.quote_id || null,
        missionId: event.missionId || event.mission_id || null,
        milestoneId: event.milestoneId || event.milestone_id || null
    }, { viewerId: event.recipientId });

    if (type === 'PAYOUT_READY') return routeIdsFromTarget({ ...parsed, route: 'finances', contactId: null, requestId: null }, 'finances');
    if (type === 'OPPORTUNITY') {
        const requestId = parsed.requestId || (isUuid(event.requestId) ? event.requestId : null) || (isUuid(event.entityId) ? event.entityId : null);
        return routeIdsFromTarget({ ...parsed, route: 'mission', contactId: null, requestId }, 'mission');
    }
    if (type === 'BOKANTAJ') return routeIdsFromTarget({ ...parsed, route: 'bokantaj' }, 'bokantaj');
    if (type === 'PAYMENT_FAILED') {
        if (parsed.route === 'messages' && parsed.contactId && parsed.requestId) {
            return routeIdsFromTarget(parsed, 'messages');
        }
        return routeIdsFromTarget({
            ...parsed,
            route: 'finances',
            contactId: null,
            requestId: null
        }, 'finances');
    }
    if (parsed.route) return routeIdsFromTarget(parsed, parsed.route);
    if (type === 'NEW_MESSAGE' || type === 'QUOTE_RECEIVED' || type === 'WORK_TO_VALIDATE' || type === 'MISSION_ACCEPTED') {
        return routeIdsFromTarget({
            ...parsed,
            route: 'messages',
            contactId: parsed.contactId || event.peerId || event.actorId || null
        }, 'messages');
    }
    return routeIdsFromTarget(parsed, null);
}

function dedupeKey(event) {
    const recipient = String(event.recipientId || '');
    if (event.type === 'NEW_MESSAGE') {
        return 'msg:' + recipient + ':' + String(event.peerId || event.actorId || '');
    }
    if (event.type === 'OPPORTUNITY') return 'opp:' + recipient;
    return 'evt:' + event.type + ':' + recipient + ':' + String(event.entityId || '');
}

function withinWindow(recent, key, now, windowMs) {
    const at = recent && recent[key];
    return Number.isFinite(at) && now - at < windowMs;
}

function planDelivery(event, now = Date.now()) {
    const type = event && event.type;
    const recipientId = event && event.recipientId;
    const actorId = event && event.actorId;
    if (!recipientId) return { enqueue: false, reason: 'RECIPIENT_MISSING' };
    if (sameParty(recipientId, actorId)) return { enqueue: false, reason: 'SENDER' };
    if (event.supportId && sameParty(recipientId, event.supportId)) return { enqueue: false, reason: 'SUPPORT' };
    if (!PUSH_TYPES.has(type)) return { enqueue: false, reason: 'TYPE_EXCLUDED' };
    if (dealNotificationPolicy.shouldSkipNewMessagePush(event)) {
        return { enqueue: false, reason: 'DEAL_TIMELINE' };
    }
    const alert = publicAlert(type);
    const route = routeFor(event);
    if (route.route === 'messages' && (!route.contactId || sameParty(route.contactId, recipientId))) {
        return { enqueue: false, reason: 'ROUTE_INVALID' };
    }
    const key = dedupeKey(event);
    const windowMs = type === 'NEW_MESSAGE' ? MESSAGE_WINDOW_MS : (type === 'OPPORTUNITY' ? OPPORTUNITY_WINDOW_MS : 0);
    if (windowMs && withinWindow(event.recent, key, now, windowMs)) {
        return { enqueue: false, reason: 'COOLDOWN', dedupeKey: key };
    }
    if (!windowMs && event.recent && Object.prototype.hasOwnProperty.call(event.recent, key)) {
        return { enqueue: false, reason: 'DUPLICATE', dedupeKey: key };
    }
    return {
        enqueue: true,
        reason: 'QUEUED',
        dedupeKey: key,
        eventType: type,
        recipientId: String(recipientId),
        entityId: event.entityId ? String(event.entityId) : null,
        alert,
        route,
        sound: pushSound(event.customSound)
    };
}

function buildAutomaticPayload(plan) {
    const alert = plan.alert || { title: 'LYANN', body: 'Vous avez une notification.' };
    const route = plan.route || {};
    const payload = {
        version: 1,
        scopeSource: 'notification',
        aps: {
            alert: { title: String(alert.title || 'LYANN'), body: String(alert.body || '') },
            sound: pushSound(plan.customSound === false ? false : true)
        }
    };
    if (route.route) payload.route = route.route;
    const ids = ['contactId', 'requestId', 'invitationId', 'quoteId', 'missionId', 'milestoneId'];
    for (const key of ids) {
        const value = route[key];
        if (value && isUuid(value)) payload[key] = String(value);
    }
    return payload;
}

function payloadExposesSensitiveData(payload) {
    const text = JSON.stringify(payload || {});
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
    if (/\b(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}\b/.test(text)) return true;
    if (/€|\biban\b|\bcvv\b|\bcarte\b/i.test(text)) return true;
    return false;
}

function foreignActiveTokenIds(rows, userId, token) {
    return (rows || [])
        .filter((row) => row && row.active !== false && row.token === token && !sameParty(row.user_id, userId))
        .map((row) => row.id);
}

function expiryMs(type) {
    if (type === 'NEW_MESSAGE') return MESSAGE_EXPIRY_MS;
    if (type === 'OPPORTUNITY') return OPPORTUNITY_EXPIRY_MS;
    return ACTION_EXPIRY_MS;
}

function expiresAtFor(type, createdAt) {
    return Number(createdAt) + expiryMs(type);
}

function isDeliveryExpired(row, now) {
    if (!row || row.expiresAt == null) return false;
    return Number(row.expiresAt) <= now;
}

function claimable(row, now) {
    if (!row) return false;
    if (isDeliveryExpired(row, now)) return false;
    if (row.attempts >= (row.maxAttempts || MAX_ATTEMPTS) && row.status !== 'pending') return false;
    if (row.status === 'sent' || row.status === 'skipped' || row.status === 'dead') return false;
    if (row.nextAttemptAt && row.nextAttemptAt > now) return false;
    if (row.status === 'processing' && row.lockedAt && now - row.lockedAt < LOCK_STALE_MS) return false;
    return row.status === 'pending' || row.status === 'retry' || row.status === 'processing';
}

function selectClaimable(rows, now, limit) {
    return (rows || [])
        .filter((row) => claimable(row, now))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .slice(0, limit);
}

function backoffMs(attempts) {
    const steps = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];
    return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

function settleDelivery(delivery, sends, now) {
    const attempts = Number(delivery.attempts || 0);
    const maxAttempts = Number(delivery.maxAttempts || MAX_ATTEMPTS);
    const results = sends || [];
    if (!results.length) {
        return { status: 'skipped', lastError: 'NO_DEVICE', deactivateIds: [], nextAttemptAt: null };
    }
    const deactivateIds = results.filter((item) => item.deactivate && item.deviceId).map((item) => item.deviceId);
    const sent = results.some((item) => item.ok);
    if (sent) return { status: 'sent', lastError: null, deactivateIds, nextAttemptAt: null };
    if (attempts >= maxAttempts) {
        return { status: 'dead', lastError: results[0].code || 'APNS_REJECTED', deactivateIds, nextAttemptAt: null };
    }
    return {
        status: 'retry',
        lastError: results[0].code || 'APNS_REJECTED',
        deactivateIds,
        nextAttemptAt: now + backoffMs(attempts)
    };
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function pushAccessGranted(queryResult) {
    if (!queryResult || queryResult.error) return false;
    return Array.isArray(queryResult.rows) && queryResult.rows.length > 0;
}

function openPushTargetAllowed(sessionUserId, data) {
    if (!sessionUserId) return { ok: false, reason: 'AUTH_REQUIRED' };
    const route = data && data.route;
    if (route !== 'messages' && route !== 'mission' && route !== 'finances' && route !== 'bokantaj') {
        return { ok: false, reason: 'ROUTE_UNKNOWN' };
    }
    if (data.contactId && sameParty(data.contactId, sessionUserId)) {
        return { ok: false, reason: 'SENDER' };
    }
    if (route === 'messages' && !isUuid(data.contactId)) return { ok: false, reason: 'CONTACT_MISSING' };
    if (route === 'mission' && !isUuid(data.requestId)) return { ok: false, reason: 'REQUEST_MISSING' };
    if (route === 'finances' || route === 'bokantaj') {
        return { ok: true, route, contactId: null, requestId: null, needsResourceCheck: route === 'bokantaj' };
    }
    return {
        ok: true,
        route,
        contactId: data.contactId || null,
        requestId: data.requestId || null,
        needsResourceCheck: true
    };
}

async function drainQueue(options) {
    const enabled = options.enabled === true;
    if (!enabled) {
        return { enabled: false, processed: 0, code: 'PUSH_AUTOMATIC_DISABLED' };
    }
    const now = options.now || Date.now();
    const claimed = await options.claim({ workerId: options.workerId, limit: options.limit || 20, now });
    const rows = claimed || [];
    const allowlist = Array.isArray(options.allowlist) ? options.allowlist : null;
    let processed = 0;
    for (const row of rows) {
        if (isDeliveryExpired(row, now)) {
            await options.complete(row, { status: 'skipped', lastError: 'EXPIRED', nextAttemptAt: null });
            processed += 1;
            continue;
        }
        if (allowlist && !allowlist.includes(String(row.recipientId))) {
            await options.complete(row, { status: 'skipped', lastError: 'QA_EXCLUDED', nextAttemptAt: null });
            processed += 1;
            continue;
        }
        const plan = {
            alert: { title: row.title, body: row.body },
            route: routeFor({
                type: row.eventType || row.type,
                route: row.route,
                entityId: row.entityId,
                contactId: row.contactId,
                peerId: row.contactId,
                requestId: row.requestId,
                invitationId: row.invitationId,
                quoteId: row.quoteId,
                missionId: row.missionId,
                milestoneId: row.milestoneId,
                recipientId: row.recipientId
            }),
            customSound: options.customSound !== false
        };
        const payload = buildAutomaticPayload(plan);
        if (payloadExposesSensitiveData(payload)) {
            await options.complete(row, { status: 'dead', lastError: 'SENSITIVE_PAYLOAD', nextAttemptAt: null });
            processed += 1;
            continue;
        }
        const devices = await options.tokensForUser(row.recipientId);
        const sends = [];
        for (const device of devices || []) {
            const result = await options.send({
                deviceToken: device.token,
                environment: device.environment,
                payload,
                apnsId: row.apnsId || null
            });
            sends.push({
                ok: Boolean(result && result.ok),
                code: result && result.code,
                deactivate: Boolean(result && result.deactivate),
                deviceId: device.id
            });
        }
        const settled = settleDelivery(row, sends, now);
        if (settled.deactivateIds.length && options.deactivateTokens) {
            await options.deactivateTokens(settled.deactivateIds);
        }
        await options.complete(row, settled);
        processed += 1;
    }
    return { enabled: true, processed, code: 'DRAINED' };
}

module.exports = {
    SOUND_FILE,
    MESSAGE_WINDOW_MS,
    OPPORTUNITY_WINDOW_MS,
    MESSAGE_EXPIRY_MS,
    OPPORTUNITY_EXPIRY_MS,
    ACTION_EXPIRY_MS,
    expiresAtFor,
    isDeliveryExpired,
    LOCK_STALE_MS,
    MAX_ATTEMPTS,
    PUSH_TYPES,
    automaticPushEnabled,
    cronAuthorized,
    pushAudience,
    isUuid,
    pushAccessGranted,
    pushSound,
    recipientsForMessage,
    planDelivery,
    routeFor,
    buildAutomaticPayload,
    payloadExposesSensitiveData,
    foreignActiveTokenIds,
    claimable,
    selectClaimable,
    settleDelivery,
    openPushTargetAllowed,
    drainQueue
};
