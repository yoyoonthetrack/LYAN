'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { payoutAccountState, payoutReturnUrls, payoutLinkPath, readConnectParam, clearConnectParam, renderPayoutAccount } = require('../payout-account.js');

const ready = {
    success: true,
    ready: true,
    account_created: true,
    onboarding_completed: true,
    charges_enabled: true,
    transfers_active: true,
    payouts_enabled: true
};

test('no payout account offers setup', () => {
    assert.equal(payoutAccountState({ success: true, account_created: false, payouts_enabled: false }), 'none');
    const view = renderPayoutAccount('none');
    assert.equal(view.subtitle, 'À configurer');
    assert.equal(view.actionLabel, 'Configurer');
    assert.equal(view.readyVisible, false);
});

test('incomplete onboarding is not shown as active', () => {
    assert.equal(payoutAccountState({
        success: true,
        ready: false,
        account_created: true,
        onboarding_completed: false,
        transfers_active: false,
        payouts_enabled: true
    }), 'incomplete');
    const view = renderPayoutAccount('incomplete');
    assert.equal(view.subtitle, 'Configuration à terminer');
    assert.equal(view.actionLabel, 'Continuer');
});

test('active matches the server payable rule and ignores payouts_enabled', () => {
    assert.equal(payoutAccountState(ready), 'active');
    assert.equal(payoutAccountState({ ...ready, payouts_enabled: false }), 'active');
    assert.equal(payoutAccountState({ ...ready, ready: false, payouts_enabled: true }), 'incomplete');
    assert.equal(payoutAccountState({ ...ready, transfers_active: false }), 'incomplete');
    assert.equal(payoutAccountState({ ...ready, onboarding_completed: false }), 'incomplete');
    const active = renderPayoutAccount('active');
    assert.equal(active.title, 'Compte de versement actif');
    assert.equal(active.subtitle, 'Vos informations de versement sont configurées.');
    assert.equal(active.actionLabel, 'Modifier');
    assert.equal(active.actionVisible, true);
    assert.equal(active.readyVisible, true);
    assert.equal(active.intent, 'update');
    assert.equal(payoutLinkPath('update'), '/v1/payments/connect/express-dashboard-link');
    assert.equal(renderPayoutAccount('none').title, 'Compte de versement');
    assert.equal(renderPayoutAccount('none').actionLabel, 'Configurer');
    assert.equal(renderPayoutAccount('incomplete').actionLabel, 'Continuer');
    assert.equal(payoutLinkPath('onboarding'), '/v1/payments/connect/onboarding-link');
});

test('return and refresh urls stay on the finances page', () => {
    const urls = payoutReturnUrls();
    assert.equal(urls.return_url, 'https://lyann.app/?action=finances&connect=return');
    assert.equal(urls.refresh_url, 'https://lyann.app/?action=finances&connect=refresh');
    assert.equal(readConnectParam('?action=finances&connect=return'), 'return');
    assert.equal(readConnectParam('?action=finances&connect=refresh'), 'refresh');
    assert.equal(clearConnectParam('https://lyann.app/?action=finances&connect=return'), '/?action=finances');
});

test('an API failure is not presented as an active account', () => {
    assert.equal(payoutAccountState(null), 'error');
    assert.equal(payoutAccountState({ success: false }), 'error');
    assert.equal(renderPayoutAccount('error').actionLabel, 'Réessayer');
});
