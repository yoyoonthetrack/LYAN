'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '../52_quote_acceptance_blocks_and_report_evidence.sql'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
const notices = fs.readFileSync(path.join(__dirname, '../deal-notification-policy.js'), 'utf8');

test('quote cards are kept apart by message, quote, version and event type', () => {
    const start = chat.indexOf("if (type === 'quote_created' || type === 'quote_updated' || type === 'quote_accepted')");
    const branch = chat.slice(start, chat.indexOf('const wrapper = document.createElement', start));
    assert.equal(branch.includes('threadAlreadySays(box, quoteTracePrefix'), false);
    assert.match(branch, /eventType: type/);
    assert.match(branch, /quoteId/);
    assert.match(branch, /version/);
    assert.match(branch, /dataset\.quoteVersion/);
    assert.match(branch, /dataset\.entityId = quoteId/);
});

test('confirmation replaces the quote sheet until the member cancels or the accept fails', () => {
    const accept = chat.slice(chat.indexOf('window.handleAcceptQuote'), chat.indexOf('window.handleRejectQuote'));
    assert.match(accept, /reviewGate\.acceptBlock/);
    assert.match(accept, /suspendQuoteReview\(\)/);
    const confirmAt = accept.indexOf('lyannConfirm');
    const suspendAt = accept.indexOf('suspendQuoteReview');
    assert.ok(suspendAt > -1 && suspendAt < confirmAt);
    assert.match(accept, /restoreQuoteReview\(\)/);
    assert.match(accept, /closeQuoteReview\(\)/);
    assert.doesNotMatch(accept, /accept_request_quote/);
});

test('the server acceptance gate and the notification copy stay in place', () => {
    assert.match(sql, /status IS DISTINCT FROM 'SENT'/);
    assert.match(sql, /valid_until IS NOT NULL AND v_quote_record\.valid_until < now\(\)/);
    assert.match(client, /rpc\('accept_request_quote'/);
    assert.match(notices, /✅ Devis accepté/);
    assert.match(notices, /Devis refusé/);
});
