'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { payoutAccountState, rememberPayoutReturn, readPayoutReturn, clearPayoutReturn, renderPayoutAccount } = require('../payout-account.js');
const { payoutGuidance, payoutChatNotice, payoutPrompt } = require('../payout-prompt.js');
const payment = require('../quote-payment-eligibility.js');

const store = {};
global.sessionStorage = {
    setItem(key, value) { store[key] = String(value); },
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    removeItem(key) { delete store[key]; }
};

const quote = {
    id: 'q-fuite',
    status: 'ACCEPTED',
    requester_id: 'A',
    provider_id: 'B',
    total_amount: 100,
    mission_id: 'm1',
    mission_status: 'AGREED',
    request_id: 'R1',
    request_title: 'Fuite voiture essence',
    milestones: [{ id: 'ms1', title: 'réaparation', amount: 100, status: 'PENDING' }],
    payments: []
};

test('6.31B maps Connect JSON to none / incomplete / pending / active / error', () => {
    assert.equal(payoutAccountState({ success: true, account_created: false }), 'none');
    assert.equal(payoutAccountState({
        success: true, ready: false, account_created: true, onboarding_completed: false, transfers_active: false
    }), 'incomplete');
    assert.equal(payoutAccountState({
        success: true, ready: false, account_created: true, onboarding_completed: true, transfers_active: false
    }), 'pending');
    assert.equal(payoutAccountState({
        success: true, ready: true, account_created: true, onboarding_completed: true, transfers_active: true
    }), 'active');
    assert.equal(payoutAccountState({ success: false }), 'error');
    assert.equal(payoutAccountState(null), 'error');
});

test('6.31B Lyanneur sees a real setup CTA only when the account is missing or incomplete', () => {
    const none = payment.missionCard(quote, 'B', 'none', { requestTitle: 'Fuite voiture essence' });
    const incomplete = payment.missionCard(quote, 'B', 'incomplete', { requestTitle: 'Fuite voiture essence' });
    const pending = payment.missionCard(quote, 'B', 'pending', { requestTitle: 'Fuite voiture essence' });
    const active = payment.missionCard(quote, 'B', 'active', { requestTitle: 'Fuite voiture essence' });
    const unknown = payment.missionCard(quote, 'B', 'unknown', { requestTitle: 'Fuite voiture essence' });
    assert.equal(none.primaryAction && none.primaryAction.id, 'setup');
    assert.equal(none.primaryAction.label, 'Configurer mon compte de versement');
    assert.equal(incomplete.primaryAction && incomplete.primaryAction.id, 'setup');
    assert.equal(pending.primaryAction, null);
    assert.match(pending.context, /vérification/);
    assert.equal((active.actions || []).some((action) => action.id === 'setup'), false);
    assert.doesNotMatch(unknown.context || '', /n’a pas configuré/);
    assert.equal((unknown.actions || []).some((action) => action.id === 'setup'), false);
});

test('6.31B requester never gets Pay while payout is not active, then gets it after a simulated flip', () => {
    const blocked = payment.missionCard(quote, 'A', 'incomplete', { requestTitle: 'Fuite voiture essence' });
    assert.equal(blocked.status, 'En attente du Lyanneur');
    assert.equal((blocked.actions || []).some((action) => action.id === 'pay'), false);
    assert.match(blocked.context, /aucune action immédiate/);
    const unknown = payment.missionCard(quote, 'A', 'unknown', { requestTitle: 'Fuite voiture essence' });
    assert.doesNotMatch(unknown.context || '', /n’a pas configuré/);
    assert.equal((unknown.actions || []).some((action) => action.id === 'pay'), false);
    const ready = payment.missionCard(quote, 'A', 'active', { requestTitle: 'Fuite voiture essence' });
    assert.equal(ready.primaryAction && ready.primaryAction.id, 'pay');
});

test('6.31B guidance copy names the dossier and keeps unknown distinct from none', () => {
    const lyanneur = payoutGuidance({ role: 'provider', readiness: 'none', requestTitle: 'Fuite voiture essence' });
    assert.match(lyanneur.body, /Fuite voiture essence/);
    assert.equal(lyanneur.action.label, 'Configurer mon compte de versement');
    const requester = payoutGuidance({ role: 'requester', readiness: 'none', requestTitle: 'Fuite voiture essence' });
    assert.equal(requester.headline, 'En attente du Lyanneur');
    assert.equal(requester.action, null);
    const unknown = payoutGuidance({ role: 'requester', readiness: 'unknown', requestTitle: 'Fuite voiture essence' });
    assert.match(unknown.body, /pas encore connu/);
    assert.equal(payoutPrompt({ role: 'requester', status: 'ACCEPTED', readiness: 'pending' }).title, 'En attente du Lyanneur');
});

test('6.31B chat notices identify the mission and are one-shot by storage key', () => {
    const wait = payoutChatNotice({ kind: 'accepted_wait', role: 'requester', requestTitle: 'Fuite voiture essence' });
    const ready = payoutChatNotice({ kind: 'payout_ready', role: 'requester', requestTitle: 'Fuite voiture essence' });
    const paid = payoutChatNotice({ kind: 'payment_secured', role: 'lyanneur', requestTitle: 'Fuite voiture essence' });
    assert.match(wait.body, /Fuite voiture essence/);
    assert.match(ready.body, /Fuite voiture essence/);
    assert.match(paid.body, /Fuite voiture essence/);
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /payoutNoticeStorageKey/);
    assert.match(chat, /markPayoutNoticeSeen/);
    assert.match(chat, /lyann:payout-return/);
    assert.match(chat, /beginPayoutSetup\(\{/);
    assert.doesNotMatch(chat, /from\('messages'\)\.insert/);
});

test('6.31B onboarding return remembers the exact dossier without changing Stripe URLs', () => {
    clearPayoutReturn();
    rememberPayoutReturn({
        requestId: '13e088a4-6a14-4539-b009-e174b440bd45',
        invitationId: 'efa773dc-c149-4479-a7c-fb366e9c9b88',
        contactId: 'contact-1'
    });
    const hint = readPayoutReturn();
    assert.equal(hint.requestId, '13e088a4-6a14-4539-b009-e174b440bd45');
    assert.equal(hint.contactId, 'contact-1');
    const { payoutReturnUrls } = require('../payout-account.js');
    assert.match(payoutReturnUrls().return_url, /action=finances/);
    assert.equal(renderPayoutAccount('active').intent, 'update');
});
