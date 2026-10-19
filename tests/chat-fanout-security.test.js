'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');

function fn(start, end) {
    const from = chat.indexOf(start);
    const to = chat.indexOf(end, from + 1);
    assert.ok(from >= 0 && to > from, start);
    return new Function(chat.slice(from, to) + '\nreturn ' + start.replace(/^function /, '').replace(/\(.*$/, '') + ';')();
}

test('fanout wake never includes message or quote bodies', () => {
    const chatFanoutWake = fn('function chatFanoutWake', 'function conversationAllowedForFanout');
    const wake = chatFanoutWake('wake', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const deal = chatFanoutWake('deal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.deepEqual(Object.keys(wake).sort(), ['conversationId', 'kind']);
    assert.equal(wake.kind, 'wake');
    assert.equal(deal.kind, 'deal');
    assert.equal(wake.content, undefined);
    assert.equal(wake.row, undefined);
    assert.match(chat, /publishChatFanout\(row\.conversation_id, 'wake', null, row\)/);
    assert.match(chat, /publishChatFanout\(conversationId, 'deal'/);
    assert.match(chat, /payload\.message = \{/);
    assert.match(chat, /message: payload\.message \|\| null/);
    assert.doesNotMatch(chat, /payload = row/);
    assert.doesNotMatch(chat, /publishChatFanout\([^)]*kind: 'message', row/);
    assert.match(chat, /if \(payload\.row \|\| payload\.content \|\| payload\.new\) return;/);
    assert.match(chat, /source === 'fanout'/);
    assert.doesNotMatch(
        chat.slice(chat.indexOf('function applyFanoutWake'), chat.indexOf('function applyIncomingChatEvent')),
        /payload\.row\.content|payload\.content/
    );
});

test('fanout is ignored unless the conversation is open or already in the inbox', () => {
    const conversationAllowedForFanout = fn(
        'function conversationAllowedForFanout',
        'async function unbindChatFanout'
    );
    global.chatFanout = { conversationId: null, subscribed: false };
    global.currentChatContact = { conversationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    global.isUUID = (value) => /^[0-9a-f-]{36}$/i.test(String(value));
    global.getMyId = () => 'me';
    global.window = { LYANN_MESSAGING_REPOSITORY: { peekConversations: () => [{ conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }] } };
    assert.equal(conversationAllowedForFanout('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), true);
    assert.equal(conversationAllowedForFanout('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), true);
    assert.equal(conversationAllowedForFanout('dddddddd-dddd-4ddd-8ddd-dddddddddddd'), false);
    delete global.currentChatContact;
    delete global.window;
});

test('chat fanout uses private channels and never falls back to public', () => {
    assert.match(chat, /lyann-chat-fanout:/);
    assert.match(chat, /function chatFanoutChannelConfig/);
    assert.match(chat, /private: true/);
    assert.match(chat, /realtime fanout denied/);
    assert.doesNotMatch(chat, /private: false/);
    assert.match(chat, /conversationAllowedForFanout/);
    assert.match(chat, /function bindInboxChatFanouts/);
    assert.match(chat, /bumpMessageBadge/);
    const bind = chat.slice(chat.indexOf('async function bindChatFanout'), chat.indexOf('async function waitFanoutSubscribed'));
    assert.match(bind, /chatFanoutChannelConfig\(\)/);
    assert.match(bind, /chatFanout.subscribed/);
    assert.doesNotMatch(bind, /config: \{ broadcast: \{ ack: false, self: false \} \}/);
    assert.doesNotMatch(bind, /event: '\*'/);
});
