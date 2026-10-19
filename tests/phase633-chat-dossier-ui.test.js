'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dossier = require('../mission-dossier.js');
const payment = require('../quote-payment-eligibility.js');

const ROOT = path.join(__dirname, '..');

function src(name) {
    return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

const pendingQuote = {
    id: 'q-sent',
    status: 'SENT',
    requester_id: 'A',
    provider_id: 'B',
    total_amount: 80,
    request_id: 'req-1',
    request_title: 'Réparation fuite',
    milestones: [{ id: 'ms1', title: 'Travaux', amount: 80, status: 'PENDING' }],
    payments: []
};

const acceptedQuote = {
    id: 'q-acc',
    status: 'ACCEPTED',
    requester_id: 'A',
    provider_id: 'B',
    total_amount: 100,
    mission_id: 'm1',
    mission_status: 'AGREED',
    request_id: 'req-2',
    request_title: 'Fuite voiture essence',
    milestones: [{ id: 'ms2', title: 'réaparation', amount: 100, status: 'PENDING' }],
    payments: []
};

test('6.33 business gates stay on missionCard and dossierActionIds', () => {
    const requesterPending = payment.missionCard(pendingQuote, 'A', 'active');
    const providerPending = payment.missionCard(pendingQuote, 'B', 'active');
    assert.equal(requesterPending.primaryAction && requesterPending.primaryAction.id, 'accept');
    assert.equal((providerPending.actions || []).some((action) => action.id === 'accept'), false);
    assert.equal(payment.quoteNeedsViewerAction(pendingQuote, 'A', 'active'), true);
    assert.equal(payment.quoteNeedsViewerAction(pendingQuote, 'B', 'active'), false);

    const pay = payment.missionCard(acceptedQuote, 'A', 'active');
    const lyanneur = payment.missionCard(acceptedQuote, 'B', 'active');
    assert.equal(pay.primaryAction && pay.primaryAction.id, 'pay');
    assert.equal((lyanneur.actions || []).some((action) => action.id === 'pay'), false);

    const ids = dossier.dossierActionIds({
        roleCode: 'lyanneur',
        quoteStatus: '',
        canPropose: true,
        cardActionIds: []
    });
    assert.ok(ids.includes('propose'));
    const requesterIds = dossier.dossierActionIds({
        roleCode: 'requester',
        quoteStatus: 'SENT',
        canPropose: false,
        cardActionIds: ['accept', 'decline']
    });
    assert.ok(requesterIds.includes('accept'));
    assert.equal(requesterIds.includes('propose'), false);
});

test('6.33 chat keeps todo actions visible and offers quote buttons on the thread', () => {
    const chat = src('chat-logic.js');
    assert.match(chat, /Vos actions à faire/);
    assert.match(chat, /chat-todo-panel/);
    assert.match(chat, /function pendingActionCopy/);
    assert.match(chat, /openMissionDossier\(\{\s*requestId: row\.dossier\.requestId/);
    assert.match(chat, /Demander un devis/);
    assert.match(chat, /Proposer un devis/);
    assert.match(chat, /Bravo pour ce beau Lyannage ! Vous êtes de vrais Lyanneurs\./);
    assert.doesNotMatch(chat.slice(chat.indexOf('function paintPendingActionBanner'), chat.indexOf('window.paintPendingActionBanner')), /bindMissionAction|checkout|stripe/i);
    assert.doesNotMatch(chat.slice(chat.indexOf('function paintPendingActionBanner'), chat.indexOf('window.paintPendingActionBanner')), /createElement\('details'\)/);
    assert.match(chat, /chat-notice-compact/);
    assert.doesNotMatch(chat, /Payer dans le dossier/);
    assert.match(chat, /button\.textContent = 'Voir le dossier'/);
    assert.doesNotMatch(chat, /activeDossier && currentChatContact\.activeDossier\.title/);
});

test('6.33 dossier sheet is a visual card with next-step box', () => {
    const surfaces = src('mission-surfaces.js');
    const css = src('style.css');
    assert.match(surfaces, /chat-dossier-card-head/);
    assert.match(surfaces, /Prochaine étape/);
    assert.match(surfaces, /Historique et jalons/);
    assert.match(surfaces, /Missions \('/);
    assert.match(css, /chat-todo-panel/);
    assert.match(css, /chat-dossier-next/);
    assert.match(css, /chat-notice-compact/);
    assert.match(css, /chat-header-info[\s\S]{0,180}flex-direction:\s*row/);
});

test('6.33 compact event still uses exact dossier match, never last opened', () => {
    const chat = src('chat-logic.js');
    const start = chat.indexOf('function resolveChatEventDossier');
    const end = chat.indexOf('function viewerMaySeeQuoteAmount');
    const fn = chat.slice(start, end);
    assert.match(fn, /resolveEventDossier/);
    assert.doesNotMatch(fn, /activeDossier/);
    assert.doesNotMatch(fn, /lastOpened/);
});
