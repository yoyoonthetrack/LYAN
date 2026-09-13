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
    const legacyOpenConversation = typeof window.__LYANN_CHAT_CORE_OPEN === 'function'
        ? window.__LYANN_CHAT_CORE_OPEN.bind(window)
        : null;

    function modal() { return document.getElementById('chatModal'); }
    function layout() { return modal()?.querySelector('.chat-modal-layout') || null; }
    function mainArea() { return modal()?.querySelector('.chat-main-area') || null; }
    function withTimeout(promise, ms, label) {
        let timer;
        return Promise.race([
            promise,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label || 'operation'} timeout`)), ms); })
        ]).finally(() => clearTimeout(timer));
    }

    function ensureHydrationGuardStyle() {
        if (document.getElementById('lyannMessagingHydrationGuard')) return;
        const style = document.createElement('style');
        style.id = 'lyannMessagingHydrationGuard';
        style.textContent = '#chatModal.lyann-canonical-hydrating{visibility:hidden!important;opacity:0!important;pointer-events:none!important;}';
        document.head.appendChild(style);
    }

    function defaultAvatar() {
        return typeof window.getLyannDefaultAvatar === 'function' ? window.getLyannDefaultAvatar() : '';
    }

    async function resolveCurrentUserId() {
        try {
            const client = window.LYANN_API_CLIENT || window.apiClient;
            const auth = client?.supabase?.auth;
            if (auth && typeof auth.getSession === 'function') {
                const { data } = await withTimeout(auth.getSession(), 4000, 'session');
                if (data?.session?.user?.id) return data.session.user.id;
            }
        } catch (e) {
            console.warn('[MESSAGING] session resolution failed', e);
        }
        return window.CURRENT_USER_ID || null;
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
            document.body.classList.remove('hide-bottom-nav', 'in-chat-active', 'lyann-messaging-open', 'lyann-messaging-child-open', 'lyann-messaging-transition');
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

    function isVisible(el) { return !!el && getComputedStyle(el).display !== 'none'; }

    function syncChildSurfaceState() {
        const main = mainArea();
        const openSurface = CHILD_SURFACES.map((id) => document.getElementById(id)).find(isVisible);
        const active = !!openSurface;
        if (main) {
            main.classList.toggle('lyann-child-surface-open', active);
            main.dataset.lyannChildSurface = openSurface?.id || '';
        }
        document.body.classList.toggle('lyann-messaging-child-open', active);
    }

    function setListEmptyState(listContainer) {
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="chat-empty-state" style="padding:48px 20px;text-align:center;">
                <i class="ph ph-chat-circle-dots" style="font-size:2.4rem;color:#cbd5e1;"></i>
                <h4 style="font-weight:800;margin:12px 0 6px;">Aucune conversation pour le moment.</h4>
                <p style="color:#64748b;margin:0;">Vos échanges avec la communauté et les Lyanneurs apparaîtront ici.</p>
            </div>`;
    }

    function lastActiveFallback() {
        try {
            const parsed = JSON.parse(localStorage.getItem('lyann_last_active_contact') || 'null');
            return parsed?.id ? parsed : null;
        } catch (_) { return null; }
    }

    function renderConversationRows(listContainer, conversations) {
        listContainer.innerHTML = '';
        conversations.forEach((conversation) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'chat-contact-item';
            row.style.cssText = 'width:100%;border:0;background:transparent;text-align:left;';

            const avatarWrap = document.createElement('div');
            avatarWrap.className = 'chat-contact-avatar-wrap';
            const img = document.createElement('img');
            img.className = 'chat-contact-avatar';
            img.alt = conversation.name || 'Contact';
            img.src = conversation.avatar || defaultAvatar();
            avatarWrap.appendChild(img);

            const info = document.createElement('div');
            info.className = 'chat-contact-info';
            const name = document.createElement('div');
            name.className = 'chat-contact-name';
            name.textContent = conversation.name || 'Membre LYANN';
            const preview = document.createElement('div');
            preview.className = 'chat-contact-preview';
            preview.textContent = conversation.preview || 'Conversation LYANN';
            info.append(name, preview);
            row.append(avatarWrap, info);
            row.addEventListener('click', () => openConversation({
                contactId: conversation.contactId || conversation.id,
                name: conversation.name,
                avatar: conversation.avatar,
                requestId: conversation.requestId || null
            }));
            listContainer.appendChild(row);
        });
    }

    async function renderConversationList() {
        const listContainer = document.getElementById('chatContactsList');
        const repo = window.LYANN_MESSAGING_REPOSITORY;
        const userId = await resolveCurrentUserId();
        if (!listContainer) return;

        listContainer.innerHTML = '<div style="padding:28px;text-align:center;color:#64748b;">Chargement des conversations…</div>';
        if (repo && typeof repo.listConversations === 'function' && userId) {
            try {
                const conversations = await withTimeout(repo.listConversations(userId, { fresh: true }), 8000, 'conversation list');
                if (conversations.length) {
                    renderConversationRows(listContainer, conversations);
                    return;
                }
            } catch (e) {
                console.warn('[MESSAGING] canonical conversation list failed', e);
            }
        }

        const recent = lastActiveFallback();
        if (recent) {
            renderConversationRows(listContainer, [{
                contactId: recent.id,
                name: recent.name || 'Membre LYANN',
                avatar: recent.avatar || defaultAvatar(),
                preview: 'Conversation récente',
                requestId: recent.requestId || null
            }]);
            return;
        }
        setListEmptyState(listContainer);
    }

    async function openList() {
        document.body.classList.remove('lyann-messaging-transition');
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

    function resolveRequestId(options = {}) {
        return options.requestId
            || options.initialNeed?.requestId
            || window.LYANN_ACTIVE_CHAT_CONTACT?.requestId
            || document.getElementById('chatMissionContextBar')?.dataset?.requestContext
            || document.getElementById('btnViewLyannFromChat')?.dataset?.requestId
            || null;
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
        ensureHydrationGuardStyle();
        const shell = modal();
        if (shell) shell.classList.add('lyann-canonical-hydrating');
        document.body.classList.add('lyann-messaging-transition');
        const main = mainArea();
        if (main) main.setAttribute('aria-busy', 'true');

        try {
            await legacyOpenConversation(name, avatar, contactId, options.initialNeed || null);
            const l = layout();
            if (l) l.classList.add('mobile-conversation-active');
            const enriched = window.LYANN_ACTIVE_CHAT_CONTACT || {};
            const active = {
                id: contactId,
                name: enriched.name || name,
                avatar: enriched.avatar || avatar,
                requestId: resolveRequestId(options)
            };
            window.LYANN_ACTIVE_CHAT_CONTACT = active;
            try { localStorage.setItem('lyann_last_active_contact', JSON.stringify(active)); } catch (_) {}
        } finally {
            if (main) main.removeAttribute('aria-busy');
            if (shell) shell.classList.remove('lyann-canonical-hydrating');
            document.body.classList.remove('lyann-messaging-transition');
            setShellVisible(true);
        }
    }

    async function open(options = {}) {
        const mode = options.mode || (options.contactId || options.id || options.memberId ? 'conversation' : 'list');
        return mode === 'conversation' ? openConversation(options) : openList();
    }

    function backToList(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return openList();
    }

    function close(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        hideAllChildSurfaces();
        setShellVisible(false);
    }

    function openMissionFromChat(event, source) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const requestId = source?.dataset?.requestId || resolveRequestId();
        if (!requestId) {
            console.warn('[MESSAGING] no request id available for mission detail');
            return;
        }
        if (typeof window.openLyannDetailModal === 'function') {
            document.body.classList.add('chat-child-modal-open');
            window.openLyannDetailModal(requestId);
            requestAnimationFrame(() => {
                const detail = document.getElementById('lyannDetailModal');
                if (detail) detail.classList.add('opened-from-chat');
            });
        }
    }

    function routeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        if (action !== 'messages' && action !== 'openchat') return;
        const contactId = params.get('contact') || params.get('member') || params.get('chat');
        if (contactId) openConversation({ contactId, name: params.get('name') || 'Membre LYANN' });
        else openList();
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
            const mission = event.target.closest('#chatViewMissionBtn, #btnViewLyannFromChat, #chatDropViewMission');
            if (mission) {
                event.stopImmediatePropagation?.();
                openMissionFromChat(event, mission);
                return;
            }
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
        hideAllChildSurfaces,
        renderConversationList,
        openMissionFromChat
    };
    window.LYANN_MESSAGING = api;

    window.openLyannMessagesModal = () => api.openList();
    window.openChatWithUser = (name, avatar, contactId = name, initialNeed = null) => api.openConversation({
        name, avatar, contactId, initialNeed, requestId: initialNeed?.requestId || null
    });
    window.backToChatContacts = (event) => api.backToList(event);
    window.closeLyannChatModal = (event) => api.close(event);

    function boot() {
        ensureHydrationGuardStyle();
        installChildSurfaceObserver();
        installCanonicalEntryInterception();
        routeFromUrl();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();