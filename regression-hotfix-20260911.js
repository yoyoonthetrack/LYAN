(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const api = () => window.LYANN_API_CLIENT || window.apiClient || null;
  const sb = () => api()?.supabase || null;

  function injectStyles() {
    if ($('#lyannRegressionHotfixStyle')) return;
    const style = document.createElement('style');
    style.id = 'lyannRegressionHotfixStyle';
    style.textContent = `
      #chatMessages .chat-message-row.sent {
        width: 100% !important;
        display: flex !important;
        justify-content: flex-end !important;
        text-align: left !important;
      }
      #chatMessages .chat-message-row.received {
        width: 100% !important;
        display: flex !important;
        justify-content: flex-start !important;
        text-align: left !important;
      }
      #chatMessages .chat-message-row.sent > .chat-message-bubble {
        margin-left: auto !important;
        margin-right: 0 !important;
      }
      #chatMessages .chat-message-row.received > .chat-message-bubble {
        margin-left: 0 !important;
        margin-right: auto !important;
      }
      #chatModal .lyann-stray-project-tracking,
      #chatModal [data-lyann-stray-tracking="true"] {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        min-width: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
      .lyann-author-name { cursor: pointer !important; pointer-events:auto!important; }
    `;
    document.head.appendChild(style);
  }

  async function currentUserId() {
    const client = sb();
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      return data?.session?.user?.id || null;
    } catch (_) { return null; }
  }

  async function repairMessageOwnership() {
    const client = sb();
    const state = window.__LYANN_SHARED_NAV_CHAT__;
    const box = $('#chatMessages');
    if (!client || !state?.conversationId || !box) return;
    const uid = await currentUserId();
    if (!uid) return;
    const rows = $$('[data-message-id]', box);
    const ids = rows.map(row => row.dataset.messageId).filter(Boolean);
    if (!ids.length) return;
    const { data, error } = await client.from('messages').select('id,sender_id').in('id', ids);
    if (error || !Array.isArray(data)) return;
    const senders = new Map(data.map(message => [String(message.id), String(message.sender_id || '')]));
    rows.forEach(row => {
      const senderId = senders.get(String(row.dataset.messageId));
      if (!senderId) return;
      const mine = senderId === String(uid);
      row.classList.toggle('sent', mine);
      row.classList.toggle('received', !mine);
      row.dataset.messageOwner = mine ? 'self' : 'other';
    });
  }

  function normalizedText(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function removeStrayTrackingControl() {
    const chat = $('#chatModal');
    if (!chat) return;
    $$('*', chat).forEach(el => {
      if (el.closest('#lyannSharedActionSheet')) return;
      if (normalizedText(el) !== 'suivi du chantier') return;
      const actionable = el.closest('button,a,[role="button"],[onclick]');
      const target = actionable && chat.contains(actionable) ? actionable : el;
      target.classList.add('lyann-stray-project-tracking');
      target.dataset.lyannStrayTracking = 'true';
      target.setAttribute('aria-hidden', 'true');
      if ('tabIndex' in target) target.tabIndex = -1;
      target.style.setProperty('display', 'none', 'important');
    });
  }

  function authorIdFromName(nameEl) {
    return nameEl?.closest('[data-member-id]')?.dataset?.memberId
      || nameEl?.closest('[data-user-id]')?.dataset?.userId
      || nameEl?.closest('[data-profile-id]')?.dataset?.profileId
      || nameEl?.closest('.flash-card,.feed-card,.bokantaj-card,article')?.dataset?.memberId
      || null;
  }

  async function openAuthorProfile(nameEl) {
    const memberId = authorIdFromName(nameEl);
    if (!memberId) return false;
    try {
      if (typeof window.openQuickProfileModal === 'function') {
        await window.openQuickProfileModal(memberId);
        return true;
      }
      if (typeof window.openPublicMemberProfile === 'function') {
        await window.openPublicMemberProfile(memberId);
        return true;
      }
    } catch (error) {
      console.error('[LYANN profile hotfix]', error);
    }
    return false;
  }

  function bindBokantajAuthorNames() {
    if (document.documentElement.dataset.lyannAuthorNameHotfixBound === 'true') return;
    document.documentElement.dataset.lyannAuthorNameHotfixBound = 'true';
    document.addEventListener('click', async event => {
      const name = event.target.closest('.lyann-author-name');
      if (!name) return;
      const card = name.closest('.flash-card,.feed-card,.bokantaj-card,article');
      if (!card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      await openAuthorProfile(name);
    }, true);
  }

  function bindRepairs() {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        removeStrayTrackingControl();
        repairMessageOwnership();
      }, 30);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', event => {
      if (event.target.closest('#chatModal,.btn-help-lyann,.btn-open-chat-direct')) {
        setTimeout(schedule, 30);
        setTimeout(schedule, 150);
        setTimeout(schedule, 500);
      }
    }, true);
    setInterval(() => {
      if ($('#chatModal')?.classList.contains('active')) {
        removeStrayTrackingControl();
        repairMessageOwnership();
      }
    }, 750);
  }

  function start() {
    injectStyles();
    bindBokantajAuthorNames();
    bindRepairs();
    removeStrayTrackingControl();
    repairMessageOwnership();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
