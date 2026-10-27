'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const {
    missionCard,
    actionPanel,
    actionPanelNeutral,
    missionBoard,
    missionPhase,
    dealTypeOf,
    quoteNeedsViewerAction
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
        request_id: 'annonce-a',
        request_title: 'Taille de haie',
        mission_id: 'mission-1',
        payments: [],
        milestones: [{ id: 'ms-1', title: 'Travail', amount: 50, status: 'PENDING' }],
        created_at: '2026-10-01T10:00:00Z'
    }, overrides);
}

function chatSource() {
    return fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
}

function assertPrimary(view, id) {
    assert.ok(view);
    assert.equal(view.primaryAction && view.primaryAction.id, id);
    assert.equal(view.actions.filter((a) => a.tone !== 'secondary').length, 1);
}

test('E3: actionPanel aliases missionCard and exposes annonce + deal type', () => {
    assert.equal(actionPanel, missionCard);
    const direct = missionCard(quote(), requester, 'active');
    assert.equal(dealTypeOf(quote()), 'tarif_direct');
    assert.equal(direct.dealType, 'tarif_direct');
    assert.equal(direct.dealTypeLabel, 'Tarif Direct');
    assert.equal(direct.annonceTitle, 'Taille de haie');
    assert.equal(direct.requestId, 'annonce-a');
    assert.equal(direct.panelKind, 'action');
    assert.equal(direct.mode, 'active');

    const jalons = quote({
        milestones: [
            { id: 'a', title: 'Un', amount: 20, status: 'PENDING' },
            { id: 'b', title: 'Deux', amount: 30, status: 'PENDING' }
        ]
    });
    assert.equal(dealTypeOf(jalons), 'jalons');
    assert.equal(missionCard(jalons, requester, 'active').dealTypeLabel, 'Devis par jalons');
});

test('E3 matrix: demandeur × état → primary action', () => {
    const sent = missionCard(quote({ status: 'SENT', mission_id: null }), requester, 'active');
    assert.equal(sent.phase, 'devis');
    assert.equal(sent.actorToAct, 'requester');
    assert.equal(sent.actorLabel, 'À vous d’agir');
    assertPrimary(sent, 'view');
    assert.equal(sent.secondaryActions.length, 0);

    const pay = missionCard(quote(), requester, 'active');
    assert.equal(pay.status, 'Devis accepté');
    assert.equal(pay.actorToAct, 'requester');
    assertPrimary(pay, 'pay');

    const initiated = quote({
        payments: [{ milestone_id: 'ms-1', payment_status: 'REQUIRES_ACTION' }]
    });
    const paying = missionCard(initiated, requester, 'active');
    assert.equal(paying.status, 'Paiement en cours');
    assert.equal(paying.paymentInFlight, true);
    assert.equal(paying.actions.length, 0);
    assert.equal(paying.primaryAction, null);

    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    const waitWork = missionCard(funded, requester, 'active');
    assert.equal(waitWork.status, 'Paiement sécurisé');
    assert.equal(waitWork.actorToAct, 'provider');
    assert.equal(waitWork.actions.length, 0);

    const done = quote();
    done.milestones[0].status = 'COMPLETED';
    const release = missionCard(done, requester, 'active');
    assert.equal(release.status, 'Prestation à valider');
    assertPrimary(release, 'release');

    const released = quote();
    released.milestones[0].status = 'RELEASED';
    const closed = missionCard(released, requester, 'active');
    assert.equal(missionPhase(released), 'closed');
    assert.equal(closed.mode, 'history');
    assert.equal(closed.actions.length, 0);
    assert.equal(closed.primaryAction, null);
});

test('E3 matrix: Lyanneur × état → primary action', () => {
    const sent = missionCard(quote({ status: 'SENT', mission_id: null }), provider, 'active');
    assert.equal(sent.status, 'Devis envoyé');
    assert.equal(sent.actorToAct, 'requester');
    assert.equal(sent.primaryAction, null);
    assert.equal(sent.actions.length, 0);

    const revise = missionCard(quote({ status: 'SENT', mission_id: null }), provider, 'active', { reviseOk: true });
    assert.equal(revise.primaryAction, null);
    assert.equal(revise.secondaryActions[0].id, 'revise');
    assert.equal(quoteNeedsViewerAction(quote({ status: 'SENT', mission_id: null }), provider, 'active'), false);

    const waitPay = missionCard(quote(), provider, 'active');
    assert.equal(waitPay.actorToAct, 'requester');
    assert.equal(waitPay.actions.length, 0);

    const setup = missionCard(quote(), provider, 'none');
    assertPrimary(setup, 'setup');
    assert.equal(setup.actorToAct, 'provider');

    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    const doing = missionCard(funded, provider, 'active');
    assert.equal(doing.status, 'Paiement sécurisé');
    assertPrimary(doing, 'done');
    assert.equal(doing.actorToAct, 'provider');

    const done = quote();
    done.milestones[0].status = 'COMPLETED';
    const waiting = missionCard(done, provider, 'active');
    assert.equal(waiting.actorToAct, 'requester');
    assert.equal(waiting.actions.length, 0);
    assert.match(waiting.context, /validation/);

    const released = quote();
    released.milestones[0].status = 'RELEASED';
    assert.equal(missionCard(released, provider, 'active').actions.length, 0);
});

test('E3: Tarif Direct and Jalons both work without €200 gate', () => {
    const cheap = quote({ total_amount: 12, milestones: [{ id: 'ms-1', title: 'Forfait', amount: 12, status: 'PENDING' }] });
    assert.equal(missionCard(cheap, requester, 'active').primaryAction.id, 'pay');
    assert.equal(missionCard(cheap, requester, 'active').dealType, 'tarif_direct');

    const parts = quote({
        total_amount: 100,
        milestones: [
            { id: 'a', title: 'Un', amount: 40, status: 'FUNDED' },
            { id: 'b', title: 'Deux', amount: 60, status: 'PENDING' }
        ]
    });
    const providerView = missionCard(parts, provider, 'active');
    assert.equal(providerView.dealType, 'jalons');
    assertPrimary(providerView, 'done');
    assert.equal(providerView.primaryAction.milestoneId, 'a');
    // Requester can secure the next PENDING jalon; primary stays a single CTA.
    const requesterView = missionCard(parts, requester, 'active');
    assertPrimary(requesterView, 'pay');
    assert.equal(requesterView.primaryAction.milestoneId, 'b');
    assert.equal(requesterView.details.find((d) => d.id === 'b').paymentState, 'awaiting');
});

test('E3: multi-mission board keeps finished in history, active CTAs only on open deals', () => {
    const finished = quote({
        id: 'done',
        milestones: [{ id: 'ms', status: 'RELEASED', amount: 10, title: 'Fin' }]
    });
    const open = quote({ id: 'open', status: 'SENT', mission_id: null, request_id: 'annonce-b', request_title: 'Autre' });
    const board = missionBoard([finished, open]);
    assert.deepEqual(board.active.map((q) => q.id), ['open']);
    assert.ok(board.history.some((q) => q.id === 'done'));
    assert.equal(missionCard(finished, requester, 'active').mode, 'history');
    assert.equal(missionCard(finished, requester, 'active').actions.length, 0);
    assertPrimary(missionCard(open, requester, 'active'), 'view');
});

test('E3: neutral panels for ambiguous / loading / error have no CTAs', () => {
    ['ambiguous', 'loading', 'error', 'empty'].forEach((kind) => {
        const panel = actionPanelNeutral(kind);
        assert.equal(panel.mode, 'neutral');
        assert.equal(panel.panelKind, kind);
        assert.equal(panel.actions.length, 0);
        assert.equal(panel.primaryAction, null);
        assert.equal(panel.showSteps, false);
    });
    assert.match(actionPanelNeutral('ambiguous').context, /annonce/i);
});

test('E3: chat-logic wires ActionPanel shell + ambiguous neutral path; E1/E2 homes preserved', () => {
    const source = chatSource();
    assert.match(source, /function renderActionPanelShell/);
    assert.match(source, /function renderNeutralActionPanel/);
    assert.match(source, /chat-action-panel/);
    assert.match(source, /data-action-panel/);
    assert.match(source, /panel: 'ambiguous'/);
    assert.match(source, /function renderMissionCard/);
    assert.match(source, /function bindMissionAction/);
    assert.match(source, /function threadQuoteContextOptions/);
    assert.match(source, /getQuoteContext\(getMyId\(\), contact\.id, threadQuoteContextOptions/);
    assert.equal(/function appendLiveQuoteCard[\s\S]*?handleAcceptQuote/.test(source), false);
    const live = source.slice(source.indexOf('function appendLiveQuoteCard'), source.indexOf('realQuotes.forEach((quote) => timelineQuotes.set'));
    assert.equal(/data-quote-pay/.test(live), false);
    assert.match(live, /informational|Répondez via le suivi de mission/);
});

test('E5.1: empty thread still loads request-scoped quotes for ActionPanel (same path mobile/desktop)', () => {
    const source = chatSource();
    const emptyBranch = source.slice(
        source.indexOf('renderEmptyConversationState(container)'),
        source.indexOf('// Add Date Separator at top')
    );
    assert.match(emptyBranch, /empty chat text must not skip ActionPanel/);
    // E5.1 (fix): rebuild goes through the single generation/E1-scope guarded owner,
    // never a parallel pair-scoped fetch that can strip/overwrite the panel.
    assert.match(emptyBranch, /scheduleActionPanelRebuild\(container, hadActionPanel\)/);
    assert.doesNotMatch(emptyBranch, /getQuoteContext\(/);
    const owner = source.slice(source.indexOf('function scheduleActionPanelRebuild'), source.indexOf('async function renderMessages('));
    assert.match(owner, /panel: 'loading'/);
    assert.match(owner, /refreshDealContext\('render'\)/);
    assert.match(source, /panel: 'ambiguous'/);
    // Single ActionPanel home — no second mobile-only renderer.
    assert.equal((source.match(/function renderActionPanelShell/g) || []).length, 1);
    assert.equal((source.match(/function renderMissionCard/g) || []).length, 1);
    assert.doesNotMatch(source, /renderMobileActionPanel|ActionPanelMobile|desktopActionPanel/);
});

test('E5.1: thread-open rebuilds ActionPanel from server after context select', () => {
    const source = chatSource();
    assert.match(source, /refreshDealContext\('thread-open'\)/);
    assert.match(source, /noteDealContextConversation\(currentChatContact\)/);
    const paint = source.slice(source.indexOf('function paintDealRecaps'), source.indexOf('const payoutReadinessByUser'));
    assert.match(paint, /opts\.softEmpty/);
    assert.match(source, /softEmpty:\s*!current\.length/);
    assert.match(source, /mission_related_request_id/);
    const fromServer = source.slice(source.indexOf('async function paintDealContextFromServer'), source.indexOf('async function refreshDealContext'));
    assert.match(fromServer, /softEmpty: true/);
    assert.match(fromServer, /fromCache: true/);
    assert.match(fromServer, /panel: 'empty'/);
    assert.match(source, /dossier-switch/);
});

test('E5.1: payment-awaiting ACCEPTED stays on active ActionPanel board (history not active)', () => {
    const unpaid = quote();
    const board = missionBoard([unpaid]);
    assert.equal(board.active.length, 1);
    assert.equal(board.history.length, 0);
    assert.equal(missionPhase(unpaid), 'paiement');
    const view = missionCard(unpaid, requester, 'active');
    assert.ok(view);
    assert.equal(view.mode, 'active');
    assert.equal(view.phase, 'paiement');
    assert.equal(view.primaryAction && view.primaryAction.id, 'pay');

    const connectGate = missionCard(unpaid, requester, 'none');
    assert.ok(connectGate);
    assert.equal(connectGate.mode, 'active');
    assert.match(connectGate.context, /versement|paiement/i);
    assert.equal(connectGate.primaryAction, null);

    const finished = quote({
        id: 'closed',
        milestones: [{ id: 'ms-x', title: 'Travail', amount: 50, status: 'RELEASED' }]
    });
    const mixed = missionBoard([finished, unpaid]);
    assert.deepEqual(mixed.active.map((q) => q.id), ['quote-1']);
    assert.ok(mixed.history.some((q) => q.id === 'closed'));
    assert.equal(missionCard(finished, requester, 'active').mode, 'history');
});

test('E5.1: multi-request isolation keeps one active deal per request board', () => {
    const a = quote({ id: 'qa', request_id: 'annonce-a', mission_id: 'ma' });
    const b = quote({
        id: 'qb',
        request_id: 'annonce-b',
        mission_id: 'mb',
        description: 'Autre',
        milestones: [{ id: 'ms-b', title: 'Jalon', amount: 50, status: 'PENDING' }]
    });
    const boardA = missionBoard([a]);
    const boardB = missionBoard([b]);
    assert.deepEqual(boardA.active.map((q) => q.id), ['qa']);
    assert.deepEqual(boardB.active.map((q) => q.id), ['qb']);
    assert.notEqual(boardA.active[0].request_id, boardB.active[0].request_id);
    // Combined board may list both actives — E1 scoping filters before paint.
    const both = missionBoard([a, b]);
    assert.equal(both.active.length, 2);
    assert.equal(both.history.length, 0);
});
