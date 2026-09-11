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
      /* Explicit message ownership layout. Do not depend on legacy theme rules. */
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
      /* The standalone tracking control is not part of the chat composer/header. */
      #chatModal .lyann-stray-project-tracking { display: none !important; }
      .lyann-author-name { cursor: pointer !important; }
    `;
    document.head.appendChild(style);
  }

  async function currentUserId() {
    const client = sb();
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      return data?.session?.user?.id || null;
    } catch (_) {
      return null;
    }
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

  function removeStrayTrackingControl(root = document) {
    const chat = $('#chatModal');
    if (!chat) return;
    $$('button,a,[role="button"]', chat).forEach(control => {
      const text = (control.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text === 'suivi du chantier') {
        control.classList.add('lyann-stray-project-tracking');
        control.setAttribute('aria-hidden', 'true');
        control.tabIndex = -1;
      }
    });
  }

  function profileTriggerForName(nameEl) {
    const card = nameEl.closest('.flash-card,.feed-card,.bokantaj-card,article,[data-post-id],[data-request-id]');
    if (!card) return null;
    const direct = card.querySelector('.trigger-quick-profile,[data-member-id][role="button"],[data-member-id].clickable,img[data-member-id]');
    if (direct && direct !== nameEl) return direct;
    const authorBlock = nameEl.closest('.flash-author,.flash-author-row,.flash-author-info')?.parentElement || card;
    const avatar = authorBlock.querySelector?.('.trigger-quick-profile,[data-member-id],img');
    return avatar && avatar !== nameEl ? avatar : null;
  }

  function bindBokantajAuthorNames() {
    if (document.documentElement.dataset.lyannAuthorNameHotfixBound === 'true') return;
    document.documentElement.dataset.lyannAuthorNameHotfixBound = 'true';
    document.addEventListener('click', event => {
      const name = event.target.closest('.lyann-author-name');
      if (!name) return;
      const trigger = profileTriggerForName(name);
      if (trigger) {
        event.preventDefault();
        event.stopImmediatePropagation();
        trigger.click();
      }
    }, true);
  }

  function bindRepairs() {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        removeStrayTrackingControl();
        repairMessageOwnership();
      }, 40);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      if (event.target.closest('#chatModal,.btn-help-lyann,.btn-open-chat-direct')) {
        setTimeout(schedule, 80);
        setTimeout(schedule, 500);
      }
    }, true);

    setInterval(() => {
      if ($('#chatModal')?.classList.contains('active')) {
        removeStrayTrackingControl();
        repairMessageOwnership();
      }
    }, 1500);
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
