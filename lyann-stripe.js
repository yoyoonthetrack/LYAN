(function (global) {
    'use strict';

    const STRIPE_JS_SRC = 'https://js.stripe.com/v3/';
    const CONFIRM_WAIT_MS = 180000;
    let stripePromise = null;
    let stripe = null;
    let cardElement = null;
    let clientSecret = null;
    let paymentIntentId = null;
    let preparing = null;
    let confirming = false;
    let generation = 0;
    let saveAvailable = false;

    function paymentErrorBox() {
        return document.getElementById('lyannCardPaymentError');
    }

    function setPaymentError(message) {
        const box = paymentErrorBox();
        if (box) box.textContent = message || '';
    }

    function leaveCheckoutForChat() {
        if (global.LYANN_MESSAGING && typeof global.LYANN_MESSAGING.hideAllChildSurfaces === 'function') {
            global.LYANN_MESSAGING.hideAllChildSurfaces();
        } else {
            const overlay = document.getElementById('chatCheckoutOverlay');
            if (overlay) overlay.style.display = 'none';
        }
    }

    function explainPaymentFailure(message) {
        setPaymentError(message);
        leaveCheckoutForChat();
        if (global.lyannAlert) {
            Promise.resolve(global.lyannAlert(message, 'warning', 'Paiement non abouti')).catch(() => {});
        } else if (typeof global.showToast === 'function') {
            global.showToast(message, 'warning');
        }
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

    function unmountCard() {
        if (cardElement && typeof cardElement.unmount === 'function') {
            try { cardElement.unmount(); } catch (e) {}
        }
        cardElement = null;
    }

    function destroyCard() {
        if (confirming) return;
        generation += 1;
        unmountCard();
        clientSecret = null;
        paymentIntentId = null;
        saveAvailable = false;
        const box = document.getElementById('lyannSaveCardConsent');
        if (box) box.checked = false;
        setPaymentError('');
        showSaveControls(false, false);
    }

    function ensureSaveControls() {
        const error = paymentErrorBox();
        const parent = error && error.parentElement;
        if (!parent) return;
        if (!document.getElementById('lyannSavedCardChooser')) {
            const chooser = document.createElement('fieldset');
            chooser.id = 'lyannSavedCardChooser';
            chooser.hidden = true;
            chooser.style.cssText = 'border:0;padding:0;margin:8px 0 0;';
            parent.appendChild(chooser);
        }
        if (!document.getElementById('lyannSaveCardUnavailable')) {
            const note = document.createElement('p');
            note.id = 'lyannSaveCardUnavailable';
            note.hidden = true;
            note.style.cssText = 'font-size:0.78rem;color:#5C6B62;margin:8px 0 0;';
            note.textContent = 'L’enregistrement de carte est momentanément indisponible. Vous pouvez quand même payer.';
            parent.appendChild(note);
        }
        if (!document.getElementById('lyannSaveCardConsent')) {
            const label = document.createElement('label');
            label.id = 'lyannSaveCardLabel';
            label.htmlFor = 'lyannSaveCardConsent';
            label.hidden = true;
            label.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:44px;margin-top:10px;font-size:0.85rem;line-height:1.35;color:#1F3827;';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = 'lyannSaveCardConsent';
            input.style.cssText = 'width:22px;height:22px;accent-color:#2E7D32;flex:0 0 auto;';
            const text = document.createElement('span');
            text.textContent = 'Enregistrer cette carte pour mes prochains Lyanns';
            label.append(input, text);
            parent.appendChild(label);
        }
        if (!document.getElementById('lyannSavedCardInfo')) {
            const info = document.createElement('p');
            info.id = 'lyannSavedCardInfo';
            info.hidden = true;
            info.style.cssText = 'font-size:0.75rem;color:#5C6B62;margin:6px 0 0;';
            info.textContent = 'Votre carte est enregistrée en toute sécurité par Stripe. Vous pouvez la supprimer à tout moment dans vos paramètres.';
            parent.appendChild(info);
        }
    }

    function showSaveControls(available, hasCards) {
        const label = document.getElementById('lyannSaveCardLabel');
        const info = document.getElementById('lyannSavedCardInfo');
        const unavailable = document.getElementById('lyannSaveCardUnavailable');
        const usingNew = !selectedSavedPaymentMethod();
        if (label) label.hidden = !(available && usingNew);
        if (info) info.hidden = !(available || hasCards);
        if (unavailable) unavailable.hidden = available;
    }

    function formatCard(card) {
        const brand = String(card.brand || 'Carte');
        const pretty = brand.charAt(0).toUpperCase() + brand.slice(1);
        const tail = String(card.last4 || '').replace(/\D/g, '').slice(-4);
        const month = String(card.exp_month || '').padStart(2, '0');
        const year = String(card.exp_year || '');
        return pretty + ' •••• ' + tail + ' — exp. ' + month + '/' + year;
    }

    function selectedSavedPaymentMethod() {
        const chosen = document.querySelector('input[name="lyannSavedCardChoice"]:checked');
        if (!chosen || chosen.value === 'new') return '';
        return /^pm_[A-Za-z0-9]+$/.test(chosen.value) ? chosen.value : '';
    }

    function syncCardChoice() {
        const saved = selectedSavedPaymentMethod();
        const mount = document.getElementById('lyannCardPaymentElement');
        const fieldLabel = document.querySelector('label[for="lyannCardPaymentElement"]');
        const usingNew = !saved;
        if (mount) mount.hidden = !usingNew;
        if (fieldLabel) fieldLabel.hidden = !usingNew;
        showSaveControls(saveAvailable, !!document.querySelector('input[name="lyannSavedCardChoice"]'));
    }

    function renderSavedCards(cards) {
        const chooser = document.getElementById('lyannSavedCardChooser');
        if (!chooser) return;
        chooser.replaceChildren();
        if (!cards.length) {
            chooser.hidden = true;
            return;
        }
        chooser.hidden = false;
        const legend = document.createElement('legend');
        legend.textContent = 'Carte pour ce paiement';
        legend.style.cssText = 'font-size:0.78rem;font-weight:700;margin-bottom:4px;color:#1F3827;';
        chooser.appendChild(legend);
        const hint = document.createElement('p');
        hint.textContent = 'Choisissez une carte enregistrée ou une nouvelle carte. Rien n’est débité tant que vous n’avez pas confirmé.';
        hint.style.cssText = 'margin:0 0 6px;font-size:0.75rem;color:#5C6B62;';
        chooser.appendChild(hint);
        cards.forEach((card) => {
            chooser.appendChild(choiceRow(card.id, formatCard(card), false));
        });
        chooser.appendChild(choiceRow('new', 'Utiliser une nouvelle carte', true));
    }

    function choiceRow(value, text, checked) {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:44px;font-size:0.88rem;color:#1F3827;';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'lyannSavedCardChoice';
        input.value = value;
        input.checked = checked;
        input.style.cssText = 'width:22px;height:22px;accent-color:#2E7D32;flex:0 0 auto;';
        input.addEventListener('change', syncCardChoice);
        const span = document.createElement('span');
        span.textContent = text;
        label.append(input, span);
        return label;
    }

    function saveConsentChecked() {
        const box = document.getElementById('lyannSaveCardConsent');
        const label = document.getElementById('lyannSaveCardLabel');
        return !!(saveAvailable && box && box.checked && label && !label.hidden && !selectedSavedPaymentMethod());
    }

    async function authorizedPaymentRequest(path, method, body) {
        const apiClient = global.LYANN_API_CLIENT;
        const session = apiClient && typeof apiClient.getSession === 'function' ? await apiClient.getSession() : null;
        const token = session?.data?.session?.access_token;
        if (!token) throw new Error('Connectez-vous pour payer.');
        const fetcher = typeof global.lyannBackendFetch === 'function' ? global.lyannBackendFetch : fetch;
        const response = await fetcher(path, {
            method: method || 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Cartes enregistrées indisponibles.');
        return data;
    }

    function checkoutReturnUrl() {
        const native = global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform();
        if (native) return '';
        try {
            if (!global.location || !/^https?:$/i.test(global.location.protocol)) return '';
            const url = new URL(global.location.href);
            url.hash = '';
            return url.toString();
        } catch (e) {
            return '';
        }
    }

    function isPersistedUuid(value) {
        if (typeof global.isUUID === 'function') return global.isUUID(value);
        return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }

    async function prepareCheckout(milestoneId) {
        // E5: coalesce repeated pay initiation (double-click / retry) into one in-flight prepare.
        if (preparing) return preparing;
        const token = ++generation;
        unmountCard();
        clientSecret = null;
        paymentIntentId = null;
        saveAvailable = false;
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
            if (token !== generation) return { error: { message: 'Paiement annulé.' } };
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
            const stripeSdk = await getStripe();
            if (token !== generation) return { error: { message: 'Paiement annulé.' } };
            clientSecret = payload.client_secret;
            paymentIntentId = payload.payment_intent_id || null;
            ensureSaveControls();
            const consent = document.getElementById('lyannSaveCardConsent');
            if (consent) consent.checked = false;
            let cards = [];
            try {
                const session = await authorizedPaymentRequest('/v1/payments/customer-session', 'POST', {
                    payment_intent_id: paymentIntentId,
                    save_card: false
                });
                saveAvailable = session.save_available === true;
                cards = Array.isArray(session.cards) ? session.cards : [];
            } catch (sessionError) {
                saveAvailable = false;
                cards = [];
                console.warn('Optional saved-card session unavailable; using card checkout.');
            }
            renderSavedCards(cards);
            showSaveControls(saveAvailable, cards.length > 0);
            mount.hidden = false;
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
            if (token !== generation) {
                unmountCard();
                return { error: { message: 'Paiement annulé.' } };
            }
            setPayReady(true);
            return { data: payload };
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

    function refusedCopy() {
        return 'Le paiement n’a pas abouti. Aucun montant n’a été mis en sécurité. Vous êtes de retour dans la conversation : ouvrez le dossier pour réessayer.';
    }

    function staysOnForm(error) {
        const code = error && error.code;
        const type = error && error.type;
        return type === 'validation_error'
            || code === 'incomplete_number'
            || code === 'incomplete_expiry'
            || code === 'incomplete_cvc';
    }

    async function retrieveStatus() {
        if (!stripe || !clientSecret) return null;
        try {
            const current = await stripe.retrievePaymentIntent(clientSecret);
            return current && current.paymentIntent ? current.paymentIntent : null;
        } catch (e) {
            return null;
        }
    }

    async function finishConfirmedPayment(status, intentId) {
        if (status !== 'succeeded' && status !== 'requires_capture') {
            const pending = status === 'processing' || status === 'requires_action';
            const message = pending
                ? 'Le paiement est encore en cours de confirmation. Restez dans cette conversation : l’état se met à jour dès que la banque a répondu. Aucun second paiement n’a été lancé.'
                : refusedCopy();
            if (pending && status === 'requires_action') {
                setPaymentError('Votre banque demande une confirmation. Terminez-la sur cet écran pour mettre le paiement en sécurité. Tant qu’elle n’est pas faite, aucun montant n’est bloqué.');
                api.lastResult = { error: { message: 'Confirmation bancaire encore requise.' } };
                return api.lastResult;
            }
            explainPaymentFailure(message);
            api.lastResult = { error: { message } };
            return api.lastResult;
        }
        setPaymentError('');
        leaveCheckoutForChat();
        let serverValidated = false;
        if (typeof global.lyannAwaitPaidQuote === 'function') {
            const sync = await global.lyannAwaitPaidQuote();
            serverValidated = !!(sync && (sync.serverValidated || sync.funded));
        }
        if (serverValidated && typeof global.announcePaidMission === 'function') {
            await global.announcePaidMission(intentId || paymentIntentId);
        }
        const successMessage = serverValidated
            ? 'Paiement sécurisé.'
            : 'Le paiement a été envoyé. Il n’est pas encore confirmé comme sécurisé. Restez dans cette conversation : l’état se met à jour dès que la banque a validé. Aucun fonds n’est libéré avant cette confirmation.';
        if (serverValidated && typeof global.showToast === 'function') {
            global.showToast(successMessage, 'success');
        } else if (global.lyannAlert) {
            Promise.resolve(global.lyannAlert(successMessage, 'info', 'Paiement en cours')).catch(() => {});
        } else if (typeof global.showToast === 'function') {
            global.showToast(successMessage, 'info');
        }
        api.lastResult = {
            data: {
                status,
                payment_intent_id: intentId || paymentIntentId,
                serverValidated
            }
        };
        return api.lastResult;
    }

    async function confirmCheckout() {
        if (confirming) return { data: { duplicate_click: true } };
        if (preparing && !cardElement) {
            const prepared = await preparing;
            if (prepared && prepared.error) return prepared;
        }
        const savedMethod = selectedSavedPaymentMethod();
        if ((!cardElement && !savedMethod) || !clientSecret || !stripe) {
            return { error: { message: 'Paiement indisponible : le formulaire carte Stripe n’est pas prêt. Aucun versement n’a été confirmé.' } };
        }
        confirming = true;
        const submitBtn = document.getElementById('btnConfirmCheckoutPay');
        if (submitBtn) submitBtn.disabled = true;
        try {
            let paymentMethod = savedMethod;
            if (!paymentMethod && saveConsentChecked()) {
                // Server sets setup_future_usage to on_session only after this explicit consent.
                let consentApplied = false;
                try {
                    await authorizedPaymentRequest('/v1/payments/customer-session', 'POST', {
                        payment_intent_id: paymentIntentId,
                        save_card: true
                    });
                    consentApplied = true;
                    const created = await stripe.createPaymentMethod({
                        type: 'card',
                        card: cardElement,
                        allow_redisplay: 'always'
                    });
                    if (created.error) {
                        if (staysOnForm(created.error)) {
                            setPaymentError(created.error.message || 'Vérifiez les informations de la carte.');
                            api.lastResult = { error: { message: created.error.message || 'Carte incomplète.' } };
                            return api.lastResult;
                        }
                        throw created.error;
                    }
                    paymentMethod = created.paymentMethod && created.paymentMethod.id;
                } catch (saveError) {
                    if (consentApplied) {
                        try {
                            await authorizedPaymentRequest('/v1/payments/customer-session', 'POST', {
                                payment_intent_id: paymentIntentId,
                                save_card: false
                            });
                        } catch (clearError) {}
                    }
                    if (saveError && (saveError.type === 'card_error' || saveError.type === 'validation_error')) {
                        explainPaymentFailure(refusedCopy());
                        api.lastResult = { error: { message: refusedCopy() } };
                        return api.lastResult;
                    }
                    saveAvailable = false;
                    showSaveControls(false, false);
                    setPaymentError('L’enregistrement de carte est momentanément indisponible. Vous pouvez quand même payer.');
                    paymentMethod = '';
                }
            } else if (!paymentMethod) {
                try {
                    await authorizedPaymentRequest('/v1/payments/customer-session', 'POST', {
                        payment_intent_id: paymentIntentId,
                        save_card: false
                    });
                } catch (e) {}
            }
            const confirmData = paymentMethod
                ? { payment_method: paymentMethod }
                : { payment_method: { card: cardElement } };
            const returnUrl = checkoutReturnUrl();
            if (returnUrl) confirmData.return_url = returnUrl;
            if (typeof global.showChatWait === 'function') global.showChatWait('Paiement en cours…');
            let result;
            try {
                result = await Promise.race([
                    stripe.confirmCardPayment(clientSecret, confirmData),
                    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Délai dépassé lors de la confirmation Stripe.'), { code: 'lyann_confirm_timeout' })), CONFIRM_WAIT_MS))
                ]);
            } finally {
                if (typeof global.hideChatWait === 'function') global.hideChatWait();
            }
            if (result && result.error) {
                if (staysOnForm(result.error)) {
                    setPaymentError(result.error.message || 'Vérifiez les informations de la carte.');
                    api.lastResult = { error: { message: result.error.message || 'Carte incomplète.' } };
                    return api.lastResult;
                }
                const recovered = await retrieveStatus();
                if (recovered && (recovered.status === 'succeeded' || recovered.status === 'requires_capture' || recovered.status === 'processing')) {
                    return finishConfirmedPayment(recovered.status, recovered.id);
                }
                explainPaymentFailure(refusedCopy());
                api.lastResult = { error: { message: refusedCopy() } };
                return api.lastResult;
            }
            const status = result && result.paymentIntent && result.paymentIntent.status;
            return finishConfirmedPayment(status, result && result.paymentIntent && result.paymentIntent.id);
        } catch (err) {
            const recovered = await retrieveStatus();
            if (recovered && (recovered.status === 'succeeded' || recovered.status === 'requires_capture')) {
                return finishConfirmedPayment(recovered.status, recovered.id);
            }
            const message = err && err.code === 'lyann_confirm_timeout'
                ? 'La confirmation bancaire a pris trop de temps. Aucun second paiement n’a été lancé. Rouvrez le dossier : l’état affichera le résultat dès que la banque aura répondu.'
                : refusedCopy();
            explainPaymentFailure(message);
            api.lastResult = { error: { message } };
            return api.lastResult;
        } finally {
            confirming = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function resumeRedirectedCheckout() {
        let params;
        try {
            params = new URLSearchParams(global.location.search || '');
        } catch (e) {
            return;
        }
        const secret = params.get('payment_intent_client_secret');
        if (!secret) return;
        const redirectStatus = params.get('redirect_status');
        params.delete('payment_intent');
        params.delete('payment_intent_client_secret');
        params.delete('redirect_status');
        const next = params.toString();
        if (global.history && typeof global.history.replaceState === 'function') {
            global.history.replaceState({}, '', global.location.pathname + (next ? '?' + next : '') + global.location.hash);
        }
        try {
            const stripeSdk = await getStripe();
            const retrieved = await stripeSdk.retrievePaymentIntent(secret);
            const intent = retrieved && retrieved.paymentIntent;
            clientSecret = secret;
            paymentIntentId = intent && intent.id;
            if (redirectStatus === 'failed' || !intent) {
                explainPaymentFailure(refusedCopy());
                return;
            }
            await finishConfirmedPayment(intent.status, intent.id);
        } catch (err) {
            explainPaymentFailure(refusedCopy());
        }
    }

    const api = {
        prepareCheckout,
        confirmCheckout,
        destroyCard,
        resumeRedirectedCheckout,
        lastResult: null
    };
    global.LYANN_STRIPE = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { resumeRedirectedCheckout(); }, { once: true });
        } else {
            resumeRedirectedCheckout();
        }
    }
})(window);
