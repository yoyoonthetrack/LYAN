(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_PAYOUT_ACCOUNT = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Same payable rule as connectPayoutReady: ready does not depend on payouts_enabled.
    // pending = account exists, onboarding done, transfers not yet active (verification).
    function payoutAccountState(status) {
        if (!status || status.success === false) return 'error';
        const payable = status.ready === true
            && status.account_created === true
            && status.onboarding_completed === true
            && status.transfers_active === true;
        if (payable) return 'active';
        if (status.account_created === true && status.onboarding_completed === true && status.transfers_active !== true) {
            return 'pending';
        }
        if (status.account_created === true) return 'incomplete';
        return 'none';
    }

    function payoutReturnUrlsFromLocation(href) {
        try {
            const url = new URL(String(href || ''));
            if (url.hostname === '127.0.0.1' && String(url.port || '') === '8098') {
                const page = url.pathname && url.pathname !== '/' ? url.pathname : '/feed.html';
                const base = 'http://127.0.0.1:8098' + page;
                return {
                    return_url: base + '?action=finances&connect=return',
                    refresh_url: base + '?action=finances&connect=refresh'
                };
            }
        } catch (_) {}
        return {
            return_url: 'https://lyann.app/?action=finances&connect=return',
            refresh_url: 'https://lyann.app/?action=finances&connect=refresh'
        };
    }

    function payoutReturnUrls() {
        const href = typeof window !== 'undefined' && window.location ? window.location.href : '';
        return payoutReturnUrlsFromLocation(href);
    }

    function readConnectParam(search) {
        const value = new URLSearchParams(search || '').get('connect');
        return value === 'return' || value === 'refresh' ? value : '';
    }

    function clearConnectParam(href) {
        const url = new URL(href, 'https://lyann.app/');
        url.searchParams.delete('connect');
        return url.pathname + url.search + url.hash;
    }

    const COPY = {
        loading: { title: 'Compte de versement', subtitle: 'Vérification…', action: '', ready: false, intent: 'onboarding' },
        none: { title: 'Compte de versement', subtitle: 'À configurer', action: 'Configurer', ready: false, intent: 'onboarding' },
        incomplete: { title: 'Compte de versement', subtitle: 'Configuration à terminer', action: 'Continuer', ready: false, intent: 'onboarding' },
        pending: { title: 'Compte de versement', subtitle: 'Vérification en cours', action: '', ready: false, intent: '' },
        active: {
            title: 'Compte de versement actif',
            subtitle: 'Vos informations de versement sont configurées.',
            action: 'Modifier',
            ready: true,
            intent: 'update'
        },
        error: { title: 'Compte de versement', subtitle: 'Impossible de vérifier votre compte de versement. Vérifiez votre connexion, puis réessayez.', action: 'Réessayer', ready: false, intent: 'onboarding' }
    };

    function payoutLinkPath(intent) {
        return intent === 'update'
            ? '/v1/payments/connect/express-dashboard-link'
            : '/v1/payments/connect/onboarding-link';
    }

    function renderPayoutAccount(state) {
        const view = COPY[state] || COPY.error;
        return {
            state,
            title: view.title,
            subtitle: view.subtitle,
            actionLabel: view.action,
            actionVisible: Boolean(view.action),
            readyVisible: view.ready,
            intent: view.intent
        };
    }

    async function authHeader() {
        const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
        const session = supabase ? await supabase.auth.getSession() : null;
        const token = session && session.data && session.data.session && session.data.session.access_token;
        if (!token) return null;
        return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    }

    const SIM_KEY = 'lyann_connect_sim';

    function connectSimulationBody(state) {
        const base = {
            success: true,
            ready: false,
            account_created: false,
            onboarding_completed: false,
            transfers_active: false,
            payouts_enabled: false,
            charges_enabled: false
        };
        if (state === 'none') return base;
        if (state === 'incomplete') return Object.assign({}, base, { account_created: true });
        if (state === 'pending') return Object.assign({}, base, { account_created: true, onboarding_completed: true });
        if (state === 'active') {
            return Object.assign({}, base, {
                ready: true,
                account_created: true,
                onboarding_completed: true,
                transfers_active: true
            });
        }
        if (state === 'error') return { success: false };
        return null;
    }

    function readConnectSimulation() {
        try {
            const raw = sessionStorage.getItem(SIM_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && parsed.state ? String(parsed.state) : '';
        } catch (_) {
            return '';
        }
    }

    function simulateConnect(state) {
        try {
            if (!state) sessionStorage.removeItem(SIM_KEY);
            else sessionStorage.setItem(SIM_KEY, JSON.stringify({ state: String(state) }));
        } catch (_) {}
        return readConnectSimulation();
    }

    async function connectRequest(path, options) {
        const method = String((options && options.method) || 'GET').toUpperCase();
        const sim = readConnectSimulation();
        if (sim && method === 'GET' && /\/v1\/payments\/connect\/(status|peer-status)/.test(String(path || ''))) {
            if (sim === 'unknown') {
                const error = new Error('unknown');
                error.code = 'unknown';
                throw error;
            }
            const body = connectSimulationBody(sim);
            if (body) return body;
        }
        const headers = await authHeader();
        if (!headers) {
            const error = new Error('auth');
            error.code = 401;
            throw error;
        }
        const fetcher = window.lyannBackendFetch || window.fetch.bind(window);
        let response;
        try {
            response = await fetcher(path, Object.assign({ headers }, options || {}));
        } catch (networkError) {
            const error = new Error('network');
            error.code = 0;
            error.cause = networkError;
            throw error;
        }
        let body = {};
        try { body = await response.json(); } catch (_) {}
        if (response.status === 401) {
            const error = new Error('auth');
            error.code = 401;
            throw error;
        }
        if (!response.ok) {
            const error = new Error('api');
            error.code = response.status;
            throw error;
        }
        return body;
    }

    function isNative() {
        return (typeof window.isNativePlatform === 'function' && window.isNativePlatform())
            || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    const RETURN_KEY = 'lyann_payout_return';

    function rememberPayoutReturn(hint) {
        const payload = hint && typeof hint === 'object' ? {
            requestId: hint.requestId || null,
            invitationId: hint.invitationId || null,
            contactId: hint.contactId || null,
            conversationId: hint.conversationId || null,
            contactName: hint.contactName || '',
            at: Date.now()
        } : null;
        try {
            if (payload && (payload.requestId || payload.invitationId || payload.contactId)) {
                sessionStorage.setItem(RETURN_KEY, JSON.stringify(payload));
            }
            sessionStorage.setItem('lyann_payout_setup', '1');
        } catch (_) {}
        return payload;
    }

    function readPayoutReturn() {
        try {
            const raw = sessionStorage.getItem(RETURN_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function clearPayoutReturn() {
        try { sessionStorage.removeItem(RETURN_KEY); } catch (_) {}
    }

    async function openStripe(url) {
        try { sessionStorage.setItem('lyann_payout_setup', '1'); } catch (_) {}
        const app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (isNative() && app && typeof app.openUrl === 'function') {
            try {
                await app.openUrl({ url: url });
                return;
            } catch (_) {}
        }
        if (isNative()) {
            const opened = window.open(url, '_blank');
            if (!opened) window.location.assign(url);
            return;
        }
        window.location.assign(url);
    }

    async function fetchReadiness(userId) {
        const sim = readConnectSimulation();
        if (sim === 'unknown') return 'unknown';
        if (sim === 'error') return 'error';
        if (sim) return payoutAccountState(connectSimulationBody(sim));
        const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
        const session = supabase ? await supabase.auth.getSession() : null;
        const mine = session && session.data && session.data.session && session.data.session.user && session.data.session.user.id;
        const path = mine && String(userId) === String(mine)
            ? '/v1/payments/connect/status'
            : '/v1/payments/connect/peer-status?user_id=' + encodeURIComponent(String(userId || ''));
        const body = await connectRequest(path);
        return payoutAccountState(body);
    }

    async function beginPayoutSetup(hint) {
        rememberPayoutReturn(hint);
        try {
            await startOnboarding();
        } catch (error) {
            if (error && error.code === 401 && typeof window.requireAuthSession === 'function') {
                window.requireAuthSession('Compte de versement');
            }
            throw error;
        }
    }

    async function startOnboarding() {
        const status = await connectRequest('/v1/payments/connect/status');
        if (!status.account_created) await connectRequest('/v1/payments/connect/account', { method: 'POST', body: '{}' });
        const link = await connectRequest('/v1/payments/connect/onboarding-link', {
            method: 'POST',
            body: JSON.stringify(payoutReturnUrls())
        });
        if (!link.url) throw new Error('api');
        await openStripe(link.url);
    }

    async function startAccountUpdate() {
        const link = await connectRequest(payoutLinkPath('update'), {
            method: 'POST',
            body: '{}'
        });
        if (!link.url) throw new Error('api');
        await openStripe(link.url);
    }

    function paint(view) {
        const title = document.getElementById('payoutAccountTitle');
        const subtitle = document.getElementById('payoutAccountState');
        const action = document.getElementById('payoutAccountAction');
        const ready = document.getElementById('payoutAccountReady');
        if (title) title.textContent = view.title;
        if (subtitle) subtitle.textContent = view.subtitle;
        if (action) {
            action.hidden = !view.actionVisible;
            action.textContent = view.actionLabel;
            action.disabled = false;
            action.dataset.intent = view.intent || 'onboarding';
            action.classList.toggle('is-payout-update', view.intent === 'update');
        }
        if (ready) ready.hidden = !view.readyVisible;
    }

    async function refresh() {
        paint(renderPayoutAccount('loading'));
        try {
            const status = await connectRequest('/v1/payments/connect/status');
            const state = payoutAccountState(status);
            paint(renderPayoutAccount(state));
            if (state === 'active') {
                try { sessionStorage.removeItem('lyann_payout_setup'); } catch (_) {}
            }
            return state;
        } catch (error) {
            if (error && error.code === 401 && typeof window.requireAuthSession === 'function') {
                window.requireAuthSession('Compte de versement');
            }
            paint(renderPayoutAccount('error'));
            return 'error';
        }
    }

    function mount() {
        const action = document.getElementById('payoutAccountAction');
        if (action && !action.dataset.bound) {
            action.dataset.bound = '1';
            action.addEventListener('click', async () => {
                action.disabled = true;
                try {
                    if (action.dataset.intent === 'update') await startAccountUpdate();
                    else await startOnboarding();
                } catch (error) {
                    if (error && error.code === 401 && typeof window.requireAuthSession === 'function') {
                        window.requireAuthSession('Compte de versement');
                    }
                    paint(renderPayoutAccount('error'));
                }
            });
        }
        return refresh();
    }

    function consumeReturn() {
        const mode = readConnectParam(window.location.search);
        if (!mode) return;
        const next = clearConnectParam(window.location.href);
        window.history.replaceState({}, '', next);
        const open = () => {
            if (typeof window.openAccountModalSubView === 'function') {
                return window.openAccountModalSubView('finances');
            }
            return null;
        };
        Promise.resolve(open()).then(async () => {
            const hint = readPayoutReturn();
            const state = await refresh();
            try {
                window.dispatchEvent(new CustomEvent('lyann:payout-readiness', { detail: { state: state || 'error', hint: hint || null } }));
                window.dispatchEvent(new CustomEvent('lyann:payout-return', { detail: { state: state || 'error', hint: hint || null } }));
            } catch (_) {}
            if (hint && (hint.requestId || hint.invitationId)) return;
            if (mode === 'refresh' && state !== 'active' && state !== 'error') {
                try { await startOnboarding(); } catch (_) { paint(renderPayoutAccount('error')); }
            }
        });
    }

    async function resumeSetup() {
        let pending = '';
        try { pending = sessionStorage.getItem('lyann_payout_setup') || ''; } catch (_) {}
        if (pending !== '1') return null;
        if (typeof window.openAccountModalSubView === 'function') {
            try { await window.openAccountModalSubView('finances'); } catch (_) {}
        }
        const hint = readPayoutReturn();
        const state = await refresh();
        try {
            window.dispatchEvent(new CustomEvent('lyann:payout-readiness', { detail: { state: state || 'error', hint: hint || null } }));
            window.dispatchEvent(new CustomEvent('lyann:payout-return', { detail: { state: state || 'error', hint: hint || null } }));
        } catch (_) {}
        return state;
    }

    function watchAppReturn() {
        const resume = () => { resumeSetup(); };
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) resume();
        });
        const app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (app && typeof app.addListener === 'function') {
            app.addListener('appStateChange', (state) => {
                if (state && state.isActive) resume();
            });
        }
    }

    if (typeof document !== 'undefined') {
        const boot = () => {
            watchAppReturn();
            consumeReturn();
            if (!readConnectParam(window.location.search)) {
                Promise.resolve(resumeSetup()).catch(() => {});
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }

    return { payoutAccountState, payoutReturnUrls, payoutReturnUrlsFromLocation, payoutLinkPath, readConnectParam, clearConnectParam, renderPayoutAccount, mount, refresh, fetchReadiness, beginPayoutSetup, resumeSetup, rememberPayoutReturn, readPayoutReturn, clearPayoutReturn, simulateConnect, connectSimulationBody, readConnectSimulation };
});
