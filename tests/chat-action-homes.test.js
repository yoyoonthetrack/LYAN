'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const {
    missionCard,
    missionBoard,
    missionPhase
} = require('../quote-payment-eligibility.js');

const requester = 'req-1';
const provider = 'prov-1';

function quote(overrides = {}) {
    return Object.assign({
        id: 'quote-1',
        status: 'ACCEPTED',
        description: 'Tonte',
        total_amount: 50,
        requester_id: requester,
        provider_id: provider,
        mission_id: 'mission-1',
        milestones: [{ id: 'ms-1', title: 'Travail', amount: 50, status: 'PENDING' }],
        created_at: '2026-10-01T10:00:00Z'
    }, overrides);
}

function chatSource() {
    return fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
}

function sliceBetween(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + 1);
    assert.ok(from >= 0, 'missing start: ' + start);
    assert.ok(to > from, 'missing end after start: ' + end);
    return source.slice(from, to);
}

test('E2: indispensable deal actions stay on missionCard for both roles', () => {
    const sent = missionCard(quote({ status: 'SENT', mission_id: null }), requester, 'active');
    assert.deepEqual(sent.actions.map((a) => a.id), ['accept', 'decline']);

    const waitingProvider = missionCard(quote({ status: 'SENT', mission_id: null }), provider, 'active');
    assert.equal(waitingProvider.actions.length, 0);

    const pay = missionCard(quote(), requester, 'active');
    assert.equal(pay.actions[0].id, 'pay');
    assert.equal(missionCard(quote(), provider, 'active').actions.some((a) => a.id === 'pay'), false);

    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    assert.equal(missionCard(funded, provider, 'active').actions[0].id, 'done');
    assert.equal(missionCard(funded, requester, 'active').actions.length, 0);

    const done = quote();
    done.milestones[0].status = 'COMPLETED';
    assert.equal(missionCard(done, requester, 'active').actions[0].id, 'release');
    assert.equal(missionCard(done, provider, 'active').actions.length, 0);

    const released = quote();
    released.milestones[0].status = 'RELEASED';
    assert.equal(missionPhase(released), 'closed');
    assert.equal(missionCard(released, requester, 'active').actions.length, 0);
    assert.equal(missionBoard([released]).active.length, 0);
});

test('E2: chat-logic keeps revise + deal CTAs only on missionCard / ActionPanel bind path', () => {
    const source = chatSource();
    const renderMission = sliceBetween(source, 'function renderMissionCard', 'function bindMissionAction');
    const bind = sliceBetween(source, 'function bindMissionAction', 'function renderMissionHistory');
    assert.match(source, /function renderActionPanelShell/);
    assert.match(renderMission, /action\.id === 'revise'|id: 'revise'/);
    assert.match(renderMission, /Modifier le devis/);
    assert.match(bind, /action\.id === 'accept'/);
    assert.match(bind, /action\.id === 'decline'/);
    assert.match(bind, /action\.id === 'revise'/);
    assert.match(bind, /action\.id === 'pay'/);
    assert.match(bind, /MARK_DONE/);
    assert.match(bind, /CONFIRM_DONE/);
    assert.match(bind, /openQuoteRevision/);
});

test('E2: live quote cards no longer emit deal CTAs', () => {
    const source = chatSource();
    const live = sliceBetween(source, 'function appendLiveQuoteCard', 'realQuotes.forEach((quote) => timelineQuotes.set');
    assert.equal(/handleAcceptQuote/.test(live), false);
    assert.equal(/handleRejectQuote/.test(live), false);
    assert.equal(/data-quote-pay/.test(live), false);
    assert.equal(/data-quote-mark-done/.test(live), false);
    assert.equal(/data-quote-confirm/.test(live), false);
    assert.equal(/appendPayoutPrompt\(quoteDiv/.test(live), false);
    assert.match(live, /informational/);
    assert.match(live, /Répondez via le suivi de mission|En attente de validation/);
});

test('E2: timeline quote / funding cards stay informational without deal CTAs', () => {
    const source = chatSource();
    const timeline = sliceBetween(source, 'function renderTimelineCard', 'async function refreshOpenBusinessCards');
    const quoteBranch = timeline.slice(
        timeline.indexOf("type === 'quote_created'"),
        timeline.indexOf("type === 'milestone_completed'")
    );
    assert.equal(/handleAcceptQuote/.test(quoteBranch), false);
    assert.equal(/handleRejectQuote/.test(quoteBranch), false);
    assert.equal(/openQuoteRevision/.test(quoteBranch), false);
    assert.equal(/appendPayableQuoteAction/.test(quoteBranch), false);
    assert.equal(/appendPayoutPrompt/.test(quoteBranch), false);
    assert.match(quoteBranch, /informational|suivi de mission|Devis en attente/);

    const funding = sliceBetween(source, 'function appendFundingAction', 'function repaintFundingCards');
    assert.equal(/handleChatAction/.test(funding), false);
    assert.equal(/btn-primary/.test(funding), false);
    assert.match(funding, /missionCard/);
});

test('E1 preserved: quote context stays request-scoped', () => {
    const source = chatSource();
    assert.match(source, /function threadQuoteContextOptions/);
    assert.match(source, /getQuoteContext\(getMyId\(\), contact\.id, threadQuoteContextOptions/);
    const revision = fs.readFileSync(path.join(__dirname, '../quote-revision.js'), 'utf8');
    assert.match(revision, /function resolveQuoteContextSelection/);
    const repo = fs.readFileSync(path.join(__dirname, '../messaging-repository.js'), 'utf8');
    assert.match(repo, /resolveQuoteContextSelection/);
});

test('E2: finished / wrong-request deals do not keep an active CTA board', () => {
    const finished = quote({ id: 'done', milestones: [{ id: 'ms', status: 'RELEASED', amount: 10 }] });
    assert.equal(missionBoard([finished]).active.length, 0);
    const otherAnnonce = quote({ id: 'other', status: 'SENT', mission_id: null, request_id: 'annonce-b' });
    const board = missionBoard([finished, otherAnnonce]);
    assert.deepEqual(board.active.map((q) => q.id), ['other']);
    assert.equal(missionCard(finished, requester, 'active').actions.length, 0);
});
