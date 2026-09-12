(() => {
  'use strict';

  if (window.LYANN_AUTH_STATE) return;

  let current = {
    status: 'resolving',
    session: null,
    user: null,
    userId: null,
    authenticated: false,
    revision: 0
  };

  const listeners = new Set();
  let readyResolve;
  const readyPromise = new Promise((resolve) => { readyResolve = resolve; });
  let readyResolved = false;

  function snapshot() {
    return Object.freeze({ ...current });
  }

  function mirrorLegacyState(next) {
    window.CURRENT_USER_ID = next.userId || null;
    window.__LYANN_AUTH_REAL__ = window.__LYANN_AUTH_REAL__ || {};
    window.__LYANN_AUTH_REAL__.hasSession = next.authenticated;
    window.__LYANN_AUTH_REAL__.userId = next.userId || null;
    window.__LYANN_AUTH_REAL__.lastAuthEvent = next.authenticated ? 'SESSION_AUTHENTICATED' : 'SESSION_ANONYMOUS';

    try {
      if (next.status === 'ready') {
        if (next.authenticated) {
          localStorage.setItem('lyan_user_logged_in', 'true');
          if (next.userId) localStorage.setItem('lyan_user_id', next.userId);
        } else {
          localStorage.removeItem('lyan_user_logged_in');
          localStorage.removeItem('lyan_user_id');
        }
      }
    } catch (_) {}
  }

  function applyBodyState(next) {
    if (!document.body) return;
    const ready = next.status === 'ready';
    document.body.classList.toggle('auth-resolving', !ready);
    document.body.classList.toggle('auth-ready', ready);
    document.body.classList.toggle('user-is-logged-in', ready && next.authenticated);
    document.body.classList.toggle('user-is-logged-out', ready && !next.authenticated);
  }

  function publish(next) {
    current = { ...current, ...next, revision: current.revision + 1 };
    mirrorLegacyState(current);
    applyBodyState(current);

    const state = snapshot();
    window.__LYANN_AUTH_STATE__ = state;
    listeners.forEach((listener) => {
      try { listener(state); } catch (error) { console.error('[LYANN_AUTH_STATE] listener failed', error); }
    });
    window.dispatchEvent(new CustomEvent('lyann:auth-state', { detail: state }));

    if (state.status === 'ready' && !readyResolved) {
      readyResolved = true;
      readyResolve(state);
      window.dispatchEvent(new CustomEvent('lyann:auth-ready', { detail: state }));
    }
  }

  function consumeSessionState(sessionState) {
    const ready = sessionState?.status === 'ready';
    const user = sessionState?.user || sessionState?.session?.user || null;
    publish({
      status: ready ? 'ready' : (sessionState?.status || 'resolving'),
      session: sessionState?.session || null,
      user,
      userId: user?.id || null,
      authenticated: !!user
    });
  }

  function subscribe(listener, { immediate = true } = {}) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    if (immediate) listener(snapshot());
    return () => listeners.delete(listener);
  }

  function isAuthenticated() {
    return current.status === 'ready' && current.authenticated === true;
  }

  async function ready() {
    if (current.status === 'ready') return snapshot();
    return readyPromise;
  }

  window.LYANN_AUTH_STATE = { getSnapshot: snapshot, subscribe, isAuthenticated, ready };

  const start = () => {
    applyBodyState(current);
    if (!window.LYANN_SESSION) {
      console.error('[LYANN_AUTH_STATE] LYANN_SESSION is required before auth-state.js');
      publish({ status: 'error', authenticated: false, session: null, user: null, userId: null });
      return;
    }

    window.LYANN_SESSION.subscribe(consumeSessionState);
    window.LYANN_SESSION.ready().then(consumeSessionState).catch((error) => {
      console.error('[LYANN_AUTH_STATE] session resolution failed', error);
      publish({ status: 'error', authenticated: false, session: null, user: null, userId: null });
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
