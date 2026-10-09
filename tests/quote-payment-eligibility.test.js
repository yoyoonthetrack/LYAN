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
    assert.equal(hidden.has('payment_requested'), false);
    assert.equal(hidden.has('payment_secured'), false);
    assert.equal(hidden.has('milestone_completed'), true);
    assert.equal(hiddenTimelineTypes([], [quote({ status: 'SENT' })]).has('payment_requested'), false);
    assert.equal(hiddenTimelineTypes([], [quote({ status: 'SENT' })]).has('quote_created'), false);
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
