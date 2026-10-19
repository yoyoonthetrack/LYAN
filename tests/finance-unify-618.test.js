'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../finance-policy-ui');
const {
    postTransferFinancialExecutionEnabled,
    preTransferRefundExecutionEnabled
} = require('../api/stripe-policy');

test('6.18 labels distinguish transfer from bank payout', () => {
    const view = policy.classifyFinanceDisplay({
        payment: { id: 'p', payment_status: 'SUCCEEDED', transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_x' },
        milestone: { status: 'RELEASED' }
    });
    assert.equal(policy.fundLabel(view.code), 'Transfer Stripe créé — versement bancaire non confirmé');
    assert.match(policy.policyCopy(view.code), /ne confirme pas un virement bancaire/);
});

test('6.18 compact strip does not invent protection fees from a quote', () => {
    const html = policy.renderCompactStrip({
        demo: false,
        quote: { status: 'ACCEPTED', total_amount: 42 },
        payment: {},
        milestone: {},
        mission: { status: 'AGREED' }
    });
    assert.match(html, /Devis accepté/);
    assert.match(html, /Frais de protection : non calculés ici/);
    assert.doesNotMatch(html, /1,49/);
});

test('mission tracking copy is a readable next step, not the compact finance dump', () => {
    const html = policy.renderMissionTracking({
        demo: false,
        quote: { status: 'ACCEPTED', description: 'tggyhy', total_amount: 100 },
        payment: {},
        milestone: { status: 'PENDING' },
        mission: { status: 'AGREED', title: 'une aide ménagère' }
    });
    assert.match(html, /tggyhy/);
    assert.match(html, /sécuriser le paiement/);
    assert.match(html, /Devis/);
    assert.doesNotMatch(html, /Montants indisponibles/);
    assert.doesNotMatch(html, /Rien n’est inventé/);
});

test('6.18 mission buckets', () => {
    assert.equal(policy.missionBucket({ status: 'DISPUTED' }), 'dispute');
    assert.equal(policy.missionBucket({ status: 'CANCELLED' }), 'cancelled');
    assert.equal(policy.missionBucket({ status: 'COMPLETED' }), 'done');
    assert.equal(policy.missionBucket({ status: 'IN_PROGRESS' }), 'active');
    assert.equal(policy.missionBucket({ status: 'PENDING' }), 'pending');
});

test('6.18 chat uses compact strip and keeps historic hide helper', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /function attachChatFinanceStrip/);
    assert.match(chat, /function hideChatMissionChrome/);
    assert.match(chat, /threadDealIsFinished/);
    assert.match(chat, /hideChatFinanceStrip\(\);/);
    assert.doesNotMatch(chat, /attachChatFinanceStrip\(banner, financeRowFromThread/);
    const activity = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.match(activity, /openMissionFromActivity/);
    assert.match(activity, /__lyannMissionBucket/);
    const policySrc = fs.readFileSync(path.join(__dirname, '..', 'finance-policy-ui.js'), 'utf8');
    assert.match(policySrc, /function renderMissionTracking/);
    assert.match(chat, /renderMissionTracking/);
    assert.doesNotMatch(activity, /payment-portal.html#\/finance/);
});

test('6.18 portal no longer mounts a parallel lab by default', () => {
    const portal = fs.readFileSync(path.join(__dirname, '..', 'payment-portal.html'), 'utf8');
    assert.match(portal, /financeLab=1/);
    assert.match(portal, /Mes missions/);
    const shared = fs.readFileSync(path.join(__dirname, '..', 'shared-html-build.js'), 'utf8');
    assert.match(shared, /finance-policy-ui\.js/);
    assert.match(shared, /finance-desk\.css/);
});

test('phase 7 ledger keeps gains and expenses on one account without a net balance', () => {
    const me = 'user-1';
    const lines = policy.ledgerLines(me, [
        { id: 'p1', requester_id: 'other', provider_id: me, payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION', service_amount_cents: 1800, provider_fee_cents: 54, provider_net_cents: 1746 },
        { id: 'p1', requester_id: 'other', provider_id: me, payment_status: 'SUCCEEDED', provider_net_cents: 1 },
        { id: 'p2', requester_id: me, provider_id: 'other', payment_status: 'SUCCEEDED', service_amount_cents: 1800, customer_fee_cents: 149, customer_total_cents: 1949 },
        { id: 'p3', requester_id: 'stranger', provider_id: 'nope', payment_status: 'SUCCEEDED', customer_total_cents: 100 }
    ]);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].kind, 'gain');
    assert.equal(lines[0].label, 'À recevoir — versement pas encore confirmé');
    assert.equal(lines[1].kind, 'expense');
    assert.equal(lines[1].label, 'Paiement sécurisé');
    assert.equal(lines[0].serviceCents, 1800);
    assert.equal(lines[0].netCents, 1746);
    assert.equal(lines[1].customerFeeCents, 149);
    assert.equal(lines[1].cents, 1949);
    assert.equal(typeof policy.netAvailableBalance, 'undefined');
    const refunded = policy.ledgerLines(me, [
        { id: 'r1', requester_id: me, provider_id: 'other', payment_status: 'REFUNDED', customer_total_cents: 4349 }
    ]);
    assert.equal(refunded[0].label, 'Remboursé');
    assert.match(policy.dossierMoney(me, refunded.map((line) => ({
        id: line.id,
        requester_id: me,
        provider_id: 'other',
        payment_status: 'REFUNDED',
        customer_total_cents: 4349
    }))), /Remboursé/);
});

test('dossier summary uses server cents and the role on that mission', () => {
    const quote = {
        requester_id: 'client',
        provider_id: 'helper',
        milestones: [
            { id: 'm1', title: 'Aide', amount: 18, status: 'COMPLETED' },
            { id: 'm2', title: 'Suite', amount: 12, status: 'PENDING' }
        ],
        payments: [{
            id: 'p1',
            milestone_id: 'm1',
            requester_id: 'client',
            provider_id: 'helper',
            payment_status: 'SUCCEEDED',
            transfer_status: 'PENDING_VALIDATION',
            service_amount_cents: 1800,
            customer_fee_cents: 149,
            customer_total_cents: 1949,
            provider_fee_cents: 54,
            provider_net_cents: 1746
        }]
    };
    const client = policy.dossierSummary('client', quote);
    assert.match(client, /payé 19,49 €/);
    assert.match(client, /frais 1,49 €/);
    assert.match(client, /Validation attendue/);
    assert.match(client, /pas encore payé/);
    const helper = policy.dossierSummary('helper', quote);
    assert.match(helper, /à recevoir 17,46 €/);
    assert.match(helper, /commission 0,54 €/);
    assert.doesNotMatch(helper, /Validation attendue/);
    assert.equal(policy.dossierSummary('stranger', quote), '');
});

test('fee forecast applies the 1.49 euro floor to each milestone', () => {
    const { calculateMilestonePricing } = require('../api/stripe-policy');
    [8, 12, 20, 30].forEach((amount) => {
        const shown = policy.forecastMilestoneCharge(amount);
        const server = calculateMilestonePricing(amount);
        assert.equal(shown.customerFeeCents, Number(server.customer_fee_cents));
        assert.equal(shown.customerTotalCents, Number(server.customer_total_cents));
        assert.equal(shown.providerNetCents, Number(server.provider_net_cents));
    });
    const quote = policy.forecastQuoteCharges([{ title: 'Taille', amount: 8 }, { title: 'Évacuation', amount: 12 }]);
    assert.equal(quote.customerFeeCents, 298);
    assert.equal(quote.customerTotalCents, 2298);
    assert.equal(quote.minimumCount, 2);
});

test('6.18 engines stay off', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(preTransferRefundExecutionEnabled(), false);
});
