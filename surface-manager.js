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

  function applyBodyState() {
    const active = stack.map((entry) => getConfig(entry.name)).filter(Boolean);
    const hasSurface = active.length > 0;
    const hideBottomNav = active.some((entry) => entry.hideBottomNav);
    const lockBody = active.some((entry) => entry.lockBody);

    document.body.classList.toggle('lyann-surface-open', hasSurface);
    document.body.classList.toggle('hide-bottom-nav', hideBottomNav);
    if (lockBody) document.body.style.overflow = 'hidden';
    else if (!document.body.classList.contains('lyann-messaging-open')) document.body.style.removeProperty('overflow');
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
})();
