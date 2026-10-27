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
    isVisibleDealNotice,
    quoteDeclineCopy,
    nextFundingAction,
    providerFundsSecuredNote,
    missionCard,
    quoteReview,
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

test('an unfinished Stripe intent can be reopened by the requester', () => {
    const started = quote({
        payments: [{ id: 'pay-1', milestone_id: 'milestone-1', payment_status: 'CREATED' }]
    });
    const view = missionCard(started, requester, 'active');
    assert.equal(view.primaryAction && view.primaryAction.label, 'Finaliser le paiement');
    assert.equal(view.primaryAction.milestoneId, 'milestone-1');
    assert.equal(missionCard(started, provider, 'active').actions.length, 0);
});

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
    assert.match(source, /type === 'quote_accepted'/);
    assert.match(source, /repaintQuoteTimelineCards\(box\)/);
    // E2: pay / done CTAs live on missionCard (bindMissionAction), not timeline / live quote.
    assert.match(source, /payMissionPayload\(quote/);
    assert.match(source, /action\.id === 'pay'/);
    assert.equal(source.includes("'/v1/payments/create-intent'"), false);
    assert.equal(source.includes('"/v1/payments/create-intent"'), false);
    assert.match(source, /type === 'milestone_completed'/);
    assert.match(source, /appendFundingAction\(body\)/);
    assert.match(source, /MARK_DONE \/ CONFIRM_DONE live only on missionCard/);
});

test('closed deals are not painted as deal-recap cards stuck at the bottom', () => {
    const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    const paint = source.slice(source.indexOf('function paintDealRecaps'), source.indexOf('function watchPayoutReadiness'));
    const insert = source.slice(source.indexOf('function insertDealRecapCard'), source.indexOf('function paintDealRecaps'));
    // Closed-only / server-empty: strip active ActionPanel. softEmpty protects mid-switch local paints.
    assert.match(paint, /Closed-only \/ server-confirmed empty: strip leftover active recap/);
    assert.match(paint, /opts\.softEmpty/);
    assert.equal(paint.includes('(board.history || []).forEach'), false);
    assert.match(paint, /renderMissionHistory\(board\.history\)/);
    assert.match(paint, /if \(!board\.active\.length\)/);
    assert.match(paint, /existingRecaps\.forEach\(\(node\) => node\.remove\(\)\)/);
    // Unseated non-focus cards must never fall through to appendChild.
    assert.match(insert, /if \(card\.dataset\.missionFocus === '1'\) box\.appendChild\(card\);/);
    assert.equal(/\n\s*box\.appendChild\(card\);\n\}/.test(insert), false);
    assert.match(source, /function threadDealIsFinished/);
    assert.match(source, /hideChatMissionChrome\(\)/);
    assert.match(source, /quoteIsClosedDeal\(q\)/);
});

test('deal steps collapse into one recap instead of a stack of cards', () => {
    const hidden = hiddenTimelineTypes([], [quote()]);
    assert.equal(hidden.has('quote_accepted'), false);
    assert.equal(hidden.has('payment_requested'), true);
    assert.equal(hidden.has('payment_secured'), false);
    assert.equal(hidden.has('milestone_completed'), false);
    assert.equal(hidden.has('funds_released'), false);
    assert.equal(hiddenTimelineTypes([], [quote({ status: 'SENT' })]).has('quote_created'), false);
    assert.equal(hiddenTimelineTypes([], [quote({ status: 'REJECTED' })]).has('quote_declined'), false);
    assert.equal(isVisibleDealNotice('quote_declined'), true);
    assert.equal(isVisibleDealNotice('quote_created'), true);
    assert.equal(isVisibleDealNotice('quote_accepted'), true);
    assert.equal(isVisibleDealNotice('payment_secured'), true);
    assert.equal(isVisibleDealNotice('milestone_completed'), true);
    assert.equal(isVisibleDealNotice('funds_released'), true);
    const validated = quote();
    validated.milestones[0].status = 'VALIDATED';
    const waiting = missionCard(validated, requester, 'active');
    assert.equal(waiting.closed, false);
    assert.equal(waiting.phase, 'validation');
    assert.equal(waiting.primaryAction, null);
    const released = quote();
    released.milestones[0].status = 'RELEASED';
    assert.equal(missionCard(released, requester, 'active').closed, true);
    assert.equal(hiddenTimelineTypes([], []).has('quote_created'), false);
    const declined = quoteDeclineCopy({ total_amount: 120, provider_id: 'prov-1' }, 'prov-1');
    assert.equal(declined.headline, 'Le devis de 120 € a été refusé.');
    assert.equal(declined.next, 'Vous pouvez envoyer une nouvelle proposition.');
    assert.equal(quoteDeclineCopy({ total_amount: 120, provider_id: 'prov-1' }, 'req-1').next, '');
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
    assert.deepEqual(closedOnly.active.map((item) => item.id), []);
    assert.deepEqual(closedOnly.history.map((item) => item.id), ['done']);
    // Closed deals must not be re-promoted into active (no bottom CTA / Suivi chrome).
    assert.equal(closedOnly.active.length, 0);
    assert.equal(missionBoard([finished, refused]).active.length, 0);
    const mixedClosedOpen = missionBoard([finished, openMission]);
    assert.deepEqual(mixedClosedOpen.active.map((item) => item.id), ['job-a']);
    assert.ok(mixedClosedOpen.history.some((item) => item.id === 'done'));
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
    assert.deepEqual(sent.actions.map((action) => action.label), ['Voir le devis']);
    assert.equal(sent.actions.some((action) => action.id === 'accept'), false);
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

test('a received quote is opened before it can be signed', () => {
    const sent = quote({
        status: 'SENT',
        mission_id: null,
        description: 'Taille de la haie',
        total_amount: 40,
        version: 2,
        valid_until: '2026-11-02T00:00:00Z',
        milestones: [{ id: 'a', title: 'Taille', description: 'Façade', amount: 40, status: 'PENDING', display_order: 1 }]
    });
    const card = missionCard(sent, requester, 'active');
    assert.deepEqual(card.actions.map((action) => action.id), ['view']);
    assert.equal(card.primaryAction.label, 'Voir le devis');
    const review = quoteReview(sent, requester);
    assert.equal(review.acceptsOnOpen, false);
    assert.equal(review.canAccept, true);
    assert.equal(review.acceptLabel, 'Signer et accepter le devis');
    assert.equal(review.prestation, 'Taille de la haie');
    assert.equal(review.amount, '40 €');
    assert.equal(review.milestones[0].title, 'Taille');
    assert.equal(review.milestones[0].detail, 'Façade');
    assert.match(review.conditions, /02\/11\/2026/);
    assert.match(review.conditions, /Version 2/);
    assert.equal(quoteReview(sent, provider).canAccept, false);
    const accepted = quoteReview(Object.assign({}, sent, { status: 'ACCEPTED' }), requester);
    assert.equal(accepted.canAccept, false);
    assert.equal(accepted.acceptLabel, '');
    const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    const viewHandler = source.slice(source.indexOf("if (action.id === 'view')"), source.indexOf("if (action.id === 'accept')"));
    assert.equal(viewHandler.includes('handleAcceptQuote'), false);
    assert.match(source, /window\.openQuoteReview = function/);
    assert.match(source, /Signer et accepter le devis/);
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

test('a cancelled milestone does not invite a payment that cannot start', () => {
    const cancelled = quote();
    cancelled.status = 'ACCEPTED';
    cancelled.milestones[0].status = 'CANCELLED';
    const view = missionCard(cancelled, requester, 'active');
    assert.equal(view.phase, 'unavailable');
    assert.equal(view.actions.length, 0);
    assert.equal(view.primaryAction, null);
    assert.match(view.context, /n’est plus disponible/);
    assert.doesNotMatch(view.context, /sécuriser le paiement/i);
});
