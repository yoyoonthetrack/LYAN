'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../deal-notification-policy');
const dealSync = require('../deal-context-sync');

const sql45 = fs.readFileSync(path.join(__dirname, '..', '45_chat_timeline.sql'), 'utf8');
const sql54 = fs.readFileSync(path.join(__dirname, '..', '54_deal_notification_skip.sql'), 'utf8');
const sql55 = fs.readFileSync(path.join(__dirname, '..', '55_payment_failed_notification.sql'), 'utf8');
const sql55rb = fs.readFileSync(path.join(__dirname, '..', '55_payment_failed_notification_rollback.sql'), 'utf8');

function skipList(sql) {
    const match = sql.match(/lyann_notify_on_message[\s\S]+?IF NEW\.message_type IN \(([\s\S]+?)\)\s+THEN/);
    assert.ok(match, 'skip list present');
    return match[1];
}

test('2a.2 55 is Lyann-test only, one transaction, no historical DELETE', () => {
    assert.match(sql55, /Lyann-test only/);
    assert.match(sql55, /Do not apply on Supabase Production/);
    assert.match(sql55, /^BEGIN;/m);
    assert.match(sql55, /^COMMIT;/m);
    assert.doesNotMatch(sql55, /DELETE FROM public\.(notifications|payments|missions|quotes)/);
    assert.doesNotMatch(sql55, /UPDATE public\.payments SET/);
    assert.doesNotMatch(sql55, /api\.stripe\.com|payment_intent/);
});

test('2a.2 producer is created before the payment_failed skip replace', () => {
    const producerAt = sql55.indexOf('CREATE OR REPLACE FUNCTION public.lyann_notify_payment_failed');
    const triggerAt = sql55.indexOf('CREATE TRIGGER trg_lyann_notify_payment_failed');
    const skipAt = sql55.indexOf("CREATE OR REPLACE FUNCTION public.lyann_notify_on_message");
    assert.ok(producerAt > 0 && triggerAt > producerAt);
    assert.ok(skipAt > triggerAt, 'skip replace must follow the producer trigger');
    assert.match(sql55, /v_old IS NOT DISTINCT FROM 'FAILED'/);
    assert.match(sql55, /TG_OP <> 'UPDATE'/);
    assert.match(sql55, /v_requester = v_provider/);
    assert.match(sql55, /finances:' \|\| COALESCE\(v_quote::text, 'none'\)/);
    assert.match(sql55, /lyann_insert_notification\(\s*v_requester,\s*'PAYMENT_FAILED'/);
    assert.doesNotMatch(sql55, /lyann_insert_notification\(\s*v_provider/);
    assert.doesNotMatch(sql55, /OR v_request IS NULL\n\s+OR v_requester = v_provider/);
});

test('2a.2 55 skips technical timeline types and keeps humans and visits', () => {
    const skip = skipList(sql55);
    assert.match(skip, /payment_failed/);
    assert.match(skip, /quote_declined/);
    assert.match(skip, /quote_created/);
    assert.doesNotMatch(skip, /visit_accepted/);
    assert.doesNotMatch(skip, /visit_declined/);
    assert.doesNotMatch(skip, /'text'|photo|document|video/);
    assert.match(sql55, /QUOTE_RECEIVED/);
    assert.match(sql55, /MISSION_ACCEPTED/);
    assert.match(sql55, /WORK_TO_VALIDATE/);
    assert.match(sql55, /PAYOUT_READY/);
});

test('2a.2 enqueue stores requestId from the navigation prefix, not the attempt suffix', () => {
    assert.match(sql55, /split_part\(COALESCE\(NEW\.entity_id, ''\), ':', 3\)/);
    assert.match(sql55, /entity_id LIKE '%:' \|\| NEW\.id::text \|\| ':a%'/);
    const REQUESTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const PROVIDER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const QUOTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const REQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const PAY = '11111111-4111-4111-8111-111111111111';
    const card = policy.buildPaymentFailedNotification({
        requester_id: REQUESTER,
        provider_id: PROVIDER,
        quote_id: QUOTE,
        request_id: REQ,
        id: PAY,
        attempt: 2
    });
    const parsed = policy.parseNotificationTarget({
        type: 'PAYMENT_FAILED',
        entity_id: card.entityId
    }, { viewerId: REQUESTER });
    assert.equal(parsed.requestId, REQ);
    assert.notEqual(parsed.requestId, PAY);
    assert.equal(parsed.quoteId, QUOTE);
    assert.equal(card.idempotenceKey, PAY + ':a2');
    assert.equal(policy.planNotificationNavigation({
        type: 'PAYMENT_FAILED',
        entity_id: card.entityId
    }, { viewerId: REQUESTER }).open, true);
});

test('2a.2 timeline and E4 stay independent of the inbox producer', () => {
    assert.match(sql45, /kind := 'payment_failed'/);
    assert.doesNotMatch(sql55, /lyann_payment_timeline/);
    assert.doesNotMatch(sql55, /DROP TRIGGER IF EXISTS payments_timeline_event/);
    assert.equal(dealSync.isDealWakeMessage({ message_type: 'payment_failed' }), true);
    assert.ok(sql55.indexOf('payments_timeline_event') === -1
        || sql55.indexOf('trg_lyann_notify_payment_failed') > 0);
});

test('2a.2 54 then 55 never skips payment_failed without a producer', () => {
    assert.doesNotMatch(skipList(sql54), /payment_failed/);
    assert.match(skipList(sql55), /payment_failed/);
    assert.equal(policy.paymentFailedTransitionGate({
        hasDedicatedProducer: false,
        skipPaymentFailedNewMessage: /payment_failed/.test(skipList(sql54))
    }).code, 'KEEP_NEW_MESSAGE');
    assert.equal(policy.paymentFailedTransitionGate({
        hasDedicatedProducer: true,
        skipPaymentFailedNewMessage: /payment_failed/.test(skipList(sql55))
    }).code, 'SWITCH_TO_DEDICATED');
});

test('2a.3 safe rollback keeps the producer and restores payment_failed NEW_MESSAGE', () => {
    assert.match(sql55rb, /KEEPING lyann_notify_payment_failed/);
    assert.doesNotMatch(sql55rb, /^DROP TRIGGER IF EXISTS trg_lyann_notify_payment_failed/m);
    assert.doesNotMatch(sql55rb, /^DROP FUNCTION IF EXISTS public.lyann_notify_payment_failed/m);
    assert.doesNotMatch(sql55rb, /DELETE FROM public\.notifications/);
    assert.doesNotMatch(skipList(sql55rb), /payment_failed/);
    assert.match(sql55rb, /PAYMENT_FAILED/);
    assert.match(sql55rb, /requester silence/);
});

test('2a.2 legacy pair-only NEW_MESSAGE still parses after the dedicated type exists', () => {
    const legacy = policy.parseNotificationTarget({
        type: 'NEW_MESSAGE',
        entity_type: 'conversation',
        entity_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        body: '❌ Paiement échoué'
    });
    assert.equal(legacy.route, 'messages');
    assert.equal(legacy.code, 'pair_only');
    assert.equal(policy.shouldSkipNewMessagePush({
        type: 'NEW_MESSAGE',
        body: '❌ Paiement échoué'
    }), true);
});
