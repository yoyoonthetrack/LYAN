(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function injectStyles() {
    if ($('#lyannSharedUxFixesStyle')) return;
    const style = document.createElement('style');
    style.id = 'lyannSharedUxFixesStyle';
    style.textContent = `
      /* Login/search field icon spacing */
      #loginEmail, #loginPassword, #chatSearchInput,
      .input-with-icon .modal-input,
      .search-input-wrapper input,
      .search-input-wrapper select {
        box-sizing: border-box !important;
      }
      .input-with-icon { position: relative !important; }
      .input-with-icon > i,
      .search-input-wrapper > i {
        position: absolute !important;
        left: 14px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        z-index: 2 !important;
        pointer-events: none !important;
      }
      .input-with-icon .modal-input,
      .search-input-wrapper input,
      .search-input-wrapper select,
      #chatSearchInput { padding-left: 42px !important; }
      #loginEmail, #loginPassword { padding-left: 16px !important; }
      #loginForm .input-with-icon #loginEmail,
      #loginForm .input-with-icon #loginPassword { padding-left: 42px !important; }

      #lyannLoginInlineError {
        display:none; margin: 10px 0 2px; padding: 10px 12px; border-radius: 12px;
        background:#FFF1F2; border:1px solid #FECDD3; color:#9F1239; font-size:.86rem;
        font-weight:600; line-height:1.35;
      }

      /* Keep hero composition visually stable while switching intent. */
      @media (min-width: 769px) {
        #parcoursSearchPanel, #parcoursNeedPanel { min-height: 365px !important; }
        .hero-visual { transform: none !important; transition: none !important; align-self: flex-start !important; }
      }

      /* True full-page experience for chat/profile surfaces. */
      #chatModal.modal-overlay.active,
      #userAccountModal.modal-overlay.active,
      #publicMemberProfileModal.modal-overlay.active {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100dvh !important;
        max-width: none !important;
        max-height: none !important;
        padding: 0 !important;
        margin: 0 !important;
        border-radius: 0 !important;
        background: #F8FAF8 !important;
        align-items: stretch !important;
        justify-content: stretch !important;
        z-index: 100000 !important;
      }
      #chatModal .modal-card-chat,
      #userAccountModal .modal-card-user-account,
      #publicMemberProfileModal .modal-card {
        width: 100vw !important;
        height: 100dvh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding-top: env(safe-area-inset-top) !important;
        padding-bottom: env(safe-area-inset-bottom) !important;
        overflow: hidden !important;
      }
      #chatModal .chat-modal-layout {
        width: calc(100% - 24px) !important;
        max-width: 1180px !important;
        height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important;
        margin: 0 auto !important;
      }
      #chatModal .chat-contacts-sidebar,
      #chatModal .chat-main-area { min-width: 0 !important; }
      #chatSearchInput { padding-left: 38px !important; }
      #userAccountModal .modal-body,
      #publicMemberProfileModal .modal-body {
        max-height: none !important;
        overflow-y: auto !important;
        padding-bottom: calc(24px + env(safe-area-inset-bottom)) !important;
      }
      #lyannDetailStatus[data-open-status="true"] { display:none !important; }

      @media (max-width: 768px) {
        #chatModal .chat-modal-layout { width: calc(100% - 16px) !important; }
        #chatModal .chat-contacts-sidebar,
        #chatModal .chat-main-area { border-radius: 16px !important; overflow: hidden !important; }
        #userAccountModal .modal-card-user-account,
        #publicMemberProfileModal .modal-card { padding-left: 0 !important; padding-right: 0 !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLoginErrorBox() {
    const form = $('#loginForm');
    if (!form || $('#lyannLoginInlineError')) return;
    const box = document.createElement('div');
    box.id = 'lyannLoginInlineError';
    box.setAttribute('role', 'alert');
    box.textContent = 'Email ou mot de passe incorrect. Vérifie tes informations et réessaie.';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) form.insertBefore(box, submit);
    else form.appendChild(box);
  }

  function showLoginError(message) {
    ensureLoginErrorBox();
    const box = $('#lyannLoginInlineError');
    if (!box) return;
    box.textContent = message || 'Email ou mot de passe incorrect. Vérifie tes informations et réessaie.';
    box.style.display = 'block';
  }

  function clearLoginError() {
    const box = $('#lyannLoginInlineError');
    if (box) box.style.display = 'none';
  }

  function patchLoginApi() {
    const api = window.LYANN_API_CLIENT || window.apiClient;
    if (!api || typeof api.login !== 'function' || api.login.__lyannUxWrapped) return false;
    const original = api.login.bind(api);
    const wrapped = async (...args) => {
      clearLoginError();
      try {
        const result = await original(...args);
        if (result?.error || !result?.data?.session) {
          showLoginError();
        }
        return result;
      } catch (error) {
        showLoginError();
        throw error;
      }
    };
    wrapped.__lyannUxWrapped = true;
    api.login = wrapped;
    return true;
  }

  function bindHeroSearch() {
    const form = $('#heroSearchForm');
    if (!form || form.dataset.sharedUxBound === 'true') return;
    form.dataset.sharedUxBound = 'true';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const query = ($('#searchInput')?.value || '').trim();
      const territory = $('#locationSelect')?.value || '';
      const city = $('#citySelect')?.value || '';
      if (!query) {
        $('#searchInput')?.focus();
        return;
      }
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('search', query);
      params.set('query', query);
      if (territory) {
        params.set('location', territory);
        params.set('territory', territory);
      }
      if (city) params.set('city', city);
      window.location.href = `results.html?${params.toString()}`;
    }, true);
  }

  function stableHeroIntent() {
    ['#btnIntentSearch', '#btnIntentNeed'].forEach((selector) => {
      const btn = $(selector);
      if (!btn || btn.dataset.sharedUxBound === 'true') return;
      btn.dataset.sharedUxBound = 'true';
      btn.addEventListener('click', () => {
        const visual = $('.hero-visual');
        if (visual) {
          visual.style.transform = 'none';
          visual.style.transition = 'none';
        }
      }, true);
    });
  }

  function currentUserId() {
    return window.CURRENT_USER_ID || window.LYANN_CURRENT_USER?.id || null;
  }

  function findProfileContext(el) {
    const card = el.closest('[data-member-id], [data-user-id], [data-profile-id], .talent-card, .provider-card, .result-card, .profile-card, article, .search-result-card');
    const id = el.dataset.memberId || el.dataset.userId || el.dataset.profileId ||
      card?.dataset.memberId || card?.dataset.userId || card?.dataset.profileId ||
      card?.querySelector('[data-member-id]')?.dataset.memberId ||
      card?.querySelector('[data-user-id]')?.dataset.userId || '';
    const name = (el.dataset.memberName || card?.querySelector('[data-member-name]')?.dataset.memberName ||
      card?.querySelector('.member-name, .profile-name, .talent-name, h3, h4, strong')?.textContent || 'Lyanneur').trim();
    const avatar = el.dataset.memberAvatar || card?.querySelector('img')?.src || '';
    return { id, name, avatar, card };
  }

  function openChatForContext(ctx, initialNeed = null) {
    if (!ctx?.id) return false;
    if (typeof window.openChatWithUser === 'function') {
      window.openChatWithUser(ctx.name || 'Lyanneur', ctx.avatar || '', ctx.id, initialNeed);
      return true;
    }
    try {
      sessionStorage.setItem('lyann_open_chat_target', JSON.stringify(ctx));
    } catch (_) {}
    window.location.href = 'feed.html?action=openchat';
    return true;
  }

  let privateTarget = null;

  function openTargetedNeedWizard(ctx) {
    if (!ctx?.id) return;
    privateTarget = ctx;
    try { sessionStorage.setItem('lyann_private_target', JSON.stringify(ctx)); } catch (_) {}
    const modal = $('#modal-request-help');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      const heading = modal.querySelector('.modal-header h3');
      if (heading) heading.innerHTML = `<i class="ph-fill ph-hand-heart"></i> Proposer un besoin à ${ctx.name || 'ce Lyanneur'}`;
      if (typeof window.showWizardStep === 'function') window.showWizardStep(1);
    } else {
      window.location.href = `feed.html?privateTarget=${encodeURIComponent(ctx.id)}&privateTargetName=${encodeURIComponent(ctx.name || '')}`;
    }
  }

  function hydratePrivateTargetFromUrlOrStorage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('privateTarget');
    const name = params.get('privateTargetName');
    if (id) {
      privateTarget = { id, name: name || 'Lyanneur', avatar: '' };
      try { sessionStorage.setItem('lyann_private_target', JSON.stringify(privateTarget)); } catch (_) {}
      setTimeout(() => openTargetedNeedWizard(privateTarget), 250);
      return;
    }
    try {
      const raw = sessionStorage.getItem('lyann_private_target');
      if (raw) privateTarget = JSON.parse(raw);
    } catch (_) {}
  }

  async function submitPrivateNeed() {
    const api = window.LYANN_API_CLIENT || window.apiClient;
    if (!privateTarget?.id || !api?.supabase) return false;
    const desc = ($('#wizardDescInput')?.value || '').trim();
    if (!desc) {
      $('#wizardDescInput')?.focus();
      return true;
    }
    const category = $('#wizardCategory')?.value || $('#wizardDomain')?.value || 'autre';
    const city = $('#wizardCitySelect')?.value || '';
    const territory = $('#wizardTerritorySelect')?.value || '';
    const location = [city, territory].filter(Boolean).join(' · ');
    const urgency = ($('#wizardDateType')?.value || 'FLEXIBLE').toUpperCase();
    let budget = null;
    const budgetMode = document.querySelector('input[name="wizardBudget"]:checked')?.value;
    if (budgetMode === 'fixe') {
      const raw = Number($('#wizardBudgetInput')?.value || 0);
      if (Number.isFinite(raw) && raw > 0) budget = raw;
    }
    const title = desc.length > 90 ? `${desc.slice(0, 87)}…` : desc;

    const { data, error } = await api.supabase.rpc('create_private_request', {
      p_target_user_id: privateTarget.id,
      p_category: category,
      p_title: title,
      p_description: desc,
      p_budget: budget,
      p_location: location,
      p_urgency: urgency
    });

    if (error) {
      console.error('[LYANN PRIVATE REQUEST] create failed', error);
      if (window.NotificationService?.showToast) window.NotificationService.showToast('warning', "Impossible d'envoyer ce besoin privé pour le moment.");
      else if (window.lyannAlert) window.lyannAlert("Impossible d'envoyer ce besoin privé pour le moment.");
      return true;
    }

    const requestId = data;
    const target = privateTarget;
    privateTarget = null;
    try { sessionStorage.removeItem('lyann_private_target'); } catch (_) {}
    const modal = $('#modal-request-help');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    if (window.NotificationService?.showToast) window.NotificationService.showToast('success', `Besoin envoyé uniquement à ${target.name || 'ce Lyanneur'}.`);
    else if (window.showLyanToast) window.showLyanToast(`Besoin envoyé uniquement à ${target.name || 'ce Lyanneur'}.`, '✓');
    openChatForContext(target, { requestId, requesterId: currentUserId(), helperId: target.id, title });
    return true;
  }

  function bindGlobalActions() {
    if (document.documentElement.dataset.sharedUxGlobalBound === 'true') return;
    document.documentElement.dataset.sharedUxGlobalBound = 'true';

    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('button, a');
      if (!btn) return;
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();

      if (/^Contacter$/i.test(text) || btn.classList.contains('btn-contact') || btn.classList.contains('contact-provider-btn')) {
        const ctx = findProfileContext(btn);
        if (ctx.id) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!currentUserId()) {
            $('#loginModal')?.classList.add('active');
            return;
          }
          openChatForContext(ctx);
          return;
        }
      }

      if (/lui proposer mon besoin/i.test(text) || btn.classList.contains('btn-propose-need')) {
        const ctx = findProfileContext(btn);
        if (ctx.id) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!currentUserId()) {
            $('#loginModal')?.classList.add('active');
            return;
          }
          openTargetedNeedWizard(ctx);
          return;
        }
      }

      const helpBtn = btn.closest('.btn-help-lyann');
      if (helpBtn) {
        const requesterId = helpBtn.dataset.requesterId;
        const requestId = helpBtn.dataset.requestId;
        if (requesterId && requesterId === currentUserId()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (window.LYANN_OWNER_ACTIONS?.openManager) window.LYANN_OWNER_ACTIONS.openManager(requestId);
          return;
        }
        if (requesterId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const ctx = {
            id: requesterId,
            name: helpBtn.dataset.requesterName || 'Lyanneur',
            avatar: helpBtn.dataset.requesterAvatar || ''
          };
          openChatForContext(ctx, {
            requestId,
            requesterId,
            helperId: currentUserId(),
            title: helpBtn.dataset.title || "Besoin d'entraide"
          });
          return;
        }
      }

      if (privateTarget && btn.closest('#modal-request-help')) {
        const activeStep = $('#modal-request-help .wizard-step.active')?.dataset.step;
        const finalLike = /publier|envoyer|valider|terminer/i.test(text);
        if (activeStep === '6' && finalLike) {
          event.preventDefault();
          event.stopImmediatePropagation();
          await submitPrivateNeed();
        }
      }
    }, true);
  }

  function removeOpenStatus() {
    const status = $('#lyannDetailStatus');
    if (!status) return;
    if (/\bOPEN\b/i.test(status.textContent || '')) status.dataset.openStatus = 'true';
    else delete status.dataset.openStatus;
  }

  function start() {
    injectStyles();
    ensureLoginErrorBox();
    bindHeroSearch();
    stableHeroIntent();
    bindGlobalActions();
    hydratePrivateTargetFromUrlOrStorage();
    removeOpenStatus();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      patchLoginApi();
      ensureLoginErrorBox();
      bindHeroSearch();
      stableHeroIntent();
      removeOpenStatus();
      if (tries > 20) clearInterval(timer);
    }, 500);

    const observer = new MutationObserver(() => {
      ensureLoginErrorBox();
      removeOpenStatus();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
