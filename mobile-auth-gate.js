/*
 * LYANN mobile authentication gate (Phase 3.0A).
 *
 * Inside the Capacitor app (iOS and Android) a visitor without a real Supabase session never sees a member page.
 * The gate is a small state machine with three exclusive states:
 *
 *   CHECKING_SESSION  the session is being resolved. Nothing of the page is visible, only a loader.
 *   GUEST             no session. Only bienvenue.html (welcome slides + sign-in / sign-up) is reachable.
 *   AUTHENTICATED     a real session. Member pages are visible, the welcome page forwards to Découvrir.
 *
 * Source of truth: LYANN_AUTH_STATE, itself fed by supabase.auth.getSession() / onAuthStateChange. The legacy
 * localStorage flag lyan_user_logged_in is never read here.
 *
 * A temporary failure (network down, token endpoint unreachable) leaves the machine in CHECKING_SESSION with a retry
 * panel. It is never interpreted as a logout, and a "no session" answer is double-checked against the stored token.
 *
 * The script is injected in <head> by the mobile build only (shared-html-build.injectMobileAuthGate). It is a no-op on
 * the website: the public marketing site and its SEO pages are not restricted.
 */
(function (root) {
  'use strict';

  var WELCOME_PAGE = 'bienvenue.html';
  var APP_HOME = 'discover.html';
  var TARGET_KEY = 'lyann_post_auth_target';
  var LOOP_KEY = 'lyann_gate_hops';
  var STATES = { CHECKING: 'CHECKING_SESSION', GUEST: 'GUEST', AUTHENTICATED: 'AUTHENTICATED' };

  // Pages that never go through the gate: authentication callbacks, legal texts needed during sign-up,
  // and the back-office, which owns its own authentication and is not part of the member app.
  var OPEN_PAGES = {
    'auth-callback': 1, 'auth/callback': 1, 'confirm-signup': 1, 'legal': 1, 'confidentialite': 1,
    'admin': 1, 'admin-login': 1, 'business-admin': 1,
    // index.html is only a redirect to discover.html (the page that follows is gated).
    'index': 1
  };
  var AUTH_ACTIONS = { email_confirmed: 1, open_login: 1, resend_confirmation: 1, reset_password: 1 };

  function pageKey(pathname) {
    var path = String(pathname || '').split('?')[0].split('#')[0];
    path = path.replace(/^\/+/, '').replace(/\.html$/i, '').toLowerCase();
    var parts = path.split('/');
    if (parts.length > 1 && parts[0] === 'auth') return 'auth/' + parts[1];
    return parts[parts.length - 1] || 'index';
  }

  // 'open' | 'guest-entry' | 'member'
  function classifyPath(pathname) {
    var key = pageKey(pathname);
    if (OPEN_PAGES[key]) return 'open';
    if (key === 'bienvenue') return 'guest-entry';
    return 'member';
  }

  function isSafeTarget(target) {
    if (typeof target !== 'string' || target.length > 600) return false;
    if (!/^[a-z0-9_-]+\.html(?:[?#][^\s]*)?$/i.test(target)) return false;
    return classifyPath(target.split(/[?#]/)[0]) === 'member';
  }

  // Only the authentication actions travel from a protected page to the welcome page.
  function authPassthrough(search, hash) {
    var out = '';
    try {
      var params = new URLSearchParams(search || '');
      var action = params.get('action');
      if (action && AUTH_ACTIONS[action]) out = '?action=' + encodeURIComponent(action);
    } catch (_) {}
    var h = String(hash || '');
    if (/(^#|&)(access_token|error|error_description|type)=/.test(h)) out += h;
    return out;
  }

  function stateFromAuth(snapshot) {
    if (!snapshot) return STATES.CHECKING;
    if (snapshot.status === 'ready') return snapshot.authenticated ? STATES.AUTHENTICATED : STATES.GUEST;
    return STATES.CHECKING; // 'resolving' and 'error'
  }

  var api = {
    STATES: STATES,
    classifyPath: classifyPath,
    isSafeTarget: isSafeTarget,
    authPassthrough: authPassthrough,
    stateFromAuth: stateFromAuth
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || root !== window) return;
  if (window.LYANN_MOBILE_AUTH) return;

  var native = false;
  try {
    var cap = window.Capacitor;
    native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) || location.protocol === 'capacitor:';
  } catch (_) {}

  var kind = classifyPath(location.pathname);
  var gated = native && kind !== 'open';
  var state = STATES.CHECKING;
  var listeners = [];
  var degraded = false;

  window.LYANN_MOBILE_AUTH = Object.assign({
    native: native,
    kind: kind,
    gated: gated,
    getState: function () { return gated ? state : null; },
    isDegraded: function () { return degraded; },
    subscribe: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    retry: function () { retrySession('manual'); }
  }, api);

  if (!gated) return;

  var doc = document;
  var html = doc.documentElement;

  // ---- Loader and hidden page -------------------------------------------------------------------------------
  var style = doc.createElement('style');
  style.id = 'lyannGateStyle';
  style.textContent =
    'html.lyann-gate-checking,html.lyann-gate-checking body{background:#F7F5F0!important}' +
    'html.lyann-gate-checking body>*:not(.lyann-boot-splash):not(#lyannGatePanel){visibility:hidden!important}' +
    'html.lyann-gate-checking:not(.lyann-gate-offline)::after{content:"";position:fixed;left:50%;top:50%;width:30px;height:30px;' +
    'margin:-15px 0 0 -15px;border:3px solid rgba(74,124,89,.22);border-top-color:#4A7C59;border-radius:50%;' +
    'animation:lyannGateSpin .8s linear infinite;z-index:2147482000}' +
    '@keyframes lyannGateSpin{to{transform:rotate(360deg)}}' +
    '#lyannGatePanel{position:fixed;inset:0;z-index:2147482500;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:14px;padding:32px;text-align:center;background:#F7F5F0;color:#243329;font-family:Outfit,system-ui,sans-serif}' +
    '#lyannGatePanel h1{margin:0;font-size:1.25rem;font-weight:800}' +
    '#lyannGatePanel p{margin:0;max-width:300px;line-height:1.45;color:#4A5A50}' +
    '#lyannGatePanel button{margin-top:6px;min-height:48px;padding:0 28px;border:0;border-radius:14px;background:#4A7C59;color:#fff;font:700 1rem Outfit,system-ui,sans-serif}';
  (doc.head || html).appendChild(style);
  html.classList.add('lyann-gate-checking');
  // "Sign in with Apple" is native to iOS only: no Apple button on Android (it could only fail).
  try {
    if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'android') {
      html.classList.add('lyann-native-android');
      style.textContent += 'html.lyann-native-android .btn-apple-auth{display:none!important}';
    }
  } catch (_) {}

  function reveal() {
    html.classList.remove('lyann-gate-checking', 'lyann-gate-offline');
    removePanel();
  }

  function removePanel() {
    var panel = doc.getElementById('lyannGatePanel');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }

  function showPanel() {
    html.classList.add('lyann-gate-offline');
    if (doc.getElementById('lyannGatePanel') || !doc.body) return;
    var panel = doc.createElement('div');
    panel.id = 'lyannGatePanel';
    panel.setAttribute('role', 'alert');
    panel.innerHTML = '<h1>Connexion impossible</h1>' +
      '<p>LYANN ne parvient pas à joindre le serveur. Ta session est conservée : vérifie ta connexion puis réessaie.</p>' +
      '<button type="button" id="lyannGateRetry">Réessayer</button>';
    doc.body.appendChild(panel);
    panel.querySelector('#lyannGateRetry').addEventListener('click', function () { retrySession('manual'); });
  }

  // ---- Navigation -------------------------------------------------------------------------------------------
  function loopGuard() {
    try {
      var now = Date.now();
      var hops = JSON.parse(sessionStorage.getItem(LOOP_KEY) || '[]').filter(function (t) { return now - t < 4000; });
      hops.push(now);
      sessionStorage.setItem(LOOP_KEY, JSON.stringify(hops));
      return hops.length <= 4;
    } catch (_) { return true; }
  }

  // The state is re-evaluated on several signals (event, DOMContentLoaded, load): one navigation per decision.
  var navigating = false;
  var wasAuthenticated = false;
  function startNavigation() {
    if (navigating) return false;
    navigating = true;
    setTimeout(function () { navigating = false; }, 3000);
    return true;
  }

  function toWelcome() {
    html.classList.add('lyann-gate-checking');
    if (!startNavigation()) return;
    if (wasAuthenticated) { try { sessionStorage.removeItem(TARGET_KEY); } catch (_) {} }
    if (!loopGuard()) { degraded = true; showPanel(); return; }
    // A deep link met without a session is remembered for after sign-in. A logout or an expiry is not: the next
    // sign-in opens Découvrir.
    if (kind === 'member' && !wasAuthenticated) {
      try {
        var here = location.pathname.split('/').pop() + location.search + location.hash;
        if (isSafeTarget(here) && pageKey(location.pathname) !== 'discover') sessionStorage.setItem(TARGET_KEY, here);
      } catch (_) {}
    }
    location.replace(WELCOME_PAGE + authPassthrough(location.search, location.hash));
  }

  function toApp() {
    if (!startNavigation()) return;
    if (!loopGuard()) { degraded = true; showPanel(); return; }
    var target = APP_HOME;
    try {
      var stored = sessionStorage.getItem(TARGET_KEY);
      sessionStorage.removeItem(TARGET_KEY);
      if (isSafeTarget(stored)) target = stored;
    } catch (_) {}
    location.replace(target);
  }

  function recoveryPending() {
    if (window.__lyannRecoveryPending) return true;
    if (doc.getElementById('lyannPasswordRecoveryOverlay')) return true;
    return /(^|[?&])action=reset_password/.test(location.search) || /type=recovery/.test(location.hash);
  }

  // ---- State machine ----------------------------------------------------------------------------------------
  function hasStoredToken() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        if (/^sb-.*-auth-token$/.test(localStorage.key(i) || '')) return true;
      }
    } catch (_) {}
    return false;
  }

  function setState(next) {
    if (state === next) return;
    var previous = state;
    state = next;
    html.setAttribute('data-lyann-mobile-auth', next);
    listeners.forEach(function (fn) { try { fn(next, previous); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('lyann:mobile-auth-state', { detail: { state: next, previous: previous } })); } catch (_) {}
  }

  function applyState() {
    if (state === STATES.AUTHENTICATED) {
      wasAuthenticated = true;
      degraded = false;
      clearRetry();
      if (kind === 'guest-entry') {
        if (recoveryPending()) { reveal(); return; }
        toApp();
        return;
      }
      reveal();
    } else if (state === STATES.GUEST) {
      degraded = false;
      clearRetry();
      if (kind === 'guest-entry') reveal();
      else toWelcome();
    }
  }

  function evaluate(snapshot) {
    if (snapshot && snapshot.status === 'error') {
      // Without a stored token there is no session to lose: the failure cannot be hiding a member (typical when the
      // Supabase SDK could not be downloaded offline). With a stored token the answer is unknown: keep checking.
      if (!hasStoredToken()) { setState(STATES.GUEST); applyState(); return; }
      onSessionError();
      return;
    }
    var next = stateFromAuth(snapshot);
    // "No session" while a stored token is still there means the answer cannot be trusted yet (a refresh that could
    // not complete). Keep checking instead of treating it as a logout.
    if (next === STATES.GUEST && hasStoredToken() && navigator.onLine === false) { onSessionError(); return; }
    setState(next);
    applyState();
  }

  var retryTimer = null;
  var retryCount = 0;
  var RETRY_DELAYS = [700, 2000, 5000, 10000];

  function clearRetry() { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } retryCount = 0; }

  function onSessionError() {
    setState(STATES.CHECKING);
    degraded = true;
    if (retryTimer) return;
    if (retryCount >= 2) showPanel();
    var delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
    retryTimer = setTimeout(function () { retryTimer = null; retryCount += 1; retrySession('auto'); }, delay);
  }

  function retrySession(reason) {
    if (!window.supabase) {
      // The Supabase SDK itself did not load (offline cold start). Only a reload can fetch it again, and only on an
      // explicit signal (the member taps Réessayer, or the network comes back): never in a loop.
      degraded = true;
      showPanel();
      if (reason === 'manual' || reason === 'online') { try { location.reload(); } catch (_) {} }
      return;
    }
    if (window.LYANN_SESSION && typeof window.LYANN_SESSION.initialize === 'function') {
      window.LYANN_SESSION.initialize().catch(function () { /* the status event drives the next step */ });
    }
    if (reason === 'manual' && !retryTimer) { retryCount = 0; }
  }

  function poll() {
    var auth = window.LYANN_AUTH_STATE;
    if (auth && typeof auth.getSnapshot === 'function') evaluate(auth.getSnapshot());
  }

  window.addEventListener('lyann:auth-state', function (event) { evaluate(event.detail); });
  window.addEventListener('online', function () { if (state === STATES.CHECKING) retrySession('online'); });
  window.addEventListener('lyann:recovery-closed', function () { if (state === STATES.AUTHENTICATED) applyState(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) poll(); });
  doc.addEventListener('DOMContentLoaded', poll);
  window.addEventListener('load', poll);

  // Watchdog: a refresh that hangs on a bad network (Supabase retries for up to ~30 s) or auth scripts that never
  // started. After 8 s the member gets the retry panel; the page stays closed and the session untouched.
  setTimeout(function () {
    if (state !== STATES.CHECKING) return;
    degraded = true;
    showPanel();
    var auth = window.LYANN_AUTH_STATE;
    if (!auth) onSessionError();
  }, 8000);
})(typeof window !== 'undefined' ? window : this);
