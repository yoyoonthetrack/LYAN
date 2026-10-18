'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
const repo = fs.readFileSync(path.join(__dirname, '../messaging-repository.js'), 'utf8');

function fn(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + 1);
    assert.ok(from >= 0, 'missing ' + start);
    assert.ok(to > from, 'missing end ' + end);
    return new Function(source.slice(from, to) + '\nreturn ' + start.replace(/^function /, '').replace(/\(.*$/, '') + ';')();
}

test('a refused-only thread is not a finished deal', () => {
    const threadDealIsFinished = fn(chat, 'function threadDealIsFinished', 'function hasViewableThreadMission');
    const quoteIsClosedDeal = fn(chat, 'function quoteIsClosedDeal', 'function threadDealIsFinished');
    const request = { status: 'OPEN', requester_id: 'req-1' };
    assert.equal(threadDealIsFinished(null, [{ id: 'q1', status: 'REJECTED' }], request), false);
    assert.equal(threadDealIsFinished({ status: 'COMPLETED' }, [{ id: 'q1', status: 'REJECTED' }], request), true);
    assert.equal(typeof quoteIsClosedDeal, 'function');
});

test('the provider can propose again after a refusal', () => {
    const threadQuoteProposalGate = fn(chat, 'function threadQuoteProposalGate', 'function collectThreadQuotes');
    const requestContext = {
        requesterId: 'req-1',
        request: { status: 'OPEN', requester_id: 'req-1' }
    };
    const refused = [{ id: 'q1', status: 'REJECTED', requester_id: 'req-1', provider_id: 'prov-1' }];
    const gate = threadQuoteProposalGate(requestContext, null, refused, 'prov-1');
    assert.equal(gate.ok, true);
    const asClient = threadQuoteProposalGate(requestContext, null, refused, 'req-1');
    assert.equal(asClient.ok, false);
    const pending = threadQuoteProposalGate(requestContext, null, [{ id: 'q2', status: 'SENT' }], 'prov-1');
    assert.equal(pending.ok, false);
    const closed = threadQuoteProposalGate({
        requesterId: 'req-1',
        request: { status: 'CANCELLED', requester_id: 'req-1' }
    }, null, refused, 'prov-1');
    assert.equal(closed.ok, false);
    assert.match(closed.reason, /close/i);
});

test('live refuse notice and realtime miss catch-up are wired', () => {
    assert.match(chat, /function isRpcNoiseMessage/);
    assert.match(chat, /function ensureQuoteDeclinedNotice/);
    assert.match(chat, /function threadQuoteProposalGate/);
    assert.match(chat, /catchUpOpenThread\('realtime-miss'\)/);
    assert.match(chat, /type === 'quote_declined'/);
    assert.match(chat, /isVisibleDealNotice/);
    assert.match(chat, /quoteDeclineCopy/);
    assert.doesNotMatch(
        chat.slice(chat.indexOf('function appendLiveChatMessage'), chat.indexOf('window.appendLiveChatMessage')),
        /if \(dealWake\) \{\s*void refreshDealContext\('realtime-timeline'\);\s*return;/
    );
    assert.match(repo, /options\.conversationId/);
    assert.match(chat, /conversationId: options\.conversationId \|\| conversationId/);
});

test('two-session refuse payload paints once and does not leak', () => {
    const incomingBelongsToOpenChat = fn(chat, 'function incomingBelongsToOpenChat', 'function openConversationIsVisible');
    const open = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
    const me = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const declined = {
        id: 'msg-declined',
        sender_id: me,
        conversation_id: open.conversationId,
        message_type: 'quote_declined',
        entity_type: 'quote',
        entity_id: 'quote-1',
        content: 'Devis refusé'
    };
    assert.equal(incomingBelongsToOpenChat(declined, open, me), true);
    const otherThread = Object.assign({}, declined, { conversation_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
    assert.equal(incomingBelongsToOpenChat(otherThread, open, me), false);
    const stranger = Object.assign({}, declined, {
        sender_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        conversation_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    });
    assert.equal(incomingBelongsToOpenChat(stranger, open, me), false);
});
