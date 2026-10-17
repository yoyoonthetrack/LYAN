'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dossier = require('../mission-dossier.js');
const payment = require('../quote-payment-eligibility.js');

const fuite = {
    id: 'd2d54d73-68ac-467c-a753-85cbd2c88018',
    status: 'ACCEPTED',
    requester_id: 'A',
    provider_id: 'B',
    total_amount: 100,
    mission_id: 'm1',
    mission_status: 'AGREED',
    request_id: '13e088a4-6a14-4539-b009-e174b440bd45',
    request_title: 'Fuite voiture essence',
    milestones: [{ id: 'ms1', title: 'réaparation', amount: 100, status: 'PENDING' }],
    payments: []
};

test('6.31 accepted 100€ requester gets pay only when payout is known active', () => {
    const active = payment.missionCard(fuite, 'A', 'active');
    const unknown = payment.missionCard(fuite, 'A', 'unknown');
    const provider = payment.missionCard(fuite, 'B', 'active');
    assert.equal(active.primaryAction && active.primaryAction.id, 'pay');
    assert.equal((unknown.actions || []).some((action) => action.id === 'pay'), false);
    assert.equal((provider.actions || []).some((action) => action.id === 'pay'), false);
    assert.match(provider.context, /demandeur/);
});

test('6.31 nextActionLabel never substitutes a fake pay or open-dossier CTA', () => {
    assert.equal(dossier.nextActionLabel('quote_accepted', 'requester'), '');
    assert.equal(dossier.nextActionLabel('quote_accepted', 'lyanneur'), '');
    assert.equal(dossier.nextActionLabel('done', 'requester'), '');
    assert.equal(dossier.nextActionLabel('quote_accepted', 'requester', { milestones: [{ status: 'PENDING' }] }), 'Sécuriser le paiement');
    assert.equal(dossier.nextActionLabel('in_progress', 'lyanneur', { milestones: [{ status: 'FUNDED' }] }), 'Déclarer la prestation terminée');
    assert.equal(dossier.nextActionLabel('in_progress', 'requester', { milestones: [{ status: 'COMPLETED' }] }), 'Valider la prestation');
    assert.doesNotMatch(dossier.nextActionLabel('discussing', 'lyanneur'), /Ouvrir le dossier|Paiement dans le dossier/);
});

test('6.31 explainNextStep distinguishes missing milestone from authorized pay', () => {
    const withView = dossier.explainNextStep({
        roleCode: 'requester',
        quote: fuite,
        view: payment.missionCard(fuite, 'A', 'active')
    });
    assert.match(withView, /Sécurisez le paiement/);
    const noMilestone = dossier.explainNextStep({
        roleCode: 'requester',
        quote: Object.assign({}, fuite, { milestones: [] })
    });
    assert.match(noMilestone, /jalon de paiement n’est pas encore disponible/);
    const lyanneur = dossier.explainNextStep({
        roleCode: 'lyanneur',
        quote: fuite,
        view: payment.missionCard(fuite, 'B', 'active')
    });
    assert.match(lyanneur, /En attente du paiement du demandeur/);
});

test('6.31 source hydrates quotes, waits for payout, and does not guess old event dossiers', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const repo = fs.readFileSync(path.join(__dirname, '..', 'messaging-repository.js'), 'utf8');
    assert.match(chat, /enrichQuotes/);
    assert.match(chat, /ensurePayoutReadiness\(providerId\)/);
    assert.match(chat, /function paintPendingActionBanner/);
    assert.match(chat, /Voir le dossier/);
    assert.doesNotMatch(chat, /activeDossier && currentChatContact\.activeDossier\.title/);
    assert.doesNotMatch(chat, /dossier\.nextAction \|\| 'Le chat reste disponible/);
    assert.match(repo, /enrichQuotes/);
    assert.doesNotMatch(repo, /Plusieurs demandes/);
});
