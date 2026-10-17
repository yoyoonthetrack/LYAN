'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, '../messaging-ui.js'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');

test('inbox live activity can mark a row unread by conversation id', () => {
    assert.match(ui, /function findInboxRow/);
    assert.match(ui, /if \(!list \|\| \(!detail\.contactId && !detail\.conversationId\)\) return;/);
    assert.match(ui, /paintInboxNewMark\(row, !!detail\.unread\)/);
    assert.match(ui, /textContent = 'Nouveau'/);
});

test('a message received on the inbox list is not treated as already read', () => {
    assert.match(chat, /openConversationIsVisible\(\) && incomingBelongsToOpenChat/);
    assert.match(chat, /unreadCount: noted && noted\.unreadCount \? noted\.unreadCount : 1/);
});
