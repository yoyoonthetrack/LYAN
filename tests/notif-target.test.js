'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../deal-notification-policy');

const CONTACT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQ1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQ2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const Q1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const Q2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const INV1 = '77777777-7777-4777-8777-777777777777';
const INV2 = '66666666-6666-4666-8666-666666666666';
const MSN1 = '99999999-9999-4999-8999-999999999999';
const MSN2 = '88888888-8888-4888-8888-888888888888';
const MILE1 = '55555555-5555-4555-8555-555555555555';

function invitation(id, requestId) {
    return { id, request_id: requestId, status: 'ACCEPTED' };
}

function mission(id, requestId, status) {
    return { id, related_request_id: requestId, status };
}

const twoOpen = {
    invitations: [invitation(INV1, REQ1), invitation(INV2, REQ2)],
    missions: [
        mission(MSN1, REQ1, 'IN_PROGRESS'),
        mission(MSN2, REQ2, 'AGREED')
    ]
};

test('T1 structured QUOTE_RECEIVED opens req2 among two annonces', () => {
    const resolved = policy.resolveNotificationContext({
        version: 1,
        type: 'QUOTE_RECEIVED',
        route: 'messages',
        contactId: CONTACT,
        requestId: REQ2,
        quoteId: Q2
    }, { ...twoOpen, lastActiveRequestId: REQ1, viewerId: VIEWER });
    assert.equal(resolved.resolution, 'exact');
    assert.equal(resolved.requestId, REQ2);
    assert.equal(resolved.contactId, CONTACT);
    assert.equal(resolved.quoteId, Q2);
    assert.equal(resolved.route, 'messages');
    assert.equal(resolved.access.authorized, false);
    assert.equal(resolved.access.payloadIsNotAuthorization, true);
});

test('T2 legacy 2-segment + two open deals is ambiguous and ignores lastActiveRequestId', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'QUOTE_RECEIVED',
        entity_type: 'quote',
        entity_id: CONTACT + ':' + Q1
    }, { ...twoOpen, lastActiveRequestId: REQ1, viewerId: VIEWER });
    assert.equal(resolved.resolution, 'ambiguous');
    assert.equal(resolved.requestId, null);
    assert.equal(resolved.contactId, CONTACT);
    assert.equal(resolved.scopeSource, 'legacy');
    assert.notEqual(resolved.requestId, REQ1);
});

test('T3 pair-only with a single open invitation resolves unique', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'NEW_MESSAGE',
        entity_type: 'conversation',
        entity_id: CONTACT
    }, {
        invitations: [invitation(INV2, REQ2)],
        missions: [mission(MSN2, REQ2, 'AGREED')],
        lastActiveRequestId: REQ1
    });
    assert.equal(resolved.resolution, 'unique');
    assert.equal(resolved.requestId, REQ2);
    assert.equal(resolved.invitationId, INV2);
});

test('T4 two quotes on the same request keep quoteId Q2', () => {
    const resolved = policy.resolveNotificationContext({
        version: 1,
        type: 'QUOTE_RECEIVED',
        contactId: CONTACT,
        requestId: REQ1,
        quoteId: Q2
    }, {
        invitations: [invitation(INV1, REQ1)],
        missions: [mission(MSN1, REQ1, 'IN_PROGRESS')],
        quotes: [
            { id: Q1, request_id: REQ1 },
            { id: Q2, request_id: REQ1 }
        ]
    });
    assert.equal(resolved.resolution, 'exact');
    assert.equal(resolved.requestId, REQ1);
    assert.equal(resolved.quoteId, Q2);
});

test('T5 WORK_TO_VALIDATE keeps milestone and request', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'WORK_TO_VALIDATE',
        entity_id: CONTACT + ':' + MILE1 + ':' + REQ2
    }, twoOpen);
    assert.equal(resolved.resolution, 'exact');
    assert.equal(resolved.requestId, REQ2);
    assert.equal(resolved.milestoneId, MILE1);
    assert.equal(resolved.contactId, CONTACT);
    assert.ok(resolved.access.checks.includes('milestone_visible'));
});

test('T6 NEW_MESSAGE pair-only with two annonces is ambiguous', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'NEW_MESSAGE',
        entity_id: CONTACT
    }, twoOpen);
    assert.equal(resolved.resolution, 'ambiguous');
    assert.equal(resolved.requestId, null);
    assert.equal(resolved.route, 'messages');
    assert.equal(resolved.navigate, true);
});

test('T7 NEW_MESSAGE pair-only with one annonce is unique', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'NEW_MESSAGE',
        entity_id: CONTACT
    }, {
        invitations: [invitation(INV1, REQ1)],
        missions: [mission(MSN1, REQ1, 'IN_PROGRESS')]
    });
    assert.equal(resolved.resolution, 'unique');
    assert.equal(resolved.requestId, REQ1);
});

test('T8 OPPORTUNITY of a closed request is closed (no toast wired in 1a)', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'OPPORTUNITY',
        entity_type: 'request',
        entity_id: REQ1
    }, { requestStatus: 'CLOSED' });
    assert.equal(resolved.route, 'mission');
    assert.equal(resolved.requestId, REQ1);
    assert.equal(resolved.resolution, 'closed');
    assert.equal(resolved.navigate, false);
});

test('T9 PAYOUT_READY routes to finances without a request', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'PAYOUT_READY',
        entity_type: 'conversation',
        entity_id: CONTACT
    }, { lastActiveRequestId: REQ1 });
    assert.equal(resolved.route, 'finances');
    assert.equal(resolved.requestId, null);
    assert.equal(resolved.contactId, null);
    assert.equal(resolved.navigate, true);
    assert.equal(resolved.access.authorized, false);
});

test('T10 parse: push-shaped payload keeps requestId', () => {
    const parsed = policy.parseNotificationTarget({
        type: 'QUOTE_RECEIVED',
        route: 'messages',
        contactId: CONTACT,
        requestId: REQ2
    });
    assert.equal(parsed.requestId, REQ2);
    assert.equal(parsed.contactId, CONTACT);
    assert.equal(parsed.route, 'messages');
    assert.equal(parsed.resolution, 'exact');
});

test('T10 open: plan and consumers pass requestId to messages', () => {
    const plan = policy.planNotificationNavigation({
        type: 'QUOTE_RECEIVED',
        route: 'messages',
        contactId: CONTACT,
        requestId: REQ2
    }, { viewerId: VIEWER });
    assert.equal(plan.open, true);
    assert.equal(plan.route, 'messages');
    assert.equal(plan.payload.requestId, REQ2);
    assert.equal(plan.payload.contactId, CONTACT);
    assert.equal(plan.payload.scopeSource, 'notification');
    assert.equal(plan.target.access.authorized, false);

    const core = fs.readFileSync(path.join(__dirname, '..', 'platform-core.js'), 'utf8');
    assert.match(core, /planNotificationNavigation/);
    assert.match(core, /LYANN_ROUTER\.go\('messages', plan\.payload\)/);
    assert.doesNotMatch(core, /go\('messages', \{ contactId \}\)/);

    const ui = fs.readFileSync(path.join(__dirname, '..', 'notifications-ui.js'), 'utf8');
    assert.match(ui, /planNotificationNavigation/);
    assert.match(ui, /go\('messages',\s*\{[\s\S]*plan\.payload/);
});

test('T11 pending sessionStorage keeps the full notification target', () => {
    const raw = policy.serializePendingPushTarget({
        type: 'QUOTE_RECEIVED',
        route: 'messages',
        contactId: CONTACT,
        requestId: REQ2,
        quoteId: Q2
    });
    const stored = JSON.parse(raw);
    assert.equal(stored.requestId, REQ2);
    assert.equal(stored.contactId, CONTACT);
    assert.equal(stored.quoteId, Q2);
    const restored = policy.parsePendingPushTarget(raw);
    assert.equal(restored.requestId, REQ2);
    assert.equal(restored.contactId, CONTACT);
    const replay = policy.planNotificationNavigation(restored, { viewerId: VIEWER });
    assert.equal(replay.payload.requestId, REQ2);

    const core = fs.readFileSync(path.join(__dirname, '..', 'platform-core.js'), 'utf8');
    assert.match(core, /serializePendingPushTarget/);
    assert.match(core, /parsePendingPushTarget/);
});

test('T12 displayed scope is contact+request; req2 is not displayed on req1', () => {
    const target = policy.parseNotificationTarget({
        version: 1,
        type: 'QUOTE_RECEIVED',
        contactId: CONTACT,
        requestId: REQ2
    });
    assert.equal(policy.isTargetDisplayed(target, {
        chatOpen: true,
        contactId: CONTACT,
        requestId: REQ1
    }), false);
    assert.equal(policy.isTargetDisplayed(target, {
        chatOpen: true,
        contactId: CONTACT,
        requestId: REQ2
    }), true);
});

test('1d same contact + same request visible is silent', () => {
    const notif = {
        type: 'QUOTE_RECEIVED',
        contactId: CONTACT,
        requestId: REQ2,
        read: false
    };
    const visible = { contactId: CONTACT, requestId: REQ2, chatOpen: true };
    assert.equal(policy.shouldSkipChime(notif, visible), true);
    assert.equal(policy.shouldSkipForegroundToast(notif, visible, { appVisible: true }), true);
});

test('1d same contact + other request keeps the alert', () => {
    const notif = { type: 'QUOTE_RECEIVED', contactId: CONTACT, requestId: REQ2, read: false };
    assert.equal(policy.shouldSkipChime(notif, { contactId: CONTACT, requestId: REQ1, chatOpen: true }), false);
    assert.equal(policy.shouldSkipForegroundToast(notif, {
        contactId: CONTACT, requestId: REQ1, chatOpen: true
    }, { appVisible: true, realtimeLive: false }), false);
});

test('1d other contact or closed chat keeps the alert', () => {
    const notif = { type: 'QUOTE_RECEIVED', contactId: CONTACT, requestId: REQ2, read: false };
    assert.equal(policy.shouldSkipChime(notif, { contactId: VIEWER, requestId: REQ2, chatOpen: true }), false);
    assert.equal(policy.shouldSkipChime(notif, { contactId: CONTACT, requestId: REQ2, chatOpen: false }), false);
});

test('1d background does not suppress APNs or skip as displayed', () => {
    const notif = { type: 'QUOTE_RECEIVED', contactId: CONTACT, requestId: REQ2, read: false };
    const visible = { contactId: CONTACT, requestId: REQ2, chatOpen: true };
    assert.equal(policy.shouldSkipChime(notif, visible, { appVisible: false }), false);
    assert.equal(policy.shouldSkipForegroundToast(notif, visible, { appVisible: false, realtimeLive: true }), false);
    const { planDelivery } = require('../api/push-queue');
    assert.equal(planDelivery({
        type: 'QUOTE_RECEIVED',
        recipientId: VIEWER,
        actorId: CONTACT,
        peerId: CONTACT,
        entityId: CONTACT + ':' + Q2 + ':' + REQ2
    }).enqueue, true);
});

test('1d legacy ambiguous is not treated as displayed', () => {
    const notif = { type: 'QUOTE_RECEIVED', entity_id: CONTACT + ':' + Q1, read: false };
    const visible = { contactId: CONTACT, requestId: REQ1, chatOpen: true };
    assert.equal(policy.isTargetDisplayed(policy.parseNotificationTarget(notif), visible, twoOpen), false);
    assert.equal(policy.shouldSkipChime(notif, visible, twoOpen), false);
    assert.equal(policy.shouldSkipChime(notif, visible), false, 'unknown multiplicity is not assumed displayed');
});

test('1d legacy unique open deal is silent when that request is visible', () => {
    const unique = {
        invitations: [invitation(INV2, REQ2)],
        missions: [mission(MSN2, REQ2, 'AGREED')]
    };
    const notif = { type: 'NEW_MESSAGE', entity_id: CONTACT, read: false };
    assert.equal(policy.shouldSkipChime(notif, { contactId: CONTACT, requestId: REQ2, chatOpen: true }, unique), true);
    assert.equal(policy.shouldSkipChime(notif, { contactId: CONTACT, requestId: REQ1, chatOpen: true }, unique), false);
});

test('1d foreground iOS skips toast when Realtime will chime', () => {
    const notif = { type: 'NEW_MESSAGE', entity_id: CONTACT, contactId: CONTACT, read: false };
    const other = { contactId: VIEWER, chatOpen: true };
    assert.equal(policy.shouldSkipForegroundToast(notif, other, { appVisible: true, realtimeLive: true }), true);
    assert.equal(policy.shouldSkipChime(notif, other, { appVisible: true }), false);
    const core = fs.readFileSync(path.join(__dirname, '..', 'platform-core.js'), 'utf8');
    assert.match(core, /shouldSkipForegroundPushToast/);
    assert.match(core, /LYANN_NOTIFICATION_LIVE/);
});

test('1d returning from background hydrates without chime', () => {
    const engine = fs.readFileSync(path.join(__dirname, '..', 'notification-engine.js'), 'utf8');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'notifications-ui.js'), 'utf8');
    assert.match(engine, /rememberNotificationIds\(mapped, \{ chime: false \}\)/);
    assert.match(ui, /hydrate is silent/);
    assert.match(ui, /refreshDealContext\?\.\('notif-deal'\)/);
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.doesNotMatch(chat, /refreshDealContext[\s\S]{0,80}playNotificationSound/);
});

test('1b ambiguous inbox plan does not send a requestId', () => {
    const plan = policy.planNotificationNavigation({
        type: 'QUOTE_RECEIVED',
        entity_id: CONTACT + ':' + Q1
    }, { ...twoOpen, viewerId: VIEWER, lastActiveRequestId: REQ1 });
    assert.equal(plan.open, true);
    assert.equal(plan.payload.contactId, CONTACT);
    assert.equal(plan.payload.requestId, undefined);
    assert.equal(plan.payload.scopeSource, 'notification');
});

test('1b messaging-ui ignores last-active requestId for notification opens', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'messaging-ui.js'), 'utf8');
    assert.match(source, /scopeSource === 'notification'/);
    assert.match(source, /fromNotification \? null : \(enriched\.requestId/);
});

test('T13 requestId/missionId mismatch does not fall back', () => {
    const resolved = policy.resolveNotificationContext({
        version: 1,
        type: 'MISSION_ACCEPTED',
        contactId: CONTACT,
        requestId: REQ1,
        missionId: MSN2
    }, { ...twoOpen, lastActiveRequestId: REQ2 });
    assert.equal(resolved.resolution, 'mismatch');
    assert.equal(resolved.requestId, null);
    assert.equal(resolved.missionId, null);
    assert.equal(resolved.navigate, false);
});

test('T14 entity_id equal to viewer does not navigate', () => {
    const parsed = policy.parseNotificationTarget({
        type: 'NEW_MESSAGE',
        entity_id: VIEWER
    }, { viewerId: VIEWER });
    assert.equal(parsed.code, 'self');
    assert.equal(parsed.navigate, false);
    assert.equal(parsed.contactId, null);
    assert.equal(parsed.route, null);
});

test('T15 REQUEST_CLOSING does not route to messages', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'REQUEST_CLOSING',
        entity_type: 'request',
        entity_id: REQ1
    });
    assert.equal(resolved.route, null);
    assert.equal(resolved.requestId, REQ1);
    assert.equal(resolved.navigate, false);
    assert.equal(resolved.code, 'request_closing');
});

test('1a never inherits last-active request on pair-only deal notif', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'QUOTE_RECEIVED',
        entity_id: CONTACT + ':' + Q1
    }, { ...twoOpen, lastActiveRequestId: REQ2 });
    assert.equal(resolved.requestId, null);
    assert.equal(resolved.resolution, 'ambiguous');
});
