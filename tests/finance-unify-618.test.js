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

test('6.18 engines stay off', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(preTransferRefundExecutionEnabled(), false);
});
