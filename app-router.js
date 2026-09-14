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

  function openAccountSection(section = 'account') {
    closeDrawer();
    if (typeof window.openAccountModalSubView === 'function') {
      window.openAccountModalSubView(section);
      return true;
    }
    if (typeof window.openUserAccountModal === 'function') {
      window.openUserAccountModal();
      return true;
    }
    const modal = document.getElementById('userAccountModal');
    if (modal && window.LYANN_SURFACES) {
      window.LYANN_SURFACES.register('account', { element: modal, mode: 'major', hideBottomNav: true, lockBody: true });
      window.LYANN_SURFACES.open('account');
      return true;
    }
    return false;
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
      return await handler(payload);
    } catch (error) {
      console.error('[ROUTER] route failed', name, error);
      return false;
    }
  }

  // Define the public API before registering routes. register() returns this object,
  // so creating it later would trigger a temporal-dead-zone crash during bootstrap.
  const api = {
    __canonical: true,
    register,
    go,
    has: (name) => routes.has(name),
    sameDocumentPath,
    routes: () => [...routes.keys()]
  };

  register('home', () => hardNavigate('index.html'));
  register('explorer', (payload = {}) => {
    const params = new URLSearchParams();
    if (payload.query) params.set('query', payload.query);
    if (payload.category) params.set('category', payload.category);
    const suffix = params.toString();
    return hardNavigate(`results.html${suffix ? `?${suffix}` : ''}`);
  });
  register('bokantaj', () => hardNavigate('feed.html'));
  register('messages', (payload = {}) => {
    const messaging = window.LYANN_MESSAGING;
    if (messaging) {
      if (payload.contactId || payload.id || payload.memberId) return messaging.openConversation(payload);
      return messaging.openList();
    }
    const params = new URLSearchParams({ action: 'messages' });
    if (payload.contactId) params.set('contact', payload.contactId);
    if (payload.name) params.set('name', payload.name);
    return hardNavigate(`feed.html?${params.toString()}`);
  });
  register('publish', () => {
    if (typeof window.openLyannWizard === 'function') return window.openLyannWizard();
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
  register('about', () => hardNavigate('about.html'));

  const selectorRouteMap = [
    ['#tab-home', 'home'],
    ['#tab-explorer', 'explorer'],
    ['#tab-bokantaj', 'bokantaj'],
    ['#tab-messages, [data-lyann-messages], .open-chat-trigger', 'messages'],
    ['#tab-create, [data-lyann-publish]', 'publish']
  ];

  function installCaptureNavigation() {
    if (captureNavigationInstalled) return;
    captureNavigationInstalled = true;

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      const explicit = target.closest('[data-lyann-route]');
      if (explicit) {
        const route = explicit.getAttribute('data-lyann-route');
        if (!route) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const payload = {
          id: explicit.getAttribute('data-id') || undefined,
          requestId: explicit.getAttribute('data-request-id') || undefined,
          contactId: explicit.getAttribute('data-contact-id') || undefined,
          name: explicit.getAttribute('data-contact-name') || undefined,
          title: explicit.getAttribute('data-title') || undefined,
          query: explicit.getAttribute('data-query') || undefined,
          category: explicit.getAttribute('data-category') || undefined
        };
        go(route, payload);
        return;
      }

      for (const [selector, route] of selectorRouteMap) {
        const trigger = target.closest(selector);
        if (!trigger) continue;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        go(route);
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
    }
  }

  window.LYANN_ROUTER = api;
  window.navigateLyann = (route, payload) => api.go(route, payload);

  // Install public click ownership immediately. Waiting for DOMContentLoaded here
  // leaves a race window in Capacitor where dynamically-rendered controls can be tapped
  // before the router owns navigation.
  installCaptureNavigation();

  function bootLocationRoute() {
    routeFromLocation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLocationRoute, { once: true });
  else bootLocationRoute();
})();
