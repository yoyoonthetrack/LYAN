'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    automaticPushEnabled,
    cronAuthorized,
    pushAudience,
    pushAccessGranted,
    pushSound,
    recipientsForMessage,
    planDelivery,
    routeFor,
    buildAutomaticPayload,
    payloadExposesSensitiveData,
    foreignActiveTokenIds,
    selectClaimable,
    claimable,
    settleDelivery,
    openPushTargetAllowed,
    drainQueue,
    MESSAGE_WINDOW_MS,
    OPPORTUNITY_WINDOW_MS,
    MESSAGE_EXPIRY_MS,
    OPPORTUNITY_EXPIRY_MS,
    ACTION_EXPIRY_MS,
    expiresAtFor,
    isDeliveryExpired,
    SOUND_FILE
} = require('../api/push-queue');
const policy = require('../deal-notification-policy');

const QUOTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REQ1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQ2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MILE = '55555555-5555-4555-8555-555555555555';
const INV1 = '77777777-7777-4777-8777-777777777777';
const INV2 = '66666666-6666-4666-8666-666666666666';
const MSN1 = '99999999-9999-4999-8999-999999999999';
const MSN2 = '88888888-8888-4888-8888-888888888888';

const SENDER = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SUPPORT = 'a1e00000-1ea1-4000-8000-000000000001';
const NOW = Date.parse('2026-10-12T00:00:00Z');

test('automatic push stays off unless the explicit switch is true', () => {
    assert.equal(automaticPushEnabled({}), false);
    assert.equal(automaticPushEnabled({ PUSH_AUTOMATIC_ENABLED: 'false' }), false);
    assert.equal(automaticPushEnabled({ PUSH_AUTOMATIC_ENABLED: 'true' }), true);
});

test('a disabled drain never claims or sends', async () => {
    let claimed = 0;
    let sent = 0;
    const outcome = await drainQueue({
        enabled: false,
        claim: async () => { claimed += 1; return []; },
        send: async () => { sent += 1; return { ok: true }; },
        tokensForUser: async () => [],
        complete: async () => {}
    });
    assert.equal(outcome.code, 'PUSH_AUTOMATIC_DISABLED');
    assert.equal(outcome.processed, 0);
    assert.equal(claimed, 0);
    assert.equal(sent, 0);
});

test('the cron caller is refused without a configured secret', () => {
    assert.equal(cronAuthorized('Bearer secret', {}), false);
    assert.equal(cronAuthorized('Bearer secret', { PUSH_CRON_SECRET: 'secret' }), true);
    assert.equal(cronAuthorized('Bearer secret', { CRON_SECRET: 'secret' }), true);
    assert.equal(cronAuthorized('Bearer other', { CRON_SECRET: 'secret' }), false);
    assert.equal(pushAudience({}).enabled, false);
    assert.equal(pushAudience({ PUSH_AUTOMATIC_ENABLED: 'true' }).allowlist, null);
    assert.deepEqual(pushAudience({
        PUSH_AUTOMATIC_ENABLED: 'true',
        PUSH_QA_ONLY: 'true',
        PUSH_QA_USER_IDS: RECIPIENT + ', not-a-uuid'
    }).allowlist, [RECIPIENT]);
});

test('a private message notifies the other participant only', () => {
    assert.deepEqual(recipientsForMessage([SENDER, RECIPIENT, SUPPORT, RECIPIENT], SENDER, SUPPORT), [RECIPIENT]);
    const plan = planDelivery({
        type: 'NEW_MESSAGE',
        recipientId: RECIPIENT,
        actorId: SENDER,
        peerId: SENDER,
        entityId: SENDER,
        messageBody: 'Appelle-moi au 0690 12 34 56, marie@example.com'
    }, NOW);
    assert.equal(plan.enqueue, true);
    assert.equal(plan.alert.body, 'Vous avez un nouveau message.');
    assert.equal(JSON.stringify(plan).includes('0690'), false);
    assert.equal(JSON.stringify(plan).includes('example.com'), false);
    assert.equal(planDelivery({
        type: 'NEW_MESSAGE', recipientId: SENDER, actorId: SENDER, peerId: RECIPIENT
    }, NOW).reason, 'SENDER');
});

test('messages and matching announcements are frequency limited', () => {
    const key = 'msg:' + RECIPIENT + ':' + SENDER;
    const recent = { [key]: NOW - 30 * 1000 };
    assert.equal(planDelivery({
        type: 'NEW_MESSAGE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER, recent
    }, NOW).reason, 'COOLDOWN');
    assert.equal(planDelivery({
        type: 'NEW_MESSAGE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER,
        recent: { [key]: NOW - MESSAGE_WINDOW_MS - 1 }
    }, NOW).enqueue, true);

    const opp = 'opp:' + RECIPIENT;
    assert.equal(planDelivery({
        type: 'OPPORTUNITY', recipientId: RECIPIENT, actorId: OTHER, requestId: 'req-1',
        recent: { [opp]: NOW - 60 * 60 * 1000 }
    }, NOW).reason, 'COOLDOWN');
    assert.equal(planDelivery({
        type: 'OPPORTUNITY', recipientId: RECIPIENT, actorId: OTHER, requestId: 'req-2',
        recent: { [opp]: NOW - OPPORTUNITY_WINDOW_MS - 1 }
    }, NOW).enqueue, true);
});

test('quotes, accepted missions, work to validate and payouts each notify the right person once', () => {
    const quote = planDelivery({
        type: 'QUOTE_RECEIVED', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER, entityId: 'quote-1'
    }, NOW);
    assert.equal(quote.enqueue, true);
    assert.equal(quote.route.route, 'messages');
    assert.equal(quote.route.contactId, SENDER);
    assert.equal(planDelivery({
        type: 'QUOTE_RECEIVED', recipientId: SENDER, actorId: SENDER, peerId: RECIPIENT, entityId: 'quote-1'
    }, NOW).reason, 'SENDER');

    const mission = planDelivery({
        type: 'MISSION_ACCEPTED', recipientId: SENDER, actorId: RECIPIENT, peerId: RECIPIENT, entityId: 'quote-1'
    }, NOW);
    assert.equal(mission.route.contactId, RECIPIENT);
    assert.equal(planDelivery({
        type: 'MISSION_ACCEPTED', recipientId: SENDER, actorId: RECIPIENT, peerId: RECIPIENT, entityId: 'quote-1',
        recent: { [mission.dedupeKey]: NOW }
    }, NOW).reason, 'DUPLICATE');

    assert.equal(planDelivery({
        type: 'WORK_TO_VALIDATE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER, entityId: 'mile-1'
    }, NOW).alert.body, 'Un travail est à valider.');
    assert.equal(planDelivery({
        type: 'PAYOUT_READY', recipientId: RECIPIENT, actorId: SENDER, entityId: SENDER
    }, NOW).route.route, 'finances');
    assert.equal(planDelivery({
        type: 'BOKANTAJ', recipientId: RECIPIENT, actorId: SENDER, entityId: 'post-1'
    }, NOW).reason, 'TYPE_EXCLUDED');
});

test('the APNs payload uses the custom sound, or the standard sound when asked, and stays generic', () => {
    const plan = planDelivery({
        type: 'NEW_MESSAGE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER
    }, NOW);
    const payload = buildAutomaticPayload(plan);
    assert.equal(payload.aps.sound, SOUND_FILE);
    assert.equal(payload.contactId, SENDER);
    assert.equal(payloadExposesSensitiveData(payload), false);
    const fallback = buildAutomaticPayload({ ...plan, customSound: false });
    assert.equal(fallback.aps.sound, 'default');
    assert.equal(pushSound(false), 'default');
    assert.equal(payloadExposesSensitiveData({
        aps: { alert: { title: 'LYANN', body: 'Payez 20 € sur marie@example.com' } }
    }), true);
});

test('a claimed delivery retries, then stops, and an invalid token is deactivated', () => {
    const now = NOW;
    const rows = [
        { id: 'a', status: 'processing', lockedAt: now - 1000, attempts: 1, createdAt: 1 },
        { id: 'b', status: 'pending', attempts: 0, createdAt: 2, nextAttemptAt: now - 1 },
        { id: 'c', status: 'sent', attempts: 1, createdAt: 3 },
        { id: 'd', status: 'processing', lockedAt: now - 3 * 60 * 1000, attempts: 1, createdAt: 4 }
    ];
    assert.deepEqual(selectClaimable(rows, now, 10).map((row) => row.id), ['b', 'd']);

    const retry = settleDelivery({ attempts: 1, maxAttempts: 5 }, [{ ok: false, code: 'APNS_REJECTED', deviceId: 'dev-1' }], now);
    assert.equal(retry.status, 'retry');
    assert.ok(retry.nextAttemptAt > now);
    const dead = settleDelivery({ attempts: 5, maxAttempts: 5 }, [{ ok: false, code: 'APNS_REJECTED' }], now);
    assert.equal(dead.status, 'dead');
    const invalid = settleDelivery({ attempts: 1, maxAttempts: 5 }, [{
        ok: false, code: 'UNREGISTERED', deactivate: true, deviceId: 'dev-9'
    }], now);
    assert.deepEqual(invalid.deactivateIds, ['dev-9']);
    assert.equal(settleDelivery({ attempts: 1 }, [], now).status, 'skipped');
    const sent = settleDelivery({ attempts: 1 }, [{ ok: true, deviceId: 'dev-1' }], now);
    assert.equal(sent.status, 'sent');
});

test('opening a notification requires a session and never targets the signed-in user', () => {
    assert.equal(openPushTargetAllowed(null, { route: 'messages', contactId: SENDER }).reason, 'AUTH_REQUIRED');
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'messages', contactId: RECIPIENT }).reason, 'SENDER');
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'messages', contactId: SENDER }).ok, true);
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'messages', contactId: 'yoann' }).reason, 'CONTACT_MISSING');
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'admin' }).reason, 'ROUTE_UNKNOWN');
    assert.equal(pushAccessGranted({ error: true, rows: [{ conversation_id: 'x' }] }), false);
    assert.equal(pushAccessGranted({ rows: [] }), false);
    assert.equal(pushAccessGranted({ rows: [{ conversation_id: 'x' }] }), true);
});

test('registering a token releases the same device from the previous account', () => {
    const rows = [
        { id: 'old', user_id: SENDER, token: 'abc', active: true },
        { id: 'keep', user_id: RECIPIENT, token: 'abc', active: true },
        { id: 'other', user_id: OTHER, token: 'zzz', active: true }
    ];
    assert.deepEqual(foreignActiveTokenIds(rows, RECIPIENT, 'abc'), ['old']);
});

test('an old push is ignored when the system is switched on later', async () => {
    assert.equal(expiresAtFor('NEW_MESSAGE', NOW), NOW + MESSAGE_EXPIRY_MS);
    assert.equal(expiresAtFor('OPPORTUNITY', NOW), NOW + OPPORTUNITY_EXPIRY_MS);
    assert.equal(expiresAtFor('QUOTE_RECEIVED', NOW), NOW + ACTION_EXPIRY_MS);
    assert.equal(expiresAtFor('MISSION_ACCEPTED', NOW), NOW + ACTION_EXPIRY_MS);
    assert.equal(expiresAtFor('WORK_TO_VALIDATE', NOW), NOW + ACTION_EXPIRY_MS);

    const expiredMessage = {
        id: 'old-message',
        recipientId: RECIPIENT,
        title: 'LYANN',
        body: 'Vous avez un nouveau message.',
        route: 'messages',
        contactId: SENDER,
        attempts: 1,
        status: 'pending',
        createdAt: NOW - 16 * 60 * 1000,
        nextAttemptAt: NOW - 1000,
        expiresAt: NOW - 60 * 1000,
        lockToken: 'worker-a'
    };
    const expiredRetry = {
        ...expiredMessage,
        id: 'old-retry',
        status: 'retry',
        attempts: 3,
        expiresAt: NOW - 60 * 1000
    };
    assert.equal(isDeliveryExpired(expiredMessage, NOW), true);
    assert.equal(claimable(expiredMessage, NOW), false);
    assert.equal(claimable(expiredRetry, NOW), false);
    assert.deepEqual(selectClaimable([expiredMessage, expiredRetry], NOW, 10), []);

    const sent = [];
    const finished = [];
    await drainQueue({
        enabled: true,
        now: NOW,
        allowlist: [RECIPIENT],
        claim: async () => [expiredMessage, expiredRetry],
        tokensForUser: async () => [{ id: 'dev', token: 'tok', environment: 'sandbox' }],
        send: async (input) => { sent.push(input); return { ok: true }; },
        complete: async (row, settled) => { finished.push([row.id, settled.status, settled.lastError]); }
    });
    assert.equal(sent.length, 0);
    assert.deepEqual(finished, [
        ['old-message', 'skipped', 'EXPIRED'],
        ['old-retry', 'skipped', 'EXPIRED']
    ]);
});

test('QA-only mode sends to the listed account and skips everyone else', async () => {
    const sent = [];
    const finished = [];
    await drainQueue({
        enabled: true,
        allowlist: [RECIPIENT],
        now: NOW,
        claim: async () => [
            { id: 'qa', recipientId: RECIPIENT, title: 'LYANN', body: 'Vous avez un nouveau message.', route: 'messages', contactId: SENDER, attempts: 1, lockToken: 'w', apnsId: 'apns-1' },
            { id: 'other', recipientId: OTHER, title: 'LYANN', body: 'Vous avez un nouveau message.', route: 'messages', contactId: SENDER, attempts: 1, lockToken: 'w' }
        ],
        tokensForUser: async () => [{ id: 'dev', token: 'tok', environment: 'sandbox' }],
        send: async (input) => { sent.push(input); return { ok: true }; },
        complete: async (row, settled) => { finished.push([row.id, settled.status, settled.lastError || null]); }
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].apnsId, 'apns-1');
    assert.deepEqual(finished, [['qa', 'sent', null], ['other', 'skipped', 'QA_EXCLUDED']]);
});

test('an enabled drain sends the safe payload and records the attempt', async () => {
    const sent = [];
    const updates = [];
    const outcome = await drainQueue({
        enabled: true,
        now: NOW,
        workerId: 'test',
        claim: async () => [{
            id: 'row-1',
            recipientId: RECIPIENT,
            title: 'LYANN',
            body: 'Vous avez un nouveau message.',
            route: 'messages',
            contactId: SENDER,
            attempts: 1,
            maxAttempts: 5
        }],
        tokensForUser: async (userId) => {
            assert.equal(userId, RECIPIENT);
            return [{ id: 'dev-1', token: 'tok', environment: 'sandbox' }];
        },
        send: async (input) => {
            sent.push(input);
            return { ok: false, code: 'UNREGISTERED', deactivate: true, status: 410 };
        },
        deactivateTokens: async (ids) => { updates.push(ids); },
        complete: async (row, settled) => { updates.push([row.id, settled.status]); }
    });
    assert.equal(outcome.processed, 1);
    assert.equal(sent[0].payload.aps.sound, SOUND_FILE);
    assert.equal(sent[0].payload.aps.alert.body, 'Vous avez un nouveau message.');
    assert.deepEqual(updates[0], ['dev-1']);
    assert.deepEqual(updates[1], ['row-1', 'retry']);
});

test('1c quote with explicit requestId reaches the APNs payload', () => {
    const plan = planDelivery({
        type: 'QUOTE_RECEIVED',
        recipientId: RECIPIENT,
        actorId: SENDER,
        peerId: SENDER,
        entityId: SENDER + ':' + QUOTE + ':' + REQ2,
        requestId: REQ2,
        quoteId: QUOTE
    }, NOW);
    assert.equal(plan.enqueue, true);
    assert.equal(plan.route.requestId, REQ2);
    assert.equal(plan.route.quoteId, QUOTE);
    assert.equal(plan.route.contactId, SENDER);
    const payload = buildAutomaticPayload(plan);
    assert.equal(payload.route, 'messages');
    assert.equal(payload.requestId, REQ2);
    assert.equal(payload.quoteId, QUOTE);
    assert.equal(payload.contactId, SENDER);
    assert.equal(payload.scopeSource, 'notification');
    assert.equal(payload.aps.alert.body, 'Vous avez reçu une proposition.');
    assert.equal(payloadExposesSensitiveData(payload), false);
    const opened = policy.planNotificationNavigation(payload, { viewerId: RECIPIENT });
    assert.equal(opened.payload.requestId, REQ2);
});

test('1c legacy quote without requestId stays pair-only', () => {
    const plan = planDelivery({
        type: 'QUOTE_RECEIVED',
        recipientId: RECIPIENT,
        actorId: SENDER,
        peerId: SENDER,
        entityId: SENDER + ':' + QUOTE
    }, NOW);
    assert.equal(plan.route.requestId, null);
    assert.equal(plan.route.quoteId, QUOTE);
    const payload = buildAutomaticPayload(plan);
    assert.equal(payload.requestId, undefined);
    assert.equal(payload.contactId, SENDER);
    const twoOpen = {
        viewerId: RECIPIENT,
        lastActiveRequestId: REQ1,
        invitations: [
            { id: INV1, request_id: REQ1, status: 'ACCEPTED' },
            { id: INV2, request_id: REQ2, status: 'ACCEPTED' }
        ],
        missions: [
            { id: MSN1, related_request_id: REQ1, status: 'IN_PROGRESS' },
            { id: MSN2, related_request_id: REQ2, status: 'AGREED' }
        ]
    };
    const opened = policy.planNotificationNavigation(payload, twoOpen);
    assert.equal(opened.open, true);
    assert.equal(opened.payload.requestId, undefined);
    assert.equal(opened.payload.contactId, SENDER);
});

test('1c accepted mission and work-to-validate keep business ids', () => {
    const accepted = planDelivery({
        type: 'MISSION_ACCEPTED',
        recipientId: SENDER,
        actorId: RECIPIENT,
        peerId: RECIPIENT,
        entityId: RECIPIENT + ':' + QUOTE + ':' + REQ1,
        missionId: MSN1
    }, NOW);
    assert.equal(accepted.route.route, 'messages');
    assert.equal(accepted.route.requestId, REQ1);
    assert.equal(buildAutomaticPayload(accepted).missionId, MSN1);

    const work = planDelivery({
        type: 'WORK_TO_VALIDATE',
        recipientId: RECIPIENT,
        actorId: SENDER,
        peerId: SENDER,
        entityId: SENDER + ':' + MILE + ':' + REQ2
    }, NOW);
    const workPayload = buildAutomaticPayload(work);
    assert.equal(workPayload.milestoneId, MILE);
    assert.equal(workPayload.requestId, REQ2);
    assert.equal(work.alert.body, 'Un travail est à valider.');
});

test('1c payout stays finances; opportunity keeps requestId; last-active is ignored', () => {
    const payout = planDelivery({
        type: 'PAYOUT_READY',
        recipientId: RECIPIENT,
        actorId: SENDER,
        entityId: SENDER,
        requestId: REQ1
    }, NOW);
    const payoutPayload = buildAutomaticPayload(payout);
    assert.equal(payout.route.route, 'finances');
    assert.equal(payoutPayload.requestId, undefined);
    assert.equal(payoutPayload.contactId, undefined);

    const opp = routeFor({
        type: 'OPPORTUNITY',
        recipientId: RECIPIENT,
        actorId: OTHER,
        entityId: REQ2
    });
    assert.equal(opp.route, 'mission');
    assert.equal(opp.requestId, REQ2);
    assert.equal(opp.contactId, null);
    assert.equal(buildAutomaticPayload({ alert: { title: 'LYANN', body: 'Une annonce correspond à une de vos compétences.' }, route: opp }).requestId, REQ2);
});

test('1c pending after a cold open and retries keep the same ids', async () => {
    const entityId = SENDER + ':' + QUOTE + ':' + REQ2;
    const row = {
        id: 'retry-1',
        recipientId: RECIPIENT,
        eventType: 'QUOTE_RECEIVED',
        title: 'LYANN',
        body: 'Vous avez reçu une proposition.',
        route: 'messages',
        contactId: SENDER,
        requestId: null,
        entityId,
        attempts: 1,
        maxAttempts: 5,
        status: 'retry',
        createdAt: NOW,
        nextAttemptAt: NOW - 1
    };
    const sent = [];
    await drainQueue({
        enabled: true,
        now: NOW,
        claim: async () => [row],
        tokensForUser: async () => [{ id: 'dev', token: 'tok', environment: 'sandbox' }],
        send: async (input) => {
            sent.push(input.payload);
            return { ok: false, code: 'APNS_REJECTED' };
        },
        complete: async () => {}
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].requestId, REQ2);
    assert.equal(sent[0].quoteId, QUOTE);
    assert.equal(sent[0].contactId, SENDER);

    sent.length = 0;
    await drainQueue({
        enabled: true,
        now: NOW,
        claim: async () => [row],
        tokensForUser: async () => [{ id: 'dev', token: 'tok', environment: 'sandbox' }],
        send: async (input) => {
            sent.push(input.payload);
            return { ok: true };
        },
        complete: async () => {}
    });
    assert.equal(sent[0].requestId, REQ2);
    assert.equal(sent[0].quoteId, QUOTE);

    const pending = policy.parsePendingPushTarget(policy.serializePendingPushTarget(sent[0]));
    assert.equal(pending.requestId, REQ2);
    assert.equal(pending.contactId, SENDER);
    assert.equal(policy.planNotificationNavigation(pending, { viewerId: RECIPIENT }).payload.requestId, REQ2);
});

test('1c existing routes stay stable and payload is not authorization', () => {
    assert.equal(routeFor({ type: 'NEW_MESSAGE', peerId: SENDER, entityId: SENDER }).route, 'messages');
    assert.equal(routeFor({ type: 'PAYOUT_READY', entityId: SENDER }).route, 'finances');
    assert.equal(routeFor({ type: 'OPPORTUNITY', entityId: REQ1 }).route, 'mission');
    assert.equal(routeFor({ type: 'BOKANTAJ', entityId: REQ1 }).route, 'bokantaj');
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'messages', contactId: SENDER, requestId: REQ2 }).ok, true);
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'messages', contactId: SENDER, requestId: REQ2 }).needsResourceCheck, true);
    assert.equal(openPushTargetAllowed(RECIPIENT, { route: 'bokantaj' }).ok, true);
    const mapped = fs.readFileSync(path.join(__dirname, '..', 'api/server.js'), 'utf8');
    assert.match(mapped, /entityId: row\.entity_id/);
    assert.match(mapped, /eventType: row\.event_type/);
    assert.doesNotMatch(mapped, /lastActiveRequestId/);
});

test('the prepared migration only queues work and never contacts APNs', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '49_push_delivery_queue.sql'), 'utf8');
    assert.equal(sql.includes('api.push.apple.com'), false);
    assert.equal(sql.includes('http_post'), false);
    assert.equal(sql.includes('FOR UPDATE SKIP LOCKED'), true);
    assert.equal(sql.includes('apns_id'), true);
    assert.equal(sql.includes('REVOKE ALL ON public.push_deliveries FROM PUBLIC, anon, authenticated'), true);
    assert.equal(sql.includes('GRANT INSERT'), false);
    assert.equal(sql.includes('GRANT UPDATE'), false);
    assert.equal(sql.includes('BOKANTAJ'), false);
    assert.equal(sql.includes('📄 Devis proposé'), true);
    assert.equal(sql.includes('✅ Devis accepté'), true);
    assert.equal(sql.includes('✓ Travail déclaré terminé'), true);
    assert.equal(sql.includes('DELETE FROM public.notifications'), false);
    assert.equal(sql.includes("NEW.message_type IN ('quote_created', 'quote_accepted', 'milestone_completed')"), true);
    assert.equal(sql.includes("COALESCE(NEW.metadata->>'kind', '') = 'payout_ready'"), true);
    assert.equal(sql.includes("interval '15 minutes'"), true);
    assert.equal(sql.includes("interval '24 hours'"), true);
    assert.equal(sql.includes("interval '6 hours'"), true);
    assert.equal(sql.includes("last_error = 'EXPIRED'"), true);
    for (const type of ['NEW_MESSAGE', 'QUOTE_RECEIVED', 'MISSION_ACCEPTED', 'WORK_TO_VALIDATE', 'PAYOUT_READY', 'OPPORTUNITY']) {
        assert.equal(sql.includes("'" + type + "'"), true);
    }
});
