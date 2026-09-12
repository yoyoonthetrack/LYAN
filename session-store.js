(() => {
  'use strict';

  if (window.LYANN_SESSION) return;

  const listeners = new Set();
  const state = {
    status: 'idle',
    session: null,
    user: null,
    error: null,
    revision: 0,
    initializedAt: null,
    readyAt: null
  };

  let readyPromise = null;
  let authSubscription = null;
  let originals = null;

  function snapshot() {
    return Object.freeze({ ...state });
  }

  function publish() {
    const current = snapshot();
    window.__LYANN_SESSION_STATE__ = current;
    listeners.forEach((listener) => {
      try { listener(current); } catch (error) { console.error('[LYANN_SESSION] listener failed', error); }
    });
    window.dispatchEvent(new CustomEvent('lyann:session', { detail: current }));
  }

  function setState(next) {
    Object.assign(state, next, { revision: state.revision + 1 });
    publish();
  }

  function client() {
    return window.LYANN_API_CLIENT || window.apiClient || null;
  }

  function installClientFacade(api) {
    if (!api || api.__lyannSessionFacadeInstalled) return;

    originals = {
      getSession: typeof api.getSession === 'function' ? api.getSession.bind(api) : null,
      getCurrentUser: typeof api.getCurrentUser === 'function' ? api.getCurrentUser.bind(api) : null
    };

    if (originals.getSession) {
      api.getSession = async () => {
        await initialize();
        return { data: { session: state.session }, error: state.error };
      };
    }

    if (originals.getCurrentUser) {
      api.getCurrentUser = async () => {
        await initialize();
        return state.user;
      };
    }

    api.__lyannSessionFacadeInstalled = true;
  }

  async function initialize() {
    if (state.status === 'ready') return snapshot();
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      const api = client();
      if (!api?.supabase) {
        const error = new Error('Supabase API client is not available');
        setState({ status: 'error', error, initializedAt: Date.now() });
        throw error;
      }

      setState({ status: 'loading', error: null, initializedAt: Date.now() });
      installClientFacade(api);

      const getSession = originals?.getSession
        ? originals.getSession
        : () => api.supabase.auth.getSession();

      const { data, error } = await getSession();
      if (error) {
        setState({ status: 'error', error, session: null, user: null, readyAt: Date.now() });
        throw error;
      }

      const session = data?.session || null;
      setState({
        status: 'ready',
        session,
        user: session?.user || null,
        error: null,
        readyAt: Date.now()
      });

      if (!authSubscription) {
        const result = api.supabase.auth.onAuthStateChange((_event, nextSession) => {
          setState({
            status: 'ready',
            session: nextSession || null,
            user: nextSession?.user || null,
            error: null,
            readyAt: state.readyAt || Date.now()
          });
        });
        authSubscription = result?.data?.subscription || null;
      }

      return snapshot();
    })();

    try {
      return await readyPromise;
    } finally {
      if (state.status === 'error') readyPromise = null;
    }
  }

  function subscribe(listener, { immediate = true } = {}) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    if (immediate) listener(snapshot());
    return () => listeners.delete(listener);
  }

  function getSnapshot() {
    return snapshot();
  }

  async function getSession() {
    await initialize();
    return state.session;
  }

  async function getUser() {
    await initialize();
    return state.user;
  }

  window.LYANN_SESSION = {
    initialize,
    ready: initialize,
    subscribe,
    getSnapshot,
    getSession,
    getUser
  };

  // The script is intentionally loaded after api-client.js. Start resolving
  // authentication immediately so later feature scripts can consume one
  // deterministic session promise instead of issuing their own boot reads.
  initialize().catch((error) => {
    console.error('[LYANN_SESSION] initialization failed', error);
  });
})();
