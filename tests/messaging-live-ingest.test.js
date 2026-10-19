'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const repo = fs.readFileSync(path.join(__dirname, '../messaging-repository.js'), 'utf8');
const cache = fs.readFileSync(path.join(__dirname, '../data-cache.js'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');

test('incoming live rows are ingested into the warm message cache', () => {
    assert.match(repo, /function ingestIncomingMessage/);
    assert.match(repo, /bumpMessageEpoch\(contactId\)/);
    assert.match(cache, /function dropInFlight/);
    assert.match(cache, /dropInFlight\(namespace, id\)/);
    assert.match(chat, /ingestIncomingMessage\?\.\(userId, currentChatContact\.id, convId, row\)/);
});

test('a fresh message fetch does not keep a stale in-flight snapshot', () => {
    assert.match(repo, /if \(options\.fresh\) \{/);
    assert.match(repo, /c\.invalidate\('chat-messages', conversationId\)/);
    assert.match(repo, /currentMessageEpoch\(contactId\) === epoch/);
});
