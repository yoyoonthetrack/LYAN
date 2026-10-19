'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
const start = source.indexOf('function incomingBelongsToOpenChat');
const end = source.indexOf('function openConversationIsVisible');
const incomingBelongsToOpenChat = new Function(source.slice(start, end) + '\nreturn incomingBelongsToOpenChat;')();

const contact = { id: '22222222-2222-4222-a222-222222222222', conversationId: '33333333-3333-4333-a333-333333333333' };
const me = '11111111-1111-4111-a111-111111111111';

test('a message from another conversation of the same contact stays out of the open thread', () => {
    const row = {
        id: 'm1',
        sender_id: contact.id,
        conversation_id: '44444444-4444-4444-a444-444444222222',
        content: 'Bonjour'
    };
    assert.equal(incomingBelongsToOpenChat(row, contact, me), false);
});

test('a message of the open conversation appears immediately', () => {
    const row = {
        id: 'm1b',
        sender_id: contact.id,
        conversation_id: contact.conversationId,
        content: 'Ici'
    };
    assert.equal(incomingBelongsToOpenChat(row, contact, me), true);
});

test('a message from someone else stays out of the open thread', () => {
    const row = {
        id: 'm2',
        sender_id: '55555555-5555-4555-a555-555555555555',
        conversation_id: '66666666-6666-4666-a666-666666666666',
        content: 'Ailleurs'
    };
    assert.equal(incomingBelongsToOpenChat(row, contact, me), false);
});

test('the open thread keeps checking for new messages without a manual refresh', () => {
    assert.match(source, /supabase\.channel\('lyann-messages'\)/);
    assert.match(source, /await supabase\.realtime\.setAuth\(token\)/);
    assert.match(source, /catchUpOpenThread\('visible'\)/);
    assert.match(source, /openConversationIsVisible\(\)/);
    assert.match(source, /lyann-chat-fanout:/);
    assert.match(source, /applyIncomingMessageRow/);
    assert.match(source, /catchUpQueuedReason/);
    assert.match(source, /ingestIncomingMessage/);
    assert.match(source, /placeLiveMessage\(row, \{ stickToBottom: true \}\)/);
    assert.match(source, /Math\.min\(healthyGap, 4000\)/);
    assert.match(source, /openConversationIsVisible\(\) && incomingBelongsToOpenChat/);
    assert.match(source, /openConversationIsVisible\(\)\s*&& currentChatContact/);
});
