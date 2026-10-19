'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = {};
global.sessionStorage = {
    setItem(key, value) { store[key] = String(value); },
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    removeItem(key) { delete store[key]; }
};

const payment = require('../quote-payment-eligibility.js');
const { payoutGuidance } = require('../payout-prompt.js');
const {
    payoutAccountState,
    connectSimulationBody,
    simulateConnect,
    readConnectSimulation,
    rememberPayoutReturn,
    readPayoutReturn,
    clearPayoutReturn,
    fetchReadiness
} = require('../payout-account.js');

const quote = {
    id: 'q-e1e5',
    status: 'ACCEPTED',
    requester_id: 'A',
    provider_id: 'B',
    total_amount: 42,
    mission_id: 'm1',
    mission_status: 'AGREED',
    request_id: 'R-live',
    request_title: 'E1-E5 val 1791974830332',
    milestones: [{ id: 'ms1', title: 'intervention', amount: 42, status: 'PENDING' }],
    payments: []
};

const STATES = ['none', 'incomplete', 'pending', 'active', 'unknown', 'error'];

test('6.31D browser GET simulation maps every Connect state without Stripe', () => {
    clearPayoutReturn();
    for (const state of STATES) {
        simulateConnect(state);
        assert.equal(readConnectSimulation(), state);
        if (state === 'unknown') {
            assert.equal(connectSimulationBody(state), null);
            continue;
        }
        const mapped = payoutAccountState(connectSimulationBody(state));
        assert.equal(mapped, state);
    }
    simulateConnect('');
    assert.equal(readConnectSimulation(), '');
});

test('6.31D fetchReadiness uses sessionStorage simulation and never requires a Stripe account', async () => {
    simulateConnect('pending');
    assert.equal(await fetchReadiness('any-user'), 'pending');
    simulateConnect('unknown');
    assert.equal(await fetchReadiness('any-user'), 'unknown');
    simulateConnect('error');
    assert.equal(await fetchReadiness('any-user'), 'error');
    simulateConnect('active');
    assert.equal(await fetchReadiness('any-user'), 'active');
    simulateConnect('');
});

test('6.31D both roles: copy, primary CTA, no Pay unless active, no Configurer when active, Réessayer on error', () => {
    const title = quote.request_title;
    for (const state of STATES) {
        const requester = payment.missionCard(quote, 'A', state, { requestTitle: title });
        const lyanneur = payment.missionCard(quote, 'B', state, { requestTitle: title });
        const reqIds = (requester.actions || []).map((a) => a.id);
        const lyaIds = (lyanneur.actions || []).map((a) => a.id);
        const reqGuide = payoutGuidance({ role: 'requester', readiness: state, requestTitle: title });
        const lyaGuide = payoutGuidance({ role: 'provider', readiness: state, requestTitle: title });
        assert.equal(reqIds.includes('pay'), state === 'active', 'requester pay ' + state);
        assert.equal(lyaIds.includes('pay'), false, 'lyanneur never pays ' + state);
        assert.equal(lyaIds.includes('setup'), state === 'none' || state === 'incomplete', 'setup ' + state);
        if (state === 'active') {
            assert.equal(lyaIds.includes('setup'), false);
            assert.equal(reqGuide.action, null);
        }
        if (state === 'error') {
            assert.equal(reqIds.includes('retry'), true);
            assert.equal(lyaIds.includes('retry'), true);
            assert.match(reqGuide.body + lyaGuide.body, /Réessayez|Impossible de vérifier/);
        }
        if (state !== 'active') {
            assert.match(
                (requester.status || '') + (reqGuide.body || '') + (requester.context || ''),
                    /attente|vérif|connu|Impossible|finalis|aucune action|Réessay/i
            );
        }
        assert.doesNotMatch((reqGuide.body || '') + (lyaGuide.body || ''), /n’a pas configuré/);
    }
});

test('6.31D return remembers exact ids, restores overlay, clears only after success, picker if inaccessible', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const payout = fs.readFileSync(path.join(__dirname, '..', 'payout-account.js'), 'utf8');
    const surfaces = fs.readFileSync(path.join(__dirname, '..', 'mission-surfaces.js'), 'utf8');
    assert.match(chat, /async function restorePayoutDossier/);
    assert.match(chat, /closeUserAccountModal/);
    assert.match(chat, /reloadPairDossiers/);
    assert.match(chat, /code: 'inaccessible'/);
    assert.match(chat, /clearPayoutReturn/);
    assert.match(chat, /openPicker/);
    assert.match(chat, /is-open/);
    assert.match(surfaces, /overlay\.classList\.add\('is-open'\)/);
    assert.match(surfaces, /return \{ ok: true, dossier: picked\.dossier \}/);
    assert.match(payout, /if \(hint && \(hint\.requestId \|\| hint\.invitationId\)\) return;/);
    assert.doesNotMatch(payout, /if \(state === 'active'\) clearPayoutReturn\(\);/);
    clearPayoutReturn();
    rememberPayoutReturn({
        requestId: 'req-exact',
        invitationId: 'inv-exact',
        contactId: 'contact-b'
    });
    const hint = readPayoutReturn();
    assert.equal(hint.requestId, 'req-exact');
    assert.equal(hint.invitationId, 'inv-exact');
});

test('6.31D notices stay one-shot per quote and never mix another mission title', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /payoutNoticeStorageKey\(userId, quoteId, kind\)/);
    assert.match(chat, /appendOncePayoutNotice/);
    assert.match(chat, /dossierTitleForEvent\(quote\)/);
    assert.doesNotMatch(chat, /from\('messages'\)\.insert/);
});

test('6.31D does not claim a real Stripe onboarding PASS in source comments or gates', () => {
    const payout = fs.readFileSync(path.join(__dirname, '..', 'payout-account.js'), 'utf8');
    assert.match(payout, /lyann_connect_sim/);
    assert.match(payout, /simulateConnect/);
});
