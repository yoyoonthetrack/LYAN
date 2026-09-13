// LYANN canonical messaging controller.
// Every Web and Capacitor messaging entry point must go through this module.
(function () {
    'use strict';

    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.__canonical) return;

    const CHILD_SURFACES = [
        'chatActionChoicesOverlay',
        'chatDirectPriceForm',
        'chatMilestoneDevisForm',
        'chatCheckoutOverlay',
        'chatTrackingOverlay',
        'chatSubmitProofOverlay',
        'chatProposeDateForm',
        'chatLeaveReviewForm'
    ];

    const legacyOpenConversation = typeof window.openChatWithUser === 'function'
        ? window.openChatWithUser.bind(window)
        : null;

    function modal() { return document.getElementById('chatModal'); }
    function layout() { return modal()?.querySelector('.chat-modal-layout') || null; }
    function mainArea() { return modal()?.querySelector('.chat-main-area') || null; }

    function defaultAvatar() {
        return typeof window.getLyannDefaultAvatar === 'function' ? window.getLyannDefaultAvatar() : '';
    }

    function setShellVisible(visible) {
        const el = modal();
        if (!el) return false;
        if (visible) {
            document.body.classList.add('hide-bottom-nav', 'in-chat-active', 'lyann-messaging-open');
            el.style.display = 'flex';
            el.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            document.body.classList.remove('hide-bottom-nav', 'in-chat-active', 'lyann-messaging-open', 'lyann-messaging-child-open');
            el.classList.remove('active');
            el.style.display = 'none';
            document.body.style.removeProperty('overflow');
        }
        return true;
    }

    function hideAllChildSurfaces() {
        CHILD_SURFACES.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.setProperty('display', 'none', 'important');
        });
        syncChildSurfaceState();
    }

    function isVisible(el) {
        if (!el) return false;
        return getComputedStyle(el).display !== 'none';
    }

    function syncChildSurfaceState() {
        const main = mainArea();
        const openSurface = CHILD_SURFACES
            .map((id) => document.getElementById(id))
            .find(isVisible);
        const active = !!openSurface;
        if (main) {
            main.classList.toggle('lyann-child-surface-open', active);
            main.dataset.lyannChildSurface = openSurface?.id || '';
        }
        document.body.classList.toggle('lyann-messaging-child-open', active);
    }

    async function renderConversationList() {
        if (typeof window.renderContactsList === 'function') {
            try { await window.renderContactsList(); return; } catch (e) { console.warn('[MESSAGING] renderContactsList failed', e); }
        }
        if (typeof window.renderChatContacts === 'function') {
            try { await window.renderChatContacts(); } catch (e) { console.warn('[MESSAGING] renderChatContacts failed', e); }
        }
    }

    async function openList() {
        if (!setShellVisible(true)) {
            window.location.href = 'feed.html?action=messages';
            return;
        }
        hideAllChildSurfaces();
        const l = layout();
        if (l) l.classList.remove('mobile-conversation-active');
        document.querySelectorAll('#chatModal .chat-contacts-sidebar').forEach((node) => node.style.removeProperty('display'));
        await renderConversationList();
    }

    async function openConversation(options = {}) {
        const contactId = options.contactId || options.id || options.memberId || options.name;
        const name = options.name || 'Membre LYANN';
        const avatar = options.avatar || defaultAvatar();
        if (!contactId) return openList();

        if (!legacyOpenConversation) {
            const params = new URLSearchParams({ action: 'messages', contact: String(contactId), name: String(name) });
            window.location.href = `feed.html?${params.toString()}`;
            return;
        }

        hideAllChildSurfaces();
        await legacyOpenConversation(name, avatar, contactId, options.initialNeed || null);
        setShellVisible(true);
        const l = layout();
        if (l) l.classList.add('mobile-conversation-active');
        const active = { id: contactId, name, avatar, requestId: options.requestId || options.initialNeed?.requestId || null };
        window.LYANN_ACTIVE_CHAT_CONTACT = active;
        try { localStorage.setItem('lyann_last_active_contact', JSON.stringify(active)); } catch (e) {}
    }

    async function open(options = {}) {
        const mode = options.mode || (options.contactId || options.id || options.memberId ? 'conversation' : 'list');
        return mode === 'conversation' ? openConversation(options) : openList();
    }

    function backToList(event) {
        if (event) {
            event.preventDefault?.();
            event.stopPropagation?.();
        }
        return openList();
    }

    function close(event) {
        if (event) {
            event.preventDefault?.();
            event.stopPropagation?.();
        }
        hideAllChildSurfaces();
        setShellVisible(false);
    }

    function routeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        if (action !== 'messages' && action !== 'openchat') return;
        const contactId = params.get('contact') || params.get('member') || params.get('chat');
        if (contactId) {
            openConversation({ contactId, name: params.get('name') || 'Membre LYANN' });
        } else {
            openList();
        }
    }

    function installChildSurfaceObserver() {
        const nodes = CHILD_SURFACES.map((id) => document.getElementById(id)).filter(Boolean);
        if (!nodes.length) return;
        const observer = new MutationObserver(syncChildSurfaceState);
        nodes.forEach((node) => observer.observe(node, { attributes: true, attributeFilter: ['style', 'class'] }));
        syncChildSurfaceState();
    }

    function installCanonicalEntryInterception() {
        document.addEventListener('click', (event) => {
            const generic = event.target.closest('.open-chat-trigger, #tab-messages, #btnHeaderChat, [data-lyann-messages]');
            if (!generic) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            openList();
        }, true);
    }

    const api = {
        __canonical: true,
        open,
        openList,
        openConversation,
        backToList,
        close,
        syncChildSurfaceState,
        hideAllChildSurfaces
    };
    window.LYANN_MESSAGING = api;

    // Compatibility aliases: legacy code may still call these names, but they now
    // terminate in the single controller above.
    window.openLyannMessagesModal = () => api.openList();
    window.openChatWithUser = (name, avatar, contactId = name, initialNeed = null) => api.openConversation({
        name,
        avatar,
        contactId,
        initialNeed,
        requestId: initialNeed?.requestId || null
    });
    window.backToChatContacts = (event) => api.backToList(event);
    window.closeLyannChatModal = (event) => api.close(event);

    function boot() {
        installChildSurfaceObserver();
        installCanonicalEntryInterception();
        routeFromUrl();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
