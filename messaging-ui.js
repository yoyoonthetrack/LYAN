// LYANN canonical messaging controller.
// One shared messaging owner for Web and Capacitor.
(function () {
    'use strict';

    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.__canonical) return;

    const CHAT_SURFACE = 'messaging';
    const CHILD_SURFACES = [
        ['chat-actions', 'chatActionChoicesOverlay'],
        ['chat-direct-price', 'chatDirectPriceForm'],
        ['chat-milestone-quote', 'chatMilestoneDevisForm'],
        ['chat-checkout', 'chatCheckoutOverlay'],
        ['chat-tracking', 'chatTrackingOverlay'],
        ['chat-proof', 'chatSubmitProofOverlay'],
        ['chat-date', 'chatProposeDateForm'],
        ['chat-review', 'chatLeaveReviewForm']
    ];

    function getLegacyHydrator() {
        return typeof window.__LYANN_CHAT_CORE_OPEN === 'function'
            ? window.__LYANN_CHAT_CORE_OPEN.bind(window)
            : null;
    }

    function modal() { return document.getElementById('chatModal'); }
    function layout() { return modal()?.querySelector('.chat-modal-layout') || null; }
    function mainArea() { return modal()?.querySelector('.chat-main-area') || null; }
    function surfaces() { return window.LYANN_SURFACES || null; }

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

    function registerSurfaces() {
        const manager = surfaces();
        if (!manager) return false;

        manager.register(CHAT_SURFACE, {
            element: 'chatModal',
            mode: 'major',
            hideBottomNav: true,
            lockBody: true,
            onOpen() {
                document.body.classList.add('in-chat-active', 'lyann-messaging-open');
            },
            onClose() {
                document.body.classList.remove('in-chat-active', 'lyann-messaging-open', 'lyann-messaging-child-open', 'lyann-messaging-transition');
            }
        });

        CHILD_SURFACES.forEach(([name, id]) => {
            manager.register(name, {
                element: id,
                mode: 'child',
                hideBottomNav: true,
                lockBody: true,
                onOpen() { syncChildSurfaceState(); },
                onClose() { syncChildSurfaceState(); }
            });
        });
        return true;
    }

    function defaultAvatar() {
        return typeof window.getLyannDefaultAvatar === 'function' ? window.getLyannDefaultAvatar() : 'lyann-avatar-placeholder.svg';
    }

    async function resolveCurrentUserId() {
        const authState = window.LYANN_AUTH_STATE;
        if (authState) {
            try {
                await withTimeout(authState.ready(), 4000, 'auth state');
                const uid = authState.getSnapshot?.().userId;
                if (uid) return uid;
            } catch (error) {
                console.warn('[MESSAGING] auth-state resolution failed', error);
            }
        }

        if (window.CURRENT_USER_ID) return window.CURRENT_USER_ID;
        if (window.LYANN_CURRENT_USER?.id) return window.LYANN_CURRENT_USER.id;

        const session = window.LYANN_SESSION;
        if (session) {
            try {
                const user = await withTimeout(session.getUser(), 4000, 'session');
                if (user?.id) return user.id;
            } catch (error) {
                console.warn('[MESSAGING] session resolution failed', error);
            }
        }

        return null;
    }

    function setShellVisible(visible) {
        const manager = surfaces();
        const el = modal();
        if (visible) {
            document.body.classList.add('in-chat-active', 'lyann-messaging-open');
            document.body.style.overflow = 'hidden';
            if (el) {
                el.classList.add('active', 'lyann-surface-active');
                el.style.setProperty('display', 'flex', 'important');
                el.setAttribute('aria-hidden', 'false');
            }
            if (manager) {
                if (!manager.getElement(CHAT_SURFACE)) registerSurfaces();
                manager.open(CHAT_SURFACE);
            }
        } else {
            if (el) {
                el.classList.remove('active', 'lyann-surface-active');
                el.style.setProperty('display', 'none', 'important');
                el.setAttribute('aria-hidden', 'true');
            }
            if (manager) manager.close(CHAT_SURFACE);
            document.body.classList.remove('in-chat-active', 'lyann-messaging-open', 'lyann-messaging-child-open', 'lyann-messaging-transition');
            document.body.style.removeProperty('overflow');
        }
        return true;
    }

    function childSurfaceNameForElement(el) {
        const found = CHILD_SURFACES.find(([, id]) => id === el?.id);
        return found?.[0] || null;
    }

    function hideAllChildSurfaces() {
        const manager = surfaces();
        if (manager) {
            CHILD_SURFACES.forEach(([name]) => manager.close(name));
        } else {
            CHILD_SURFACES.forEach(([, id]) => {
                const el = document.getElementById(id);
                if (el) el.style.setProperty('display', 'none', 'important');
            });
        }
        syncChildSurfaceState();
    }

    function openChildSurface(id) {
        const el = document.getElementById(id);
        if (!el) return false;
        const name = childSurfaceNameForElement(el);
        const manager = surfaces();
        if (manager && name) manager.open(name);
        else el.style.display = 'flex';
        syncChildSurfaceState();
        return true;
    }

    function syncChildSurfaceState() {
        const manager = surfaces();
        const openName = CHILD_SURFACES.find(([name, id]) => manager?.isOpen(name) || isElementVisible(document.getElementById(id)))?.[0] || '';
        const active = !!openName;
        const main = mainArea();
        if (main) {
            main.classList.toggle('lyann-child-surface-open', active);
            main.dataset.lyannChildSurface = openName;
        }
        document.body.classList.toggle('lyann-messaging-child-open', active);
    }

    function isElementVisible(el) {
        if (!el) return false;
        return getComputedStyle(el).display !== 'none';
    }

    function setListEmptyState(listContainer) {
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="chat-empty-state" style="padding:48px 20px;text-align:center;">
                <i class="ph ph-chat-circle-dots" style="font-size:2.4rem;color:#cbd5e1;"></i>
                <h4 style="font-weight:800;margin:12px 0 6px;">Aucune conversation pour le moment.</h4>
                <p style="color:#64748b;margin:0;">Vos échanges autour d’un besoin apparaîtront ici.</p>
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
        if (!userId) {
            setListEmptyState(listContainer);
            return;
        }
        if (!repo || typeof repo.listConversations !== 'function') {
            listContainer.innerHTML = '<div class="chat-empty-state" style="padding:48px 20px;text-align:center;"><strong>Impossible de charger les conversations.</strong><p>Vérifiez votre connexion, puis réessayez.</p><button type="button" class="btn btn-outline" id="chatRetryConversations" style="margin-top:16px;min-height:44px;">Réessayer</button></div>';
            listContainer.querySelector('#chatRetryConversations')?.addEventListener('click', () => renderConversationList());
            return;
        }

        try {
            const conversations = await withTimeout(repo.listConversations(userId, { fresh: true }), 8000, 'conversation list');
            const supportId = window.LYANN_SUPPORT_USER_ID || (window.LYANN_API_CLIENT && await window.LYANN_API_CLIENT.getSupportUserId());
            let rows = conversations.slice();
            if (supportId && !rows.some((row) => row.contactId === supportId)) {
                rows.unshift({
                    contactId: supportId,
                    name: 'Aide LYANN',
                    preview: 'Écrivez-nous ici',
                    pinned: true
                });
            }
            if (rows.length) renderConversationRows(listContainer, rows);
            else setListEmptyState(listContainer);
        } catch (error) {
            console.warn('[MESSAGING] canonical conversation list failed', error);
            // Navigation memory is only a degraded-network fallback, never a second data source.
            const recent = lastActiveFallback();
            if (recent) {
                renderConversationRows(listContainer, [{
                    contactId: recent.id,
                    name: recent.name || 'Membre LYANN',
                    avatar: recent.avatar || defaultAvatar(),
                    preview: 'Conversation récente',
                    requestId: recent.requestId || null
                }]);
            } else {
                listContainer.innerHTML = '<div class="chat-empty-state" style="padding:48px 20px;text-align:center;"><strong>Impossible de charger les conversations.</strong><p>Vérifiez votre connexion, puis réessayez.</p><button type="button" class="btn btn-outline" id="chatRetryConversations" style="margin-top:16px;min-height:44px;">Réessayer</button></div>';
                listContainer.querySelector('#chatRetryConversations')?.addEventListener('click', () => renderConversationList());
            }
        }
    }

    async function openList() {
        if (!await window.LYANN_ROUTER.requireAuthForInteraction('messages')) return false;
        document.body.classList.remove('lyann-messaging-transition');
        registerSurfaces();
        if (!setShellVisible(true)) {
            window.location.href = 'feed.html?action=messages';
            return;
        }
        hideAllChildSurfaces();
        const l = layout();
        if (l) {
            l.classList.remove('mobile-conversation-active', 'has-active-conversation');
        }
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
        if (!await window.LYANN_ROUTER.requireAuthForInteraction(options.requestId ? 'requestHelp' : 'messages', options)) return false;
        console.log('[MESSAGING openConversation] called with:', JSON.stringify({
            contactId: options.contactId, id: options.id, name: options.name,
            requestId: options.requestId, memberId: options.memberId,
            initialNeed: options.initialNeed
        }));

        // Resolve contactId from available options. All callers (router extractPayload,
        // conversation row click, openChatWithUser compat) already supply the correct
        // user UUID. Request UUID → user UUID resolution is handled downstream by
        // __LYANN_CHAT_CORE_OPEN so we must NOT duplicate it here.
        const contactId = options.contactId || options.requesterId
            || options.initialNeed?.requesterId || options.memberId
            || options.id || null;
        const name = options.name || 'Membre LYANN';
        const avatar = options.avatar || defaultAvatar();

        console.log('[MESSAGING openConversation] contactId:', contactId, 'name:', name);

        if (!contactId) {
            console.warn('[MESSAGING openConversation] no contactId, falling back to list');
            return openList();
        }

        const legacyOpenConversation = getLegacyHydrator();
        registerSurfaces();
        hideAllChildSurfaces();

        if (!legacyOpenConversation) {
            console.error('[MESSAGING] conversation hydrator unavailable');
            setShellVisible(true);
            return true;
        }

        ensureHydrationGuardStyle();
        const shell = modal();
        if (shell) shell.classList.add('lyann-canonical-hydrating');
        document.body.classList.add('lyann-messaging-transition');
        const main = mainArea();
        if (main) main.setAttribute('aria-busy', 'true');

        try {
            console.log('[MESSAGING openConversation] calling legacyOpenConversation with:', name, contactId);
            await legacyOpenConversation(name, avatar, contactId, options.initialNeed || null);
            const l = layout();
            if (l) {
                l.classList.add('mobile-conversation-active', 'has-active-conversation');
            }
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
            document.body.classList.remove('lyann-messaging-transition');
            setShellVisible(true);
            if (shell) shell.classList.remove('lyann-canonical-hydrating');
        }
        return true;
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
        return setShellVisible(false);
    }

    function openMissionFromChat(event, source) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const requestId = source?.dataset?.requestId || resolveRequestId();
        if (!requestId) {
            console.warn('[MESSAGING] no request id available for mission detail');
            return false;
        }
        if (window.LYANN_ROUTER) return window.LYANN_ROUTER.go('mission', { requestId });
        if (typeof window.openLyannDetailModal === 'function') {
            window.openLyannDetailModal(requestId);
            return true;
        }
        return false;
    }

    function installFeatureInternalInterception() {
        document.addEventListener('click', (event) => {
            const cancelReply = event.target.closest('#chatCancelReplyBtn, .chat-reply-cancel-btn');
            if (cancelReply) {
                event.stopImmediatePropagation?.();
                const preview = document.getElementById('chatReplyPreview') || document.querySelector('.chat-reply-preview');
                if (preview) preview.style.display = 'none';
                return;
            }
            const mission = event.target.closest('#chatViewMissionBtn, #btnViewLyannFromChat, #chatDropViewMission');
            if (!mission) return;
            event.stopImmediatePropagation?.();
            openMissionFromChat(event, mission);
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
        openChildSurface,
        renderConversationList,
        openMissionFromChat
    };
    window.LYANN_MESSAGING = api;

    // Compatibility aliases only. All public navigation should enter through LYANN_ROUTER.
    window.openLyannMessagesModal = () => window.LYANN_ROUTER ? window.LYANN_ROUTER.go('messages') : api.openList();
    window.openChatWithUser = (name, avatar, contactId = name, initialNeed = null) => api.openConversation({
        name, avatar, contactId, initialNeed, requestId: initialNeed?.requestId || null
    });
    window.backToChatContacts = (event) => api.backToList(event);
    window.closeLyannChatModal = (event) => api.close(event);

    function boot() {
        ensureHydrationGuardStyle();
        registerSurfaces();
        installFeatureInternalInterception();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();