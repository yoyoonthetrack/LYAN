'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const api = require('../mission-dossier.js');
const payment = require('../quote-payment-eligibility.js');

test('6.29 dossierActionIds follows existing métier, never mixes roles', () => {
    assert.deepEqual(api.dossierActionIds({
        roleCode: 'requester',
        quoteStatus: 'SENT',
        canPropose: true,
        cardActionIds: ['accept', 'decline']
    }), ['accept', 'decline']);

    assert.deepEqual(api.dossierActionIds({
        roleCode: 'lyanneur',
        quoteStatus: 'SENT',
        canPropose: true,
        reviseOk: true,
        cardActionIds: []
    }), ['revise']);

    assert.deepEqual(api.dossierActionIds({
        roleCode: 'lyanneur',
        quoteStatus: 'REJECTED',
        canPropose: true,
        cardActionIds: []
    }), ['propose']);

    assert.deepEqual(api.dossierActionIds({
        roleCode: 'requester',
        quoteStatus: 'REJECTED',
        canPropose: true,
        cardActionIds: []
    }), []);

    assert.deepEqual(api.dossierActionIds({
        roleCode: 'lyanneur',
        quoteStatus: '',
        canPropose: true,
        cardActionIds: []
    }), ['propose']);

    assert.deepEqual(api.dossierActionIds({
        roleCode: 'requester',
        quoteStatus: 'ACCEPTED',
        hasReportableMilestone: true,
        cardActionIds: ['pay']
    }), ['pay', 'report']);

    assert.deepEqual(api.dossierActionIds({
        roleCode: 'lyanneur',
        quoteStatus: 'ACCEPTED',
        hasReportableMilestone: true,
        cardActionIds: ['done']
    }), ['done']);
});

test('6.29 missionCard keeps pay/done/release on existing quote only', () => {
    const quote = {
        id: 'q',
        status: 'ACCEPTED',
        requester_id: 'A',
        provider_id: 'B',
        total_amount: 90,
        mission_status: 'AGREED',
        milestones: [{ id: 'm1', title: 'Jalon', amount: 90, status: 'PENDING' }]
    };
    const requester = payment.missionCard(quote, 'A', 'active', { requestId: 'R', requestTitle: 'T' });
    const lyanneur = payment.missionCard(quote, 'B', 'active', { requestId: 'R', requestTitle: 'T' });
    assert.equal(requester.actions.some((action) => action.id === 'pay'), true);
    assert.equal(requester.actions.some((action) => action.id === 'done'), false);
    assert.equal(lyanneur.actions.some((action) => action.id === 'pay'), false);
});

test('6.29 description is copied onto dossiers', () => {
    const rows = api.listDossiers({
        viewerId: 'A',
        conversationId: 'c',
        invitations: [{ id: 'inv', request_id: 'R1', requester_id: 'A', recipient_id: 'B', status: 'ACCEPTED', conversation_id: 'c' }],
        requests: [{ id: 'R1', title: 'Terrasse', description: 'Planches cassées', requester_id: 'A' }],
        quotes: [],
        missions: []
    });
    assert.equal(rows[0].description, 'Planches cassées');
});

test('6.29 source keeps architecture: no ActionPanel dump, no invented RPC', () => {
    const surfaces = fs.readFileSync(path.join(__dirname, '..', 'mission-surfaces.js'), 'utf8');
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(surfaces, /paintDossierActions/);
    assert.match(surfaces, /chat-dossier-sheet-desc/);
    assert.match(surfaces, /chat-mission-pick-status/);
    assert.match(chat, /function paintDossierActions/);
    assert.match(chat, /threadQuoteProposalGate/);
    assert.doesNotMatch(chat, /from\('quotes'\)\.insert/);
    assert.match(chat, /openMissionDossier\(\{[\s\S]*invitationId/);
});
