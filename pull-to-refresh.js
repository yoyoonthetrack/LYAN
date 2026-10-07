(function () {
  'use strict';

  const TRIGGER = 64;
  const MAX_PULL = 84;

  const styleParent = document.head || document.documentElement;
  if (styleParent && !document.getElementById('lyannPtrStyle')) {
    const style = document.createElement('style');
    style.id = 'lyannPtrStyle';
    style.textContent = [
      '.lyann-ptr{position:absolute;left:0;right:0;z-index:8;display:flex;justify-content:center;height:0;pointer-events:none}',
      '.lyann-ptr.is-document{position:fixed;top:var(--lyann-header-total-height,64px);z-index:1001;left:0;right:0}',
      '.lyann-ptr-pill{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:6px 12px;border-radius:999px;background:#fff;color:#4A7C59;border:1px solid rgba(74,124,89,.28);box-shadow:0 2px 10px rgba(36,56,43,.12);font:600 .78rem/1 Outfit,sans-serif;opacity:0;transform:translateY(0);transition:transform .18s ease,opacity .18s ease}',
      '.lyann-ptr.is-pulling .lyann-ptr-pill{transition:none}',
      '.lyann-ptr-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(74,124,89,.25);border-top-color:#4A7C59;box-sizing:border-box}',
      '.lyann-ptr.is-refreshing .lyann-ptr-spin{animation:lyann-ptr-spin .7s linear infinite}',
      '.lyann-ptr-label:empty{display:none}',
      '@keyframes lyann-ptr-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.lyann-ptr.is-refreshing .lyann-ptr-spin{animation:none;border-top-color:#4A7C59}}'
    ].join('');
    styleParent.appendChild(style);
  }

  function isDocumentScroller(scroller) {
    return !scroller || scroller === window || scroller === document || scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement;
  }

  function scrollTopOf(scroller, documentMode) {
    if (documentMode) return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    return scroller.scrollTop || 0;
  }

  function pageBlocked() {
    return Boolean(document.querySelector('.modal-overlay.active, .mobile-menu-overlay.active, dialog[open]'));
  }

  function visibleScroller(scroller) {
    const style = getComputedStyle(scroller);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = scroller.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function attach(scroller, onRefresh) {
    const documentMode = isDocumentScroller(scroller);
    const host = documentMode ? document.documentElement : scroller;
    if (!host || host.dataset.lyannPtr === '1' || typeof onRefresh !== 'function') return function () {};
    host.dataset.lyannPtr = '1';
    if (!documentMode) host.setAttribute('data-lyann-ptr-host', '1');

    const indicator = document.createElement('div');
    indicator.className = documentMode ? 'lyann-ptr is-document' : 'lyann-ptr';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<div class="lyann-ptr-pill"><span class="lyann-ptr-spin" aria-hidden="true"></span><span class="lyann-ptr-label"></span></div>';
    const pill = indicator.querySelector('.lyann-ptr-pill');
    const spin = indicator.querySelector('.lyann-ptr-spin');
    const label = indicator.querySelector('.lyann-ptr-label');

    if (documentMode) {
      document.body.appendChild(indicator);
    } else if (scroller.parentElement) {
      const parent = scroller.parentElement;
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(indicator);
    }

    let startX = 0;
    let startY = 0;
    let armed = false;
    let pulling = false;
    let distance = 0;
    let refreshing = false;
    let listening = false;
    const listenTarget = documentMode ? document : scroller;

    function place() {
      if (documentMode || !scroller.parentElement) return;
      indicator.style.top = scroller.offsetTop + 'px';
      indicator.style.left = '0';
      indicator.style.width = '100%';
    }

    function showPull(next) {
      place();
      indicator.classList.add('is-pulling');
      indicator.classList.remove('is-refreshing');
      label.textContent = '';
      indicator.setAttribute('aria-hidden', 'true');
      pill.style.opacity = String(Math.min(1, next / 28));
      pill.style.transform = 'translateY(' + Math.min(next, 48) + 'px)';
      spin.style.transform = 'rotate(' + (next * 3) + 'deg)';
    }

    function showRefreshing() {
      place();
      indicator.classList.remove('is-pulling');
      indicator.classList.add('is-refreshing');
      label.textContent = 'Actualisation…';
      indicator.setAttribute('aria-hidden', 'false');
      pill.style.opacity = '1';
      pill.style.transform = 'translateY(40px)';
      spin.style.transform = '';
    }

    function hide() {
      indicator.classList.remove('is-pulling', 'is-refreshing');
      label.textContent = '';
      indicator.setAttribute('aria-hidden', 'true');
      pill.style.opacity = '0';
      pill.style.transform = 'translateY(0)';
      spin.style.transform = '';
    }

    function releaseMoveListeners() {
      if (!listening) return;
      listening = false;
      listenTarget.removeEventListener('touchmove', onMove);
      listenTarget.removeEventListener('touchend', onEnd);
      listenTarget.removeEventListener('touchcancel', onEnd);
    }

    function onMove(event) {
      if (!armed || refreshing || !event.touches || event.touches.length !== 1) return;
      if (scrollTopOf(scroller, documentMode) > 2) {
        armed = false;
        pulling = false;
        distance = 0;
        hide();
        releaseMoveListeners();
        return;
      }
      const dy = event.touches[0].clientY - startY;
      const dx = event.touches[0].clientX - startX;
      if (!pulling) {
        if (dy < 8) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          armed = false;
          releaseMoveListeners();
          return;
        }
        pulling = true;
      }
      const raw = Math.max(0, dy);
      const resisted = raw <= TRIGGER ? raw * 0.9 : TRIGGER + (raw - TRIGGER) * 0.3;
      distance = Math.min(MAX_PULL, resisted);
      showPull(distance);
      if (distance > 0 && event.cancelable) event.preventDefault();
    }

    function onEnd() {
      releaseMoveListeners();
      const shouldRefresh = armed && pulling && distance >= TRIGGER && !refreshing;
      armed = false;
      pulling = false;
      distance = 0;
      if (!shouldRefresh) {
        hide();
        return;
      }
      refreshing = true;
      showRefreshing();
      Promise.resolve()
        .then(function () { return onRefresh(); })
        .catch(function () {})
        .finally(function () {
          refreshing = false;
          hide();
        });
    }

    listenTarget.addEventListener('touchstart', function (event) {
      if (refreshing || !event.touches || event.touches.length !== 1) return;
      if (documentMode && (pageBlocked() || event.target.closest('[data-lyann-ptr-host]'))) return;
      if (!documentMode && !visibleScroller(scroller)) return;
      const target = event.target;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (scrollTopOf(scroller, documentMode) > 2) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      armed = true;
      pulling = false;
      distance = 0;
      if (!listening) {
        listening = true;
        listenTarget.addEventListener('touchmove', onMove, { passive: false });
        listenTarget.addEventListener('touchend', onEnd);
        listenTarget.addEventListener('touchcancel', onEnd);
      }
    }, { passive: true });

    return function detach() {
      releaseMoveListeners();
      host.dataset.lyannPtr = '';
      if (!documentMode) host.removeAttribute('data-lyann-ptr-host');
      indicator.remove();
    };
  }

  window.LYANN_PULL_TO_REFRESH = { attach: attach };
})();
