'use strict';

// Masked card metadata only. PAN, CVC and raw Stripe tokens never enter this module.

function customerIdOf(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.id || '';
}

function isSavedCardId(value) {
    return typeof value === 'string' && /^pm_[A-Za-z0-9]+$/.test(value);
}

function isPaymentIntentId(value) {
    return typeof value === 'string' && /^pi_[A-Za-z0-9]+$/.test(value);
}

function cardMayRedisplay(paymentMethod) {
    if (!paymentMethod || paymentMethod.type !== 'card') return false;
    const flag = paymentMethod.allow_redisplay || 'unspecified';
    return flag === 'always' || flag === 'unspecified';
}

function maskSavedCard(paymentMethod) {
    const brand = String(paymentMethod?.card?.brand || 'carte').replace(/[^a-z0-9 -]/gi, '').slice(0, 20) || 'carte';
    const last4 = String(paymentMethod?.card?.last4 || '').replace(/\D/g, '').slice(-4);
    return {
        id: paymentMethod.id,
        brand,
        last4,
        exp_month: paymentMethod.card?.exp_month || null,
        exp_year: paymentMethod.card?.exp_year || null
    };
}

function visibleSavedCards(list) {
    const data = Array.isArray(list) ? list : (list && list.data) || [];
    return data.filter(cardMayRedisplay).map(maskSavedCard);
}

function canDetachSavedCard(paymentMethod, ownerCustomerId) {
    if (!paymentMethod || paymentMethod.type !== 'card' || !ownerCustomerId) return false;
    return customerIdOf(paymentMethod.customer) === ownerCustomerId;
}

function paymentIntentConsentUpdate(saveCard, customerId) {
    return {
        customer: customerId,
        setup_future_usage: saveCard ? 'on_session' : '',
        metadata: { lyann_save_card: saveCard ? '1' : '0' }
    };
}

function customerSessionParams(customerId) {
    return {
        customer: customerId,
        components: {
            payment_element: {
                enabled: true,
                features: {
                    payment_method_save: 'enabled',
                    payment_method_save_usage: 'on_session',
                    payment_method_redisplay: 'enabled',
                    payment_method_remove: 'enabled'
                }
            }
        }
    };
}

module.exports = {
    customerIdOf,
    isSavedCardId,
    isPaymentIntentId,
    cardMayRedisplay,
    maskSavedCard,
    visibleSavedCards,
    canDetachSavedCard,
    paymentIntentConsentUpdate,
    customerSessionParams
};
