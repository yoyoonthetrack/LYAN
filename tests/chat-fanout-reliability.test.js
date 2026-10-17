'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');

test('private fanout denial still uses REST catch-up', () => {
    assert.match(chat, /scheduleCatchUpBurst\('fanout-denied'\)/);
    assert.match(chat, /scheduleCatchUpBurst\('fanout-subscribe'\)/);
    assert.match(chat, /chatFanoutChannelConfig\(\)/);
    assert.match(chat, /function ensureRealtimeAuth/);
    assert.match(chat, /channel\.httpSend/);
    assert.match(chat, /waitFanoutSubscribed/);
});

test('reconnect rebinds fanout and queues a second REST catch-up', () => {
    assert.match(chat, /catchUpQueuedReason/);
    assert.match(chat, /forceChatRealtimeResubscribe\('online'\)/);
    assert.match(chat, /resumeChatRealtime\('foreground'\)/);
    const recycle = chat.slice(chat.indexOf('async function forceChatRealtimeResubscribe'), chat.indexOf('function setupRealtime'));
    assert.match(recycle, /setupRealtime\(\)/);
    assert.match(recycle, /bindChatFanout\(convId\)/);
    assert.match(recycle, /unbindChatFanout\(\)/);
    assert.doesNotMatch(recycle, /chatFanout\.conversationId = null;/);
    assert.match(chat, /catchUpOpenThread\('reconnect'\)/);
    assert.match(chat, /setTimeout\(\(\) => \{ void catchUpOpenThread\('reconnect'\); \}, 700\)/);
    assert.match(chat, /scheduleCatchUpBurst\('postgres-dropped'\)/);
    const bind = chat.slice(chat.indexOf('async function bindChatFanout'), chat.indexOf('async function waitFanoutSubscribed'));
    assert.match(bind, /if \(chatFanout\.channel && String\(chatFanout\.conversationId\) === String\(conversationId\)\) return;/);
});

test('live rows are deduped by server id and out-of-order catch-up uses a cursor', () => {
    assert.match(chat, /container\.querySelector\(chatMessageSelector\(messageId\)\)/);
    assert.match(chat, /getChatMessages\(contactId, \{ fresh: true, limit: 50, after: cursor \}/);
    assert.match(chat, /placeLiveMessage\(liveRowFromMapped/);
});

test('a bubble is not marked sent before persistence is confirmed', () => {
    const deliver = chat.slice(chat.indexOf('async function deliverTextMessage'), chat.indexOf('window.openPhotoLightbox'));
    assert.ok(deliver.indexOf("console.log('[CHAT] insert confirmed')") >= 0);
    assert.ok(deliver.indexOf('bindOptimisticSend') > deliver.indexOf("console.log('[CHAT] insert confirmed')"));
    assert.doesNotMatch(deliver, /setOptimisticState\(optimisticNode, 'sent'\)/);
    assert.match(chat, /if \(node\.isConnected\) setOptimisticState\(node, 'sent'\)/);
});
