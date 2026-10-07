(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_PAYOUT_ACCOUNT = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Same payable rule as api/stripe-policy.js connectPayoutReady, which
    // create-milestone-intent uses via providerCanBePaid. payouts_enabled alone
    // is not enough.
    function payoutAccountState(status) {
        if (!status || status.success === false) return 'error';
        const payable = status.ready === true
            && status.account_created === true
            && status.onboarding_completed === true
            && status.transfers_active === true
            && status.payouts_enabled === true;
        if (payable) return 'active';
        if (status.account_created === true) return 'incomplete';
        return 'none';
    }

    function payoutReturnUrls() {
        return {
            return_url: 'https://lyann.app/?action=finances&connect=return',
            refresh_url: 'https://lyann.app/?action=finances&connect=refresh'
        };
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
        loading: { subtitle: 'Vérification…', action: '', ready: false },
        none: { subtitle: 'À configurer', action: 'Configurer', ready: false },
        incomplete: { subtitle: 'Configuration à terminer', action: 'Continuer', ready: false },
        active: { subtitle: 'Compte de versement actif', action: '', ready: true },
        error: { subtitle: 'Impossible de vérifier votre compte de versement.', action: 'Réessayer', ready: false }
    };

    function renderPayoutAccount(state) {
        const view = COPY[state] || COPY.error;
        return {
            state,
            subtitle: view.subtitle,
            actionLabel: view.action,
            actionVisible: Boolean(view.action),
            readyVisible: view.ready
        };
    }

    async function authHeader() {
        const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
        const session = supabase ? await supabase.auth.getSession() : null;
        const token = session && session.data && session.data.session && session.data.session.access_token;
        if (!token) return null;
        return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    }

    async function connectRequest(path, options) {
        const headers = await authHeader();
        if (!headers) {
            const error = new Error('auth');
            error.code = 401;
            throw error;
        }
        const fetcher = window.lyannBackendFetch || window.fetch.bind(window);
        const response = await fetcher(path, Object.assign({ headers }, options || {}));
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

    function openStripe(url) {
        try { sessionStorage.setItem('lyann_payout_setup', '1'); } catch (_) {}
        if (isNative()) {
            const opened = window.open(url, '_blank');
            if (!opened) window.location.assign(url);
            return;
        }
        window.location.assign(url);
    }

    async function startOnboarding() {
        const status = await connectRequest('/v1/payments/connect/status');
        if (!status.account_created) await connectRequest('/v1/payments/connect/account', { method: 'POST', body: '{}' });
        const link = await connectRequest('/v1/payments/connect/onboarding-link', {
            method: 'POST',
            body: JSON.stringify(payoutReturnUrls())
        });
        if (!link.url) throw new Error('api');
        openStripe(link.url);
    }

    function paint(view) {
        const subtitle = document.getElementById('payoutAccountState');
        const action = document.getElementById('payoutAccountAction');
        const ready = document.getElementById('payoutAccountReady');
        if (subtitle) subtitle.textContent = view.subtitle;
        if (action) {
            action.hidden = !view.actionVisible;
            action.textContent = view.actionLabel;
            action.disabled = false;
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
                    await startOnboarding();
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
            const state = await refresh();
            if (mode === 'refresh' && state !== 'active' && state !== 'error') {
                try { await startOnboarding(); } catch (_) { paint(renderPayoutAccount('error')); }
            }
        });
    }

    function watchAppReturn() {
        const resume = () => {
            let pending = '';
            try { pending = sessionStorage.getItem('lyann_payout_setup') || ''; } catch (_) {}
            if (pending !== '1') return;
            if (document.getElementById('payoutAccountState')) refresh();
        };
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
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }

    return { payoutAccountState, payoutReturnUrls, readConnectParam, clearConnectParam, renderPayoutAccount, mount, refresh };
});
