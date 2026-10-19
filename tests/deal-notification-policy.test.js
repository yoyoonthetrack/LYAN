'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const policy = require('../deal-notification-policy');
const { planDelivery } = require('../api/push-queue');

const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const SENDER = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-10-14T00:00:00Z');

test('E6: dedicated deal types stay pushable', () => {
    for (const type of policy.KEEP_IN_APP_AND_PUSH) {
        assert.equal(policy.isKeptDealType(type), true);
        const plan = planDelivery({
            type,
            recipientId: RECIPIENT,
            actorId: SENDER,
            peerId: SENDER,
            entityId: type === 'PAYOUT_READY' ? SENDER : 'quote-1'
        }, NOW);
        assert.equal(plan.enqueue, true, type);
    }
});

test('E6: NEW_MESSAGE timeline bodies/types skip extra push', () => {
    assert.equal(policy.shouldSkipNewMessagePush({
        type: 'NEW_MESSAGE', body: '📄 Devis proposé'
    }), true);
    assert.equal(policy.shouldSkipNewMessagePush({
        type: 'NEW_MESSAGE', body: '🔒 Fonds sécurisés'
    }), true);
    assert.equal(policy.shouldSkipNewMessagePush({
        type: 'NEW_MESSAGE', messageType: 'payment_secured'
    }), true);
    assert.equal(policy.shouldSkipNewMessagePush({
        type: 'NEW_MESSAGE', messageType: 'funds_released'
    }), true);
    assert.equal(policy.shouldSkipNewMessagePush({
        type: 'NEW_MESSAGE', body: 'Salut, je peux passer demain'
    }), false);
    assert.equal(planDelivery({
        type: 'NEW_MESSAGE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER,
        body: '📄 Devis proposé'
    }, NOW).reason, 'DEAL_TIMELINE');
    assert.equal(planDelivery({
        type: 'NEW_MESSAGE', recipientId: RECIPIENT, actorId: SENDER, peerId: SENDER,
        body: 'On se voit demain ?'
    }, NOW).enqueue, true);
});

test('E6: chime skips only the visible request, not the whole contact', () => {
    const sameRequest = { contactId: SENDER, requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', chatOpen: true };
    const otherRequest = { contactId: SENDER, requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', chatOpen: true };
    const quoteSame = {
        type: 'QUOTE_RECEIVED',
        entity_id: SENDER + ':eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        read: false
    };
    assert.equal(policy.shouldSkipChime(quoteSame, sameRequest), true);
    assert.equal(policy.shouldSkipChime(quoteSame, otherRequest), false);
    assert.equal(policy.shouldSkipChime(quoteSame, { contactId: RECIPIENT, chatOpen: true }), false);
    assert.equal(policy.shouldSkipChime(quoteSame, { contactId: SENDER, requestId: sameRequest.requestId, chatOpen: false }), false);
    assert.equal(policy.shouldSkipChime({
        type: 'NEW_MESSAGE', body: '✅ Devis accepté', read: false
    }, null), true);
    assert.equal(policy.shouldSkipChime({
        type: 'NEW_MESSAGE', body: 'Photo reçue', entity_id: SENDER, read: false
    }, { contactId: SENDER, chatOpen: true }), false, 'legacy pair-only is not assumed displayed');
    assert.equal(policy.shouldSkipChime({
        type: 'NEW_MESSAGE', body: 'Photo reçue', entity_id: SENDER, read: false
    }, { contactId: RECIPIENT, chatOpen: true }), false);
});

test('E6: actor success alerts are identified; error copy is not', () => {
    assert.equal(policy.isActorSuccessAlert('Devis accepté. La mission a été créée.'), true);
    assert.equal(policy.isActorSuccessAlert('👍 Jalon validé avec succès !'), true);
    assert.equal(policy.isActorSuccessAlert('Le devis n’a pas pu être accepté. Réessayez.'), false);
});

test('E6: chat-logic no longer raises actor success alerts for accept/done/release', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.doesNotMatch(source, /lyannAlert\("Devis accepté\. La mission a été créée\."\)/);
    assert.doesNotMatch(source, /lyannAlert\('✅ Jalon marqué comme effectué/);
    assert.doesNotMatch(source, /lyannAlert\('🎉 Félicitations ! Tous les jalons/);
    assert.doesNotMatch(source, /lyannAlert\('🚀 Mission démarrée/);
    assert.match(source, /Le devis n.a pas pu être accepté/);
});

test('E6: hydrate stays silent; live INSERT still chimes except skipped deal noise', () => {
    const engine = fs.readFileSync(path.join(__dirname, '..', 'notification-engine.js'), 'utf8');
    assert.match(engine, /rememberNotificationIds\(mapped, \{ chime: false \}\)/);
    assert.match(engine, /policy\.shouldSkipChime\(notif, surface/);
    const ui = fs.readFileSync(path.join(__dirname, '..', 'notifications-ui.js'), 'utf8');
    assert.match(ui, /hydrate is silent/);
    assert.match(ui, /refreshDealContext\?\.\('notif-deal'\)/);
});

test('E6: optional SQL expands skip list and is not a production apply script', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '54_deal_notification_skip.sql'), 'utf8');
    assert.match(sql, /Lyann-test only/);
    assert.match(sql, /payment_secured/);
    assert.match(sql, /funds_released/);
    assert.match(sql, /milestone_approved/);
    assert.doesNotMatch(sql, /DELETE FROM public\.(missions|quotes|notifications)/);
});
