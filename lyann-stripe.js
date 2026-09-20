(function (global) {
    'use strict';

    const STRIPE_JS_SRC = 'https://js.stripe.com/v3/';
    let stripePromise = null;
    let stripe = null;
    let cardElement = null;
    let clientSecret = null;
    let paymentIntentId = null;
    let preparing = null;

    function paymentErrorBox() {
        return document.getElementById('lyannCardPaymentError');
    }

    function setPaymentError(message) {
        const box = paymentErrorBox();
        if (box) box.textContent = message || '';
    }

    function loadScript(src) {
        if (global.LYANN_FEATURES && typeof global.LYANN_FEATURES.loadScript === 'function') {
            return global.LYANN_FEATURES.loadScript(src);
        }
        const existing = Array.from(document.scripts || []).find((script) => {
            const attr = script.getAttribute('src') || '';
            return attr === src || attr.indexOf('js.stripe.com/v3') !== -1;
        });
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.addEventListener('load', () => resolve(script), { once: true });
            script.addEventListener('error', () => reject(new Error('Impossible de charger Stripe.js')), { once: true });
            document.head.appendChild(script);
        });
    }

    async function fetchPublishableKey() {
        if (global.LYANN_STRIPE_PUBLISHABLE_KEY) return String(global.LYANN_STRIPE_PUBLISHABLE_KEY);
        const fetcher = typeof global.lyannBackendFetch === 'function' ? global.lyannBackendFetch : fetch;
        const res = await fetcher('/v1/payments/config');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.publishableKey) {
            throw new Error(data.error || 'Clé Stripe publique indisponible.');
        }
        return data.publishableKey;
    }

    async function getStripe() {
        if (stripe) return stripe;
        if (!stripePromise) {
            stripePromise = (async () => {
                await loadScript(STRIPE_JS_SRC);
                if (typeof global.Stripe !== 'function') {
                    throw new Error('Stripe.js indisponible.');
                }
                const key = await fetchPublishableKey();
                if (!key || !String(key).startsWith('pk_')) {
                    throw new Error('Clé Stripe publique invalide.');
                }
                stripe = global.Stripe(key);
                return stripe;
            })().catch((err) => {
                stripePromise = null;
                throw err;
            });
        }
        return stripePromise;
    }

    function destroyCard() {
        if (cardElement && typeof cardElement.unmount === 'function') {
            try { cardElement.unmount(); } catch (e) {}
        }
        cardElement = null;
        clientSecret = null;
        paymentIntentId = null;
        setPaymentError('');
    }

    async function prepareCheckout(milestoneId) {
        destroyCard();
        const mount = document.getElementById('lyannCardPaymentElement');
        if (!isPersistedUuid(milestoneId)) {
            setPaymentError('Paiement indisponible : il faut un jalon PENDING.');
            return { error: { message: 'Paiement indisponible : il faut un jalon PENDING et POST /v1/payments/create-milestone-intent.' } };
        }
        if (!mount) {
            return { error: { message: 'Paiement indisponible : le champ carte Stripe n’est pas sur cet écran.' } };
        }
        if (!global.LYANN_API_CLIENT || typeof global.LYANN_API_CLIENT.createMilestonePaymentIntent !== 'function') {
            return { error: { message: 'Paiement indisponible : create-milestone-intent n’est pas raccordé.' } };
        }

        preparing = (async () => {
            const stripeSdk = await getStripe();
            const result = await global.LYANN_API_CLIENT.createMilestonePaymentIntent(milestoneId);
            if (result && result.error) {
                setPaymentError(result.error.message || 'Paiement indisponible.');
                return result;
            }
            const payload = result && result.data ? result.data : {};
            const mockIntent = payload.mode === 'stripe_test_mock'
                || (typeof payload.client_secret === 'string' && payload.client_secret.indexOf('_secret_test') !== -1);
            if (mockIntent || !payload.client_secret) {
                const message = 'Paiement indisponible : Stripe test n’est pas configuré sur ce serveur (STRIPE_SECRET_KEY). Aucun versement n’a été confirmé.';
                setPaymentError(message);
                return { error: { message } };
            }
            clientSecret = payload.client_secret;
            paymentIntentId = payload.payment_intent_id || null;
            const elements = stripeSdk.elements();
            cardElement = elements.create('card', {
                hidePostalCode: true,
                style: {
                    base: {
                        fontSize: '16px',
                        color: '#1F3827',
                        fontFamily: 'system-ui, sans-serif',
                        '::placeholder': { color: '#8A9A8E' }
                    }
                }
            });
            cardElement.mount(mount);
            cardElement.on('change', (event) => {
                setPaymentError(event.error ? event.error.message : '');
                if (mount) mount.dataset.complete = event.complete ? 'true' : 'false';
            });
            return { data: payload };
        })();

        try {
            return await preparing;
        } catch (err) {
            const message = err && err.message ? err.message : 'Paiement indisponible.';
            setPaymentError(message);
            return { error: { message: 'Paiement indisponible : ' + message } };
        } finally {
            preparing = null;
        }
    }

    function isPersistedUuid(value) {
        if (typeof global.isUUID === 'function') return global.isUUID(value);
        return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }

    async function confirmCheckout() {
        if (preparing && !cardElement) {
            const prepared = await preparing;
            if (prepared && prepared.error) return prepared;
        }
        if (!cardElement || !clientSecret || !stripe) {
            return { error: { message: 'Paiement indisponible : le formulaire carte Stripe n’est pas prêt. Aucun versement n’a été confirmé.' } };
        }
        const submitBtn = document.getElementById('btnConfirmCheckoutPay');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const result = await Promise.race([
                stripe.confirmCardPayment(clientSecret, {
                    payment_method: { card: cardElement }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Délai dépassé lors de la confirmation Stripe.')), 20000))
            ]);
            if (result.error) {
                setPaymentError(result.error.message || 'Paiement refusé.');
                api.lastResult = { error: { message: result.error.message || 'Paiement indisponible.' } };
                return api.lastResult;
            }
            const status = result.paymentIntent && result.paymentIntent.status;
            if (status !== 'succeeded' && status !== 'requires_capture') {
                const message = 'Paiement indisponible : Stripe n’a pas confirmé la carte (statut ' + (status || 'inconnu') + ').';
                setPaymentError(message);
                api.lastResult = { error: { message } };
                return api.lastResult;
            }
            setPaymentError('');
            if (global.LYANN_MESSAGING && typeof global.LYANN_MESSAGING.hideAllChildSurfaces === 'function') {
                global.LYANN_MESSAGING.hideAllChildSurfaces();
            } else {
                const overlay = document.getElementById('chatCheckoutOverlay');
                if (overlay) overlay.style.display = 'none';
            }
            const successMessage = 'Carte confirmée par Stripe. Le séquestre LYANN sera mis à jour après confirmation serveur (webhook), pas depuis cet écran.';
            if (typeof global.showToast === 'function') global.showToast(successMessage, 'success');
            else if (global.lyannAlert) {
                Promise.resolve(global.lyannAlert(successMessage)).catch(() => {});
            }
            api.lastResult = { data: { status, payment_intent_id: paymentIntentId || result.paymentIntent.id } };
            return api.lastResult;
        } catch (err) {
            const message = err && err.message ? err.message : 'Paiement indisponible.';
            setPaymentError(message);
            api.lastResult = { error: { message } };
            return api.lastResult;
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    const api = {
        prepareCheckout,
        confirmCheckout,
        destroyCard,
        lastResult: null
    };
    global.LYANN_STRIPE = api;
})(window);
