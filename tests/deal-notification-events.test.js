'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../deal-notification-policy');
const dealSync = require('../deal-context-sync');
const { planDelivery } = require('../api/push-queue');

const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const SENDER = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-10-14T00:00:00Z');

const sql49 = fs.readFileSync(path.join(__dirname, '..', '49_push_delivery_queue.sql'), 'utf8');
const sql54 = fs.readFileSync(path.join(__dirname, '..', '54_deal_notification_skip.sql'), 'utf8');
const sql39 = fs.readFileSync(path.join(__dirname, '..', '39_notifications_and_support.sql'), 'utf8');

const TIMELINE = policy.DEAL_TIMELINE_TYPES.slice();
const VISITS = policy.VISIT_TYPES.slice();

function skipList49() {
    const match = sql49.match(/IF NEW\.message_type IN \(([^)]+)\)/);
    assert.ok(match, '49 defines a message_type skip list');
    return match[1];
}

function skipList54() {
    const match = sql54.match(/IF NEW\.message_type IN \(([\s\S]+?)\)\s+THEN/);
    assert.ok(match, '54 defines a message_type skip list');
    return match[1];
}

test('2a every deal timeline type has a target policy and an E4 wake', () => {
    for (const type of TIMELINE) {
        const target = policy.eventNotificationPolicy({ message_type: type });
        assert.equal(target.kind, 'deal', type);
        assert.equal(target.wakeE4, true, type);
        assert.equal(dealSync.isDealWakeMessage({ message_type: type }), true, type);
        assert.equal(policy.shouldSkipNewMessagePush({ type: 'NEW_MESSAGE', messageType: type }), true, type);
        assert.equal(target.createNewMessage, false, type);
    }
});

test('2a human messages keep NEW_MESSAGE, push and message badge contract', () => {
    const human = { type: 'NEW_MESSAGE', messageType: 'text', body: 'On se voit demain ?' };
    const photo = { type: 'NEW_MESSAGE', message_type: 'photo', body: '' };
    assert.equal(policy.isHumanChatMessage(human), true);
    assert.equal(policy.isHumanChatMessage(photo), true);
    assert.equal(policy.eventNotificationPolicy(human).createNewMessage, true);
    assert.equal(policy.eventNotificationPolicy(human).dedicatedType, 'NEW_MESSAGE');
    assert.equal(policy.shouldSkipNewMessagePush(human), false);
    assert.equal(planDelivery({
        type: 'NEW_MESSAGE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER,
        body: human.body
    }, NOW).enqueue, true);
    const engine = fs.readFileSync(path.join(__dirname, '..', 'notification-engine.js'), 'utf8');
    assert.match(engine, /n\.type !== 'NEW_MESSAGE'/);
    const ui = fs.readFileSync(path.join(__dirname, '..', 'notifications-ui.js'), 'utf8');
    assert.match(ui, /refreshMessageBadge/);
});

test('2a quote_declined is timeline + E4, no dedicated inbox type', () => {
    const target = policy.eventNotificationPolicy({ message_type: 'quote_declined' });
    assert.equal(target.decision, 'timeline_only');
    assert.equal(target.createNewMessage, false);
    assert.equal(target.dedicatedType, null);
    assert.equal(target.wakeE4, true);
    assert.match(skipList54(), /quote_declined/);
    assert.doesNotMatch(skipList49(), /quote_declined/);
});

test('2a payment_failed is a dedicated requester inbox type after 55', () => {
    const target = policy.eventNotificationPolicy({ message_type: 'payment_failed' });
    assert.equal(target.decision, 'dedicated');
    assert.equal(target.dedicatedType, 'PAYMENT_FAILED');
    assert.equal(target.createNewMessage, false);
    assert.equal(target.recipient, 'requester');
    assert.equal(target.wakeE4, true);
    assert.doesNotMatch(skipList54(), /payment_failed/);
});

test('2a visit accept/decline keep NEW_MESSAGE (time-sensitive, no visit inbox type)', () => {
    for (const type of ['visit_accepted', 'visit_declined']) {
        const target = policy.eventNotificationPolicy({ message_type: type });
        assert.equal(target.decision, 'keep_new_message', type);
        assert.equal(target.createNewMessage, true, type);
        assert.equal(target.wakeE4, false, type);
        assert.equal(dealSync.isDealWakeMessage({ message_type: type }), false, type);
    }
    assert.doesNotMatch(skipList54(), /visit_accepted/);
    assert.doesNotMatch(skipList54(), /visit_declined/);
});

test('2a dedicated deal types stay the only important inbox events', () => {
    assert.equal(policy.eventNotificationPolicy({ message_type: 'quote_created' }).dedicatedType, 'QUOTE_RECEIVED');
    assert.equal(policy.eventNotificationPolicy({ message_type: 'quote_accepted' }).dedicatedType, 'MISSION_ACCEPTED');
    assert.equal(policy.eventNotificationPolicy({ message_type: 'milestone_completed' }).dedicatedType, 'WORK_TO_VALIDATE');
    assert.equal(policy.eventNotificationPolicy({
        metadata: { kind: 'payout_ready' }
    }).dedicatedType, 'PAYOUT_READY');
    for (const type of policy.KEEP_IN_APP_AND_PUSH) {
        assert.equal(policy.isKeptDealType(type), true);
    }
});

test('2a E4 wake stays on timeline INSERT even if NEW_MESSAGE is skipped', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /isDealWakeMessage/);
    assert.match(chat, /refreshDealContext\('realtime-timeline'\)/);
    assert.match(chat, /refreshDealContext\(source === 'fanout' \? 'fanout' : 'realtime'\)/);
    for (const type of ['quote_declined', 'payment_failed', 'payment_secured', 'funds_released']) {
        assert.equal(dealSync.isDealWakeMessage({ message_type: type }), true, type);
    }
});

test('2a quote revision stays idempotent on QUOTE_RECEIVED + same entity_id', () => {
    assert.match(sql39, /idx_notifications_idempotent/);
    assert.match(sql39, /type <> 'NEW_MESSAGE'/);
    const quoteSql = fs.readFileSync(path.join(__dirname, '..', '49_push_delivery_queue.sql'), 'utf8');
    assert.match(quoteSql, /QUOTE_RECEIVED[\s\S]+provider_id::text \|\| ':' \|\| NEW.id::text/);
});

test('2a createNotification / deal-flow are not on the live chat path', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const messaging = fs.readFileSync(path.join(__dirname, '..', 'messaging-ui.js'), 'utf8');
    assert.doesNotMatch(chat, /createNotification\(/);
    assert.doesNotMatch(chat, /LyannDealFlow/);
    assert.doesNotMatch(messaging, /createNotification\(/);
    const flow = fs.readFileSync(path.join(__dirname, '..', 'deal-flow-engine.js'), 'utf8');
    assert.match(flow, /createNotification\(/);
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(index, /deal-flow-engine\.js/);
});

test('2a migration 54 matrix is prepared and not a production apply', () => {
    assert.match(sql54, /Lyann-test only/);
    assert.doesNotMatch(sql54, /DELETE FROM public\.(missions|quotes|notifications)/);
    for (const type of TIMELINE) {
        if (type === 'payment_failed') continue;
        assert.match(sql54, new RegExp("'" + type + "'"), type);
    }
    assert.match(sql54, /payment_failed stays outside the skip list until 55/);
    assert.match(sql54, /payout_ready/);
    assert.match(sql49, /quote_created/);
    assert.match(sql49, /quote_accepted/);
    assert.match(sql49, /milestone_completed/);
    assert.doesNotMatch(skipList49(), /payment_failed/);
    assert.doesNotMatch(skipList49(), /quote_declined/);
});

test('2a.1 54 alone still keeps payment_failed NEW_MESSAGE', () => {
    const gate = policy.paymentFailedTransitionGate({
        hasDedicatedProducer: false,
        skipPaymentFailedNewMessage: /payment_failed/.test(skipList54())
    });
    assert.equal(gate.ready, true);
    assert.equal(gate.applySkip, false);
    assert.equal(gate.code, 'KEEP_NEW_MESSAGE');
});
