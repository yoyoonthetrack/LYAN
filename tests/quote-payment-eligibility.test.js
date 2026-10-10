'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    payableMilestoneForQuote,
    payButtonLabel,
    payMissionPayload,
    dispatchQuotePay,
    hiddenTimelineTypes,
    nextFundingAction,
    providerFundsSecuredNote,
    missionCard,
    missionBoard,
    dealRecap,
    quoteSettled,
    PAYMENT_ROUTE
} = require('../quote-payment-eligibility.js');

const requester = 'requester-a';
const provider = 'provider-b';

function quote(overrides = {}) {
    return {
        id: 'quote-1',
        status: 'ACCEPTED',
        requester_id: requester,
        provider_id: provider,
        mission_id: 'mission-1',
        mission_status: 'AGREED',
        description: 'Haie',
        payments: [],
        milestones: [{
            id: 'milestone-1',
            title: 'Prestation',
            status: 'PENDING',
            amount: 10
        }],
        ...overrides
    };
}

test('requester with an accepted pending milestone can pay', () => {
    const milestone = payableMilestoneForQuote(quote(), requester);
    assert.equal(milestone && milestone.id, 'milestone-1');
    assert.equal(payButtonLabel(milestone.amount), 'Payer & Bloquer (10 €)');
});

test('the provider never sees the payment action', () => {
    assert.equal(payableMilestoneForQuote(quote(), provider), null);
});

test('a mission that cannot be paid stays closed', () => {
    assert.equal(payableMilestoneForQuote(quote({ mission_status: 'CANCELLED' }), requester), null);
    assert.equal(payableMilestoneForQuote(quote({ mission_id: null }), requester), null);
    const knownOnlyById = quote();
    delete knownOnlyById.mission_status;
    assert.equal(payableMilestoneForQuote(knownOnlyById, requester).id, 'milestone-1');
});

test('a sent quote is not payable', () => {
    assert.equal(payableMilestoneForQuote(quote({ status: 'SENT' }), requester), null);
});

test('a funded milestone is not payable', () => {
    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    assert.equal(payableMilestoneForQuote(funded, requester), null);
});

test('a completed milestone is not payable', () => {
    const completed = quote();
    completed.milestones[0].status = 'COMPLETED';
    assert.equal(payableMilestoneForQuote(completed, requester), null);
});

test('a succeeded payment hides the button', () => {
    const paid = quote({
        payments: [{ milestone_id: 'milestone-1', payment_status: 'SUCCEEDED' }]
    });
    assert.equal(payableMilestoneForQuote(paid, requester), null);
});

test('a click dispatches one PAY_MISSION and never the legacy intent route', () => {
    const calls = [];
    const payload = dispatchQuotePay(quote(), requester, (action, mission) => calls.push({ action, mission }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'PAY_MISSION');
    assert.equal(payload.route, PAYMENT_ROUTE);
    assert.equal(payload.route, '/v1/payments/create-milestone-intent');
    assert.equal(payload.id, 'mission-1');
    assert.equal(payload.milestoneId, 'milestone-1');
    assert.equal(payload.agreed_price, 10);
    assert.equal(payload.route.includes('/v1/payments/create-intent'), false);
    assert.equal(payMissionPayload(quote(), quote().milestones[0]).action, 'PAY_MISSION');
});

test('the timeline card uses the same payment decision', () => {
    const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(source, /payableMilestoneForQuote\(quote, getMyId\(\)\)/);
    assert.match(source, /type === 'quote_accepted'/);
    assert.match(source, /repaintQuoteTimelineCards\(box\)/);
    assert.match(source, /dispatchQuotePay\(quote, getMyId\(\), \(action, payload\) => handleChatAction\(action, payload\)\)/);
    assert.equal(source.includes("'/v1/payments/create-intent'"), false);
    assert.equal(source.includes('"/v1/payments/create-intent"'), false);
    assert.match(source, /type === 'milestone_completed'/);
    assert.match(source, /appendFundingAction\(body\)/);
});

test('deal steps collapse into one recap instead of a stack of cards', () => {
    const hidden = hiddenTimelineTypes([], [quote()]);
    assert.equal(hidden.has('quote_accepted'), true);
    assert.equal(hidden.has('payment_requested'), true);
    assert.equal(hidden.has('payment_secured'), true);
    assert.equal(hidden.has('milestone_completed'), true);
    assert.equal(hiddenTimelineTypes([], [quote({ status: 'SENT' })]).has('quote_created'), true);
    assert.equal(hiddenTimelineTypes([], []).has('quote_created'), false);
    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    const lines = dealRecap(funded).lines.map((line) => line.label + ' ' + line.value);
    assert.equal(lines.includes('Devis Accepté'), true);
    assert.equal(lines.includes('Paiement Encaissé'), true);
    assert.equal(lines.includes('Versement Libéré'), false);
    funded.milestones[0].status = 'RELEASED';
    assert.equal(quoteSettled(funded.milestones), true);
    assert.equal(dealRecap(funded).lines.some((line) => line.value === 'Fermée'), true);
});

test('successive quotes keep one active card and do not mix two missions', () => {
    const refused = quote({ id: 'old', status: 'REJECTED', created_at: '2026-10-01T10:00:00Z', mission_id: null });
    const again = quote({ id: 'new', status: 'SENT', created_at: '2026-10-02T10:00:00Z', mission_id: null });
    const afterRefusal = missionBoard([refused, again]);
    assert.deepEqual(afterRefusal.active.map((item) => item.id), ['new']);
    assert.deepEqual(afterRefusal.history.map((item) => item.id), ['old']);
    const older = quote({ id: 'sent-1', status: 'SENT', created_at: '2026-10-01T10:00:00Z' });
    const newer = quote({ id: 'sent-2', status: 'SENT', created_at: '2026-10-03T10:00:00Z' });
    const proposals = missionBoard([older, newer]);
    assert.deepEqual(proposals.active.map((item) => item.id), ['sent-2']);
    assert.deepEqual(proposals.history.map((item) => item.id), ['sent-1']);
    const openMission = quote({ id: 'job-a', status: 'ACCEPTED', mission_id: 'mission-a', created_at: '2026-10-04T10:00:00Z' });
    const otherMission = quote({ id: 'job-b', status: 'ACCEPTED', mission_id: 'mission-b', created_at: '2026-10-05T10:00:00Z' });
    otherMission.milestones[0].status = 'FUNDED';
    const both = missionBoard([openMission, otherMission]);
    assert.deepEqual(both.active.map((item) => item.mission_id), ['mission-a', 'mission-b']);
    const finished = quote({ id: 'done', status: 'ACCEPTED', mission_id: 'mission-done', created_at: '2026-10-01T10:00:00Z' });
    finished.milestones[0].status = 'RELEASED';
    const closedOnly = missionBoard([finished]);
    assert.deepEqual(closedOnly.active.map((item) => item.id), ['done']);
    const providerCard = missionCard(openMission, provider, 'active');
    assert.equal(providerCard.actions.some((action) => action.id === 'pay' || action.id === 'release' || action.id === 'accept'), false);
    const requesterCard = missionCard(otherMission, requester, 'active');
    assert.equal(requesterCard.actions.some((action) => action.id === 'done' || action.id === 'setup'), false);
    const release = missionCard(Object.assign(quote(), { milestones: [{ id: 'c', status: 'COMPLETED', amount: 10 }] }), requester, 'active');
    assert.equal(release.actions[0].confirm, true);
    assert.equal(release.actions[0].id, 'release');
});

test('one mission card replaces the stack and keeps a single primary action', () => {
    const sent = missionCard(quote({ status: 'SENT', total_amount: 100, description: 'Haie' }), requester, 'active');
    assert.equal(sent.status, 'Devis reçu');
    assert.deepEqual(sent.actions.map((action) => action.label), ['Accepter le devis', 'Refuser']);
    const waiting = missionCard(quote({ status: 'SENT' }), provider, 'none');
    assert.equal(waiting.status, 'Devis envoyé');
    assert.equal(waiting.actions.length, 0);
    assert.match(waiting.context, /En attente de la réponse/);
    const blocked = missionCard(quote({ total_amount: 100 }), requester, 'none');
    assert.match(blocked.context, /compte de versement/);
    assert.equal(blocked.actions.length, 0);
    const pay = missionCard(quote({ total_amount: 100 }), requester, 'active');
    assert.equal(pay.status, 'Devis accepté');
    assert.equal(pay.actions.length, 1);
    assert.equal(pay.actions[0].label, 'Sécuriser le paiement');
    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    const doing = missionCard(funded, provider, 'active');
    assert.equal(doing.status, 'Paiement sécurisé');
    assert.equal(doing.actions[0].label, 'Déclarer la prestation terminée');
    assert.equal(missionCard(funded, requester, 'active').actions.length, 0);
    const done = quote();
    done.milestones[0].status = 'COMPLETED';
    const check = missionCard(done, requester, 'active');
    assert.equal(check.status, 'Prestation à valider');
    assert.equal(check.actions[0].confirm, true);
    const released = quote();
    released.milestones[0].status = 'RELEASED';
    const closed = missionCard(released, provider, 'active');
    assert.equal(closed.status, 'Prestation clôturée');
    assert.equal(closed.actions.length, 0);
    assert.match(closed.context, /compte de versement/);
    const two = quote({
        milestones: [
            { id: 'a', title: 'Un', status: 'FUNDED', amount: 10 },
            { id: 'b', title: 'Deux', status: 'PENDING', amount: 20 }
        ]
    });
    const mixed = missionCard(two, provider, 'active');
    assert.equal(mixed.actions.length, 1);
    assert.equal(mixed.details.find((line) => line.id === 'b').action, null);
});

test('secured funds tell the Lyanneur to meet the requester by name', () => {
    const lines = providerFundsSecuredNote('Yoann.D');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'Vous pouvez dès maintenant prendre rendez-vous avec Yoann.D afin d’effectuer votre mission.');
    assert.equal(lines[1], 'Une fois votre mission réalisée, Yoann.D libèrera vos fonds, qui vous seront versés immédiatement.');
    assert.match(lines[2], /^Nous comptons sur vous/);
    const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(source, /type === 'payment_requested'/);
    assert.match(source, /providerFundsSecuredNote/);
    const requested = source.slice(source.indexOf("type === 'payment_requested'"), source.indexOf("type === 'payment_secured'"));
    assert.equal(requested.includes('meta.status'), false);
});

test('release is offered to the requester only after the work is declared done', () => {
    const funded = quote();
    funded.milestones[0].status = 'FUNDED';
    assert.equal(nextFundingAction(funded, requester).action, null);
    assert.equal(nextFundingAction(funded, provider).action, 'MARK_DONE');
    assert.equal(nextFundingAction(funded, provider).label, 'J’ai terminé');
    const done = quote();
    done.milestones[0].status = 'COMPLETED';
    const release = nextFundingAction(done, requester);
    assert.equal(release.action, 'CONFIRM_DONE');
    assert.equal(release.label, 'Libérer les fonds');
    assert.equal(nextFundingAction(done, provider).action, null);
});
