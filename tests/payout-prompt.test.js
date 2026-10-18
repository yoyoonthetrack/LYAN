'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { quoteStillNeedsPayout, payoutPrompt, payoutReadyCopy } = require('../payout-prompt');

const requester = 'requester-a';
const provider = 'provider-b';

function quote(overrides = {}) {
    return {
        status: 'SENT',
        requester_id: requester,
        provider_id: provider,
        milestones: [{ id: 'm1', status: 'PENDING' }],
        payments: [],
        ...overrides
    };
}

test('an open unpaid quote still needs a payout account', () => {
    assert.equal(quoteStillNeedsPayout(quote()), true);
    assert.equal(quoteStillNeedsPayout(quote({ status: 'ACCEPTED' })), true);
    assert.equal(quoteStillNeedsPayout(quote({ status: 'REJECTED' })), false);
});

test('a funded or settled quote does not ask to configure payouts', () => {
    assert.equal(quoteStillNeedsPayout(quote({ milestones: [{ status: 'FUNDED' }] })), false);
    assert.equal(quoteStillNeedsPayout(quote({ milestones: [{ status: 'RELEASED' }] })), false);
    assert.equal(quoteStillNeedsPayout(quote({
        payments: [{ payment_status: 'SUCCEEDED' }]
    })), false);
});

test('the provider is asked to configure as soon as the quote is sent', () => {
    const prompt = payoutPrompt({ role: 'provider', status: 'SENT', readiness: 'none' });
    assert.equal(prompt.title, 'Pour recevoir ce paiement, configurez votre compte de versement.');
    assert.equal(prompt.action, 'Configurer');
    assert.equal(prompt.intent, 'setup');
    assert.match(prompt.body, /ne pourra pas payer/);
});

test('an accepted quote tells the provider who is waiting to pay', () => {
    const prompt = payoutPrompt({
        role: 'provider',
        status: 'ACCEPTED',
        readiness: 'incomplete',
        requesterName: 'Yoann'
    });
    assert.equal(prompt.title, 'Yoann a accepté votre devis.');
    assert.equal(prompt.action, 'Continuer');
    assert.match(prompt.body, /puisse vous payer/);
});

test('the payer is told the Lyanneur must configure before any card is asked', () => {
    const sent = payoutPrompt({ role: 'requester', status: 'SENT', readiness: 'none', providerName: 'Ludivine' });
    assert.equal(sent.title, 'Ludivine doit configurer son compte de versement avant que vous puissiez payer.');
    assert.equal(sent.action, '');
    assert.equal(sent.blockPay, true);
    const accepted = payoutPrompt({ role: 'requester', status: 'ACCEPTED', readiness: 'none', providerName: 'Ludivine' });
    assert.match(accepted.body, /Aucune carte/);
    assert.equal(accepted.blockPay, true);
});

test('an active payout account removes the prompt and allows payment', () => {
    assert.equal(payoutPrompt({ role: 'requester', status: 'ACCEPTED', readiness: 'active', providerName: 'Ludivine' }), null);
    assert.equal(payoutPrompt({ role: 'provider', status: 'SENT', readiness: 'active' }), null);
});

test('the ready notice is one sentence for the chat and the notification', () => {
    const copy = payoutReadyCopy('Ludivine');
    assert.equal(copy.message, 'Ludivine a configuré son compte de versement. Le paiement peut maintenant être effectué.');
    assert.equal(copy.notificationTitle, 'Compte de versement prêt');
    assert.equal(copy.notificationBody, copy.message);
    assert.equal(payoutReadyCopy('bad name @mail.test').message.startsWith('Votre interlocuteur'), true);
});

test('the chat blocks the pay button until the payout account is ready', () => {
    const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(source, /payoutBlocksPayment\(quote\)/);
    assert.match(source, /beginPayoutSetup/);
    assert.match(source, /kind === 'payout_ready'/);
    assert.match(source, /dispatchQuotePay\(quote, getMyId\(\), \(action, payload\) => handleChatAction\(action, payload\)\)/);
});

test('the server announces once and never returns a Connect account id to the peer', () => {
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    const peer = server.slice(server.indexOf("app.get('/v1/payments/connect/peer-status'"));
    const route = peer.slice(0, peer.indexOf("app.get(['/', '/v1']"));
    assert.match(route, /sharesConversation/);
    assert.match(route, /ready: ready\.ok === true, \.\.\.status/);
    assert.equal(route.includes('stripe_account_id:'), false);
    assert.match(server, /client_message_id: 'payout-ready:' \+ conversationId/);
    assert.match(server, /p_type: 'PAYOUT_READY'/);
    const gateway = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
    assert.match(gateway, /\/v1\/payments\/connect\/peer-status/);
});
