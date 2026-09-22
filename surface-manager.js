// LYANN canonical surface manager.
// Owns major modal/screen lifecycle for Web and Capacitor.
(function () {
  'use strict';

  if (window.LYANN_SURFACES && window.LYANN_SURFACES.__canonical) return;

  const registry = new Map();
  const stack = [];

  function resolveElement(ref) {
    if (!ref) return null;
    if (ref instanceof Element) return ref;
    if (typeof ref === 'string') return document.getElementById(ref) || document.querySelector(ref);
    return null;
  }

  function register(name, config = {}) {
    if (!name) throw new Error('LYANN surface name is required');
    registry.set(name, {
      name,
      element: config.element || config.selector || config.id || null,
      mode: config.mode || 'major',
      hideBottomNav: config.hideBottomNav !== false,
      lockBody: config.lockBody !== false,
      onOpen: typeof config.onOpen === 'function' ? config.onOpen : null,
      onClose: typeof config.onClose === 'function' ? config.onClose : null
    });
    return api;
  }

  function getConfig(name) {
    return registry.get(name) || null;
  }

  function getElement(name) {
    const config = getConfig(name);
    return config ? resolveElement(config.element) : null;
  }

  let scrollHeld = false;
  let savedScrollY = 0;
  const watchedOverlays = new WeakSet();

  function overlayOpen() {
    if (stack.some((entry) => getConfig(entry.name)?.lockBody)) return true;
    const body = document.body;
    if (!body) return false;
    if (body.classList.contains('lyann-messaging-open')
      || body.classList.contains('modal-open')
      || body.classList.contains('drawer-open')
      || body.classList.contains('sheet-open')) return true;
    const nodes = document.querySelectorAll('.modal-overlay, .mobile-bottom-sheet, #mobileHamburgerDrawerOverlay, .mobile-menu-overlay, .hamburger-drawer-overlay');
    for (const el of nodes) {
      if (el.classList.contains('active')) return true;
      if (el.style.display === 'flex' || el.style.display === 'block') return true;
    }
    return false;
  }

  function holdDocumentScroll() {
    if (scrollHeld) return;
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    scrollHeld = true;
    document.documentElement.classList.add('lyann-scroll-lock');
    document.body.classList.add('lyann-scroll-lock');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function dropDocumentScroll() {
    if (!scrollHeld) return;
    const y = savedScrollY;
    scrollHeld = false;
    document.documentElement.classList.remove('lyann-scroll-lock');
    document.body.classList.remove('lyann-scroll-lock');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.removeProperty('overflow');
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = previous;
  }

  function syncScrollLock() {
    watchOverlays();
    if (overlayOpen()) holdDocumentScroll();
    else dropDocumentScroll();
  }

  function eventTargetElement(target) {
    if (!target) return null;
    return target.nodeType === 1 ? target : target.parentElement;
  }

  function scrollableParent(target) {
    let node = eventTargetElement(target);
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      const canScroll = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && node.scrollHeight > node.clientHeight + 1;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return null;
  }

  function shouldBlockBackgroundScroll(target, deltaY) {
    if (!scrollHeld || !deltaY) return false;
    const el = eventTargetElement(target);
    if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return false;
    const scroller = scrollableParent(target);
    if (!scroller) return true;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if (deltaY < 0 && atTop) return true;
    if (deltaY > 0 && atBottom) return true;
    return false;
  }

  function watchOverlays() {
    if (!document.body) return;
    document.querySelectorAll('.modal-overlay, .mobile-bottom-sheet, #mobileHamburgerDrawerOverlay, .mobile-menu-overlay, .hamburger-drawer-overlay').forEach((el) => {
      if (watchedOverlays.has(el)) return;
      watchedOverlays.add(el);
      new MutationObserver(syncScrollLock).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    });
  }

  function installScrollLock() {
    if (!document.body || document.documentElement.dataset.lyannScrollLock) return;
    document.documentElement.dataset.lyannScrollLock = '1';
    new MutationObserver(syncScrollLock).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    watchOverlays();
    document.addEventListener('click', () => requestAnimationFrame(syncScrollLock));
    document.addEventListener('wheel', (event) => {
      if (shouldBlockBackgroundScroll(event.target, event.deltaY)) event.preventDefault();
    }, { passive: false, capture: true });
    let lastTouchY = 0;
    document.addEventListener('touchstart', (event) => {
      lastTouchY = event.touches[0]?.clientY || 0;
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', (event) => {
      const y = event.touches[0]?.clientY || 0;
      const delta = lastTouchY - y;
      lastTouchY = y;
      if (shouldBlockBackgroundScroll(event.target, delta)) event.preventDefault();
    }, { passive: false, capture: true });
    document.addEventListener('keydown', (event) => {
      if (!scrollHeld) return;
      if (![' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (event.target && event.target !== document.body && event.target !== document.documentElement) return;
      event.preventDefault();
    });
    syncScrollLock();
  }

  function applyBodyState() {
    const active = stack.map((entry) => getConfig(entry.name)).filter(Boolean);
    const hasSurface = active.length > 0;
    const hideBottomNav = active.some((entry) => entry.hideBottomNav);

    document.body.classList.toggle('lyann-surface-open', hasSurface);
    document.body.classList.toggle('hide-bottom-nav', hideBottomNav);
    syncScrollLock();
  }

  function hideElement(el) {
    if (!el) return;
    el.classList.remove('active', 'lyann-surface-active');
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('aria-hidden', 'true');
  }

  function showElement(el) {
    if (!el) return;
    el.style.removeProperty('display');
    const display = getComputedStyle(el).display;
    if (display === 'none') el.style.setProperty('display', 'flex');
    el.classList.add('active', 'lyann-surface-active');
    el.setAttribute('aria-hidden', 'false');
  }

  function close(name, options = {}) {
    const index = stack.map((entry) => entry.name).lastIndexOf(name);
    if (index === -1) return false;
    const [entry] = stack.splice(index, 1);
    const config = getConfig(name);
    const el = getElement(name);
    hideElement(el);
    try { config?.onClose?.(entry.payload, options); } catch (error) { console.warn('[SURFACES] close hook failed', name, error); }
    applyBodyState();
    return true;
  }

  function closeMode(mode, exceptName = null) {
    [...stack].reverse().forEach((entry) => {
      const config = getConfig(entry.name);
      if (config?.mode === mode && entry.name !== exceptName) close(entry.name, { reason: 'exclusive' });
    });
  }

  function open(name, payload = null, options = {}) {
    const config = getConfig(name);
    if (!config) {
      console.warn('[SURFACES] unknown surface', name);
      return false;
    }

    if (config.mode === 'major' && options.keepMajor !== true) closeMode('major', name);
    if (config.mode === 'child' && options.keepChildren !== true) closeMode('child', name);

    const existingIndex = stack.findIndex((entry) => entry.name === name);
    if (existingIndex !== -1) stack.splice(existingIndex, 1);
    stack.push({ name, payload });

    showElement(getElement(name));
    applyBodyState();
    try { config.onOpen?.(payload, options); } catch (error) { console.warn('[SURFACES] open hook failed', name, error); }
    return true;
  }

  function closeTop() {
    const top = stack[stack.length - 1];
    return top ? close(top.name, { reason: 'back' }) : false;
  }

  function closeAll() {
    [...stack].reverse().forEach((entry) => close(entry.name, { reason: 'close-all' }));
  }

  function isOpen(name) {
    return stack.some((entry) => entry.name === name);
  }

  function current() {
    return stack.length ? { ...stack[stack.length - 1] } : null;
  }

  const api = {
    __canonical: true,
    register,
    open,
    close,
    closeTop,
    closeAll,
    isOpen,
    current,
    getElement,
    list: () => stack.map((entry) => ({ ...entry }))
  };

  window.LYANN_SURFACES = api;

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && stack.length) {
      event.preventDefault();
      closeTop();
    }
  });

  if (document.body) installScrollLock();
  else document.addEventListener('DOMContentLoaded', installScrollLock, { once: true });

  window.LYANN_SCROLL_LOCK = { sync: syncScrollLock };
})();
