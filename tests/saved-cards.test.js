'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    visibleSavedCards,
    canDetachSavedCard,
    paymentIntentConsentUpdate,
    customerSessionParams,
    isSavedCardId,
    maskSavedCard
} = require('../api/saved-cards');

test('saved cards expose only brand, last4 and expiry', () => {
    const cards = visibleSavedCards({
        data: [
            { id: 'pm_own', type: 'card', allow_redisplay: 'always', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 }, customer: 'cus_a' },
            { id: 'pm_hidden', type: 'card', allow_redisplay: 'limited', card: { brand: 'mastercard', last4: '4444', exp_month: 1, exp_year: 2031 } },
            { id: 'pm_sepa', type: 'sepa_debit', allow_redisplay: 'always' }
        ]
    });
    assert.deepEqual(cards, [{
        id: 'pm_own',
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2030
    }]);
    assert.equal(JSON.stringify(cards).includes('4242') && !JSON.stringify(maskSavedCard(cards[0] && { id: 'pm_own', card: { last4: '4242' } })).includes('cvc'), true);
});

test('a member cannot detach another customer card', () => {
    assert.equal(canDetachSavedCard({ type: 'card', customer: 'cus_other' }, 'cus_owner'), false);
    assert.equal(canDetachSavedCard({ type: 'card', customer: { id: 'cus_owner' } }, 'cus_owner'), true);
    assert.equal(canDetachSavedCard({ type: 'sepa_debit', customer: 'cus_owner' }, 'cus_owner'), false);
    assert.equal(isSavedCardId('pm_abc123'), true);
    assert.equal(isSavedCardId('card_123'), false);
});

test('consent stays on-session and never changes the amount', () => {
    const saved = paymentIntentConsentUpdate(true, 'cus_owner');
    const skipped = paymentIntentConsentUpdate(false, 'cus_owner');
    assert.equal(saved.setup_future_usage, 'on_session');
    assert.equal(saved.metadata.lyann_save_card, '1');
    assert.equal(skipped.setup_future_usage, '');
    assert.equal(skipped.metadata.lyann_save_card, '0');
    assert.equal('amount' in saved, false);
    assert.equal('amount' in skipped, false);
    const session = customerSessionParams('cus_owner');
    assert.equal(session.components.payment_element.features.payment_method_save, 'enabled');
    assert.equal(session.components.payment_element.features.payment_method_save_usage, 'on_session');
    assert.equal(session.components.payment_element.features.payment_method_redisplay, 'enabled');
    assert.equal(session.components.payment_element.features.payment_method_remove, 'enabled');
    assert.equal(session.components.payment_element.features.payment_method_save_usage === 'off_session', false);
});

test('checkout copy is optional, unchecked, and shared by the payment screens', () => {
    const root = path.join(__dirname, '..');
    const pages = ['index.html', 'feed.html', 'results.html', 'payment-portal.html', 'pricing.html', 'how-it-works.html', 'about.html', 'legal.html', 'confidentialite.html'];
    for (const page of pages) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /id="lyannSaveCardConsent"/);
        assert.doesNotMatch(html, /id="lyannSaveCardConsent"[^>]*checked/);
        assert.match(html, /Enregistrer cette carte pour mes prochains Lyanns/);
        assert.match(html, /Votre carte est enregistrée en toute sécurité par Stripe/);
    }
    const stripe = fs.readFileSync(path.join(root, 'lyann-stripe.js'), 'utf8');
    assert.match(stripe, /if \(preparing\) return preparing/);
    assert.match(stripe, /lyannAwaitPaidQuote/);
    assert.match(stripe, /serverValidated/);
    assert.match(stripe, /setup_future_usage/);
    assert.doesNotMatch(stripe, /off_session/);
    const server = fs.readFileSync(path.join(root, 'api/server.js'), 'utf8');
    assert.match(server, /canDetachSavedCard/);
    assert.match(server, /lyann_payment_customers/);
    assert.doesNotMatch(server, /\.eq\('stripe_mode', stripeMode\)/);
});
