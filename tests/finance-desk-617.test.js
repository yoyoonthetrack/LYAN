'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    classifyFinanceDisplay,
    policyCopy,
    cents
} = require('../finance-policy-ui');
const {
    postTransferFinancialExecutionEnabled,
    preTransferRefundExecutionEnabled
} = require('../api/stripe-policy');

const policy = classifyFinanceDisplay;

test('6.17 display: FUNDED is not an automatic refund right', () => {
    const view = policy({
        payment: { id: 'p1', payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION' },
        milestone: { status: 'FUNDED' },
        mission: { status: 'AGREED' }
    });
    assert.equal(view.code, 'FUNDED_NOT_STARTED');
    assert.equal(view.autoRefund, true);
    assert.match(policyCopy(view.code), /Pas de droit automatique/);
});

test('6.17 display: started work needs provider or admin', () => {
    const view = policy({
        payment: { id: 'p1', payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION' },
        milestone: { status: 'IN_PROGRESS' }
    });
    assert.equal(view.path, 'NEEDS_PROVIDER_OR_ADMIN');
    assert.equal(view.autoRefund, false);
});

test('6.17 display: completed work has no auto refund', () => {
    const view = policy({
        payment: { id: 'p1', payment_status: 'SUCCEEDED', transfer_status: 'PENDING_VALIDATION' },
        milestone: { status: 'COMPLETED' }
    });
    assert.equal(view.code, 'WORK_DONE');
    assert.equal(view.autoRefund, false);
});

test('6.17 display: transfer id is not a bank payout', () => {
    const view = policy({
        payment: { id: 'p1', payment_status: 'SUCCEEDED', transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_x' },
        milestone: { status: 'RELEASED' }
    });
    assert.equal(view.path, 'POST_TRANSFER');
    assert.match(view.funds, /versement bancaire n’est pas confirmé/);
});

test('6.17 display: refunded and disputed', () => {
    assert.equal(policy({ payment: { id: 'p', payment_status: 'REFUNDED' }, milestone: {} }).code, 'REFUNDED');
    assert.equal(policy({ payment: { id: 'p', payment_status: 'SUCCEEDED' }, milestone: { status: 'DISPUTED' } }).code, 'DISPUTED');
});

test('6.17 display: missing payment', () => {
    const view = policy({ payment: {}, milestone: {} });
    assert.equal(view.code, 'ABSENT');
    assert.equal(cents(4349), '43,49 €');
    assert.equal(cents('nope'), '—');
});

test('6.17 demo desk never executes money and engines stay off', () => {
    assert.equal(postTransferFinancialExecutionEnabled(), false);
    assert.equal(preTransferRefundExecutionEnabled(), false);
    const deskSrc = fs.readFileSync(path.join(__dirname, '..', 'finance-desk.js'), 'utf8');
    assert.match(deskSrc, /Aucune écriture Supabase, aucun appel Stripe/);
    assert.match(deskSrc, /executed: false/);
    assert.doesNotMatch(deskSrc, /\(Simulé\)/);
    const portal = fs.readFileSync(path.join(__dirname, '..', 'payment-portal.html'), 'utf8');
    assert.match(portal, /financeDeskRoot/);
    assert.match(portal, /finance-desk.js/);
    const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.match(admin, /adminFinanceDeskRoot/);
    const server = fs.readFileSync(path.join(__dirname, '..', 'api/server.js'), 'utf8');
    assert.match(server, /\/v1\/payments\/finance-snapshot/);
    assert.match(server, /stripe_called: false/);
});
