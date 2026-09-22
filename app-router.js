// LYANN canonical application router.
// One public navigation owner for Web and Capacitor; presentation remains responsive.
(function () {
  'use strict';

  if (window.LYANN_ROUTER && window.LYANN_ROUTER.__canonical) return;

  const routes = new Map();
  let captureNavigationInstalled = false;

  function sameDocumentPath(target) {
    try {
      const url = new URL(target, window.location.href);
      return url.pathname === window.location.pathname;
    } catch (_) {
      return false;
    }
  }

  function hardNavigate(target) {
    if (!target) return false;
    window.location.assign(target);
    return true;
  }

  function closeDrawer() {
    if (typeof window.closeLyannHamburgerDrawer === 'function') {
      window.closeLyannHamburgerDrawer();
    }
  }

  function openLoginPrompt() {
    closeDrawer();
    if (typeof window.openLoginModal === 'function') {
      window.openLoginModal();
      return true;
    }
    if (typeof window.openLogin === 'function') {
      window.openLogin();
      return true;
    }
    const trigger = document.querySelector?.('.open-login-trigger, a[href="#login"], .open-login-modal');
    if (trigger && typeof trigger.click === 'function') {
      trigger.click();
      return true;
    }
    const modal = document.getElementById?.('loginModal');
    if (modal) {
      modal.classList.add('active');
      if (document.body) document.body.style.overflow = 'hidden';
      return true;
    }
    return hardNavigate('index.html#login');
  }

  // Product policy: reading is public; mutations and personal surfaces require a session.
  const interactionPolicy = Object.freeze({
    home: 'public', explorer: 'public', bokantaj: 'public', requestDetail: 'public',
    publicProfile: 'public', search: 'public', filters: 'public', pricing: 'public', help: 'public', about: 'public',
    favorite: 'context', messages: 'continue', support: 'continue', requestHelp: 'context', requestAuthor: 'context', publish: 'continue',
    comment: 'context', reaction: 'context', communityPublish: 'context', proposal: 'context',
    missionAction: 'context', profile: 'continue', account: 'continue', activity: 'continue',
    favorites: 'continue', finances: 'continue', settings: 'continue', payment: 'continue'
  });
  const INTENT_KEY = 'lyann_interaction_intent';
  let pendingIntent = null;
  let resuming = false;
  const intentFields = ['contactId', 'requestId', 'memberId', 'id', 'name', 'query', 'category', 'entityId', 'entityType', 'controlId', 'quoteId', 'missionId', 'milestoneId', 'actionId'];
  function knownLoggedOut() {
    return !window.LYANN_AUTH_STATE?.isAuthenticated?.();
  }
  function readIntent() {
    let intent = pendingIntent;
    try { intent ||= JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null'); } catch (_) {}
    if (!intent || !Object.hasOwn(interactionPolicy, intent.action) || interactionPolicy[intent.action] === 'public'
        || !Number.isFinite(intent.createdAt) || Date.now() - intent.createdAt > 15 * 60 * 1000) return null;
    try {
      const url = new URL(intent.destination, window.location.href);
      if (url.origin !== window.location.origin || !/^\/(?:index|feed|results|pricing|payment-portal|how-it-works|about|confirm-signup)?(?:\.html)?$/.test(url.pathname)) return null;
    } catch (_) { return null; }
    return intent;
  }
  function clearIntent() {
    pendingIntent = null;
    try { sessionStorage.removeItem(INTENT_KEY); sessionStorage.removeItem('pending_lyann_help'); } catch (_) {}
  }
  function requireAuthForInteraction(action, context = {}) {
    if (!Object.hasOwn(interactionPolicy, action)) throw new Error('Unknown interaction policy: ' + action);
    if (interactionPolicy[action] === 'public') return true;
    const auth = window.LYANN_AUTH_STATE;
    if (auth && !['ready', 'error'].includes(auth.getSnapshot?.().status)) {
      return auth.ready().then(() => requireAuthForInteraction(action, context));
    }
    if (auth?.getSnapshot?.().status === 'error') {
      window.showToast?.('La vérification de connexion est indisponible. Réessayez.', 'warning');
      return false;
    }
    if (!knownLoggedOut()) return true;
    const payload = {};
    for (const key of intentFields) if (typeof context[key] === 'string') payload[key] = context[key].slice(0, 1000);
    pendingIntent = { action, payload, destination: window.location.pathname + window.location.search + (window.location.hash || ''), createdAt: Date.now() };
    try { sessionStorage.setItem(INTENT_KEY, JSON.stringify(pendingIntent)); } catch (_) {}
    // Dismiss public overlays which otherwise cover the canonical login modal.
    if (window.LYANN_SURFACES?.isOpen?.('lyann-detail')) window.LYANN_SURFACES.close('lyann-detail', { reason: 'authentication' });
    for (const id of ['lyannDetailModal', 'publicMemberProfileModal']) {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('active'); el.style.display = 'none'; }
    }
    openLoginPrompt();
    window.dispatchEvent(new CustomEvent('lyann:interaction-auth-required', { detail: { action } }));
    return false;
  }
  async function resumeAuthIntent() {
    if (resuming || knownLoggedOut()) return false;
    const intent = readIntent();
    if (!intent) return false;
    resuming = true;
    try {
      if (window.location.pathname + window.location.search + (window.location.hash || '') !== intent.destination) {
        hardNavigate(intent.destination);
        return true;
      }
      clearIntent(); // consume before dispatch; token refresh or duplicate events cannot replay it
      window.closeLoginModal?.();
      const p = intent.payload || {};
      if (interactionPolicy[intent.action] === 'continue') {
        await go(intent.action, p);
      } else if (['requestHelp', 'requestAuthor'].includes(intent.action) && p.requestId) {
        // Restore the real Request. The user confirms help or opens the author again;
        // no invitation, proposal or mission is created by signing in.
        await window.openLyannDetailModal?.(p.requestId);
      } else if (intent.action === 'favorite') {
        if (p.entityType === 'REQUEST') await window.openLyannDetailModal?.(p.entityId);
        else if (p.entityType === 'PROFILE') await window.openPublicMemberProfile?.(p.entityId);
        if (p.entityType === 'BOKANTAJ_POST') await window.loadBokantajFeedFromSupabase?.({ force: true });
        const scope = (p.entityType === 'REQUEST' ? document.getElementById('lyannDetailModal')
          : p.entityType === 'PROFILE' ? document.getElementById('publicMemberProfileModal') : document) || document;
        const button = [...scope.querySelectorAll('.lyann-favorite-btn, .btn-fav-toggle')]
          .find(el => (el.dataset.favoriteId || el.dataset.favId) === p.entityId && el.getClientRects().length);
        button?.scrollIntoView({ block: 'center' });
        button?.focus(); // explicit second tap; never blindly toggle persisted state
      } else if (intent.action === 'communityPublish') {
        document.getElementById('flashContentInput')?.focus();
      } else if (intent.action === 'comment' || intent.action === 'reaction') {
        await window.loadBokantajFeedFromSupabase?.({ force: true });
        const control = [...document.querySelectorAll(intent.action === 'comment' ? '.btn-comments-toggle' : '.btn-like-flash')]
          .find(el => el.dataset.targetId === p.entityId);
        control?.scrollIntoView({ block: 'center' });
        if (intent.action === 'comment') control?.click();
        else control?.focus();
      } else if (intent.action === 'missionAction' && p.missionId) {
        await window.openMissionDetailsModal?.(p.missionId);
      } else if (p.contactId) {
        await go('messages', { contactId: p.contactId, requestId: p.requestId });
      } else if (p.controlId) {
        document.getElementById(p.controlId)?.focus();
      }
      window.dispatchEvent(new CustomEvent('lyann:interaction-resumed', { detail: { action: intent.action, ...p } }));
      return true;
    } finally { resuming = false; }
  }

  function openAccountSection(section = 'account') {
    closeDrawer();

    if (knownLoggedOut()) return openLoginPrompt();

    if (typeof window.openAccountModalSubView === 'function') {
      const result = window.openAccountModalSubView(section);
      if (result && typeof result.then === 'function') {
        result.then(() => {
          const modal = document.getElementById?.('userAccountModal');
          if (!modal?.classList?.contains('active') && knownLoggedOut()) openLoginPrompt();
        }).catch((error) => {
          console.error('[ROUTER] account route failed', section, error);
          openLoginPrompt();
        });
      }
      return true;
    }
    if (typeof window.openUserAccountModal === 'function') {
      window.openUserAccountModal();
      return true;
    }
    const modal = document.getElementById?.('userAccountModal');
    if (modal && window.LYANN_SURFACES) {
      window.LYANN_SURFACES.register('account', { element: modal, mode: 'major', hideBottomNav: true, lockBody: true });
      window.LYANN_SURFACES.open('account');
      return true;
    }
    return openLoginPrompt();
  }

  function register(name, handler) {
    if (!name || typeof handler !== 'function') throw new Error('LYANN route requires name and handler');
    routes.set(name, handler);
    return api;
  }

  async function go(name, payload = {}) {
    const handler = routes.get(name);
    if (!handler) {
      console.warn('[ROUTER] unknown route', name);
      return false;
    }
    try {
      const action = name === 'messages' && payload.requestId ? 'requestHelp' : name;
      if (interactionPolicy[action] && interactionPolicy[action] !== 'public') {
        const allowed = requireAuthForInteraction(action, payload);
        if (allowed !== true && !await allowed) return false;
      }
      return await handler(payload);
    } catch (error) {
      console.error('[ROUTER] route failed', name, error);
      return false;
    }
  }

  const protectedControls = Object.freeze([
    ['.lyann-favorite-btn, .btn-fav-toggle, #chatToggleFavoriteBtn, #chatDropAddFavorite, #shareFavoriteBtn, .btn-favorite, [data-action="favorite"]', 'favorite'],
    ['.btn-like-flash', 'reaction'],
    ['.btn-comments-toggle, .btn-reply-comment, .btn-send-comment', 'comment'],
    ['#flashContentInput, #flashPhotoInput, #flashVideoInput, #createFlashForm button[type="submit"]', 'communityPublish'],
    ['#wizardBtnSubmit', 'publish'],
    ['#missionDetailsModal [onclick*="handle"], #btnStartMission, #chatDropBlockUser, #chatDropReportUser', 'missionAction'],
    ['#chatModal [onclick*="toggleMessageReaction"]', 'reaction'],
    ['#chatModal [onclick*="handle"], #chatModal [data-chat-action], #chatActionChoicesOverlay button, .chat-card-inline-actions button, #btnCtxPropose, #btnCtxDate, #bsActionDate, #btnChooseDate, #btnProposeDate, .btn-propose-date', 'proposal']
  ]);
  const protectedForms = Object.freeze([
    ['#createFlashForm', 'communityPublish'],
    ['#chatInputForm, #contactMemberForm', 'messages'],
    ['#directPriceForm, #milestoneDevisForm, #proposeDateForm', 'proposal'],
    ['#checkoutPaymentForm, #submitProofForm, #bookingForm, #leaveReviewForm', 'missionAction'],
    ['#publicProfileForm, #accountSecurityFormHub, #reportForm, #completeProfileForm', 'account']
  ]);
  // Define the public API before registering routes. register() returns this object,
  // so creating it later would trigger a temporal-dead-zone crash during bootstrap.
  const api = {
    __canonical: true,
    register,
    go,
    has: (name) => routes.has(name),
    sameDocumentPath,
    routes: () => [...routes.keys()],
    interactionPolicy, requireAuthForInteraction, resumeAuthIntent,
    hasAuthIntent: () => Boolean(readIntent()), cancelAuthIntent: clearIntent, protectedControls, protectedForms
  };

  register('home', () => hardNavigate('index.html'));
  register('explorer', (payload = {}) => {
    const params = new URLSearchParams();
    if (payload.query) params.set('query', payload.query);
    if (payload.mode) params.set('mode', payload.mode);
    if (payload.category) params.set('category', payload.category);
    const suffix = params.toString();
    return hardNavigate(`results.html${suffix ? `?${suffix}` : ''}`);
  });
  register('bokantaj', () => hardNavigate('feed.html'));
  register('messages', (payload = {}) => {
    if (knownLoggedOut()) return openLoginPrompt();
    const contactId = payload.contactId || payload.id || payload.memberId;
    const messaging = window.LYANN_MESSAGING;
    if (messaging) {
      if (contactId) return messaging.openConversation({ ...payload, contactId });
      if (typeof messaging.openInbox === 'function') return messaging.openInbox();
      return messaging.openList();
    }
    const params = new URLSearchParams({ action: 'messages' });
    if (contactId) params.set('contact', contactId);
    if (payload.name) params.set('name', payload.name);
    return hardNavigate(`feed.html?${params.toString()}`);
  });
  register('publish', (payload = {}) => {
    if (typeof window.openLyannWizard === 'function') return window.openLyannWizard(payload.query);
    if (typeof window.openNeedWizard === 'function') return window.openNeedWizard();
    return hardNavigate('index.html?action=publish');
  });
  register('mission', (payload = {}) => {
    const requestId = payload.requestId || payload.id;
    if (requestId && typeof window.openLyannDetailModal === 'function') {
      window.openLyannDetailModal(requestId, payload.initialData || null);
      return true;
    }
    return false;
  });
  register('profile', () => {
    closeDrawer();
    if (knownLoggedOut()) return openLoginPrompt();
    if (typeof window.openPublicProfileModal === 'function') {
      window.openPublicProfileModal();
      return true;
    }
    return openAccountSection('account');
  });
  register('account', () => openAccountSection('account'));
  register('activity', () => openAccountSection('activity'));
  register('favorites', () => openAccountSection('favorites'));
  register('finances', () => openAccountSection('finances'));
  register('settings', () => openAccountSection('settings'));
  register('pricing', () => hardNavigate('pricing.html'));
  register('payment', () => hardNavigate('payment-portal.html'));
  register('help', () => hardNavigate('how-it-works.html'));
  register('support', async () => {
    if (knownLoggedOut()) return openLoginPrompt();
    const client = window.LYANN_API_CLIENT || window.apiClient;
    let supportId = window.LYANN_SUPPORT_USER_ID || null;
    try {
      const opened = await client?.openSupportConversation?.();
      supportId = opened?.data?.supportUserId || opened?.supportUserId || await client?.getSupportUserId?.() || supportId;
    } catch (_) {
      supportId = await client?.getSupportUserId?.() || supportId;
    }
    if (!supportId) {
      if (typeof window.showLyanToast === 'function') {
        window.showLyanToast('L’aide LYANN n’est pas encore disponible. Réessayez après la mise à jour serveur.', 'ℹ️');
      }
      return false;
    }
    const messaging = window.LYANN_MESSAGING;
    if (messaging) return messaging.openConversation({ contactId: supportId, name: 'Support LYANN' });
    const params = new URLSearchParams({ action: 'messages', contact: supportId, name: 'Support LYANN' });
    return hardNavigate(`feed.html?${params.toString()}`);
  });
  register('about', () => hardNavigate('about.html'));

  const selectorRouteMap = [
    ['#tab-home', 'home'],
    ['#tab-explorer', 'explorer'],
    ['#tab-bokantaj', 'bokantaj'],
    ['#tab-messages, [data-lyann-messages], .open-chat-trigger', 'messages'],
    ['#btnHeaderSupport, [data-lyann-support]', 'support'],
    ['.nav-msg-btn:not(#btnHeaderNotif):not(#btnHeaderSupport), .btn-open-chat-direct, .btn-contact-member, .btn-help-lyann, a[href*="action=messages"], a[href*="action=openchat"]', 'messages'],
    ['#tab-create, [data-lyann-publish], .open-request-help-trigger, .btn-trigger-wizard-shortcut, .explorer-publish, #btnLaunchNeedWizard', 'publish'],
    ['.open-account-modal-trigger, .nav-profile-btn', 'account'],
    ['#btnDashboardAvatar', 'profile']
  ];

  function extractPayload(element) {
    if (!element || typeof element.getAttribute !== 'function') return {};
    const requesterId = element.getAttribute('data-requester-id')
      || element.getAttribute('data-contact-id')
      || element.getAttribute('data-member-id')
      || element.getAttribute('data-user-id')
      || element.getAttribute('data-author-id')
      || undefined;
    const requestId = element.getAttribute('data-request-id')
      || element.getAttribute('data-id')
      || undefined;
    const contactId = requesterId || (element?.classList?.contains?.('btn-help-lyann') ? undefined : requestId);
    const name = element.getAttribute('data-contact-name')
      || element.getAttribute('data-requester-name')
      || element.getAttribute('data-member-name')
      || element.getAttribute('data-author-name')
      || undefined;
    const avatar = element.getAttribute('data-contact-avatar')
      || element.getAttribute('data-requester-avatar')
      || element.getAttribute('data-member-avatar')
      || element.getAttribute('data-author-avatar')
      || undefined;
    const title = element.getAttribute('data-title')
      || element.getAttribute('data-post-title')
      || undefined;
    const query = element.getAttribute('data-query') || document.getElementById('explorerSearchInput')?.value || undefined;
    const category = element.getAttribute('data-category') || undefined;

    const payload = { id: contactId || requestId, requestId, contactId, name, avatar, title, query, category };
    if (element?.classList?.contains?.('btn-help-lyann') && requestId) {
      payload.initialNeed = { requestId, requesterId: contactId, title };
    }
    return payload;
  }

  function gateControl(event) {
    const entries = event.type === 'submit' ? protectedForms : protectedControls;
    for (const [selector, action] of entries) {
      const control = event.target?.closest?.(selector);
      if (!control) continue;
      if (!knownLoggedOut()) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const context = { entityId: control.dataset.favoriteId || control.dataset.favId || control.dataset.targetId || (action === 'favorite' ? window.LYANN_ACTIVE_CHAT_CONTACT?.id : undefined),
        entityType: control.dataset.favoriteType || control.dataset.favType || control.dataset.targetType || (action === 'favorite' ? 'PROFILE' : undefined),
        controlId: control.id, contactId: window.LYANN_ACTIVE_CHAT_CONTACT?.id,
        requestId: window.LYANN_ACTIVE_CHAT_CONTACT?.requestId };
      Promise.resolve(requireAuthForInteraction(action, context)).then(allowed => {
        // Auth was still resolving when tapped. Only replay after a real session
        // resolves, never as an automatic consequence of subsequent sign-in.
        if (allowed) {
          if (event.type === 'submit') control.requestSubmit(); else control.click();
        }
      });
      return true;
    }
    return false;
  }

  function installCaptureNavigation() {
    if (captureNavigationInstalled) return;
    captureNavigationInstalled = true;
    document.addEventListener('touchend', gateControl, { capture: true, passive: false });
    document.addEventListener('submit', gateControl, true);

    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#closeLoginModalBtn, #closeOnboardingBtn')) clearIntent();
      if (gateControl(event)) return;
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      const explicit = target.closest('[data-lyann-route]');
      if (explicit) {
        const route = explicit.getAttribute('data-lyann-route');
        if (!route) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const payload = extractPayload(explicit);
        go(route, payload);
        return;
      }

      for (const [selector, route] of selectorRouteMap) {
        const trigger = target.closest(selector);
        if (!trigger) continue;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const payload = extractPayload(trigger);
        go(route, payload);
        return;
      }
    }, true);
  }

  function routeFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action === 'messages' || action === 'openchat') {
      const contactId = params.get('contact') || params.get('member') || params.get('chat');
      go('messages', { contactId, name: params.get('name') || undefined });
    } else if (action === 'publish') {
      go('publish');
    } else if (['account', 'activity', 'favorites', 'finances', 'settings', 'profile', 'support'].includes(action)) {
      go(action);
    }
  }

  window.addEventListener('lyann:auth-state', event => {
    if (!event.detail?.authenticated) return;
    setTimeout(() => {
      if (!document.querySelector('#loginForm button[type=submit]')?.disabled) resumeAuthIntent().catch(console.error);
    }, 0);
  });
  window.LYANN_ROUTER = api;
  window.navigateLyann = (route, payload) => api.go(route, payload);

  // Install public click ownership immediately. Waiting for DOMContentLoaded here
  // leaves a race window in Capacitor where dynamically-rendered controls can be tapped
  // before the router owns navigation.
  installCaptureNavigation();

  async function bootLocationRoute() {
    await window.LYANN_AUTH_STATE?.ready?.();
    await new Promise(resolve => setTimeout(resolve, 0)); // all feature DOM-ready callbacks must be installed
    if (readIntent() && !knownLoggedOut()) resumeAuthIntent();
    else routeFromLocation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLocationRoute, { once: true });
  else bootLocationRoute();
})();
