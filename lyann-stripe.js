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

    function setPayReady(ready) {
        const submitBtn = document.getElementById('btnConfirmCheckoutPay');
        if (submitBtn) submitBtn.disabled = !ready;
        const mount = document.getElementById('lyannCardPaymentElement');
        if (mount) mount.dataset.ready = ready ? 'true' : 'false';
    }

    function humanizeCheckoutError(err) {
        const text = String((err && err.message) || err || '');
        if (/Load failed|Failed to fetch|NetworkError|ECONN|timed out|timeout/i.test(text)) {
            return 'Le serveur de paiement local n’est pas joignable. Restez sur le même Wi-Fi que le Mac, autorisez le réseau local, et vérifiez que l’API Staging écoute. Aucun versement n’a été confirmé.';
        }
        if (/Impossible de charger Stripe\.js|Stripe\.js indisponible/i.test(text)) {
            return 'Le formulaire carte Stripe n’a pas pu se charger. Aucun versement n’a été confirmé.';
        }
        return text;
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
        // E5: coalesce repeated pay initiation (double-click / retry) into one in-flight prepare.
        if (preparing) return preparing;
        destroyCard();
        setPayReady(false);
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
            const result = await global.LYANN_API_CLIENT.createMilestonePaymentIntent(milestoneId);
            if (result && result.error) {
                const message = humanizeCheckoutError(result.error) || 'Paiement indisponible.';
                setPaymentError(message);
                setPayReady(false);
                return { error: { message }, data: result.data || null };
            }
            const payload = result && result.data ? result.data : {};
            const mockIntent = payload.mode === 'stripe_test_mock'
                || (typeof payload.client_secret === 'string' && payload.client_secret.indexOf('_secret_test') !== -1);
            if (mockIntent || !payload.client_secret) {
                const message = 'Paiement indisponible : Stripe test n’est pas configuré sur ce serveur (STRIPE_SECRET_KEY). Aucun versement n’a été confirmé.';
                setPaymentError(message);
                return { error: { message }, data: payload };
            }
            if (payload.amounts && typeof global.applyServerCheckoutAmounts === 'function') {
                global.applyServerCheckoutAmounts(payload.amounts);
            }
            try {
                const stripeSdk = await getStripe();
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
                setPayReady(true);
                return { data: payload };
            } catch (err) {
                const message = humanizeCheckoutError(err);
                setPaymentError(message);
                setPayReady(false);
                return { data: payload, error: { message } };
            }
        })();

        try {
            return await preparing;
        } catch (err) {
            const message = humanizeCheckoutError(err);
            setPaymentError(message);
            setPayReady(false);
            return { error: { message: message.indexOf('Paiement indisponible') === 0 ? message : ('Paiement indisponible : ' + message) } };
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
                const refused = 'Le paiement n’a pas abouti. Aucun montant n’a été mis en sécurité. Vous pouvez réessayer avec cette carte, ou annuler pour revenir au chat.';
                setPaymentError(refused);
                api.lastResult = { error: { message: refused } };
                return api.lastResult;
            }
            const status = result.paymentIntent && result.paymentIntent.status;
            if (status !== 'succeeded' && status !== 'requires_capture') {
                const message = status === 'requires_action'
                    ? 'Votre banque demande une confirmation. Terminez-la pour mettre le paiement en sécurité. Tant qu’elle n’est pas faite, aucun montant n’est bloqué.'
                    : 'Le paiement n’a pas abouti. Aucun montant n’a été mis en sécurité. Vous pouvez réessayer, ou annuler pour revenir au chat.';
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
            // E5: never show FUNDED until server deal state validates it.
            let serverValidated = false;
            if (typeof global.lyannAwaitPaidQuote === 'function') {
                const sync = await global.lyannAwaitPaidQuote();
                serverValidated = !!(sync && (sync.serverValidated || sync.funded));
            }
            const title = (document.getElementById('coPrestationTitle') || {}).textContent || 'cette mission';
            const works = (document.getElementById('coDevisAmount') || {}).textContent || '';
            const total = (document.getElementById('coTotalAmount') || {}).textContent || '';
            const successMessage = serverValidated
                ? [
                    'Paiement sécurisé.',
                    'Mission : ' + title + '.',
                    works ? ('Prestation : ' + works + '.') : '',
                    total ? ('Montant mis en sécurité : ' + total + '.') : '',
                    'L’argent est conservé par LYANN. Il n’est pas versé tout de suite au Lyanneur.',
                    'La mission peut maintenant commencer.',
                    'Quand la prestation sera terminée, vous la validerez dans ce même chat. Cela libérera les fonds pour le Lyanneur.'
                ].filter(Boolean).join(' ')
                : 'Le paiement a été envoyé. Il n’est pas encore confirmé comme sécurisé. Restez dans cette conversation : l’état se met à jour dès que la banque a validé. Aucun fonds n’est libéré avant cette confirmation.';
            if (global.lyannAlert) {
                Promise.resolve(global.lyannAlert(successMessage, serverValidated ? 'success' : 'info', serverValidated ? 'Paiement sécurisé' : 'Paiement en cours')).catch(() => {});
            } else if (typeof global.showToast === 'function') {
                global.showToast(successMessage, serverValidated ? 'success' : 'info');
            }
            api.lastResult = {
                data: {
                    status,
                    payment_intent_id: paymentIntentId || result.paymentIntent.id,
                    serverValidated
                }
            };
            return api.lastResult;
        } catch (err) {
            const message = 'Le paiement n’a pas abouti. Aucun montant n’a été mis en sécurité. Vous pouvez réessayer, ou annuler pour revenir au chat.';
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
