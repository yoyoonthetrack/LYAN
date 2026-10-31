'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    missionCard,
    quoteReview,
    payButtonLabel,
    payableMilestoneForQuote,
    milestoneStatusLabel
} = require('../quote-payment-eligibility.js');

function src(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('1. conversation action buttons order: propose/ask -> decision banner -> messages -> input', () => {
    const chat = src('chat-logic.js');
    
    // ensurePendingActionBanner inserts before thread (chatMessagesContainer)
    const ensureFn = chat.slice(chat.indexOf('function ensurePendingActionBanner'), chat.indexOf('function paintPendingActionBanner'));
    assert.match(ensureFn, /thread\.parentNode\.insertBefore\(bar,\s*thread\)/);
    assert.doesNotMatch(ensureFn, /area\.parentNode\.insertBefore\(bar,\s*area\)/);
    
    // paintChatPairButtons places Proposer un devis first, then Demander un devis
    const pairFn = chat.slice(chat.indexOf('function paintChatPairButtons'), chat.indexOf('function pendingActionCopy'));
    assert.match(pairFn, /row\.append\(offer,\s*ask\)/);
    assert.match(pairFn, /btn-chat-propose/);
    assert.match(pairFn, /btn-chat-ask/);
    assert.match(pairFn, /insertTarget\s*=\s*banner/);
});

test('2. button styling: propose is solid pastel green, ask is white with green border', () => {
    const css = src('style.css');
    
    assert.match(css, /\.chat-pair-actions \.btn-chat-propose\s*\{[\s\S]*?background:\s*#4A7C59/);
    assert.match(css, /\.chat-pair-actions \.btn-chat-ask\s*\{[\s\S]*?background:\s*#FFFFFF/);
    assert.match(css, /\.chat-pair-actions \.btn-chat-ask\s*\{[\s\S]*?border:\s*2px solid #4A7C59/);
    assert.match(css, /\.chat-todo-toggle-icon/);
    assert.match(css, /\.chat-todo-panel\.is-collapsed/);
});

test('3. milestone numbering: Paiement 1 sur 3, 2 sur 3, 3 sur 3 associated with name, amount, status', () => {
    const multiQuote = {
        id: 'q-multi',
        status: 'ACCEPTED',
        requester_id: 'user-req',
        provider_id: 'user-prov',
        mission_id: 'm-multi',
        mission_status: 'AGREED',
        description: 'Rénovation terrasse',
        payments: [],
        milestones: [
            { id: 'ms-1', title: 'Acompte matériel', amount: 80, status: 'PENDING' },
            { id: 'ms-2', title: 'Avancement gros œuvre', amount: 120, status: 'PENDING' },
            { id: 'ms-3', title: 'Finitions et livraison', amount: 100, status: 'PENDING' }
        ]
    };

    const card = missionCard(multiQuote, 'user-req', 'active');
    assert.equal(card.details.length, 3);
    
    // Check 1 sur 3
    assert.equal(card.details[0].stepLabel, 'Paiement 1 sur 3');
    assert.equal(card.details[0].rawTitle, 'Acompte matériel');
    assert.equal(card.details[0].title, 'Paiement 1 sur 3 : Acompte matériel');
    assert.equal(card.details[0].amount, '80 €');
    assert.equal(card.details[0].status, 'PENDING');
    assert.equal(card.details[0].statusLabel, 'En attente de paiement');

    // Check 2 sur 3
    assert.equal(card.details[1].stepLabel, 'Paiement 2 sur 3');
    assert.equal(card.details[1].rawTitle, 'Avancement gros œuvre');
    assert.equal(card.details[1].title, 'Paiement 2 sur 3 : Avancement gros œuvre');
    assert.equal(card.details[1].amount, '120 €');
    assert.equal(card.details[1].status, 'PENDING');
    assert.equal(card.details[1].statusLabel, 'En attente de paiement');

    // Check 3 sur 3
    assert.equal(card.details[2].stepLabel, 'Paiement 3 sur 3');
    assert.equal(card.details[2].rawTitle, 'Finitions et livraison');
    assert.equal(card.details[2].title, 'Paiement 3 sur 3 : Finitions et livraison');
    assert.equal(card.details[2].amount, '100 €');
    assert.equal(card.details[2].status, 'PENDING');
    assert.equal(card.details[2].statusLabel, 'En attente de paiement');

    // Primary pay button label for multiple milestones
    assert.equal(card.primaryAction.id, 'pay');
    assert.equal(card.primaryAction.label, 'Sécuriser le Paiement 1 sur 3 (80 €)');

    // payButtonLabel function with index and total
    assert.equal(payButtonLabel(80, 1, 3), 'Payer (Paiement 1 sur 3 · 80 €)');
    assert.equal(payButtonLabel(120, 2, 3), 'Payer (Paiement 2 sur 3 · 120 €)');
    assert.equal(payButtonLabel(100, 3, 3), 'Payer (Paiement 3 sur 3 · 100 €)');
    
    // Backward compatibility for single milestone
    assert.equal(payButtonLabel(50), 'Payer & Bloquer (50 €)');

    // Quote review also carries step numbering
    const review = quoteReview(multiQuote, 'user-req');
    assert.equal(review.milestones.length, 3);
    assert.equal(review.milestones[0].title, 'Paiement 1 sur 3 : Acompte matériel');
    assert.equal(review.milestones[0].amount, '80 €');
    assert.equal(review.milestones[0].statusLabel, 'En attente de paiement');
    assert.equal(review.milestones[1].title, 'Paiement 2 sur 3 : Avancement gros œuvre');
    assert.equal(review.milestones[2].title, 'Paiement 3 sur 3 : Finitions et livraison');
});

test('4. single milestone quotes remain cleanly formatted without over-numbering', () => {
    const singleQuote = {
        id: 'q-single',
        status: 'ACCEPTED',
        requester_id: 'user-req',
        provider_id: 'user-prov',
        mission_id: 'm-single',
        mission_status: 'AGREED',
        description: 'Tonte pelouse',
        payments: [],
        milestones: [
            { id: 'ms-unique', title: 'Tonte complète', amount: 45, status: 'PENDING' }
        ]
    };

    const card = missionCard(singleQuote, 'user-req', 'active');
    assert.equal(card.details[0].title, 'Tonte complète');
    assert.equal(card.primaryAction.label, 'Sécuriser le paiement');
    assert.equal(payButtonLabel(45), 'Payer & Bloquer (45 €)');
});
