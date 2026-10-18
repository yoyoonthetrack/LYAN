'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const payments = fs.readFileSync(path.join(root, 'payment-script.js'), 'utf8');
const start = payments.indexOf('function decideQuoteMilestones');
const end = payments.indexOf('window.LYANN_PAYMENTS');
const decideQuoteMilestones = new Function(
    payments.slice(start, end) + '\nreturn decideQuoteMilestones;'
)();

const amounts = [80, 200, 500, 2000];
const parts = [
    { title: 'Préparation', description: 'Phase 1', percentage: 40 },
    { title: 'Fin', description: 'Phase 2', percentage: 60 }
];

test('a direct quote stays a single amount at every tested price', () => {
    for (const total of amounts) {
        const decision = decideQuoteMilestones({
            quoteType: 'direct',
            total,
            milestones: parts
        });
        assert.equal(decision.ok, true);
        assert.equal(decision.quoteType, 'direct');
        assert.equal(decision.requiresMilestones, false);
        assert.deepEqual(decision.milestones, []);
    }
});

test('a milestone quote keeps its steps at every tested price', () => {
    for (const total of amounts) {
        const decision = decideQuoteMilestones({
            quoteType: 'milestones',
            total,
            milestones: parts
        });
        assert.equal(decision.ok, true);
        assert.equal(decision.quoteType, 'milestones');
        assert.equal(decision.requiresMilestones, true);
        assert.equal(decision.milestones.length, 2);
        assert.equal(decision.milestones[0].title, 'Préparation');
        assert.equal(decision.milestones[1].percentage, 60);
    }
});

test('a missing quote type is not inferred from the amount or from attached steps', () => {
    for (const total of amounts) {
        const decision = decideQuoteMilestones({ total, milestones: parts });
        assert.equal(decision.ok, false);
        assert.equal(decision.code, 'quote_type_missing');
        assert.equal('requiresMilestones' in decision, false);
    }
    const body = payments.slice(start, end);
    assert.doesNotMatch(body, /amount|200/);
});

test('the old ledger stays disconnected and no longer classifies quotes by 200 euros', () => {
    const reader = payments.slice(payments.indexOf('getTransactions: function'), payments.indexOf('saveTransactions: function'));
    assert.match(reader, /return \[\];/);
    assert.match(payments, /return this\.financialUnavailable\('Création de demande'\)/);
    assert.match(payments, /return this\.financialUnavailable\('Paiement du devis'\)/);
    assert.match(payments, /return this\.financialUnavailable\('Soumission de jalon'\)/);
    assert.match(payments, /return this\.financialUnavailable\('Versement'\)/);
    const quote = payments.slice(payments.indexOf('submitQuotation: function'), payments.indexOf('PAYMENT_MODE'));
    assert.doesNotMatch(quote, /amount > 200|>= 200|< 200/);
    assert.match(quote, /tx\.commissionAmount = \(tx\.amount \* tx\.commissionRate\) \/ 100/);
    const portal = fs.readFileSync(path.join(root, 'payment-portal.html'), 'utf8');
    const call = portal.slice(portal.indexOf('LYANN_PAYMENTS.submitQuotation'), portal.indexOf('showToast(`Devis'));
    assert.doesNotMatch(call, /quoteType/);
    const chat = fs.readFileSync(path.join(root, 'chat-logic.js'), 'utf8');
    assert.doesNotMatch(chat, /decideQuoteMilestones|amount > 200/);
});
