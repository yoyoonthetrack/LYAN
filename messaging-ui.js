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
        style.textContent = '#chatModal.lyann-canonical-hydrating .chat-thread-pending{opacity:1}';
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

    function formatInboxTime(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const now = new Date();
        if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    function escapeInboxSelector(value) {
        return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/"/g, '');
    }

    function inboxQuoteLabel(status) {
        if (status === 'COMPLETED') return 'Terminé';
        if (status === 'SENT' || status === 'VIEWED' || status === 'REVISED') return 'En attente';
        if (status === 'ACCEPTED') return 'Accepté';
        if (status === 'REJECTED' || status === 'DECLINED') return 'Refusé';
        return '';
    }

    function createConversationRow(conversation) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'chat-contact-item';
        row.dataset.chatMemberId = conversation.contactId || conversation.id || '';
        row.setAttribute('data-chat-member-id', row.dataset.chatMemberId);
        if (conversation.conversationId) row.dataset.conversationId = conversation.conversationId;
        if (conversation.pinned) row.dataset.pinned = '1';
        row.dataset.unread = conversation.unread ? '1' : '0';
        row.dataset.annonce = conversation.hasAnnonce ? '1' : '0';
        row.dataset.devis = conversation.hasDevis ? '1' : '0';
        row.dataset.favorite = window.isContactFavorite?.(conversation.contactId || conversation.id) ? '1' : '0';
        if (conversation.unread) row.classList.add('is-unread');
        const activeId = window.LYANN_ACTIVE_CHAT_CONTACT?.id;
        if (activeId && String(activeId) === String(row.dataset.chatMemberId)) row.classList.add('active');
        row.style.cssText = '';
        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'chat-contact-avatar-wrap';
        if (conversation.isSupport) {
            avatarWrap.classList.add('is-support');
            const mark = document.createElement('img');
            mark.className = 'chat-contact-avatar lyann-support-mark';
            mark.alt = '';
            mark.src = 'logo-app-256.png';
            avatarWrap.appendChild(mark);
        } else {
            const img = document.createElement('img');
            img.className = 'chat-contact-avatar';
            img.alt = conversation.name || 'Contact';
            img.src = conversation.avatar || defaultAvatar();
            avatarWrap.appendChild(img);
        }

        const info = document.createElement('div');
        info.className = 'chat-contact-info';
        const nameRow = document.createElement('div');
        nameRow.className = 'chat-contact-name-row';
        const name = document.createElement('div');
        name.className = 'chat-contact-name';
        name.textContent = conversation.name || 'Membre LYANN';
        nameRow.appendChild(name);
        if (conversation.isSupport) {
            const support = document.createElement('span');
            support.className = 'lyann-inbox-role';
            support.textContent = 'Support officiel';
            nameRow.appendChild(support);
        } else {
            if (conversation.isProVerified) {
                const pro = document.createElement('span');
                pro.className = 'lyann-inbox-role';
                pro.textContent = 'Pro';
                nameRow.appendChild(pro);
            }
            if (conversation.isVerified) {
                const verified = document.createElement('span');
                verified.className = 'lyann-inbox-role is-verified';
                verified.textContent = 'Vérifié';
                nameRow.appendChild(verified);
            }
        }
        const time = document.createElement('span');
        time.className = 'chat-contact-time';
        time.textContent = formatInboxTime(conversation.lastMessageAt);
        nameRow.appendChild(time);
        info.appendChild(nameRow);
        if (conversation.preview) {
            const preview = document.createElement('div');
            preview.className = 'chat-contact-preview';
            preview.textContent = conversation.preview;
            info.appendChild(preview);
        }
        const quoteLabel = inboxQuoteLabel(conversation.quoteStatus);
        if (conversation.annonceTitle || quoteLabel) {
            const context = document.createElement('div');
            context.className = 'lyann-inbox-context';
            if (conversation.annonceTitle) {
                const annonce = document.createElement('span');
                annonce.textContent = conversation.annonceTitle;
                context.appendChild(annonce);
            }
            if (quoteLabel) {
                const quote = document.createElement('span');
                quote.textContent = 'Devis · ' + quoteLabel;
                context.appendChild(quote);
            }
            info.appendChild(context);
        }
        row.dataset.context = [conversation.annonceTitle || '', quoteLabel || ''].join(' ').toLowerCase();
        const dot = document.createElement('span');
        dot.className = 'chat-unread-dot lyann-inbox-unread';
        dot.setAttribute('aria-hidden', 'true');
        const unreadCount = Number(conversation.unreadCount) || 0;
        dot.hidden = unreadCount < 1;
        if (unreadCount) dot.textContent = String(unreadCount);
        row.append(avatarWrap, info, dot);
        row.addEventListener('click', () => openConversation({
            contactId: conversation.contactId || conversation.id,
            name: conversation.name,
            avatar: conversation.avatar,
            requestId: conversation.requestId || null
        }));
        return row;
    }

    function bumpInboxRow(row) {
        const list = row.parentElement;
        if (!list) return;
        const pinned = [...list.querySelectorAll('.chat-contact-item[data-pinned="1"]')].filter((item) => item !== row);
        if (row.dataset.pinned === '1') {
            list.insertBefore(row, list.firstChild);
            return;
        }
        const anchor = pinned[pinned.length - 1];
        if (anchor) anchor.after(row);
        else list.insertBefore(row, list.firstChild);
    }

    function renderConversationRows(listContainer, conversations) {
        listContainer.innerHTML = '';
        conversations.forEach((conversation) => listContainer.appendChild(createConversationRow(conversation)));
        applyInboxView();
    }

    function withSupportRow(rows) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        const supportId = window.LYANN_SUPPORT_USER_ID;
        if (supportId && !list.some((row) => row.contactId === supportId)) {
            list.unshift({
                contactId: supportId,
                name: 'Support LYANN',
                preview: 'Écrivez-nous ici pour toute question ou aide sur l’application.',
                pinned: true,
                isSupport: true
            });
        }
        return list;
    }

    function latestConversation(rows) {
        return [...(rows || [])]
            .filter((row) => row && row.contactId)
            .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))[0] || null;
    }

    let conversationListLoading = false;
    async function renderConversationList() {
        if (conversationListLoading) return;
        conversationListLoading = true;
        try {
        const listContainer = document.getElementById('chatContactsList');
        const repo = window.LYANN_MESSAGING_REPOSITORY;
        const userId = await resolveCurrentUserId();
        if (!listContainer) return;

        const keepVisible = listContainer.querySelector('.chat-contact-item');
        const warmed = userId && repo?.peekConversations?.(userId);
        if (Array.isArray(warmed) && warmed.length) {
            renderConversationRows(listContainer, withSupportRow(warmed));
        } else if (!keepVisible) {
            listContainer.innerHTML = '<div style="padding:28px;text-align:center;color:#64748b;">Chargement des conversations…</div>';
        }
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
            if (conversations.length) renderConversationRows(listContainer, withSupportRow(conversations));
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
        } finally {
            conversationListLoading = false;
        }
    }

    function syncInboxNavOffset() {
        const nav = document.querySelector('.navbar');
        if (!nav) return;
        const bottom = Math.ceil(nav.getBoundingClientRect().bottom);
        if (bottom > 0) document.documentElement.style.setProperty('--lyann-inbox-nav-offset', bottom + 'px');
    }

    let inboxScrollTop = 0;
    let threadHistoryPushed = false;
    let threadBackLock = 0;

    function captureInboxScroll() {
        const list = document.getElementById('chatContactsList');
        if (list) inboxScrollTop = list.scrollTop;
    }

    function noteThreadHistory(contactId) {
        const state = { lyannMessaging: 'thread', contactId: String(contactId || '') };
        if (threadHistoryPushed) {
            history.replaceState(state, '');
            return;
        }
        history.pushState(state, '');
        threadHistoryPushed = true;
    }

    async function openList(options = {}) {
        if (!await window.LYANN_ROUTER.requireAuthForInteraction('messages')) return false;
        window.__lyannOpenToken = (window.__lyannOpenToken || 0) + 1;
        document.body.classList.remove('lyann-messaging-transition');
        registerSurfaces();
        if (!setShellVisible(true)) {
            window.location.href = 'feed.html?action=messages';
            return;
        }
        document.body.classList.remove('in-chat-active', 'chat-conversation-open');
        document.body.classList.add('chat-list-open');
        syncInboxNavOffset();
        requestAnimationFrame(syncInboxNavOffset);
        document.querySelectorAll('.mobile-bottom-nav .nav-tab').forEach((tab) => {
            const selected = tab.id === 'tab-messages';
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', selected ? 'true' : 'false');
            if (selected) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
        hideAllChildSurfaces();
        const l = layout();
        if (l) {
            l.classList.remove('mobile-conversation-active', 'has-active-conversation');
        }
        document.querySelectorAll('#chatModal .chat-contacts-sidebar').forEach((node) => node.style.removeProperty('display'));
        const list = document.getElementById('chatContactsList');
        const keepRows = options.restore && list && list.querySelector('.chat-contact-item');
        if (!keepRows) await renderConversationList();
        else {
            applyInboxView();
            list.scrollTop = inboxScrollTop;
        }
    }

    async function openInbox() {
        if (!await window.LYANN_ROUTER.requireAuthForInteraction('messages')) return false;
        document.body.classList.remove('lyann-messaging-transition');
        registerSurfaces();
        if (!setShellVisible(true)) {
            window.location.href = 'feed.html?action=messages';
            return false;
        }
        hideAllChildSurfaces();
        const userId = await resolveCurrentUserId();
        const repo = window.LYANN_MESSAGING_REPOSITORY;
        let rows = userId && repo?.peekConversations?.(userId);
        const listContainer = document.getElementById('chatContactsList');
        if (Array.isArray(rows) && rows.length && listContainer) {
            renderConversationRows(listContainer, withSupportRow(rows));
        }
        const refreshList = () => {
            if (!userId || typeof repo?.listConversations !== 'function') return Promise.resolve(rows || []);
            return repo.listConversations(userId, { fresh: true }).then((fresh) => {
                const box = document.getElementById('chatContactsList');
                if (box) {
                    if (fresh.length) renderConversationRows(box, withSupportRow(fresh));
                    else setListEmptyState(box);
                }
                return fresh;
            });
        };
        if (!Array.isArray(rows) || !rows.length) {
            try {
                rows = repo?.warmInbox ? await repo.warmInbox(userId) : await refreshList();
                if (listContainer && Array.isArray(rows)) {
                    if (rows.length) renderConversationRows(listContainer, withSupportRow(rows));
                    else setListEmptyState(listContainer);
                }
            } catch (_) {
                rows = [];
            }
        } else {
            refreshList().catch(() => {});
        }
        const last = latestConversation(rows);
        if (!last) return true;
        const l = layout();
        if (l) l.classList.add('mobile-conversation-active', 'has-active-conversation');
        return openConversation({ contactId: last.contactId, name: last.name, avatar: last.avatar });
    }

    function resolveRequestId(options = {}) {
        const contactId = options.contactId || options.id || options.memberId;
        if (contactId && window.LYANN_SUPPORT_USER_ID && String(contactId) === String(window.LYANN_SUPPORT_USER_ID)) {
            return null;
        }
        if (options.name === 'Support LYANN' || options.name === 'Aide LYANN') return null;
        return options.requestId
            || options.initialNeed?.requestId
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
        const openToken = (window.__lyannOpenToken = (window.__lyannOpenToken || 0) + 1);
        const openedAt = performance.now();
        captureInboxScroll();
        const viewerId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.CURRENT_USER_ID || null;
        const warmThread = Boolean(viewerId && window.LYANN_MESSAGING_REPOSITORY?.peekMessages?.(viewerId, contactId));
        const headerName = document.getElementById('chatHeaderName');
        const headerAvatar = document.getElementById('chatHeaderAvatar');
        if (headerName) headerName.textContent = name;
        if (headerAvatar && avatar) headerAvatar.src = avatar;
        const threadLayout = layout();
        if (threadLayout) threadLayout.classList.add('mobile-conversation-active', 'has-active-conversation');
        document.querySelectorAll('#chatModal .chat-main-area, #chatModal .chat-main-pane').forEach((node) => node.style.removeProperty('display'));
        document.body.classList.add('in-chat-active', 'chat-conversation-open');
        document.body.classList.remove('chat-list-open');
        if (shell) shell.classList.add('lyann-canonical-hydrating');
        document.body.classList.remove('lyann-messaging-transition');
        noteThreadHistory(contactId);
        const main = mainArea();
        if (main) main.setAttribute('aria-busy', 'true');
        window.__LYANN_THREAD_TIMING = { shellMs: Math.round(performance.now() - openedAt), warm: warmThread };

        try {
            console.log('[MESSAGING openConversation] calling legacyOpenConversation with:', name, contactId);
            if (!window.LYANN_SUPPORT_USER_ID && window.LYANN_API_CLIENT?.getSupportUserId && !warmThread) {
                window.LYANN_API_CLIENT.getSupportUserId().catch(() => {});
            }
            const supportThread = Boolean(window.LYANN_SUPPORT_USER_ID && String(contactId) === String(window.LYANN_SUPPORT_USER_ID));
            await legacyOpenConversation(name, avatar, contactId, supportThread ? null : (options.initialNeed || (options.direct ? { direct: true } : null)));
            if (openToken !== window.__lyannOpenToken || !document.body.classList.contains('chat-conversation-open')) return true;
            const l = layout();
            if (l) {
                l.classList.add('mobile-conversation-active', 'has-active-conversation');
            }
            const enriched = window.LYANN_ACTIVE_CHAT_CONTACT || {};
            const active = {
                id: contactId,
                name: supportThread ? 'Support LYANN' : (enriched.name || name),
                avatar: enriched.avatar || avatar,
                requestId: supportThread ? null : resolveRequestId(options)
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
        return mode === 'conversation' ? openConversation(options) : openInbox();
    }

    function backToList(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const now = Date.now();
        if (now - threadBackLock < 350) return false;
        threadBackLock = now;
        const pushed = threadHistoryPushed;
        threadHistoryPushed = false;
        const shown = openList({ restore: true });
        if (pushed) history.back();
        return shown;
    }

    function close(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        hideAllChildSurfaces();
        document.body.classList.remove('chat-list-open', 'chat-conversation-open');
        return setShellVisible(false);
    }

    let inboxFilter = 'all';
    function applyInboxView() {
        const query = (document.getElementById('chatSearchInput')?.value || '').trim().toLowerCase();
        const items = [...document.querySelectorAll('#chatContactsList .chat-contact-item')];
        let visible = 0;
        items.forEach((item) => {
            const name = item.querySelector('.chat-contact-name')?.textContent.toLowerCase() || '';
            const preview = item.querySelector('.chat-contact-preview')?.textContent.toLowerCase() || '';
            const context = item.dataset.context || '';
            const matchesQuery = !query || name.includes(query) || preview.includes(query) || context.includes(query);
            const memberId = item.dataset.chatMemberId;
            let matchesFilter = true;
            if (inboxFilter === 'unread') matchesFilter = item.dataset.unread === '1';
            else if (inboxFilter === 'annonces') matchesFilter = item.dataset.annonce === '1';
            else if (inboxFilter === 'devis') matchesFilter = item.dataset.devis === '1';
            else if (inboxFilter === 'favoris') matchesFilter = item.dataset.favorite === '1' || !!window.isContactFavorite?.(memberId);
            const show = matchesQuery && matchesFilter;
            item.hidden = !show;
            if (show) visible += 1;
        });
        const list = document.getElementById('chatContactsList');
        if (!list) return;
        let note = list.querySelector('.lyann-inbox-filter-empty');
        if (!note) {
            note = document.createElement('p');
            note.className = 'lyann-inbox-filter-empty';
            list.appendChild(note);
        }
        note.hidden = visible > 0 || !items.length;
        note.textContent = query ? 'Aucune conversation ne correspond à votre recherche.' : 'Aucune conversation dans ce filtre.';
    }
    window.applyLyannInboxView = applyInboxView;
    document.addEventListener('click', (event) => {
        const pill = event.target.closest('.lyann-inbox-pill');
        if (pill) {
            inboxFilter = pill.dataset.inboxFilter || 'all';
            document.querySelectorAll('.lyann-inbox-pill').forEach((node) => {
                const on = node === pill;
                node.classList.toggle('is-active', on);
                node.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            applyInboxView();
            return;
        }
        if (event.target.closest('.lyann-inbox-compose')) {
            window.location.href = 'results.html?mode=lyanneurs';
        }
    });

    function openMissionFromChat(event, source) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const requestId = source?.dataset?.requestId || window.__lyannChatRequestId || resolveRequestId();
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
        openInbox,
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

    function warmCurrentInbox(userId) {
        const snapshot = window.LYANN_AUTH_STATE?.getSnapshot?.() || {};
        const id = userId || snapshot.userId;
        if (!id) return;
        if (!userId && snapshot.authenticated === false) return;
        window.LYANN_API_CLIENT?.getSupportUserId?.().catch(() => {});
        window.LYANN_MESSAGING_REPOSITORY?.warmInbox?.(id);
    }

    function installPullToRefresh() {
        const ptr = window.LYANN_PULL_TO_REFRESH;
        if (!ptr || installPullToRefresh.done) return;
        const list = document.getElementById('chatContactsList');
        const thread = document.getElementById('chatMessagesContainer');
        if (!list && !thread) return;
        installPullToRefresh.done = true;
        if (list) ptr.attach(list, () => api.renderConversationList());
        if (thread) ptr.attach(thread, () => window.refreshChatUI?.());
    }

    function boot() {
        ensureHydrationGuardStyle();
        registerSurfaces();
        installFeatureInternalInterception();
        installPullToRefresh();
        warmCurrentInbox();
        window.addEventListener('resize', () => {
            if (document.body.classList.contains('chat-list-open')) syncInboxNavOffset();
        });
        window.addEventListener('popstate', () => {
            if (!threadHistoryPushed) return;
            threadHistoryPushed = false;
            threadBackLock = Date.now();
            if (document.body.classList.contains('chat-conversation-open')) openList({ restore: true });
        });
        const threadSurface = document.getElementById('chatModal');
        let edgeStart = null;
        threadSurface?.addEventListener('touchstart', (event) => {
            if (!document.body.classList.contains('chat-conversation-open')) return;
            const touch = event.changedTouches && event.changedTouches[0];
            edgeStart = touch && touch.clientX <= 28 ? touch.clientX : null;
        }, { passive: true });
        threadSurface?.addEventListener('touchend', (event) => {
            if (edgeStart == null) return;
            const touch = event.changedTouches && event.changedTouches[0];
            const dx = touch ? touch.clientX - edgeStart : 0;
            edgeStart = null;
            if (dx > 72) backToList(event);
        }, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    window.addEventListener('lyann:auth-ready', (event) => warmCurrentInbox(event.detail?.userId));
    window.addEventListener('lyann:auth-state', (event) => {
        if (event.detail?.authenticated) warmCurrentInbox(event.detail.userId);
    });

    window.addEventListener('lyann:chat-activity', (event) => {
        const detail = event.detail || {};
        const list = document.getElementById('chatContactsList');
        if (!list || !detail.contactId) return;
        [...list.children].forEach((child) => {
            if (!child.classList?.contains('chat-contact-item')) child.remove();
        });
        const selector = escapeInboxSelector(detail.contactId);
        let row = list.querySelector('[data-chat-member-id="' + selector + '"]');
        if (!row) {
            row = createConversationRow({
                contactId: detail.contactId,
                conversationId: detail.conversationId,
                name: detail.name || 'Membre LYANN',
                avatar: detail.avatar,
                preview: detail.preview,
                lastMessageAt: detail.lastMessageAt,
                unread: !!detail.unread
            });
            list.appendChild(row);
        } else {
            const preview = row.querySelector('.chat-contact-preview');
            if (detail.preview) {
                if (preview) preview.textContent = detail.preview;
                else {
                    const info = row.querySelector('.chat-contact-info');
                    const node = document.createElement('div');
                    node.className = 'chat-contact-preview';
                    node.textContent = detail.preview;
                    info?.appendChild(node);
                }
            }
            const time = row.querySelector('.chat-contact-time');
            if (time && detail.lastMessageAt) time.textContent = formatInboxTime(detail.lastMessageAt);
            if (Object.prototype.hasOwnProperty.call(detail, 'unread')) {
                row.dataset.unread = detail.unread ? '1' : '0';
                row.classList.toggle('is-unread', !!detail.unread);
                const dot = row.querySelector('.chat-unread-dot');
                if (dot) {
                    if (detail.unread) {
                        const next = (Number(dot.textContent) || 0) + 1;
                        dot.textContent = String(next);
                        dot.hidden = false;
                    } else {
                        dot.textContent = '';
                        dot.hidden = true;
                    }
                }
            }
            if (detail.conversationId) row.dataset.conversationId = detail.conversationId;
        }
        bumpInboxRow(row);
        applyInboxView();
    });

    window.addEventListener('lyann:chat-read', (event) => {
        const detail = event.detail || {};
        const list = document.getElementById('chatContactsList');
        if (!list) return;
        const selector = detail.conversationId
            ? '[data-conversation-id="' + escapeInboxSelector(detail.conversationId) + '"]'
            : detail.contactId
                ? '[data-chat-member-id="' + escapeInboxSelector(detail.contactId) + '"]'
                : '';
        if (!selector) return;
        list.querySelectorAll(selector).forEach((row) => {
            row.classList.remove('is-unread');
            row.dataset.unread = '0';
            const dot = row.querySelector('.chat-unread-dot');
            if (dot) {
                dot.hidden = true;
                dot.textContent = '';
            }
        });
        applyInboxView();
    });

    window.addEventListener('lyann:quote-status', (event) => {
        const detail = event.detail || {};
        const label = inboxQuoteLabel(detail.status);
        if (!detail.contactId || !label) return;
        const selector = '[data-chat-member-id="' + escapeInboxSelector(detail.contactId) + '"]';
        document.querySelectorAll('#chatContactsList ' + selector).forEach((row) => {
            row.dataset.devis = '1';
            let context = row.querySelector('.lyann-inbox-context');
            if (!context) {
                context = document.createElement('div');
                context.className = 'lyann-inbox-context';
                row.querySelector('.chat-contact-info')?.appendChild(context);
            }
            let quote = context.querySelector('[data-quote-status]');
            if (!quote) {
                quote = document.createElement('span');
                quote.dataset.quoteStatus = '1';
                context.appendChild(quote);
            }
            quote.textContent = 'Devis · ' + label;
            row.dataset.context = ((row.dataset.context || '') + ' ' + label).toLowerCase();
        });
        applyInboxView();
    });
})();