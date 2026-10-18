'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../deal-notification-policy');
const dealSync = require('../deal-context-sync');
const { planDelivery, routeFor, buildAutomaticPayload } = require('../api/push-queue');

const REQUESTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROVIDER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QUOTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAY1 = '11111111-4111-4111-8111-111111111111';
const PAY2 = '22222222-4222-4222-8222-222222222222';
const MISSION = '99999999-4999-4999-8999-999999999999';
const PI1 = 'pi_test_same_intent';
const NOW = Date.parse('2026-10-14T08:00:00Z');

const sql45 = fs.readFileSync(path.join(__dirname, '..', '45_chat_timeline.sql'), 'utf8');
const sql54 = fs.readFileSync(path.join(__dirname, '..', '54_deal_notification_skip.sql'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'api/server.js'), 'utf8');

function skipList54() {
    const match = sql54.match(/IF NEW\.message_type IN \(([\s\S]+?)\)\s+THEN/);
    assert.ok(match);
    return match[1];
}

const payment = {
    id: PAY1,
    requester_id: REQUESTER,
    provider_id: PROVIDER,
    quote_id: QUOTE,
    request_id: REQ,
    mission_id: MISSION,
    stripe_payment_intent_id: PI1,
    payment_status: 'FAILED',
    attempt: 1
};

test('2a.1 Stripe failure only writes payments.FAILED; timeline trigger owns payment_failed', () => {
    assert.match(server, /case 'payment_intent\.payment_failed'/);
    assert.match(server, /payment_status: 'FAILED'/);
    assert.doesNotMatch(server, /PAYMENT_FAILED/);
    assert.doesNotMatch(server, /createNotification\(/);
    assert.match(sql45, /kind := 'payment_failed'/);
    assert.match(sql45, /COALESCE\(auth\.uid\(\), quote_row\.requester_id/);
    assert.match(sql45, /v_status IS NOT DISTINCT FROM v_previous/);
});

test('2a.1 current NEW_MESSAGE recipient is the peer of the timeline actor (Lyanneur)', () => {
    const notify = fs.readFileSync(path.join(__dirname, '..', '49_push_delivery_queue.sql'), 'utf8');
    assert.match(notify, /cp\.user_id IS DISTINCT FROM NEW\.sender_id/);
    const actorIsRequester = true;
    const currentInboxRecipient = actorIsRequester ? 'provider' : 'requester';
    assert.equal(currentInboxRecipient, 'provider');
    assert.equal(policy.paymentFailedRecipient(payment), REQUESTER);
    assert.notEqual(policy.paymentFailedRecipient(payment), PROVIDER);
});

test('2a.1 PAYMENT_FAILED contract targets the demandeur and opens the Lyanneur thread', () => {
    const card = policy.buildPaymentFailedNotification(payment);
    assert.equal(card.create, true);
    assert.equal(card.userId, REQUESTER);
    assert.equal(card.recipientRole, 'requester');
    assert.equal(card.notifyProvider, false);
    assert.equal(card.route, 'messages');
    assert.equal(card.contactId, PROVIDER);
    assert.equal(card.requestId, REQ);
    assert.equal(card.quoteId, QUOTE);
    assert.equal(card.missionId, MISSION);
    assert.equal(card.paymentId, PAY1);
    assert.equal(card.attempt, 1);
    assert.equal(card.idempotenceKey, PAY1 + ':a1');
    assert.deepEqual(card.navigation, {
        route: 'messages',
        contactId: PROVIDER,
        requestId: REQ,
        quoteId: QUOTE,
        missionId: MISSION,
        scopeSource: 'notification',
        fallback: false
    });
    assert.equal(card.entityId, [PROVIDER, QUOTE, REQ, PAY1, 'a1'].join(':'));
    assert.notEqual(card.idempotenceKey, card.contactId);
    assert.ok(card.entityId.indexOf(card.idempotenceKey) > card.entityId.indexOf(card.requestId));

    const parsed = policy.parseNotificationTarget({
        type: 'PAYMENT_FAILED',
        entity_type: 'payment',
        entity_id: card.entityId
    }, { viewerId: REQUESTER });
    assert.equal(parsed.route, 'messages');
    assert.equal(parsed.contactId, PROVIDER);
    assert.equal(parsed.requestId, REQ);
    assert.equal(parsed.quoteId, QUOTE);
    assert.equal(parsed.resolution, 'exact');
    assert.equal(parsed.navigate, true);
    assert.equal(parsed.scopeSource, 'notification');
});

test('2a.1 PAYMENT_FAILED never notifies the payer as if they were the contact', () => {
    const self = policy.parseNotificationTarget({
        type: 'PAYMENT_FAILED',
        entity_id: [REQUESTER, QUOTE, REQ].join(':')
    }, { viewerId: REQUESTER });
    assert.equal(self.code, 'self');
    assert.equal(policy.paymentFailedRecipient({
        requester_id: REQUESTER,
        provider_id: REQUESTER,
        quote_id: QUOTE,
        request_id: REQ,
        id: PAY1
    }), null);
});

test('2a.1 webhook replay of the same FAILED row is a technical retry', () => {
    const again = Object.assign({}, payment);
    assert.equal(policy.isTechnicalPaymentRetry(payment, again), true);
    assert.equal(policy.isDistinctPaymentFailure(payment, again), false);
    assert.equal(policy.buildPaymentFailedEntityId(payment), policy.buildPaymentFailedEntityId(again));
});

test('2a.1 a new payment row after FAILED is a distinct failure', () => {
    const second = Object.assign({}, payment, { id: PAY2, stripe_payment_intent_id: 'pi_test_other', attempt: 1 });
    assert.equal(policy.isTechnicalPaymentRetry(payment, second), false);
    assert.equal(policy.isDistinctPaymentFailure(payment, second), true);
    assert.notEqual(policy.buildPaymentFailedEntityId(payment), policy.buildPaymentFailedEntityId(second));
});

test('2a.1 same payment leaving FAILED then failing again increments attempt', () => {
    const retryFail = Object.assign({}, payment, { attempt: 2 });
    assert.equal(policy.isTechnicalPaymentRetry(payment, retryFail), false);
    assert.equal(policy.isDistinctPaymentFailure(payment, retryFail), true);
    assert.match(policy.buildPaymentFailedEntityId(retryFail), /:a2$/);
});

test('2a.1 Phase 1d stays silent only on the visible request', () => {
    const card = policy.buildPaymentFailedNotification(payment);
    const notif = { type: 'PAYMENT_FAILED', entity_id: card.entityId, read: false };
    const visible = { chatOpen: true, contactId: PROVIDER, requestId: REQ };
    const other = { chatOpen: true, contactId: PROVIDER, requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
    assert.equal(policy.shouldSkipChime(notif, visible, { appVisible: true }), true);
    assert.equal(policy.shouldSkipChime(notif, other, { appVisible: true }), false);
    assert.equal(policy.shouldSkipForegroundToast(notif, visible, { appVisible: false }), false);
});

test('2a.1 push payload stays generic and keeps requestId', () => {
    const card = policy.buildPaymentFailedNotification(payment);
    const plan = planDelivery({
        type: 'PAYMENT_FAILED',
        recipientId: REQUESTER,
        actorId: PROVIDER,
        peerId: PROVIDER,
        entityId: card.entityId,
        requestId: REQ,
        quoteId: QUOTE
    }, NOW);
    assert.equal(plan.enqueue, true);
    assert.equal(plan.alert.body, 'Une action est nécessaire sur un paiement.');
    const payload = buildAutomaticPayload(plan);
    assert.equal(payload.route, 'messages');
    assert.equal(payload.requestId, REQ);
    assert.equal(payload.contactId, PROVIDER);
    assert.equal(payload.aps.sound, 'lyann-notif.caf');
    assert.doesNotMatch(JSON.stringify(payload), /FAILED|carte|€/i);
    assert.equal(routeFor({
        type: 'PAYMENT_FAILED',
        entityId: card.entityId,
        recipientId: REQUESTER
    }).requestId, REQ);
});

test('2a.1 visits stay on NEW_MESSAGE and 54 still does not skip them', () => {
    for (const type of ['visit_accepted', 'visit_declined']) {
        const target = policy.eventNotificationPolicy({ message_type: type });
        assert.equal(target.createNewMessage, true, type);
        assert.equal(target.dedicatedType, null, type);
    }
    assert.doesNotMatch(skipList54(), /visit_accepted|visit_declined/);
});

test('2a.1 E4 wake stays on the timeline row, not on the inbox type', () => {
    assert.equal(dealSync.isDealWakeMessage({ message_type: 'payment_failed' }), true);
    assert.equal(dealSync.isDealWakeMessage({ type: 'PAYMENT_FAILED' }), false);
    assert.equal(policy.eventNotificationPolicy({ message_type: 'payment_failed' }).wakeE4, true);
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /refreshDealContext\('realtime-timeline'\)/);
});

test('2a.1 transition refuses to skip NEW_MESSAGE before the dedicated producer', () => {
    assert.deepEqual(policy.paymentFailedTransitionGate({
        hasDedicatedProducer: false,
        skipPaymentFailedNewMessage: true
    }), { ready: false, code: 'SILENCE_RISK', keepNewMessage: true, applySkip: false });
    assert.equal(policy.paymentFailedTransitionGate({
        hasDedicatedProducer: false,
        skipPaymentFailedNewMessage: false
    }).ready, true);
    assert.equal(policy.paymentFailedTransitionGate({
        hasDedicatedProducer: true,
        skipPaymentFailedNewMessage: true
    }).code, 'SWITCH_TO_DEDICATED');
    assert.doesNotMatch(skipList54(), /'payment_failed'/);
    assert.match(sql54, /PAYMENT_FAILED/);
    const sql55 = fs.readFileSync(path.join(__dirname, '..', '55_payment_failed_notification.sql'), 'utf8');
    assert.match(sql55, /lyann_notify_payment_failed/);
    assert.match(sql55, /'payment_failed'/);
    assert.equal(policy.paymentFailedTransitionGate({
        hasDedicatedProducer: /lyann_notify_payment_failed/.test(sql55),
        skipPaymentFailedNewMessage: /'payment_failed'/.test(sql55)
    }).code, 'SWITCH_TO_DEDICATED');
});

test('2a.3 missing requestId still alerts the requester and opens Finances', () => {
    const card = policy.buildPaymentFailedNotification({
        requester_id: REQUESTER,
        provider_id: PROVIDER,
        quote_id: QUOTE,
        id: PAY1,
        attempt: 1
    });
    assert.equal(card.create, true);
    assert.equal(card.userId, REQUESTER);
    assert.equal(card.route, 'finances');
    assert.equal(card.navigation.fallback, true);
    assert.equal(card.contactId, null);
    assert.equal(card.requestId, null);
    assert.match(card.entityId, /^finances:/);
    const parsed = policy.parseNotificationTarget({
        type: 'PAYMENT_FAILED',
        entity_id: card.entityId
    }, { viewerId: REQUESTER });
    assert.equal(parsed.route, 'finances');
    assert.equal(parsed.contactId, null);
    assert.equal(parsed.requestId, null);
    assert.equal(parsed.code, 'payment_failed_finances');
    assert.equal(parsed.navigate, true);
    const plan = policy.planNotificationNavigation({
        type: 'PAYMENT_FAILED',
        entity_id: card.entityId
    }, { viewerId: REQUESTER, lastActiveRequestId: REQ });
    assert.equal(plan.open, true);
    assert.equal(plan.route, 'finances');
    assert.equal(plan.payload.requestId, undefined);
});

test('2a.3 inconsistent requestId does not pick another annonce', () => {
    const resolved = policy.resolveNotificationContext({
        type: 'PAYMENT_FAILED',
        entity_id: [PROVIDER, QUOTE, REQ, PAY1, 'a1'].join(':')
    }, {
        viewerId: REQUESTER,
        lastActiveRequestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        quotes: [{ id: QUOTE, request_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]
    });
    assert.equal(resolved.route, 'finances');
    assert.equal(resolved.requestId, null);
    assert.equal(resolved.contactId, null);
    assert.equal(resolved.code, 'payment_failed_finances');
});

test('2a.3 idempotence matrix for Stripe retries and distinct attempts', () => {
    const created = Object.assign({}, payment, { payment_status: 'CREATED' });
    const failed = Object.assign({}, payment, { payment_status: 'FAILED' });
    const replay = Object.assign({}, failed);
    const recovered = Object.assign({}, payment, { payment_status: 'CREATED' });
    const failedAgain = Object.assign({}, payment, { payment_status: 'FAILED', attempt: 2 });
    const otherPay = Object.assign({}, payment, { id: PAY2, stripe_payment_intent_id: 'pi_other', attempt: 1 });

    assert.equal(policy.shouldEmitPaymentFailed(created, failed), true);
    assert.equal(policy.shouldEmitPaymentFailed(failed, replay), false);
    assert.equal(policy.shouldEmitPaymentFailed(failed, failed), false);
    assert.equal(policy.shouldEmitPaymentFailed(recovered, failedAgain), true);
    assert.equal(policy.shouldEmitPaymentFailed(null, failed), false);

    assert.equal(policy.isTechnicalPaymentRetry(failed, replay), true);
    assert.equal(policy.isDistinctPaymentFailure(failed, replay), false);
    assert.equal(policy.isDistinctPaymentFailure(failed, failedAgain), true);
    assert.equal(policy.isDistinctPaymentFailure(failed, otherPay), true);
    assert.notEqual(policy.buildPaymentFailedIdempotenceKey(failed), policy.buildPaymentFailedIdempotenceKey(failedAgain));
    assert.notEqual(policy.buildPaymentFailedIdempotenceKey(failed), policy.buildPaymentFailedIdempotenceKey(otherPay));
});

test('2b push routeFor keeps messages when ids are complete and Finances otherwise', () => {
    const complete = policy.buildPaymentFailedNotification(payment);
    const fallback = policy.buildPaymentFailedNotification({
        requester_id: REQUESTER,
        provider_id: PROVIDER,
        quote_id: QUOTE,
        id: PAY1,
        attempt: 1
    });
    const full = routeFor({
        type: 'PAYMENT_FAILED',
        entityId: complete.entityId,
        recipientId: REQUESTER,
        peerId: PROVIDER
    });
    const soft = routeFor({
        type: 'PAYMENT_FAILED',
        entityId: fallback.entityId,
        recipientId: REQUESTER,
        peerId: PROVIDER
    });
    assert.equal(full.route, 'messages');
    assert.equal(full.contactId, PROVIDER);
    assert.equal(full.requestId, REQ);
    assert.equal(soft.route, 'finances');
    assert.equal(soft.contactId, null);
    assert.equal(soft.requestId, null);
    const retry = planDelivery({
        type: 'PAYMENT_FAILED',
        recipientId: REQUESTER,
        actorId: PROVIDER,
        entityId: fallback.entityId,
        recent: { ['evt:PAYMENT_FAILED:' + REQUESTER + ':' + fallback.entityId]: NOW }
    }, NOW);
    assert.equal(retry.enqueue, false);
    assert.equal(retry.reason, 'DUPLICATE');
});
