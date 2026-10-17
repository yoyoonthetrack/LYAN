'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');

test('pending actions refresh from live deal state without leaving the thread', () => {
    assert.match(chat, /function applyLiveQuotesToDossiers/);
    assert.match(chat, /function syncLiveDealActions/);
    assert.match(chat, /syncLiveDealActions\(quotes\)/);
    const awaitPaid = chat.slice(chat.indexOf('window.lyannAwaitPaidQuote'), chat.indexOf('function isPersistedUuid'));
    assert.match(awaitPaid, /loadPairDossiers/);
    assert.match(awaitPaid, /waits/);
    assert.match(awaitPaid, /syncLiveDealActions/);
});

test('deal fanout and payment-confirm repaint the todo banner', () => {
    assert.match(chat, /await loadPairDossiers\(currentChatContact\);\s*paintPendingActionBanner\(\);/);
    assert.match(chat, /paintDealContextFromServer/);
});
