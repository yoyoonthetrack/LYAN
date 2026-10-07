// ---------------------------------------------------------
// CHAT LOGIC (NO ROLES)
// ---------------------------------------------------------

const BLOCKED_USERS_KEY = 'LYANN_BLOCKED_USERS';

window.getBlockedUsers = function() {
    try {
        const stored = localStorage.getItem(BLOCKED_USERS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch(e) {
        return [];
    }
};

function isLyannSupportContact(contactId) {
    const id = contactId || currentChatContact?.id || window.LYANN_ACTIVE_CHAT_CONTACT?.id;
    return Boolean(id && window.LYANN_SUPPORT_USER_ID && String(id) === String(window.LYANN_SUPPORT_USER_ID));
}

function hideChatMissionChrome() {
    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    if (banner) {
        banner.style.display = 'none';
        banner.removeAttribute('data-request-context');
        banner.innerHTML = '';
    }
    const dropViewMission = document.getElementById('chatDropViewMission');
    if (dropViewMission) dropViewMission.style.display = 'none';
    const viewMissionBtn = document.getElementById('chatViewMissionBtn');
    if (viewMissionBtn) viewMissionBtn.style.display = 'none';
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) actionContainer.style.display = 'none';
}

function renderDirectThreadAction(banner) {
    const host = banner || document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    if (!host || !currentChatContact) return;
    const myId = typeof getMyId === 'function' ? getMyId() : null;
    const startedBy = currentChatContact.startedBy;
    const iStarted = !startedBy || String(startedBy) === String(myId);
    const label = iStarted ? 'Demander un service' : 'Faire une offre';
    const action = iStarted ? 'DIRECT_ASK' : 'DIRECT_OFFER';
    host.style.display = 'flex';
    host.className = 'chat-mission-context-card';
    host.innerHTML = `
        <div class="chat-context-card-actions" style="display: flex; width: 100%;">
            <button type="button" class="btn-chat-ctx primary" id="btnDirectThreadAction" style="flex: 1; justify-content: center; min-height: 40px; border-radius: 18px; font-weight: 800;">${label}</button>
        </div>`;
    const button = document.getElementById('btnDirectThreadAction');
    if (button) button.onclick = (event) => { event.stopPropagation(); handleChatAction(action); };
}

window.isUserBlocked = function(idOrName) {
    if (!idOrName) return false;
    if (window.LYANN_SAFETY_REPOSITORY && window.LYANN_SAFETY_REPOSITORY.isBlocked(idOrName)) return true;
    const list = window.getBlockedUsers();
    return list.some(item => (typeof item === 'string' ? item === idOrName : (item.id === idOrName || item.name === idOrName)));
};

function rememberLocalBlock(id, name, blocked) {
    let list = window.getBlockedUsers().filter(item => (typeof item === 'string' ? item !== id : item.id !== id));
    if (blocked) list.push({ id, name, timestamp: new Date().toISOString() });
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));
}

window.blockUser = async function(contactId, contactName) {
    const name = contactName || (currentChatContact ? currentChatContact.name : 'Ce membre');
    const id = contactId || (currentChatContact ? currentChatContact.id : null);
    if (!id || !(typeof window.isUUID === 'function' && window.isUUID(id))) {
        if (window.lyannAlert) window.lyannAlert('Ce membre ne peut pas être bloqué pour le moment.');
        return false;
    }
    try {
        if (!window.LYANN_SAFETY_REPOSITORY) throw new Error('safety repository unavailable');
        await window.LYANN_SAFETY_REPOSITORY.block(id);
    } catch (err) {
        console.warn('[SAFETY] block failed', err);
        if (window.lyannAlert) window.lyannAlert('Le blocage n’a pas pu être enregistré. Vérifiez votre connexion et réessayez.');
        return false;
    }
    rememberLocalBlock(id, name, true);

    if (window.lyannAlert) {
        window.lyannAlert(`${name} est désormais bloqué. Vous ne pourrez plus échanger de messages ensemble. Vous pouvez le débloquer à tout moment depuis cette conversation.`);
    }

    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.renderChatContacts === 'function') window.renderChatContacts();
    return true;
};

window.unblockUser = async function(contactId) {
    if (!contactId) return false;
    if (typeof window.isUUID === 'function' && window.isUUID(contactId)) {
        try {
            if (!window.LYANN_SAFETY_REPOSITORY) throw new Error('safety repository unavailable');
            await window.LYANN_SAFETY_REPOSITORY.unblock(contactId);
        } catch (err) {
            console.warn('[SAFETY] unblock failed', err);
            if (window.lyannAlert) window.lyannAlert('Le déblocage n’a pas pu être enregistré. Réessayez dans un instant.');
            return false;
        }
    }
    rememberLocalBlock(contactId, null, false);
    let list = window.getBlockedUsers().filter(item => (typeof item === 'string' ? item !== contactId : item.name !== contactId));
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));

    if (typeof window.lyannToast === 'function') window.lyannToast('Le membre a été débloqué.', 'success');

    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.renderChatContacts === 'function') window.renderChatContacts();
    return true;
};

window.openReportModal = function(targetName = null) {
    const reportModal = document.getElementById('reportModal');
    const nameToReport = targetName || (currentChatContact ? currentChatContact.name : 'ce membre');
    if (!reportModal) {
        console.error('[REPORT] report surface unavailable; no local fallback is permitted');
        if (window.lyannAlert) window.lyannAlert('Le signalement est momentanément indisponible. Réessayez plus tard.');
        return false;
    }
    reportModal.setAttribute('data-target-user', nameToReport);
    const modalTitle = reportModal.querySelector('.step-title');
    if (modalTitle) modalTitle.textContent = `Signaler ${nameToReport}`;
    if (window.LYANN_SURFACES) {
        window.LYANN_SURFACES.register('report', { element: 'reportModal', mode: 'major', hideBottomNav: true, lockBody: true });
        window.LYANN_SURFACES.open('report');
    } else {
        reportModal.classList.add('active');
        reportModal.style.display = 'flex';
    }
    return true;
};
let currentChatContact = null;
function getMyId() {
    const authId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId;
    return authId || window.CURRENT_USER_ID || null;
}

function closeAllOverlays() {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.hideAllChildSurfaces === 'function') {
        window.LYANN_MESSAGING.hideAllChildSurfaces();
        setChatContextCoveredByOverlay(false);
        return;
    }
    const ids = [
        'chatActionChoicesOverlay', 'chatDirectPriceForm', 'chatMilestoneDevisForm',
        'chatCheckoutOverlay', 'chatTrackingOverlay', 'chatSubmitProofOverlay',
        'chatProposeDateForm', 'chatLeaveReviewForm'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    setChatContextCoveredByOverlay(false);
}

function openChatChildSurface(id) {
    if (!id) return false;
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openChildSurface === 'function') {
        return window.LYANN_MESSAGING.openChildSurface(id);
    }
    const el = document.getElementById(id);
    if (!el) return false;
    el.style.display = 'flex';
    setChatContextCoveredByOverlay(true);
    return true;
}

function setChatContextCoveredByOverlay(isCovered) {
    const mainArea = document.querySelector('.chat-main-area');
    if (!mainArea) return;
    mainArea.classList.toggle('chat-child-surface-active', !!isCovered);
}

// Chat child-surface state is owned by messaging-ui.js / LYANN_MESSAGING.
// Legacy MutationObserver synchronization has been retired.

async function getChatMessages(contactId, options = {}) {
    const userId = getMyId();
    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_MESSAGING_REPOSITORY) return [];
    try {
        return await window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, options);
    } catch (error) {
        console.warn('[MESSAGING] canonical message query failed', error);
        return [];
    }
}

const CHAT_NEAR_BOTTOM_PX = 140;
const inflightOptimistic = [];
const parkedLiveRows = new Map();
const outgoingSends = new Map();
let optimisticClientSeq = 0;

function createOptimisticClientId() {
    optimisticClientSeq += 1;
    return 'optimistic_' + Date.now().toString(36) + '_' + optimisticClientSeq.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function chatMessageSelector(id) {
    const value = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return '[data-message-id="' + value + '"]';
}

function escapeChatHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function threadIsNearBottom(container) {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= CHAT_NEAR_BOTTOM_PX;
}

function scrollThreadToBottom(container, smooth) {
    if (!container) return;
    const top = container.scrollHeight;
    if (smooth && typeof container.scrollTo === 'function') container.scrollTo({ top: top, behavior: 'smooth' });
    else container.scrollTop = top;
}

function chatTimeLabel(value) {
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return typeof value === 'string' ? value : '';
}

function setOptimisticState(node, state) {
    if (!node) return;
    const status = node.querySelector('[data-optimistic-status]');
    if (!status) return;
    status.dataset.optimisticStatus = state;
    const time = status.dataset.timeLabel || '';
    if (state === 'sending') {
        status.textContent = time ? time + ' · Envoi…' : 'Envoi…';
        node.classList.remove('chat-message-send-failed');
        return;
    }
    if (state === 'failed' || state === 'offline') {
        const label = state === 'offline' ? 'Hors connexion' : 'Échec de l\'envoi';
        status.textContent = time ? time + ' · ' + label : label;
        node.classList.add('chat-message-send-failed');
        ensureRetryControl(node);
        return;
    }
    status.textContent = time;
    node.classList.remove('chat-message-send-failed');
    node.querySelector('[data-chat-retry]')?.remove();
    let marker = node.querySelector('.chat-msg-status');
    if (!marker) {
        marker = document.createElement('span');
        status.after(marker);
    }
    marker.className = 'chat-msg-status sent';
    marker.title = 'Envoyé';
    marker.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ph ph-check';
    marker.append(icon, document.createTextNode(' Envoyé'));
}

function ensureRetryControl(node) {
    if (!node || node.querySelector('[data-chat-retry]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-msg-retry';
    button.dataset.chatRetry = '1';
    button.textContent = 'Réessayer';
    button.addEventListener('click', () => retryOutgoing(node.dataset.optimisticMessageId || ''));
    const bubble = node.querySelector('.chat-msg-bubble') || node;
    bubble.appendChild(button);
}

function markOwnBubbleRead(messageId) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !messageId) return false;
    const node = container.querySelector(chatMessageSelector(messageId));
    if (!node || !node.classList.contains('sent')) return false;
    let marker = node.querySelector('.chat-msg-status');
    if (marker && marker.classList.contains('read')) return true;
    if (!marker) {
        const time = node.querySelector('.chat-msg-time');
        marker = document.createElement('span');
        if (time) time.appendChild(marker);
        else node.appendChild(marker);
    }
    marker.className = 'chat-msg-status read';
    marker.title = 'Vu';
    marker.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ph ph-checks';
    marker.append(icon, document.createTextNode(' Vu'));
    return true;
}

function pendingOptimisticFor(contactId) {
    const key = String(contactId || '');
    return inflightOptimistic.filter((item) => {
        return item.contactId === key && item.node && item.node.isConnected && !item.node.dataset.messageId;
    });
}

function trackOptimistic(contactId, node, text, clientId) {
    inflightOptimistic.push({
        clientId: String(clientId || ''),
        contactId: String(contactId || ''),
        node: node,
        text: String(text || '')
    });
}

function forgetOptimistic(node) {
    const index = inflightOptimistic.findIndex((item) => item.node === node);
    if (index >= 0) inflightOptimistic.splice(index, 1);
}

function claimUniqueOptimistic(contactId, text) {
    const key = String(contactId || '');
    const value = String(text || '');
    const matches = pendingOptimisticFor(key).filter((item) => item.text === value);
    return matches.length === 1 ? matches[0].node : null;
}

function exceptionalParkedId(item) {
    if (!item) return '';
    const pending = pendingOptimisticFor(item.contactId).filter((entry) => entry.text === item.text);
    if (pending.length !== 1) return '';
    const ids = [];
    parkedLiveRows.forEach((row) => {
        const text = typeof row.content === 'string' ? row.content : '';
        if (text === item.text && row.id) ids.push(String(row.id));
    });
    return ids.length === 1 ? ids[0] : '';
}

function bindOptimisticSend(clientId, serverId) {
    const item = inflightOptimistic.find((entry) => entry.clientId === String(clientId || ''));
    if (!item) return;
    settleOptimisticNode(item.node, serverId ? String(serverId) : exceptionalParkedId(item));
}

function flushParkedLiveRows() {
    if (!currentChatContact || pendingOptimisticFor(currentChatContact.id).length) return;
    const openId = currentChatContact.conversationId || '';
    const ready = [];
    parkedLiveRows.forEach((row, id) => {
        if (openId && row.conversation_id && row.conversation_id !== openId) return;
        if (row.sender_id && getMyId() && row.sender_id !== getMyId()) return;
        ready.push(row);
        parkedLiveRows.delete(id);
    });
    ready.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const container = document.getElementById('chatMessagesContainer');
    const stick = threadIsNearBottom(container);
    ready.forEach((row) => {
        const messageId = row.id ? String(row.id) : '';
        if (messageId && container && container.querySelector(chatMessageSelector(messageId))) return;
        appendLiveChatMessage(row, { stickToBottom: stick, quiet: true });
    });
}

function settleOptimisticNode(node, serverId) {
    if (!node) return;
    forgetOptimistic(node);
    const id = serverId ? String(serverId) : '';
    const parked = id ? parkedLiveRows.get(id) : null;
    if (id) parkedLiveRows.delete(id);
    if (node.isConnected && id) {
        const container = node.parentElement;
        const duplicate = container ? container.querySelector(chatMessageSelector(id)) : null;
        if (duplicate && duplicate !== node) duplicate.remove();
        node.dataset.messageId = id;
    }
    if (node.isConnected) setOptimisticState(node, 'sent');
    if (parked && parked.is_read && id) markOwnBubbleRead(id);
    flushParkedLiveRows();
}

function inboxPreviewText(content) {
    const raw = typeof content === 'string' ? content.trim() : '';
    if (!raw || raw.charAt(0) === '{') return 'Nouveau message';
    return raw.replace(/\s+/g, ' ').slice(0, 140);
}

function publishChatActivity(detail) {
    window.dispatchEvent(new CustomEvent('lyann:chat-activity', { detail: detail || {} }));
}

function buildChatActionBar(msgId, isMe, authorName, text) {
    const bar = document.createElement('div');
    bar.className = 'chat-msg-action-bar';
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'chat-msg-act-btn';
    reply.title = 'Répondre';
    reply.innerHTML = '<i class="ph ph-arrow-u-up-left"></i>';
    reply.addEventListener('click', () => window.quoteMessage(msgId, authorName, text));
    bar.appendChild(reply);
    if (isMe) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chat-msg-act-btn danger';
        remove.title = 'Supprimer ce message';
        remove.innerHTML = '<i class="ph ph-trash"></i>';
        remove.addEventListener('click', () => window.deleteMessage(msgId));
        bar.appendChild(remove);
    }
    return bar;
}

function renderOptimisticChatMessage(msgObj) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !msgObj || msgObj.type !== 'text' || !currentChatContact) return null;

    const empty = container.querySelector('.chat-empty-state');
    if (empty) empty.remove();

    if (!container.querySelector('.chat-date-separator')) {
        const dateSep = document.createElement('div');
        dateSep.className = 'chat-date-separator';
        const span = document.createElement('span');
        span.textContent = "Aujourd'hui";
        dateSep.appendChild(span);
        container.appendChild(dateSep);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-bubble-wrap sent';
    wrapper.dataset.optimisticMessageId = msgObj.id || '';

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble sent';

    const textNode = document.createElement('div');
    textNode.className = 'chat-msg-text';
    textNode.textContent = msgObj.text || '';
    bubble.appendChild(textNode);

    const meta = document.createElement('div');
    meta.className = 'chat-msg-time';
    const time = chatTimeLabel(msgObj.timestamp);
    meta.dataset.timeLabel = time;
    meta.dataset.optimisticStatus = 'sending';
    meta.textContent = time ? time + ' · Envoi…' : 'Envoi…';
    bubble.appendChild(meta);

    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    trackOptimistic(currentChatContact.id, wrapper, msgObj.text || '', msgObj.id || '');
    scrollThreadToBottom(container, false);
    return wrapper;
}

function renderOptimisticVisitCard(msgObj) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !msgObj || !currentChatContact) return null;
    container.querySelector('.chat-empty-state')?.remove();
    const node = renderTimelineCard({
        text: msgObj.text || '',
        sender: 'me',
        messageType: 'visit_proposed',
        type: 'visit_proposed',
        metadata: msgObj.metadata || {},
        createdAt: new Date().toISOString()
    });
    if (!node) return null;
    node.dataset.optimisticMessageId = msgObj.id || '';
    const status = document.createElement('div');
    status.className = 'chat-timeline-time';
    status.dataset.optimisticStatus = 'sending';
    const time = chatTimeLabel(msgObj.timestamp);
    status.dataset.timeLabel = time;
    status.textContent = time ? time + ' · Envoi…' : 'Envoi…';
    node.appendChild(status);
    container.appendChild(node);
    trackOptimistic(currentChatContact.id, node, msgObj.text || '', msgObj.id || '');
    scrollThreadToBottom(container, false);
    return node;
}

async function addMessageToContact(contactId, msgObj) {
    const userId = getMyId();
    const normalizedMsg = {
        ...msgObj,
        id: msgObj && msgObj.id ? msgObj.id : createOptimisticClientId(),
        sender: (msgObj && msgObj.sender) || 'me',
        timestamp: (msgObj && msgObj.timestamp) || Date.now()
    };

    const optimisticNode = normalizedMsg.messageType === 'visit_proposed'
        ? renderOptimisticVisitCard(normalizedMsg)
        : (normalizedMsg.type === 'text' ? renderOptimisticChatMessage(normalizedMsg) : null);
    if (optimisticNode) console.log('[CHAT] optimistic message');

    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_API_CLIENT?.supabase) {
        forgetOptimistic(optimisticNode);
        setOptimisticState(optimisticNode, 'failed');
        flushParkedLiveRows();
        return;
    }

    await deliverTextMessage(contactId, normalizedMsg, optimisticNode);
}
window.addMessageToContact = addMessageToContact;

async function deliverTextMessage(contactId, normalizedMsg, optimisticNode) {
    const userId = getMyId();
    outgoingSends.set(normalizedMsg.id, {
        kind: 'text',
        contactId,
        clientId: normalizedMsg.id,
        text: normalizedMsg.text || '',
        node: optimisticNode
    });
    if (chatIsOffline()) {
        forgetOptimistic(optimisticNode);
        setOptimisticState(optimisticNode, 'offline');
        flushParkedLiveRows();
        return;
    }
    if (optimisticNode && !optimisticNode.dataset.messageId) {
        forgetOptimistic(optimisticNode);
        trackOptimistic(contactId, optimisticNode, normalizedMsg.text || '', normalizedMsg.id);
    }
    try {
        const { data: convRes } = await window.LYANN_API_CLIENT.getOrCreateConversation(userId, contactId);
        if (!convRes || !convRes.id) throw new Error("Impossible d'initialiser la conversation.");
        const sharedConvId = convRes.id;
        const contentToSave = normalizedMsg.type === 'transactional' ? JSON.stringify(normalizedMsg.txData) : normalizedMsg.text;
        const { data: sentRow, error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, userId, contentToSave, {
            clientMessageId: normalizedMsg.id,
            messageType: normalizedMsg.messageType || null,
            entityType: normalizedMsg.entityType || null,
            entityId: normalizedMsg.entityId || null,
            metadata: normalizedMsg.metadata || null
        });
        if (sendErr) throw sendErr;
        if (window.LYANN_MESSAGING_REPOSITORY) {
            window.LYANN_MESSAGING_REPOSITORY.invalidateConversation(userId, contactId, sharedConvId);
        }
        if (currentChatContact && currentChatContact.id === contactId) currentChatContact.conversationId = sharedConvId;
        console.log('[CHAT] insert confirmed');
        bindOptimisticSend(normalizedMsg.id, sentRow?.id);
        if (optimisticNode && sentRow?.created_at) optimisticNode.dataset.createdAt = sentRow.created_at;
        if (optimisticNode) console.log('[CHAT] reconciled');
        outgoingSends.delete(normalizedMsg.id);
        const noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, sharedConvId, contentToSave, sentRow?.created_at, { unread: false, message_type: normalizedMsg.messageType || null });
        publishChatActivity({
            contactId: noted?.contactId || contactId,
            preview: noted?.preview || inboxPreviewText(contentToSave),
            conversationId: sharedConvId,
            lastMessageAt: sentRow?.created_at || null,
            unread: false,
            name: noted?.name || currentChatContact?.name || '',
            avatar: noted?.avatar || ''
        });
    } catch (e) {
        console.warn('Supabase message send failed:', e?.message || e);
        forgetOptimistic(optimisticNode);
        setOptimisticState(optimisticNode, 'failed');
        flushParkedLiveRows();
    }
}

window.openPhotoLightbox = function (url) {
    const modal = document.getElementById('chatPhotoViewerModal');
    const img = document.getElementById('chatPhotoViewerImg');
    if (modal && img) {
        img.src = url;
        modal.style.display = 'flex';
    }
};

window.__LYANN_CHAT_CORE_OPEN = async function (name, avatar, contactId = name, initialNeed = null) {
    const isUUID = (str) => typeof window.isUUID === 'function' ? window.isUUID(str) : (typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));
    if (window.LYANN_API_CLIENT?.getSupportUserId) {
        try { await window.LYANN_API_CLIENT.getSupportUserId(); } catch (_) {}
    }
    
    const openingDirect = Boolean(initialNeed && initialNeed.direct && !initialNeed.requestId);
    // Safety gate: If contactId is a request UUID, resolve the true requester_id first
    if (!openingDirect && contactId && isUUID(contactId) && window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
        try {
            const { data: reqData } = await window.LYANN_API_CLIENT.supabase
                .from('requests')
                .select('id, requester_id, title')
                .eq('id', contactId)
                .maybeSingle();
            if (reqData && reqData.requester_id) {
                if (!initialNeed) initialNeed = { requestId: reqData.id, requesterId: reqData.requester_id, title: reqData.title };
                contactId = reqData.requester_id;
            }
        } catch(e) {}
    }

    const myId = getMyId();
    if (contactId && myId && contactId === myId && contactId !== "me") {
        if (window.showToast) window.showToast("⚠️ Vous ne pouvez pas démarrer une mise en relation avec vous-même.", "warning");
        else if (window.lyannAlert) window.lyannAlert("⚠️ Vous ne pouvez pas démarrer une mise en relation avec vous-même.");
        return false;
    }

    const modal = document.getElementById('chatModal');
    if (!modal) {
        console.error('[MESSAGING] chat shell unavailable');
        return false;
    }

let displayName = name;
    let displayAvatar = avatar;

    // Hydrate header immediately, but do not reveal the shell. The canonical
    // messaging controller owns when the fully prepared surface becomes visible.
    const initialHeaderName = document.getElementById('chatHeaderName');
    const initialHeaderAvatar = document.getElementById('chatHeaderAvatar');
    if (initialHeaderName) initialHeaderName.textContent = displayName || 'Membre LYANN';
    if (initialHeaderAvatar && displayAvatar) initialHeaderAvatar.src = displayAvatar;

    if (isLyannSupportContact(contactId)) {
        displayName = 'Support LYANN';
        initialNeed = null;
    }

    currentChatContact = { id: contactId, name: displayName, avatar: displayAvatar };
    if (isLyannSupportContact(contactId)) {
        currentChatContact.requestId = null;
        hideChatMissionChrome();
    }
    document.querySelectorAll('.chat-modal-layout').forEach(l => {
        l.classList.add('mobile-conversation-active', 'has-active-conversation');
    });
    const warmedMessages = window.LYANN_MESSAGING_REPOSITORY?.peekMessages?.(getMyId(), contactId);
    if (Array.isArray(warmedMessages)) {
        renderMessages(warmedMessages);
    } else {
        const container = document.getElementById('chatMessagesContainer');
        if (container && !container.querySelector('.chat-msg-bubble')) {
            container.innerHTML = '<div class="chat-date-separator"><span>Chargement…</span></div>';
        }
    }

    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getUserProfile === 'function' && contactId && isUUID(contactId) && !isLyannSupportContact(contactId)) {
        try {
            const prof = await window.LYANN_API_CLIENT.getUserProfile(contactId);
            if (prof) {
                displayName = window.formatPublicName ? window.formatPublicName(prof, null, 'Contact') : (prof.first_name || 'Contact');
                displayAvatar = window.getLyannAvatarUrl(prof.avatar_url);
            }
        } catch(e) {}
    }

    if ((!displayName || displayName === "Lyanneur" || isUUID(displayName)) && isUUID(contactId)) {
        displayName = "Membre LYANN";
    }

    currentChatContact = { id: contactId, name: displayName, avatar: displayAvatar };
    if (openingDirect) {
        currentChatContact.direct = true;
        currentChatContact.requestId = null;
        try {
            const opened = await window.LYANN_API_CLIENT?.openDirectConversation?.(contactId);
            currentChatContact.startedBy = opened?.started_by || getMyId();
            if (opened?.conversation_id) currentChatContact.conversationId = opened.conversation_id;
        } catch (err) {
            currentChatContact.startedBy = getMyId();
        }
        hideChatMissionChrome();
    }
    if (isLyannSupportContact(contactId)) {
        currentChatContact.requestId = null;
        hideChatMissionChrome();
    }
    window.LYANN_ACTIVE_CHAT_CONTACT = { ...currentChatContact };
    
    try {
        localStorage.setItem('lyann_last_active_contact', JSON.stringify({ id: contactId, name: displayName, avatar: displayAvatar }));
    } catch(e) {}

    // Link conversation to request in DB safely via initiateLyannHelp (Step 17.4 Security Gate)
    if (!isLyannSupportContact(contactId) && initialNeed && initialNeed.requestId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.initiateLyannHelp === 'function') {
        try {
            const helpRes = await window.LYANN_API_CLIENT.initiateLyannHelp(initialNeed.requestId);
            if (helpRes && helpRes.error) {
                console.warn('[INITIATE HELP REJECTED]', helpRes.error.message || helpRes.error);
                if (typeof window.showToast === 'function') {
                    window.showToast(helpRes.error.message || 'Action non autorisée sur ce Lyann', 'error');
                }
            } else if (helpRes && helpRes.data && helpRes.data.conversation_id) {
                currentChatContact.conversationId = helpRes.data.conversation_id;
                currentChatContact.requestId = initialNeed.requestId;
            }
        } catch (e) {
            console.warn('[OPEN CHAT INITIATE HELP ERR]', e);
        }
    }

    const headerName = document.getElementById('chatHeaderName');
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerName) headerName.textContent = displayName;
    if (headerAvatar) headerAvatar.src = displayAvatar;

    document.querySelectorAll('.chat-contact-item').forEach(item => {
        const cid = item.getAttribute('data-chat-member-id');
        if (cid === contactId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    document.querySelectorAll('.chat-modal-layout').forEach(l => {
        l.classList.add('mobile-conversation-active');
    });
    document.querySelectorAll('.chat-main-area, .chat-main-pane').forEach(m => {
        m.style.removeProperty('display');
    });

    window.dispatchEvent(new CustomEvent('lyann_chat_opened', { detail: { contactId } }));

    if (typeof window.renderChatContacts === 'function') {
        window.renderChatContacts();
    }

    if (typeof initChatCloseBtn === 'function') {
        initChatCloseBtn();
    }

    await refreshChatUI();
};

let chatRefreshInFlight = false;
window.refreshChatUI = async function () {
    if (!currentChatContact || chatRefreshInFlight) return;
    chatRefreshInFlight = true;
    try {

    if (typeof window.updateChatFavHeaderUI === 'function') {
        window.updateChatFavHeaderUI();
    }

    if (!window.LYANN_SUPPORT_USER_ID && window.LYANN_API_CLIENT?.getSupportUserId) {
        try { await window.LYANN_API_CLIENT.getSupportUserId(); } catch (_) {}
    }
    const supportThread = isLyannSupportContact(currentChatContact.id);
    if (supportThread) {
        currentChatContact.requestId = null;
        currentChatContact.requestData = null;
        hideChatMissionChrome();
    }

    const myUserId = getMyId();
    let sharedConvId = currentChatContact.conversationId;
    if (supportThread && window.LYANN_API_CLIENT?.openSupportConversation) {
        try {
            const opened = await window.LYANN_API_CLIENT.openSupportConversation();
            if (opened?.data?.id) {
                sharedConvId = opened.data.id;
                currentChatContact.conversationId = sharedConvId;
            }
        } catch (_) {}
    } else if (!sharedConvId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getOrCreateConversation === 'function' && currentChatContact.id && currentChatContact.id !== 'me') {
        try {
            const convRes = await window.LYANN_API_CLIENT.getOrCreateConversation(myUserId, currentChatContact.id);
            if (convRes && convRes.data && convRes.data.id) {
                sharedConvId = convRes.data.id;
                currentChatContact.conversationId = sharedConvId;
            }
        } catch(e) {}
    }

    const messagesPromise = renderMessages(null, { fresh: true });

    // Context and mission are independent. Load them together so the banner
    // does not wait for a second round trip after the messages are visible.
    let requestContext = null;
    let mission = null;
    const reqHint = (currentChatContact && currentChatContact.requestId) ? currentChatContact.requestId : null;
    if (!supportThread && window.LYANN_API_CLIENT) {
        const contextPromise = typeof window.LYANN_API_CLIENT.getConversationRequestContext === 'function'
            ? window.LYANN_API_CLIENT.getConversationRequestContext(sharedConvId, reqHint)
            : null;
        const missionPromise = typeof window.LYANN_API_CLIENT.getActiveMissionBetween === 'function'
            ? window.LYANN_API_CLIENT.getActiveMissionBetween(myUserId, currentChatContact.id)
            : null;
        [requestContext, mission] = await Promise.all([contextPromise, missionPromise]);
    }

    if (requestContext && requestContext.startedBy) currentChatContact.startedBy = requestContext.startedBy;
    if (requestContext && requestContext.direct && !requestContext.request) {
        currentChatContact.direct = true;
        currentChatContact.requestId = null;
        requestContext = null;
    }
    const privateRequest = Boolean(requestContext && requestContext.request && (requestContext.request.visibility === 'DIRECT' || requestContext.request.target_user_id));
    if (currentChatContact?.direct && requestContext?.request && !privateRequest) {
        requestContext = null;
    }

    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    const bannerTitle = document.getElementById('chatBannerTitle');
    const bannerMeta = document.getElementById('chatBannerMeta');
    const dropViewMission = document.getElementById('chatDropViewMission');

    if (!supportThread && privateRequest && banner) {
        currentChatContact.requestId = requestContext.requestId;
        currentChatContact.direct = true;
        const title = escapeSearchHtml(requestContext.request.title);
        const mine = String(requestContext.requesterId || requestContext.request.requester_id) === String(myUserId);
        banner.style.display = 'flex';
        banner.className = 'chat-mission-context-card';
        banner.innerHTML = `
            <div class="chat-context-card-info">
                <span class="chat-context-card-tag" style="font-weight: 800; font-size: 0.72rem; color: var(--primary, #4A7C59); text-transform: uppercase;">Demande privée</span>
                <div class="chat-context-card-title" style="font-size: 0.88rem; font-weight: 800; color: var(--text, #1E2822); margin-top: 2px;">${title}</div>
                <p style="margin: 4px 0 0; font-size: 0.78rem; color: var(--text-muted, #5C6E62);">${mine ? 'Envoyée uniquement à cette personne.' : 'Cette demande ne figure pas dans Explorer.'}</p>
            </div>
            ${mine ? '' : `<div class="chat-context-card-actions" style="display: flex; margin-top: 6px;"><button type="button" class="btn-chat-ctx primary" id="btnDirectOffer" style="flex: 1; justify-content: center; min-height: 36px; border-radius: 18px;">Faire une offre</button></div>`}
        `;
        const offerBtn = document.getElementById('btnDirectOffer');
        if (offerBtn) offerBtn.onclick = (e) => { e.stopPropagation(); handleChatAction('DIRECT_OFFER'); };
        if (dropViewMission) dropViewMission.style.display = 'none';
        const viewMissionBtn = document.getElementById('chatViewMissionBtn');
        if (viewMissionBtn) viewMissionBtn.style.display = 'none';
    } else if (!supportThread && requestContext && requestContext.request) {
        currentChatContact.requestId = requestContext.requestId;
        currentChatContact.requestData = requestContext.request;

        if (banner) {
            banner.style.display = 'flex';
            banner.setAttribute('data-request-context', requestContext.requestId);
            banner.className = 'chat-mission-context-card';

            const title = escapeSearchHtml(requestContext.request.title);
            const location = escapeSearchHtml(requestContext.request.location || 'Guadeloupe');

            banner.innerHTML = `
                <div class="chat-context-card-info">
                    <div class="chat-context-card-header-row" style="display: flex; align-items: center; justify-content: space-between;">
                        <span class="chat-context-card-tag" style="font-weight: 800; font-size: 0.72rem; color: var(--primary, #4A7C59); text-transform: uppercase;">À PROPOS DE CE LYANN</span>
                        <button type="button" class="chat-context-view-link" id="btnViewLyannFromChat" data-request-id="${requestContext.requestId}" style="background: none; border: none; font-size: 0.78rem; font-weight: 700; color: var(--primary, #4A7C59); cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 0;">Voir <i class="ph ph-arrow-right"></i></button>
                    </div>
                    <div class="chat-context-card-title" style="font-size: 0.88rem; font-weight: 800; color: var(--text, #1E2822); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title} · <span style="font-weight: 600; color: var(--text-muted, #5C6E62);">${location}</span></div>
                </div>
                <div class="chat-context-card-actions" style="display: flex; gap: 6px; margin-top: 6px;">
                    <button type="button" class="btn-chat-ctx primary" id="btnCtxPropose" style="flex: 1; justify-content: center; min-height: 36px; padding: 4px 10px; font-size: 0.78rem; border-radius: 18px;"><i class="ph ph-tag"></i> Faire une proposition</button>
                    <button type="button" class="btn-chat-ctx secondary" id="btnCtxDate" style="flex: 1; justify-content: center; min-height: 36px; padding: 4px 10px; font-size: 0.78rem; border-radius: 18px;"><i class="ph ph-calendar"></i> Proposer une date</button>
                </div>
            `;

            const btnView = document.getElementById('btnViewLyannFromChat');
            if (btnView) {
                btnView.onclick = (e) => {
                    e.stopPropagation();
                    if (window.LYANN_ROUTER) window.LYANN_ROUTER.go('mission', { requestId: requestContext.requestId });
                    else if (window.LYANN_MESSAGING) window.LYANN_MESSAGING.openMissionFromChat(e, btnView);
                };
            }
            const btnPropose = document.getElementById('btnCtxPropose');
            if (btnPropose) {
                btnPropose.onclick = (e) => {
                    e.stopPropagation();
                    handleChatAction('MAKE_PROPOSAL', mission);
                };
            }
            const btnDate = document.getElementById('btnCtxDate');
            if (btnDate) {
                btnDate.onclick = (e) => {
                    e.stopPropagation();
                    handleChatAction('PROPOSE_DATE', mission);
                };
            }
        }
        if (dropViewMission) {
            dropViewMission.style.display = 'flex';
            dropViewMission.dataset.requestId = requestContext.requestId;
        }
        const viewMissionBtn = document.getElementById('chatViewMissionBtn');
        if (viewMissionBtn) {
            viewMissionBtn.style.display = 'flex';
            viewMissionBtn.dataset.requestId = requestContext.requestId;
        }
        window.__lyannChatRequestId = requestContext.requestId;
    } else if (mission && !currentChatContact.direct) {
        if (banner) {
            banner.style.display = 'flex';
            banner.className = 'chat-mission-context-card';
            banner.innerHTML = `
                <div class="chat-context-card-info">
                    <div class="chat-context-card-header-row" style="display: flex; align-items: center; justify-content: space-between;">
                        <span class="chat-context-card-tag" style="font-weight: 800; font-size: 0.72rem; color: #E5B345; text-transform: uppercase;">MISSION ACTIVE</span>
                        <span style="font-size: 0.78rem; font-weight: 700; color: var(--primary-dark, #1F3827);">${mission.agreed_price} €</span>
                    </div>
                    <div class="chat-context-card-title" style="font-size: 0.88rem; font-weight: 800; color: var(--text, #1E2822); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeSearchHtml(mission.title)}</div>
                </div>
                <div class="chat-context-card-actions" style="display: flex; gap: 6px; margin-top: 6px;">
                    <button type="button" class="btn-chat-ctx primary" id="btnCtxViewMissionDetails" style="flex: 1; justify-content: center; min-height: 36px; padding: 4px 10px; font-size: 0.8rem; font-weight: 800; border-radius: 18px;"><i class="ph ph-wrench"></i> Suivi du chantier <i class="ph ph-arrow-right"></i></button>
                </div>
            `;
            const btnTracking = document.getElementById('btnCtxViewMissionDetails');
            if (btnTracking) {
                btnTracking.onclick = (e) => {
                    e.stopPropagation();
                    const chatTrackingOverlay = document.getElementById('chatTrackingOverlay');
                    if (chatTrackingOverlay && (mission.status === 'IN_PROGRESS' || mission.status === 'WORK_MARKED_COMPLETE' || mission.status === 'COMPLETED')) {
                        closeAllOverlays();
                        chatTrackingOverlay.style.display = 'flex';
                    } else if (window.lyannAlert) {
                        window.lyannAlert(`Mission "${mission.title}" (${mission.agreed_price}€) — Statut : ${mission.status}`);
                    }
                };
            }
        }
        if (dropViewMission) dropViewMission.style.display = 'flex';
    } else {
        hideChatMissionChrome();
        if (!supportThread && currentChatContact?.direct) renderDirectThreadAction(banner);
    }

    // Hide floating separate actions toolbar completely (actions are integrated into the Context Card)
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) {
        actionContainer.style.display = 'none';
    }

    await messagesPromise;
    } finally {
        chatRefreshInFlight = false;
    }
}

const quoteActionLocks = new Set();

window.handleAcceptQuote = async function(quoteId) {
    if (!quoteId || quoteActionLocks.has(quoteId)) return;
    quoteActionLocks.add(quoteId);
    disableCardButtons(quoteId);
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { quoteId, contactId: currentChatContact?.id })) {
        quoteActionLocks.delete(quoteId);
        return;
    }
    try {
        if (window.lyannConfirm) {
            const ok = await window.lyannConfirm("Confirmez-vous l'acceptation de ce devis ? Une mission sera créée.");
            if (!ok) {
                quoteActionLocks.delete(quoteId);
                const box = document.getElementById('chatMessagesContainer');
                box?.querySelectorAll(quoteTimelineSelector(quoteId) + ' button, [data-live-quote-id="' + CSS.escape(String(quoteId)) + '"] button').forEach((button) => { button.disabled = false; });
                return;
            }
        }
        const res = await window.LYANN_API_CLIENT.acceptRequestQuote(quoteId);
        console.log("⚡ Devis accepté avec succès via RPC Supabase:", res);
        const known = timelineQuotes.get(String(quoteId)) || { id: quoteId };
        known.status = 'ACCEPTED';
        timelineQuotes.set(String(quoteId), known);
        applyQuoteStatusToDom(quoteId, 'ACCEPTED');
        await refreshOpenBusinessCards();
        if (window.lyannAlert) window.lyannAlert("Devis accepté. La mission a été créée.");
    } catch(err) {
        console.error("Erreur lors de l'acceptation du devis:", err);
        const box = document.getElementById('chatMessagesContainer');
        box?.querySelectorAll(quoteTimelineSelector(quoteId) + ' button, [data-live-quote-id="' + CSS.escape(String(quoteId)) + '"] button').forEach((button) => { button.disabled = false; });
        quoteActionLocks.delete(quoteId);
        chatToast('Le devis n’a pas pu être accepté. Réessayez.');
    }
};

window.handleRejectQuote = async function(quoteId) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { quoteId, contactId: currentChatContact?.id })) return;
    if (!quoteId) return;
    try {
        if (window.lyannConfirm) {
            const ok = await window.lyannConfirm("Êtes-vous sûr de vouloir refuser ce devis ?");
            if (!ok) return;
        }
        disableCardButtons(quoteId);
        const res = await window.LYANN_API_CLIENT.rejectRequestQuote(quoteId);
        console.log("⚡ Devis refusé via RPC Supabase:", res);
        const known = timelineQuotes.get(String(quoteId)) || { id: quoteId };
        known.status = 'REJECTED';
        timelineQuotes.set(String(quoteId), known);
        applyQuoteStatusToDom(quoteId, 'REJECTED');
        await refreshOpenBusinessCards();
        if (window.lyannAlert) window.lyannAlert("Devis refusé.");
    } catch(err) {
        console.error("Erreur lors du refus du devis:", err);
        const box = document.getElementById('chatMessagesContainer');
        box?.querySelectorAll(quoteTimelineSelector(quoteId) + ' button, [data-live-quote-id="' + CSS.escape(String(quoteId)) + '"] button').forEach((button) => { button.disabled = false; });
        chatToast('Le devis n’a pas pu être refusé. Réessayez.');
    }
};

function notifyQuoteUnavailable(err) {
    const msg = (err && err.message) ? String(err.message) : 'Proposition indisponible.';
    if (window.showToast) window.showToast(msg, 'error');
    else if (window.lyannAlert) window.lyannAlert(msg);
    else alert(msg);
}

async function createProductionQuoteForContact(contactId, description, amount, milestones) {
    if (!window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.createRequestQuote !== 'function') {
        throw new Error('Proposition indisponible : le contrat de devis n’est pas disponible.');
    }
    const myId = typeof getMyId === 'function' ? getMyId() : null;
    if (!myId || !contactId) {
        throw new Error('Proposition indisponible : aucun interlocuteur identifié.');
    }
    if (typeof window.LYANN_API_CLIENT.getActiveInvitationBetween !== 'function') {
        throw new Error('Proposition indisponible : un devis ne peut être créé que dans un échange lié à une invitation acceptée.');
    }
    const activeInv = currentChatContact?.direct && typeof window.LYANN_API_CLIENT.prepareDirectOffer === 'function'
        ? await window.LYANN_API_CLIENT.prepareDirectOffer(contactId).then((prepared) => prepared?.invitation_id ? { id: prepared.invitation_id } : null).catch((err) => { throw err; })
        : await window.LYANN_API_CLIENT.getActiveInvitationBetween(myId, contactId);
    if (!activeInv || !activeInv.id) {
        throw new Error('Proposition indisponible : un devis ne peut être créé que dans un échange lié à une invitation acceptée.');
    }
    const parsedAmount = Number(amount);
    const milestonePayload = milestones || [{
        title: description || 'Tarif proposé',
        description: description || 'Tarif convenu',
        amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
        percentage: 100
    }];
    const created = await window.LYANN_API_CLIENT.createRequestQuote(activeInv.id, description, null, milestonePayload);
    invalidateActiveQuoteContext();
    return created;
}

function invalidateActiveQuoteContext() {
    const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
    if (window.LYANN_MESSAGING_REPOSITORY && contact && contact.id && typeof getMyId === 'function') {
        window.LYANN_MESSAGING_REPOSITORY.invalidateQuoteContext(getMyId(), contact.id);
    }
}

window.lyannAwaitPaidQuote = async function lyannAwaitPaidQuote() {
    await refreshOpenBusinessCards();
};

function isPersistedUuid(id) {
    return typeof window.isUUID === 'function'
        ? window.isUUID(id)
        : (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

async function resolveChatMilestoneId(preferredId, statuses) {
    const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
    if (!window.LYANN_MESSAGING_REPOSITORY || !contact || !contact.id) return null;
    const quotes = await window.LYANN_MESSAGING_REPOSITORY.getQuoteContext(getMyId(), contact.id, { fresh: true });
    const milestones = (quotes || []).flatMap((quote) => (quote.milestones || []).map((milestone) => ({
        ...milestone,
        quoteId: quote.id,
        quoteStatus: quote.status
    })));
    const wanted = Array.isArray(statuses) && statuses.length ? statuses : null;
    const eligible = milestones.filter((milestone) => milestone && isPersistedUuid(milestone.id) && (!wanted || wanted.includes(milestone.status)));
    if (isPersistedUuid(preferredId)) {
        const explicit = eligible.find((milestone) => milestone.id === preferredId);
        return explicit ? explicit.id : null;
    }
    if (eligible.length === 1) return eligible[0].id;
    const accepted = eligible.filter((milestone) => milestone.quoteStatus === 'ACCEPTED');
    if (accepted.length === 1) return accepted[0].id;
    return null;
}
window.resolveChatMilestoneId = resolveChatMilestoneId;

function notifyActionUnavailable(err) {
    const msg = (err && err.message) ? String(err.message) : 'Action indisponible.';
    if (window.showToast) window.showToast(msg, 'error');
    else if (window.lyannAlert) window.lyannAlert(msg);
    else alert(msg);
}

async function handleChatAction(actionId, missionOrExtra = null, extraDataInput = null) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { actionId, contactId: currentChatContact?.id, requestId: currentChatContact?.requestId })) return;
    const extraData = (missionOrExtra && missionOrExtra.quoteId) ? missionOrExtra : (extraDataInput || {});
    const mission = (missionOrExtra && !missionOrExtra.quoteId) ? missionOrExtra : null;
    const contactId = currentChatContact ? currentChatContact.id : null;
    if (!contactId) return;
    const isMissionUuid = (id) => typeof window.isUUID === 'function'
        ? window.isUUID(id)
        : (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
        const refuseUnlinkedMission = (label) => {
        if (window.lyannAlert) {
            window.lyannAlert(`${label} indisponible : cette action n’est pas liée à un jalon enregistré.`);
        }
        return false;
    };

    if (actionId === 'DIRECT_ASK') {
        if (typeof window.openLyannWizard === 'function') {
            window.openLyannWizard({ directContactId: contactId, directContactName: currentChatContact?.name || 'cette personne' });
        }
        return;
    }
    if (actionId === 'DIRECT_OFFER') {
        return handleChatAction('MAKE_PROPOSAL', mission);
    }

    if (actionId === 'MAKE_PROPOSAL' || actionId === 'PROPOSE_PRICE') {
        closeAllOverlays();
        const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
        if (chatActionChoicesOverlay) {
            openChatChildSurface('chatActionChoicesOverlay');
            setChatContextCoveredByOverlay(true);
        } else {
            const amount = await window.lyannPrompt("Quel montant proposez-vous (en €) ?");
            if (!amount) return;
            const desc = await window.lyannPrompt("Description de votre proposition (ex: Réparation portail) :");
            if (!desc) return;

            try {
                await createProductionQuoteForContact(contactId, desc, parseFloat(amount));
            } catch (err) {
                notifyQuoteUnavailable(err);
                return;
            }
            if (typeof refreshChatUI === 'function') refreshOpenBusinessCards();
        }
    }
    else if (actionId === 'PROPOSE_DATE') {
        closeAllOverlays();
        const overlay = document.getElementById('chatProposeDateForm');
        if (overlay) {
            openChatChildSurface('chatProposeDateForm');
            setChatContextCoveredByOverlay(true);
            const firstRequired = overlay.querySelector('[required]');
            if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
        } else {
            const dateStr = await window.lyannPrompt("Proposer une date d'intervention (ex: Demain 14h, ou 25 Octobre) :");
            if (!dateStr) return;
            addMessageToContact(contactId, {
                type: 'text',
                sender: getMyId(),
                text: `📅 Proposition de rendez-vous : ${dateStr}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            refreshOpenBusinessCards();
        }
        return;
    }

    else if (actionId === 'REQUEST_HELP') {
        return handleChatAction('DIRECT_ASK', mission);
    }

    else if (actionId === 'DISCUSS_PRICE' || actionId === 'COUNTER_OFFER') {
        closeAllOverlays();
        const overlay = document.getElementById('chatDirectPriceForm');
        if (overlay) {
            openChatChildSurface(overlay.id);
            setChatContextCoveredByOverlay(true);
            const titleEl = overlay.querySelector('.mobile-form-title');
            if (titleEl) titleEl.textContent = "Discuter du prix";
        }
        return;
    }

    else if (actionId === 'ACCEPT_PROPOSAL' || actionId === 'ACCEPT_PRICE' || actionId === 'ACCEPT_QUOTE') {
        const quoteId = extraData.quoteId || (missionOrExtra && missionOrExtra.quoteId) || null;
        const proposalId = extraData.proposalId || (missionOrExtra && missionOrExtra.proposalId) || null;
        if (quoteId) {
            await window.handleAcceptQuote(quoteId);
            return;
        }
        if (proposalId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.acceptProposalSecure === 'function') {
            try {
                const res = await window.LYANN_API_CLIENT.acceptProposalSecure(proposalId);
                if (res && res.error) {
                    if (window.lyannAlert) window.lyannAlert(res.error.message || res.error);
                    return;
                }
                console.log("⚡ Proposition acceptée via RPC Supabase Production:", res);
                if (typeof window.showToast === 'function') window.showToast("Proposition acceptée ! La mission est activée.", "success");
                refreshOpenBusinessCards();
                return;
            } catch (err) {
                console.warn("Erreur acceptation Proposition Supabase:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'acceptation : " + (err.message || err));
                return;
            }
        }
        return refuseUnlinkedMission('Acceptation');
    }
    else if (actionId === 'REJECT_QUOTE') {
        if (window.LYANN_API_CLIENT && extraData && extraData.quoteId) {
            try {
                await window.LYANN_API_CLIENT.rejectRequestQuote(extraData.quoteId);
                console.log("⚡ Devis refusé via RPC Supabase Production");
            } catch (err) {
                console.warn("Erreur refus Devis Supabase:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors du refus du devis : " + (err.message || err));
                return;
            }
        }
        refreshOpenBusinessCards();
    }

    else if (actionId === 'PAY_MISSION') {
        if (!mission || !isMissionUuid(mission.id)) return refuseUnlinkedMission('Paiement');
        const coPrestationTitle = document.getElementById('coPrestationTitle');
        const coDevisAmount = document.getElementById('coDevisAmount');
        const coLyannFee = document.getElementById('coLyannFee');
        const coTotalAmount = document.getElementById('coTotalAmount');

        const agreedPrice = Number(mission.agreed_price);
        const title = mission.title || 'Intervention LYANN';
        if (!Number.isFinite(agreedPrice)) return refuseUnlinkedMission('Paiement');

        if (coPrestationTitle) coPrestationTitle.textContent = title;
        if (coDevisAmount) coDevisAmount.textContent = `${agreedPrice.toFixed(2)} €`;

        const fee = Math.round(agreedPrice * 0.03 * 100) / 100;
        if (coLyannFee) coLyannFee.textContent = `${fee.toFixed(2)} €`;
        if (coTotalAmount) coTotalAmount.textContent = `${(agreedPrice + fee).toFixed(2)} €`;

        closeAllOverlays();
        const chatCheckoutOverlay = document.getElementById('chatCheckoutOverlay');
        if (chatCheckoutOverlay) {
            const milestoneId = await resolveChatMilestoneId(
                extraData.milestoneId || (mission && mission.milestoneId),
                ['PENDING']
            );
            if (milestoneId) chatCheckoutOverlay.dataset.milestoneId = milestoneId;
            else delete chatCheckoutOverlay.dataset.milestoneId;
            openChatChildSurface('chatCheckoutOverlay');
            const ensureStripeCheckout = () => {
                if (window.LYANN_STRIPE && typeof window.LYANN_STRIPE.prepareCheckout === 'function') {
                    return Promise.resolve();
                }
                if (window.LYANN_FEATURES && typeof window.LYANN_FEATURES.ensure === 'function') {
                    return window.LYANN_FEATURES.ensure('stripeCheckout');
                }
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'lyann-stripe.js?v=20260922v';
                    script.addEventListener('load', resolve, { once: true });
                    script.addEventListener('error', () => reject(new Error('Stripe checkout unavailable')), { once: true });
                    document.head.appendChild(script);
                });
            };
            const prepareStripe = () => {
                if (!window.LYANN_STRIPE || typeof window.LYANN_STRIPE.prepareCheckout !== 'function') return;
                window.LYANN_STRIPE.prepareCheckout(milestoneId).then((prepared) => {
                    if (prepared && prepared.error) notifyActionUnavailable(prepared.error);
                }).catch((err) => {
                    notifyActionUnavailable({ message: err && err.message ? err.message : 'Paiement indisponible.' });
                });
            };
            ensureStripeCheckout().then(prepareStripe).catch((err) => {
                notifyActionUnavailable({ message: 'Paiement indisponible : Stripe.js n’a pas pu être chargé.' });
                console.warn(err);
            });
        } else if (window.lyannAlert) {
            window.lyannAlert('Paiement indisponible : le portail de paiement n’est pas disponible sur cet écran.');
        }
        return;
    }

    else if (actionId === 'MARK_DONE') {
        const milestoneId = await resolveChatMilestoneId(
            extraData.milestoneId || (mission && mission.milestoneId),
            ['FUNDED', 'IN_PROGRESS']
        );
        if (!milestoneId || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.submitMilestoneCompletion !== 'function') {
            return refuseUnlinkedMission('Clôture');
        }
        const result = await window.LYANN_API_CLIENT.submitMilestoneCompletion(milestoneId);
        if (result && result.error) {
            notifyActionUnavailable(result.error);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast((result && result.data && result.data.message) || 'Prestation déclarée réalisée, en attente de validation.', 'success');
        }
        invalidateActiveQuoteContext();
        refreshOpenBusinessCards();
        return;
    }

    else if (actionId === 'CONFIRM_DONE') {
        const milestoneId = await resolveChatMilestoneId(
            extraData.milestoneId || (mission && mission.milestoneId),
            ['COMPLETED']
        );
        if (!milestoneId || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.releaseMilestonePayment !== 'function') {
            return refuseUnlinkedMission('Validation');
        }
        try {
            const result = await window.LYANN_API_CLIENT.releaseMilestonePayment(milestoneId);
            if (typeof window.showToast === 'function') {
                window.showToast((result && result.message) || 'Validation enregistrée.', 'success');
            }
        } catch (err) {
            notifyActionUnavailable(err);
            return;
        }
        invalidateActiveQuoteContext();
        refreshOpenBusinessCards();
        return;
    }

    else if (actionId === 'LEAVE_REVIEW') {
        closeAllOverlays();
        const overlay = document.getElementById('chatLeaveReviewForm');
        if (overlay) {
            openChatChildSurface('chatLeaveReviewForm');
            setChatContextCoveredByOverlay(true);
        }
        return;
    }

    else if (actionId === 'RECOMMEND') {
        addMessageToContact(contactId, {
            type: 'text',
            sender: getMyId(),
            text: `⭐ Je recommande vivement ${currentChatContact ? currentChatContact.name : 'ce membre'} pour son professionnalisme sur LYANN !`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        if (window.lyannAlert) window.lyannAlert("Recommandation publiée dans la discussion !");
    }

    else if (actionId === 'REPORT_PROBLEM') {
        const reason = await window.lyannPrompt("Quel est le problème ?");
        if (!reason) return;
        const milestoneId = await resolveChatMilestoneId(
            extraData.milestoneId || (mission && mission.milestoneId),
            null
        );
        if (!milestoneId || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.raiseMilestoneDispute !== 'function') {
            return refuseUnlinkedMission('Signalement');
        }
        try {
            await window.LYANN_API_CLIENT.raiseMilestoneDispute(milestoneId, reason);
        } catch (err) {
            notifyActionUnavailable(err);
            return;
        }
        refreshOpenBusinessCards();
        return;
    }

    refreshOpenBusinessCards();
    window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId, contactId } }));
}

window.deleteMessage = async function(msgId) {
    if (!currentChatContact || !msgId) return;
    if (!isPersistedUuid(msgId) || !window.LYANN_API_CLIENT?.supabase) {
        notifyActionUnavailable({ message: 'Suppression indisponible : ce message n’est pas enregistré côté serveur.' });
        return;
    }
    const { error } = await window.LYANN_API_CLIENT.supabase.from('messages').delete().eq('id', msgId);
    if (error) {
        notifyActionUnavailable({ message: 'Suppression indisponible : le contrat messages autorise l’envoi et la lecture, pas l’effacement.' });
        return;
    }
    const conversationId = window.LYANN_MESSAGING_REPOSITORY && typeof window.LYANN_MESSAGING_REPOSITORY.findConversationId === 'function'
        ? await window.LYANN_MESSAGING_REPOSITORY.findConversationId(getMyId(), currentChatContact.id)
        : null;
    if (window.LYANN_MESSAGING_REPOSITORY) {
        window.LYANN_MESSAGING_REPOSITORY.invalidateMessages(conversationId);
    }
    if (typeof renderMessages === 'function') await renderMessages();
};

let activeReplyTo = null;

window.quoteMessage = function(msgId, author, text) {
    activeReplyTo = { id: msgId, author: author, text: text };
    const replyBar = document.getElementById('chatReplyBar');
    const replyAuthor = document.getElementById('chatReplyAuthor');
    const replyText = document.getElementById('chatReplyText');
    if (replyBar && replyAuthor && replyText) {
        replyAuthor.textContent = `Réponse à ${author}`;
        replyText.textContent = text;
        replyBar.style.display = 'flex';
    }
    const inputField = document.getElementById('chatInputField');
    if (inputField) inputField.focus();
};

window.cancelQuoteMessage = function() {
    activeReplyTo = null;
    const replyBar = document.getElementById('chatReplyBar');
    if (replyBar) replyBar.style.display = 'none';
};

window.toggleMessageReaction = function(msgId, emoji) {
    notifyActionUnavailable({ message: 'Réaction indisponible : aucun champ de réaction n’existe sur les messages serveur.' });
};

function renderEmptyConversationState(container) {
    if (!container) return;
    const supportThread = isLyannSupportContact();
    container.innerHTML = `
        <div class="chat-empty-state">
            <i class="ph ph-chat-circle-dots"></i>
            <h4 style="font-weight: 700; color: #1E2822; margin: 8px 0 4px 0;">${supportThread ? 'Support LYANN' : 'Commencez l’échange'}</h4>
            <p style="color: #64748B; font-size: 0.88rem; margin: 0;">${supportThread
                ? 'Posez votre question ici. L’équipe LYANN vous répond dans cette conversation.'
                : 'Présentez-vous ou posez une question à propos de ce Lyann.'}</p>
        </div>
    `;
}

let chatRenderGeneration = 0;

function isQuoteAcceptedNotice(text) {
    return String(text || '').trim().toLowerCase() === 'devis accepté';
}

function appendQuoteAcceptedNotice(container, messageId) {
    if (!container) return;
    if (messageId && container.querySelector(`[data-message-id="${messageId}"]`)) return;
    const notice = document.createElement('div');
    notice.className = 'chat-msg-card align-left';
    notice.style.cssText = 'margin: 12px auto; max-width: 440px; width: 100%;';
    if (messageId) notice.dataset.messageId = String(messageId);
    notice.innerHTML = `
        <div class="chat-card-header"><i class="ph-fill ph-check-circle" style="color:#15803d"></i> Devis accepté</div>
        <div class="chat-card-body">
            <div>Le paiement est validé. Le devis est accepté.</div>
        </div>
    `;
    container.appendChild(notice);
}

const TIMELINE_LABELS = {
    visit_proposed: '📅 Visite proposée',
    visit_accepted: '✓ Visite acceptée',
    visit_declined: 'Visite refusée',
    visit_rescheduled: '📅 Visite proposée',
    quote_created: '📄 Devis proposé',
    quote_updated: '📄 Devis proposé',
    quote_accepted: '✅ Devis accepté',
    quote_declined: 'Devis refusé',
    payment_requested: '💳 Paiement demandé',
    payment_secured: '🔒 Fonds sécurisés',
    payment_failed: '❌ Paiement échoué',
    milestone_created: '🔨 Jalon',
    milestone_completed: '✓ Travail déclaré terminé',
    milestone_approved: '✅ Jalon validé',
    funds_released: '💶 Fonds libérés',
    mission_started: 'Mission commencée',
    mission_completed: 'Mission terminée',
    mission_cancelled: 'Mission annulée',
    review_requested: 'Avis demandé',
    review_submitted: 'Avis publié'
};
const timelineQuotes = new Map();

function isTimelineMessage(msg) {
    const type = msg && (msg.messageType || msg.type);
    return !!(type && Object.prototype.hasOwnProperty.call(TIMELINE_LABELS, type) && type !== 'text' && type !== 'photo' && type !== 'document');
}

function quoteTimelineSelector(quoteId) {
    return '[data-entity-type="quote"][data-entity-id="' + CSS.escape(String(quoteId)) + '"]';
}

function placeThreadNode(container, node) {
    if (!container || !node) return;
    if (!node.dataset.createdAt) {
        container.appendChild(node);
        return;
    }
    const cursor = { createdAt: node.dataset.createdAt, id: node.dataset.messageId || '' };
    const next = [...container.querySelectorAll('[data-message-id][data-created-at]')]
        .find((item) => compareCursor({ createdAt: item.dataset.createdAt, id: item.dataset.messageId }, cursor) > 0);
    if (next) container.insertBefore(node, next);
    else container.appendChild(node);
}

function disableCardButtons(quoteId) {
    const box = document.getElementById('chatMessagesContainer');
    if (!box || !quoteId) return;
    box.querySelectorAll('[data-live-quote-id="' + CSS.escape(String(quoteId)) + '"] button, ' + quoteTimelineSelector(quoteId) + ' button').forEach((button) => {
        button.disabled = true;
    });
}

function applyQuoteStatusToDom(quoteId, status) {
    const box = document.getElementById('chatMessagesContainer');
    if (!box || !quoteId) return;
    box.querySelectorAll('[data-live-quote-id="' + CSS.escape(String(quoteId)) + '"], ' + quoteTimelineSelector(quoteId)).forEach((node) => {
        node.dataset.quoteStatus = status;
        let state = node.querySelector('.chat-timeline-state');
        if (!state) {
            state = document.createElement('div');
            state.className = 'chat-timeline-state';
            node.appendChild(state);
        }
        state.textContent = status === 'ACCEPTED' ? '✓ Accepté' : status === 'REJECTED' ? 'Devis refusé' : '';
    });
}

async function respondVisit(messageId, decision, button) {
    const actions = button && button.parentElement;
    if (actions) actions.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    const result = await window.LYANN_API_CLIENT?.respondToVisit?.(messageId, decision);
    if (result?.error) {
        if (actions) actions.querySelectorAll('button').forEach((item) => { item.disabled = false; });
        chatToast('Cette action n’a pas abouti. Réessayez.');
        console.warn('[CHAT] visit reply failed');
    }
}

function fundingActionForOpenQuotes() {
    const payment = window.LYANN_QUOTE_PAYMENT;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!payment || !userId) return null;
    let found = null;
    timelineQuotes.forEach((quote) => {
        if (found || !quote || !quote.milestones) return;
        const next = payment.nextFundingAction(quote, userId);
        if (next) found = next;
    });
    return found;
}

function appendFundingAction(parent) {
    const next = fundingActionForOpenQuotes();
    if (!next || !parent) return;
    if (next.waiting) {
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = next.waiting;
        parent.appendChild(line);
    }
    if (!next.action || !next.milestone) return;
    const actions = document.createElement('div');
    actions.className = 'chat-timeline-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.style.background = '#2E7D32';
    button.textContent = next.label;
    button.addEventListener('click', () => {
        button.disabled = true;
        handleChatAction(next.action, {
            id: next.missionId,
            milestoneId: next.milestone.id,
            title: next.milestone.title
        });
    });
    actions.appendChild(button);
    parent.appendChild(actions);
}

function repaintFundingCards(box) {
    if (!box) return;
    box.querySelectorAll('[data-message-type="payment_secured"], [data-message-type="milestone_completed"]').forEach((node) => {
        const replacement = renderTimelineCard({
            id: node.dataset.messageId,
            createdAt: node.dataset.createdAt,
            timestamp: node.dataset.createdAt ? Date.parse(node.dataset.createdAt) : null,
            messageType: node.dataset.messageType || 'payment_secured',
            entityType: node.dataset.entityType,
            entityId: node.dataset.entityId,
            sender: 'them'
        });
        node.replaceWith(replacement);
    });
}

function renderDealRecapCard(quote) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    if (!payment || !quote) return null;
    const recap = payment.dealRecap(quote);
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-timeline-card';
    wrapper.dataset.dealRecap = String(quote.id);
    const title = document.createElement('div');
    title.className = 'chat-timeline-title';
    title.textContent = recap.title;
    wrapper.appendChild(title);
    recap.lines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'chat-timeline-meta';
        row.textContent = line.label + ' · ' + line.value;
        wrapper.appendChild(row);
    });
    if (payment.payableMilestoneForQuote(quote, userId)) {
        appendPayableQuoteAction(wrapper, quote);
        return wrapper;
    }
    const next = payment.nextFundingAction(quote, userId);
    if (next && next.waiting && !recap.released) {
        const wait = document.createElement('div');
        wait.className = 'chat-timeline-meta';
        wait.textContent = next.waiting;
        wrapper.appendChild(wait);
    }
    if (next && next.action && next.milestone) {
        const actions = document.createElement('div');
        actions.className = 'chat-timeline-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.style.background = '#2E7D32';
        button.textContent = next.label;
        button.addEventListener('click', () => {
            button.disabled = true;
            handleChatAction(next.action, {
                id: next.missionId,
                milestoneId: next.milestone.id,
                title: next.milestone.title
            });
        });
        actions.appendChild(button);
        wrapper.appendChild(actions);
    }
    return wrapper;
}

function paintDealRecaps(box, quotes) {
    if (!box) return;
    const accepted = (quotes || []).some((quote) => quote && quote.status === 'ACCEPTED');
    if (accepted && window.LYANN_QUOTE_PAYMENT) {
        const hidden = window.LYANN_QUOTE_PAYMENT.hiddenTimelineTypes([], quotes);
        box.querySelectorAll('[data-message-type]').forEach((node) => {
            if (hidden.has(node.dataset.messageType)) node.remove();
        });
        box.querySelectorAll('.chat-msg-card').forEach((node) => {
            if (String(node.textContent || '').indexOf('Le paiement est validé') !== -1) node.remove();
        });
    }
    box.querySelectorAll('[data-deal-recap]').forEach((node) => node.remove());
    (quotes || []).forEach((quote) => {
        if (!quote || quote.status !== 'ACCEPTED') return;
        const card = renderDealRecapCard(quote);
        if (card) box.appendChild(card);
    });
}

function appendPayableQuoteAction(parent, quote) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    const payable = payment && payment.payableMilestoneForQuote(quote, getMyId());
    if (!parent || !payable) return;
    const actions = document.createElement('div');
    actions.className = 'chat-timeline-actions';
    const pay = document.createElement('button');
    pay.type = 'button';
    pay.className = 'btn btn-primary';
    pay.dataset.quotePay = '1';
    pay.style.background = '#2E7D32';
    pay.textContent = payment.payButtonLabel(payable.amount);
    pay.addEventListener('click', () => {
        pay.disabled = true;
        payment.dispatchQuotePay(quote, getMyId(), (action, payload) => handleChatAction(action, payload));
    });
    actions.appendChild(pay);
    parent.appendChild(actions);
}

function repaintQuoteTimelineCards(box) {
    if (!box) return;
    box.querySelectorAll('[data-entity-type="quote"][data-entity-id]').forEach((node) => {
        const quote = timelineQuotes.get(node.dataset.entityId || '');
        if (!quote) return;
        const replacement = renderTimelineCard({
            id: node.dataset.messageId,
            createdAt: node.dataset.createdAt,
            timestamp: node.dataset.createdAt ? Date.parse(node.dataset.createdAt) : null,
            messageType: node.dataset.messageType,
            entityType: 'quote',
            entityId: quote.id,
            sender: 'them'
        });
        node.replaceWith(replacement);
    });
}

function renderTimelineCard(msg) {
    const type = msg.messageType || msg.type;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-timeline-card';
    if (msg.id) wrapper.dataset.messageId = String(msg.id);
    if (msg.createdAt) wrapper.dataset.createdAt = String(msg.createdAt);
    wrapper.dataset.messageType = type;
    if (msg.entityType) wrapper.dataset.entityType = msg.entityType;
    if (msg.entityId) wrapper.dataset.entityId = String(msg.entityId);
    const title = document.createElement('div');
    title.className = 'chat-timeline-title';
    title.textContent = TIMELINE_LABELS[type] || 'Nouveau message';
    wrapper.appendChild(title);
    const meta = msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
    if (type === 'visit_proposed' || type === 'visit_accepted' || type === 'visit_declined' || type === 'visit_rescheduled') {
        const when = document.createElement('div');
        when.className = 'chat-timeline-meta';
        when.textContent = [meta.label, meta.slot, meta.note].filter(Boolean).join(' · ') || (msg.text || '');
        wrapper.appendChild(when);
        const mine = msg.sender === 'me' || msg.sender === getMyId();
        if (type === 'visit_proposed' && !mine && msg.id) {
            const actions = document.createElement('div');
            actions.className = 'chat-timeline-actions';
            const accept = document.createElement('button');
            accept.type = 'button';
            accept.className = 'btn btn-primary';
            accept.textContent = 'Accepter';
            accept.addEventListener('click', () => respondVisit(msg.id, 'accept', accept));
            const decline = document.createElement('button');
            decline.type = 'button';
            decline.className = 'btn btn-outline';
            decline.textContent = 'Refuser';
            decline.addEventListener('click', () => respondVisit(msg.id, 'decline', decline));
            actions.append(accept, decline);
            wrapper.appendChild(actions);
        }
    } else if (type === 'quote_created' || type === 'quote_updated') {
        const quote = timelineQuotes.get(String(msg.entityId || ''));
        const body = document.createElement('div');
        body.className = 'chat-timeline-body';
        const description = document.createElement('div');
        description.textContent = (quote && quote.description) || '';
        const total = document.createElement('div');
        total.className = 'chat-timeline-amount';
        if (quote && quote.total_amount != null) total.textContent = String(quote.total_amount) + ' €';
        body.append(description, total);
        (quote && quote.milestones || []).forEach((milestone) => {
            const line = document.createElement('div');
            line.className = 'chat-timeline-meta';
            line.textContent = (milestone.title || 'Jalon') + (milestone.amount != null ? ' · ' + milestone.amount + ' €' : '');
            body.appendChild(line);
        });
        if (quote && (quote.status === 'ACCEPTED' || quote.status === 'REJECTED')) {
            const state = document.createElement('div');
            state.className = 'chat-timeline-state';
            state.textContent = quote.status === 'ACCEPTED' ? '✓ Accepté' : 'Devis refusé';
            body.appendChild(state);
            appendPayableQuoteAction(body, quote);
        } else if (quote && quote.status === 'SENT' && quote.requester_id === getMyId()) {
            const actions = document.createElement('div');
            actions.className = 'chat-timeline-actions';
            const accept = document.createElement('button');
            accept.type = 'button';
            accept.className = 'btn btn-primary';
            accept.textContent = 'Accepter';
            accept.addEventListener('click', () => {
                accept.disabled = true;
                window.handleAcceptQuote(quote.id);
            });
            const decline = document.createElement('button');
            decline.type = 'button';
            decline.className = 'btn btn-outline';
            decline.textContent = 'Refuser';
            decline.addEventListener('click', () => {
                decline.disabled = true;
                window.handleRejectQuote(quote.id);
            });
            actions.append(accept, decline);
            body.appendChild(actions);
        }
        wrapper.appendChild(body);
    } else if (type === 'milestone_completed') {
        const body = document.createElement('div');
        body.className = 'chat-timeline-body';
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = 'La prestation est déclarée terminée.';
        body.appendChild(line);
        appendFundingAction(body);
        wrapper.appendChild(body);
    } else if (type === 'payment_secured') {
        const body = document.createElement('div');
        body.className = 'chat-timeline-body';
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = 'Le montant est encaissé.';
        body.appendChild(line);
        appendFundingAction(body);
        wrapper.appendChild(body);
    } else if (type === 'quote_accepted') {
        const quote = timelineQuotes.get(String(msg.entityId || ''));
        const body = document.createElement('div');
        body.className = 'chat-timeline-body';
        const total = document.createElement('div');
        total.className = 'chat-timeline-amount';
        if (quote && quote.total_amount != null) total.textContent = String(quote.total_amount) + ' €';
        body.appendChild(total);
        appendPayableQuoteAction(body, quote);
        wrapper.appendChild(body);
    } else if (meta.title || meta.status) {
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = [meta.title, meta.status].filter(Boolean).join(' · ');
        wrapper.appendChild(line);
    }
    const time = document.createElement('div');
    time.className = 'chat-timeline-time';
    time.textContent = typeof msg.timestamp === 'number' ? chatTimeLabel(msg.timestamp) : '';
    wrapper.appendChild(time);
    return wrapper;
}

async function refreshOpenBusinessCards() {
    const contact = currentChatContact;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!contact?.id || !userId) return;
    invalidateActiveQuoteContext();
    const quotes = await window.LYANN_MESSAGING_REPOSITORY?.getQuoteContext?.(userId, contact.id, { fresh: true });
    const box = document.getElementById('chatMessagesContainer');
    if (!box || currentChatContact?.id !== contact.id || !Array.isArray(quotes)) return;
    quotes.forEach((quote) => {
        const previous = timelineQuotes.get(String(quote.id));
        if (previous && (previous.status === 'ACCEPTED' || previous.status === 'REJECTED') && quote.status === 'SENT') {
            quote = Object.assign({}, quote, { status: previous.status });
        }
        timelineQuotes.set(String(quote.id), quote);
        (quote.milestones || []).forEach((milestone) => timelineQuotes.set('milestone:' + milestone.id, milestone));
        if (quote.status === 'ACCEPTED') {
            const proposeRow = document.getElementById('btnCtxPropose');
            if (proposeRow && proposeRow.parentElement) proposeRow.parentElement.style.display = 'none';
        }
        const covered = box.querySelector(quoteTimelineSelector(quote.id));
        if (covered) {
            box.querySelectorAll('[data-live-quote-id="' + CSS.escape(String(quote.id)) + '"]').forEach((node) => node.remove());
            repaintQuoteTimelineCards(box);
            repaintFundingCards(box);
            return;
        }
        applyQuoteStatusToDom(quote.id, quote.status);
    });
    paintDealRecaps(box, quotes);
}

async function renderMessages(passedMessages = null, options = {}) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    // ATOMIC CHAT RENDER: keep the current conversation visible while fresh data is loading.
    // Only the newest render is allowed to commit, preventing overlapping refreshes from flickering.
    const renderGeneration = ++chatRenderGeneration;

    if (!currentChatContact) {
        container.innerHTML = '';
        renderEmptyConversationState(container);
        return;
    }

    let msgs = passedMessages;
    const canRefresh = !Array.isArray(passedMessages);
    let paintedFromCache = false;
    if (!Array.isArray(msgs)) {
        const cached = window.LYANN_MESSAGING_REPOSITORY?.peekMessages?.(getMyId(), currentChatContact.id);
        if (Array.isArray(cached)) {
            msgs = cached;
            paintedFromCache = options.fresh === true;
        } else {
            msgs = await getChatMessages(currentChatContact.id, { ...options, limit: options.limit || 50 });
        }
    }

    // Quotes load after the text is on screen. They must not hold the first paint.
    let realQuotes = Array.isArray(options.quotes) ? options.quotes : [];

    // Ignore stale async renders. A newer refresh already owns the DOM.
    if (renderGeneration !== chatRenderGeneration) return;
    if (!Array.isArray(passedMessages) && window.LYANN_MESSAGING_REPOSITORY?.markConversationRead && typeof getMyId === 'function' && isUUID(currentChatContact?.id)) {
        window.LYANN_MESSAGING_REPOSITORY.markConversationRead(getMyId(), currentChatContact.id).catch(() => {});
    }

    // Full rebuild is reserved for the first paint and a conversation change.
    // Pending outgoing bubbles are put back afterwards so a refresh cannot erase them.
    const pendingOptimistic = [...container.querySelectorAll('[data-optimistic-status="sending"], [data-optimistic-status="failed"], [data-optimistic-status="offline"]')]
        .map((status) => status.closest('.chat-msg-bubble-wrap'))
        .filter((node) => node && !node.dataset.messageId);
    pendingOptimistic.forEach((node) => node.remove());
    container.innerHTML = '';

    if (!Array.isArray(msgs) || (msgs.length === 0 && realQuotes.length === 0)) {
        renderEmptyConversationState(container);
        armThreadHistory(0);
        return;
    }

    // Add Date Separator at top
    const dateSep = document.createElement('div');
    dateSep.className = 'chat-date-separator';
    dateSep.innerHTML = `<span>Aujourd'hui</span>`;
    container.appendChild(dateSep);

    msgs.forEach(msg => {
        // Skip legacy local PRICE_PROPOSAL cards if we have real Supabase quotes
        if (msg.cardType === 'PRICE_PROPOSAL' && realQuotes.length > 0) return;

        const wrapper = document.createElement('div');
        const isMe = msg.sender === 'me' || msg.sender === getMyId();
        const msgId = msg.id || ('msg_' + Math.random().toString(36).substr(2, 9));
        msg.id = msgId;

        let timeStr = msg.timestamp;
        if (typeof msg.timestamp === 'number') {
            const d = new Date(msg.timestamp);
            timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const authorName = isMe ? 'Vous' : (currentChatContact ? currentChatContact.name : 'Membre');

        wrapper.className = `chat-msg-bubble-wrap ${isMe ? 'sent' : 'received'}`;
        wrapper.dataset.messageId = String(msgId);

        const timelineType = msg.messageType || msg.type;
        const knownQuotes = [];
        timelineQuotes.forEach((quote) => { if (quote && quote.status) knownQuotes.push(quote); });
        const hiddenTimeline = window.LYANN_QUOTE_PAYMENT && window.LYANN_QUOTE_PAYMENT.hiddenTimelineTypes
            ? window.LYANN_QUOTE_PAYMENT.hiddenTimelineTypes(msgs, knownQuotes)
            : new Set();
        if (isTimelineMessage(msg)) {
            if (hiddenTimeline.has(timelineType)) return;
            const node = renderTimelineCard(msg);
            if (node) container.appendChild(node);
        }
        else if (msg.type === 'text' && isQuoteAcceptedNotice(msg.text)) {
            return;
        }
        else if (msg.type === 'text' || msg.type === 'photo' || msg.type === 'document') {
            const node = createThreadBubble(msg, { timeStr, isMe, authorName, msgId });
            if (node) container.appendChild(node);
        }
        else if (msg.type === 'system_card') {
            const div = document.createElement('div');
            div.className = `chat-msg-card ${isMe ? 'align-right' : 'align-left'}`;

            if (msg.cardType === 'PRICE_PROPOSAL') {
                const name = isMe ? 'Vous proposez' : `${currentChatContact.name} vous propose`;
                const inlineActions = !isMe ? `
                    <div class="chat-card-inline-actions">
                        <button type="button" class="btn btn-primary btn-accept-inline"><i class="ph ph-check-circle"></i> Accepter (${msg.amount} €)</button>
                        <button type="button" class="btn btn-outline btn-counter-inline">Contre-proposer</button>
                    </div>
                ` : `<div style="font-size:0.85rem; color:var(--text-muted); margin-top:8px; font-weight:600;"><i class="ph ph-clock"></i> En attente d'acceptation</div>`;

                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph ph-lightning"></i> PROPOSITION · ${escapeChatHtml(name).toUpperCase()}</div>
                    <div class="chat-card-body">
                        <div style="font-size: 1.05rem; font-weight: 700; color: var(--text);">${escapeChatHtml(msg.title)}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                        ${inlineActions}
                    </div>
                `;

                setTimeout(() => {
                    const accBtn = div.querySelector('.btn-accept-inline');
                    const ctrBtn = div.querySelector('.btn-counter-inline');
                    if (accBtn) {
                        accBtn.onclick = () => handleChatAction('ACCEPT_PRICE', { title: msg.title, agreed_price: msg.amount, id: msg.missionId || null, quoteId: msg.quoteId || null });
                    }
                    if (ctrBtn) {
                        ctrBtn.onclick = () => handleChatAction('COUNTER_OFFER');
                    }
                }, 0);
            }
            else if (msg.cardType === 'AGREEMENT_REACHED') {
                const inlinePay = !isMe ? `
                    <div class="chat-card-inline-actions">
                        <button type="button" class="btn btn-primary btn-pay-inline" style="background:#2E7D32;"><i class="ph ph-lock-key"></i> Payer & Bloquer (${msg.amount}€)</button>
                    </div>
                ` : '';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-check-circle" style="color:#2E7D32"></i> Accord trouvé !</div>
                    <div class="chat-card-body">
                        <div>${escapeChatHtml(msg.title)}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                        ${inlinePay}
                    </div>
                `;
                setTimeout(() => {
                    const payBtn = div.querySelector('.btn-pay-inline');
                    if (payBtn) payBtn.onclick = () => handleChatAction('PAY_MISSION', { title: msg.title, agreed_price: msg.amount, id: msg.missionId || null });
                }, 0);
            }
            else if (msg.cardType === 'PAYMENT_CONFIRMED') {
                div.className = 'chat-msg-card align-left';
                div.style.margin = '10px auto';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-lock-key" style="color:#E63B2E"></i> Paiement sécurisé</div>
                    <div class="chat-card-body">
                        <div>Les fonds (${msg.amount}€) sont mis sous séquestre. La mission peut commencer !</div>
                    </div>
                `;
            }
            else if (msg.cardType === 'WORK_DONE') {
                const name = isMe ? 'Vous avez terminé' : `${currentChatContact.name} indique avoir terminé`;
                const confirmBtn = !isMe ? `
                    <div class="chat-card-inline-actions">
                        <button type="button" class="btn btn-primary btn-confirm-work"><i class="ph ph-check"></i> Valider & Libérer les fonds</button>
                    </div>
                ` : '';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph ph-flag-checkered"></i> ${escapeChatHtml(name)}</div>
                    <div class="chat-card-body">
                        <div>Veuillez valider la fin de la mission pour déclencher le versement.</div>
                        ${confirmBtn}
                    </div>
                `;
                setTimeout(() => {
                    const cBtn = div.querySelector('.btn-confirm-work');
                    if (cBtn) cBtn.onclick = () => handleChatAction('CONFIRM_DONE', { id: msg.missionId || null, milestoneId: msg.milestoneId || null });
                }, 0);
            }
            else if (msg.cardType === 'MISSION_COMPLETED') {
                div.className = 'chat-msg-card align-left';
                div.style.margin = '10px auto';
                div.style.background = 'rgba(46,125,50,0.1)';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-confetti" style="color:#2E7D32"></i> Mission Terminée !</div>
                    <div class="chat-card-body">
                        <div>Merci d'avoir fait vivre le réseau LYANN. Le versement est en cours.</div>
                    </div>
                `;
            }
            container.appendChild(div);
        }
    });

    // Render Production Supabase Real Quote Cards
    function appendLiveQuoteCard(container, q) {
        const isMyQuote = (q.provider_id || q.helper_id) === getMyId();
        const payment = window.LYANN_QUOTE_PAYMENT;
        const pendingMs = payment ? payment.payableMilestoneForQuote(q, getMyId()) : null;
        const fundedMs = (q.milestones || []).find((m) => m && (m.status === 'FUNDED' || m.status === 'IN_PROGRESS'));
        const completedMs = (q.milestones || []).find((m) => m && m.status === 'COMPLETED');
        const quoteDiv = document.createElement('div');
        if (container.querySelector(quoteTimelineSelector(q.id))) return;
        quoteDiv.dataset.liveQuote = '1';
        quoteDiv.dataset.liveQuoteId = q.id;
        quoteDiv.className = `chat-msg-card ${isMyQuote ? 'align-right' : 'align-left'}`;
        quoteDiv.style.cssText = 'width: 100%; max-width: 440px; border: 1.5px solid var(--border); border-radius: 16px; background: #ffffff; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); margin: 12px 0;';

        const quoteNum = q.quote_number || ('DEV-' + q.id.slice(0, 8).toUpperCase());
        const providerName = escapeChatHtml(isMyQuote ? 'Vous (Prestataire)' : (currentChatContact?.name || 'Membre LYANN'));
        
        let statusBadgeClass = 'background: #eff6ff; color: #1d4ed8;';
        if (q.status === 'ACCEPTED') statusBadgeClass = 'background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;';
        else if (q.status === 'REJECTED') statusBadgeClass = 'background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;';

        let milestonesHTML = '';
        if (q.milestones && q.milestones.length > 0) {
            milestonesHTML = `
                <div style="background: #f8fafc; border-radius: 12px; padding: 10px 12px; margin-top: 10px; margin-bottom: 12px;">
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Parties du devis (${q.milestones.length})</div>
                    ${q.milestones.map(m => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.82rem;">
                            <div>
                                <strong style="color: var(--text);">${escapeChatHtml(m.title)}</strong>
                                ${m.description ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${escapeChatHtml(m.description)}</div>` : ''}
                            </div>
                            <div style="font-weight: 700; color: var(--primary-dark);">${m.amount} € (${m.percentage}%)</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        let actionsHTML = '';
        if (q.status === 'SENT') {
            if (q.requester_id === getMyId()) {
                actionsHTML = `
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button type="button" class="btn btn-primary" onclick="window.handleAcceptQuote('${q.id}')" style="flex: 1; justify-content: center; font-size: 0.85rem; padding: 8px 12px;"><i class="ph ph-check-circle"></i> Accepter le devis (${q.total_amount} €)</button>
                        <button type="button" class="btn btn-outline" onclick="window.handleRejectQuote('${q.id}')" style="flex: 1; justify-content: center; font-size: 0.85rem; padding: 8px 12px; border-color: #ef4444; color: #ef4444;"><i class="ph ph-x-circle"></i> Refuser</button>
                    </div>
                `;
            } else {
                actionsHTML = `
                    <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600; text-align: center; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 8px;">
                        <i class="ph ph-clock"></i> En attente de validation par le client
                    </div>
                `;
            }
        } else if (q.status === 'ACCEPTED') {
            const acceptedBadge = `
                <div style="font-size: 0.85rem; color: #15803d; font-weight: 700; text-align: center; margin-top: 8px; padding: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                    <i class="ph ph-check-circle"></i> Devis Accepté · Mission Créée
                </div>
            `;
            const providerId = q.provider_id || q.helper_id;
            if (pendingMs) {
                actionsHTML = `
                    ${acceptedBadge}
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button type="button" class="btn btn-primary btn-quote-pay" data-quote-pay style="flex: 1; justify-content: center; background:#2E7D32;">
                            <i class="ph ph-lock-key"></i> ${payment.payButtonLabel(pendingMs.amount)}
                        </button>
                    </div>
                `;
            } else if (providerId === getMyId() && fundedMs) {
                actionsHTML = `
                    ${acceptedBadge}
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button type="button" class="btn btn-primary btn-quote-mark-done" data-quote-mark-done style="flex: 1; justify-content: center;">
                            ✓ J'ai terminé
                        </button>
                    </div>
                `;
            } else if (q.requester_id === getMyId() && completedMs) {
                actionsHTML = `
                    ${acceptedBadge}
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button type="button" class="btn btn-primary btn-quote-confirm" data-quote-confirm style="flex: 1; justify-content: center;">
                            ✓ Tout est bon
                        </button>
                    </div>
                `;
            } else if (fundedMs) {
                actionsHTML = `
                    <div style="font-size: 0.85rem; color: #15803d; font-weight: 700; text-align: center; margin-top: 8px; padding: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                        <i class="ph ph-check-circle"></i> Devis accepté
                    </div>
                `;
            } else {
                actionsHTML = acceptedBadge;
            }
        } else if (q.status === 'REJECTED') {
            actionsHTML = `
                <div style="font-size: 0.85rem; color: #b91c1c; font-weight: 700; text-align: center; margin-top: 8px; padding: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                    <i class="ph ph-x-circle"></i> Devis Refusé
                </div>
            `;
        }

        window.__lyannAppendLiveQuote = appendLiveQuoteCard;
        quoteDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 10px;">
                <div>
                    <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--text-muted); letter-spacing: 0.5px;">${quoteNum}</div>
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary-dark);">Prestataire : ${providerName}</div>
                </div>
                <span style="font-weight: 800; font-size: 0.72rem; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; ${statusBadgeClass}">${q.status}</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--text); margin-bottom: 4px;">${escapeChatHtml(q.description || 'Devis détaillé')}</div>
            <div style="font-size: 1.3rem; font-weight: 900; color: var(--primary); margin-bottom: 8px;">${q.total_amount} €</div>
            ${q.valid_until ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;"><i class="ph ph-calendar"></i> Valable jusqu'au ${new Date(q.valid_until).toLocaleDateString('fr-FR')}</div>` : ''}
            ${milestonesHTML}
            ${actionsHTML}
        `;
        const payBtn = quoteDiv.querySelector('[data-quote-pay]');
        if (payBtn && pendingMs && q.mission_id) {
            payBtn.addEventListener('click', () => {
                payment.dispatchQuotePay(q, getMyId(), (action, payload) => handleChatAction(action, payload));
            });
        }
        const markDoneBtn = quoteDiv.querySelector('[data-quote-mark-done]');
        if (markDoneBtn && fundedMs) {
            markDoneBtn.addEventListener('click', () => handleChatAction('MARK_DONE', {
                id: q.mission_id,
                milestoneId: fundedMs.id
            }));
        }
        const confirmBtn = quoteDiv.querySelector('[data-quote-confirm]');
        if (confirmBtn && completedMs) {
            confirmBtn.addEventListener('click', () => handleChatAction('CONFIRM_DONE', {
                id: q.mission_id,
                milestoneId: completedMs.id
            }));
        }
        container.appendChild(quoteDiv);
    }
    realQuotes.forEach((quote) => appendLiveQuoteCard(container, quote));

    if (window.LYANN_MESSAGING_REPOSITORY && isUUID(currentChatContact.id)) {
        const generation = renderGeneration;
        const contactId = currentChatContact.id;
        const userId = getMyId();
        const painted = Array.isArray(msgs) ? msgs : [];
        if (canRefresh && paintedFromCache) {
            window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, { fresh: true, limit: 50 }).then((fresh) => {
                if (generation !== chatRenderGeneration || currentChatContact?.id !== contactId || !Array.isArray(fresh)) return;
                const box = document.getElementById('chatMessagesContainer');
                const stick = threadIsNearBottom(box);
                fresh.forEach((msg) => {
                    if (!msg || msg.type === 'transactional') return;
                    appendLiveChatMessage({
                        id: msg.id,
                        sender_id: msg.sender === 'me' ? userId : contactId,
                        content: msg.text || '',
                        created_at: msg.createdAt || (typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : null),
                        is_read: msg.status === 'read',
                        attachment_type: msg.attachmentType || msg.type === 'photo' || msg.type === 'document' ? (msg.attachmentType || msg.type) : null,
                        attachment_url: msg.attachmentPath || msg.photoUrl || '',
                        attachment_name: msg.attachmentName || msg.docName || '',
                        attachment_size: msg.attachmentSize,
                        attachment_mime: msg.attachmentMime || ''
                    }, { stickToBottom: stick, quiet: true });
                });
            }).catch(() => {});
        }
        if (!realQuotes.length) {
            window.LYANN_MESSAGING_REPOSITORY.getQuoteContext(userId, contactId).then((quotes) => {
                if (generation !== chatRenderGeneration || currentChatContact?.id !== contactId || !quotes?.length) return;
                const box = document.getElementById('chatMessagesContainer');
                if (!box) return;
                const stick = threadIsNearBottom(box);
                quotes.forEach((quote) => timelineQuotes.set(String(quote.id), quote));
                repaintQuoteTimelineCards(box);
                repaintFundingCards(box);
                paintDealRecaps(box, quotes);
                box.querySelectorAll('[data-live-quote="1"]').forEach((node) => {
                    if (node.dataset.liveQuoteId && box.querySelector(quoteTimelineSelector(node.dataset.liveQuoteId))) node.remove();
                });
                quotes.forEach((quote) => appendLiveQuoteCard(box, quote));
                if (stick) scrollThreadToBottom(box, false);
            }).catch(() => {});
        }
    }

    // Dynamic Blocked User UI Check
    const inputArea = document.querySelector('.chat-input-area');
    const existingBlockedBanner = document.getElementById('chatBlockedBanner');

    if (window.isUserBlocked && currentChatContact && (window.isUserBlocked(currentChatContact.id) || window.isUserBlocked(currentChatContact.name))) {
        if (!existingBlockedBanner) {
            const b = document.createElement('div');
            b.id = 'chatBlockedBanner';
            b.className = 'chat-blocked-banner';
            b.style.cssText = 'margin: 16px auto; padding: 16px 20px; background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 16px; text-align: center; color: #991B1B; font-weight: 600; font-size: 0.95rem; max-width: 90%; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.08); display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 10;';
            b.innerHTML = `
                <div>🚫 <strong>${escapeChatHtml(currentChatContact.name)}</strong> est désormais bloqué.</div>
                <div style="font-size: 0.85rem; font-weight: 400; color: #7F1D1D;">Vous avez bloqué cet utilisateur. Vous ne pouvez plus lui envoyer de messages.</div>
                <button type="button" class="btn btn-sm" onclick="window.unblockUser('${currentChatContact.id}')" style="background: #DC2626; color: #FFFFFF; border: none; border-radius: 20px; padding: 8px 18px; font-weight: 700; cursor: pointer; transition: all 0.2s;">🔓 Débloquer cet utilisateur</button>
            `;
            container.appendChild(b);
        }
        if (inputArea) inputArea.style.display = 'none';
    } else {
        if (existingBlockedBanner) existingBlockedBanner.remove();
        if (inputArea) inputArea.style.display = 'flex';
    }

    pendingOptimistic.forEach((node) => {
        if (!node.isConnected) container.appendChild(node);
    });
    armThreadHistory(Array.isArray(msgs) ? msgs.length : 0);
    scrollThreadToBottom(container, false);
}

const threadHistory = { contactId: null, hasMore: false, loading: false };
const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const DOC_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation'
]);
const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'odt', 'ods', 'odp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_DOC_BYTES = 20 * 1024 * 1024;

function chatIsOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return Math.round(n) + ' o';
    if (n < 1024 * 1024) {
        const value = n / 1024;
        return (value >= 10 ? value.toFixed(0) : value.toFixed(1)).replace('.', ',') + ' Ko';
    }
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
}

function fileExtension(file) {
    const name = String(file?.name || '');
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
}

function validateChatFile(file, kind) {
    if (!file) return { ok: false, message: 'Choisissez un fichier.' };
    const mime = String(file.type || '').toLowerCase();
    const ext = fileExtension(file);
    const photo = kind !== 'document';
    const mimeOk = photo ? (PHOTO_MIMES.has(mime) || (!mime && PHOTO_EXT.has(ext))) : (DOC_MIMES.has(mime) || (!mime && DOC_EXT.has(ext)));
    if (!mimeOk) return { ok: false, message: photo ? 'Cette photo n’est pas acceptée. Utilisez JPEG, PNG, WebP ou HEIC.' : 'Ce document n’est pas accepté.' };
    const limit = photo ? MAX_PHOTO_BYTES : MAX_DOC_BYTES;
    if (file.size > limit) return { ok: false, message: photo ? 'Cette photo dépasse 10 Mo.' : 'Ce document dépasse 20 Mo.' };
    return { ok: true, mime: mime || (photo ? 'image/jpeg' : 'application/octet-stream'), ext: ext || (photo ? 'jpg' : 'pdf') };
}

function safeAttachmentExt(ext, kind) {
    const value = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowed = kind === 'document' ? DOC_EXT : PHOTO_EXT;
    if (value === 'jpeg') return 'jpg';
    return allowed.has(value) ? value : (kind === 'document' ? 'pdf' : 'jpg');
}

function attachmentObjectPath(conversationId, senderId, ext) {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : createOptimisticClientId().replace(/^optimistic_/, '');
    return conversationId + '/' + senderId + '/' + id + '.' + safeAttachmentExt(ext, ext && DOC_EXT.has(ext) ? 'document' : 'photo');
}

function chatToast(message) {
    if (window.NotificationService?.showToast) window.NotificationService.showToast('info', message);
    else if (window.showToast) window.showToast(message, 'info');
    else if (window.lyannAlert) window.lyannAlert(message);
}

function createThreadBubble(msg, hints) {
    const isMe = hints && Object.prototype.hasOwnProperty.call(hints, 'isMe') ? hints.isMe : (msg.sender === 'me' || msg.sender === getMyId());
    const msgId = (hints && hints.msgId) || msg.id || '';
    let timeStr = hints && hints.timeStr;
    if (timeStr == null) timeStr = typeof msg.timestamp === 'number' ? chatTimeLabel(msg.timestamp) : (typeof msg.timestamp === 'string' ? msg.timestamp : '');
    const authorName = (hints && hints.authorName) || (isMe ? 'Vous' : (currentChatContact ? currentChatContact.name : 'Membre'));
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-bubble-wrap ' + (isMe ? 'sent' : 'received');
    if (msgId) wrapper.dataset.messageId = String(msgId);
    if (msg.createdAt) wrapper.dataset.createdAt = String(msg.createdAt);
    const path = msg.attachmentPath || '';
    if (path && !/^https?:/i.test(path) && !String(path).startsWith('blob:')) wrapper.dataset.attachmentPath = path;
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble ' + (isMe ? 'sent' : 'received');
    if (msg.type === 'photo') {
        const frame = document.createElement('div');
        frame.className = 'chat-msg-photo-wrap';
        const image = document.createElement('img');
        image.className = 'chat-msg-photo';
        image.alt = 'Photo';
        image.loading = 'lazy';
        image.decoding = 'async';
        const direct = msg.photoUrl || (/^(https?:|blob:)/i.test(path) ? path : '');
        if (direct) image.src = direct;
        frame.appendChild(image);
        frame.addEventListener('click', () => { if (image.src) window.openPhotoLightbox(image.src); });
        image.addEventListener('error', () => refreshAttachmentImage(wrapper, image));
        bubble.appendChild(frame);
    } else if (msg.type === 'document') {
        const card = document.createElement('div');
        card.className = 'chat-msg-doc-card';
        const icon = document.createElement('i');
        icon.className = 'ph ph-file-pdf chat-msg-doc-icon';
        icon.setAttribute('aria-hidden', 'true');
        const info = document.createElement('div');
        const docName = document.createElement('div');
        docName.className = 'chat-msg-doc-name';
        docName.textContent = msg.attachmentName || msg.docName || 'Document';
        const docMeta = document.createElement('div');
        docMeta.className = 'chat-msg-doc-meta';
        docMeta.textContent = msg.docSize || formatFileSize(msg.attachmentSize) || 'Document';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'chat-msg-doc-open';
        open.textContent = 'Ouvrir';
        open.addEventListener('click', () => openChatDocument(wrapper.dataset.attachmentPath || path));
        info.append(docName, docMeta, open);
        card.append(icon, info);
        bubble.appendChild(card);
    } else {
        if (msg.replyToAuthor || msg.replyToText) {
            const quote = document.createElement('div');
            quote.className = 'chat-quoted-block';
            const who = document.createElement('strong');
            who.textContent = msg.replyToAuthor || '';
            quote.append(who, document.createTextNode(': ' + (msg.replyToText || '')));
            bubble.appendChild(quote);
        }
        const textNode = document.createElement('div');
        textNode.className = 'chat-msg-text';
        textNode.textContent = msg.text || '';
        bubble.appendChild(textNode);
    }
    const meta = document.createElement('div');
    meta.className = 'chat-msg-time';
    if (timeStr) meta.append(document.createTextNode(String(timeStr) + ' '));
    if (isMe) {
        const marker = document.createElement('span');
        const seen = msg.status === 'read';
        marker.className = 'chat-msg-status ' + (seen ? 'read' : 'sent');
        marker.title = seen ? 'Vu' : 'Envoyé';
        const icon = document.createElement('i');
        icon.className = seen ? 'ph ph-checks' : 'ph ph-check';
        marker.append(icon, document.createTextNode(seen ? ' Vu' : ' Envoyé'));
        meta.appendChild(marker);
    }
    bubble.appendChild(meta);
    wrapper.append(bubble, buildChatActionBar(msgId, isMe, authorName, msg.type === 'text' ? (msg.text || '') : (msg.attachmentName || '')));
    if (msg.type === 'photo' || msg.type === 'document') queueMicrotask(() => { if (wrapper.isConnected) void hydrateAttachmentNode(wrapper); });
    return wrapper;
}

async function hydrateAttachmentNode(node) {
    const path = node?.dataset?.attachmentPath;
    if (!path || !window.LYANN_API_CLIENT?.signedChatAttachmentUrl) return;
    const url = await window.LYANN_API_CLIENT.signedChatAttachmentUrl(path);
    if (!url || !node.isConnected) return;
    const image = node.querySelector('img.chat-msg-photo');
    if (image) image.src = url;
    node.dataset.signedReady = '1';
}

async function refreshAttachmentImage(node, image) {
    if (!node || !image || image.dataset.refreshed === '1') return;
    const path = node.dataset.attachmentPath;
    if (!path) return;
    image.dataset.refreshed = '1';
    window.LYANN_API_CLIENT?.clearSignedChatAttachmentUrl?.(path);
    const url = await window.LYANN_API_CLIENT?.signedChatAttachmentUrl?.(path);
    if (url) image.src = url;
}

async function openChatDocument(path) {
    if (!path) return;
    const url = /^https?:/i.test(path) ? path : await window.LYANN_API_CLIENT?.signedChatAttachmentUrl?.(path);
    if (!url) {
        chatToast('Impossible d’ouvrir ce document pour le moment.');
        return;
    }
    window.open(url, '_blank', 'noopener');
}

function renderOptimisticAttachment(detail) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !currentChatContact) return null;
    container.querySelector('.chat-empty-state')?.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-bubble-wrap sent';
    wrapper.dataset.optimisticMessageId = detail.clientId;
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble sent';
    if (detail.kind === 'photo') {
        const frame = document.createElement('div');
        frame.className = 'chat-msg-photo-wrap';
        const image = document.createElement('img');
        image.className = 'chat-msg-photo';
        image.alt = 'Photo';
        image.src = detail.localUrl || '';
        frame.appendChild(image);
        frame.addEventListener('click', () => { if (image.src) window.openPhotoLightbox(image.src); });
        bubble.appendChild(frame);
    } else {
        const card = document.createElement('div');
        card.className = 'chat-msg-doc-card';
        const icon = document.createElement('i');
        icon.className = 'ph ph-file-pdf chat-msg-doc-icon';
        const info = document.createElement('div');
        const docName = document.createElement('div');
        docName.className = 'chat-msg-doc-name';
        docName.textContent = detail.name || 'Document';
        const docMeta = document.createElement('div');
        docMeta.className = 'chat-msg-doc-meta';
        docMeta.textContent = formatFileSize(detail.size) || 'Document';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'chat-msg-doc-open';
        open.textContent = 'Ouvrir';
        open.addEventListener('click', () => openChatDocument(wrapper.dataset.attachmentPath || ''));
        info.append(docName, docMeta, open);
        card.append(icon, info);
        bubble.appendChild(card);
    }
    const meta = document.createElement('div');
    meta.className = 'chat-msg-time';
    const time = chatTimeLabel(Date.now());
    meta.dataset.timeLabel = time;
    meta.dataset.optimisticStatus = 'sending';
    meta.textContent = time ? time + ' · Envoi…' : 'Envoi…';
    bubble.appendChild(meta);
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    trackOptimistic(currentChatContact.id, wrapper, '', detail.clientId);
    scrollThreadToBottom(container, false);
    console.log('[CHAT] optimistic message');
    return wrapper;
}

async function sendChatAttachment(file, kind) {
    if (!currentChatContact?.id) return;
    const check = validateChatFile(file, kind);
    if (!check.ok) {
        chatToast(check.message);
        return;
    }
    const clientId = createOptimisticClientId();
    const localUrl = kind === 'photo' ? URL.createObjectURL(file) : '';
    const node = renderOptimisticAttachment({ clientId, kind, file, localUrl, name: file.name, size: file.size });
    outgoingSends.set(clientId, { kind, contactId: currentChatContact.id, clientId, file, node, localUrl, name: file.name, size: file.size, mime: check.mime, ext: check.ext });
    await deliverAttachment(clientId);
}

async function deliverAttachment(clientId) {
    const job = outgoingSends.get(clientId);
    if (!job?.node) return;
    const userId = getMyId();
    if (!userId || !isUUID(userId) || !isUUID(job.contactId) || !window.LYANN_API_CLIENT?.supabase) {
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'failed');
        return;
    }
    if (!(job.file instanceof Blob)) {
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'failed');
        const button = job.node.querySelector('[data-chat-retry]');
        if (button) button.textContent = 'Choisir à nouveau';
        job.needsFile = true;
        return;
    }
    if (chatIsOffline()) {
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'offline');
        flushParkedLiveRows();
        return;
    }
    forgetOptimistic(job.node);
    trackOptimistic(job.contactId, job.node, '', clientId);
    setOptimisticState(job.node, 'sending');
    let uploadedPath = '';
    try {
        const { data: convRes } = await window.LYANN_API_CLIENT.getOrCreateConversation(userId, job.contactId);
        if (!convRes?.id) throw new Error("Impossible d'initialiser la conversation.");
        const sharedConvId = convRes.id;
        if (currentChatContact && currentChatContact.id === job.contactId) currentChatContact.conversationId = sharedConvId;
        uploadedPath = attachmentObjectPath(sharedConvId, userId, job.ext);
        const uploaded = await window.LYANN_API_CLIENT.uploadChatAttachment(uploadedPath, job.file, job.mime);
        if (uploaded?.error) throw uploaded.error;
        const { data: sentRow, error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, userId, '', {
            clientMessageId: clientId,
            path: uploadedPath,
            type: job.kind === 'photo' ? 'photo' : 'document',
            name: job.name,
            size: job.size,
            mime: job.mime
        });
        if (sendErr) throw sendErr;
        window.LYANN_MESSAGING_REPOSITORY?.invalidateConversation?.(userId, job.contactId, sharedConvId);
        console.log('[CHAT] insert confirmed');
        bindOptimisticSend(clientId, sentRow?.id);
        if (job.node && sentRow?.created_at) job.node.dataset.createdAt = sentRow.created_at;
        const remotePath = sentRow?.attachment_url || uploadedPath;
        if (remotePath && !/^https?:/i.test(remotePath)) job.node.dataset.attachmentPath = remotePath;
        if (job.localUrl) URL.revokeObjectURL(job.localUrl);
        job.localUrl = '';
        await hydrateAttachmentNode(job.node);
        console.log('[CHAT] reconciled');
        outgoingSends.delete(clientId);
        const noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, sharedConvId, '', sentRow?.created_at, {
            attachment_type: job.kind === 'photo' ? 'photo' : 'document',
            attachment_name: job.name,
            unread: false
        });
        publishChatActivity({
            contactId: noted?.contactId || job.contactId,
            preview: noted?.preview || (job.kind === 'photo' ? '📷 Photo' : ('📄 ' + (job.name || 'Document'))),
            conversationId: sharedConvId,
            lastMessageAt: sentRow?.created_at || null,
            unread: false,
            name: noted?.name || '',
            avatar: noted?.avatar || ''
        });
    } catch (error) {
        console.warn('[CHAT] attachment send failed', error?.message || error);
        if (uploadedPath) window.LYANN_API_CLIENT.removeChatAttachment?.(uploadedPath).catch(() => {});
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'failed');
        flushParkedLiveRows();
    }
}

async function retryOutgoing(clientId) {
    const job = outgoingSends.get(clientId);
    if (!job?.node?.isConnected) return;
    if (job.needsFile) {
        const input = chatPicker(job.kind === 'document' ? 'document' : 'photo');
        input.onchange = () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const check = validateChatFile(file, job.kind === 'document' ? 'document' : 'photo');
            if (!check.ok) {
                chatToast(check.message);
                return;
            }
            job.file = file;
            job.needsFile = false;
            job.mime = check.mime;
            job.ext = check.ext;
            job.name = file.name;
            job.size = file.size;
            if (job.kind === 'photo') {
                if (job.localUrl) URL.revokeObjectURL(job.localUrl);
                job.localUrl = URL.createObjectURL(file);
                const image = job.node.querySelector('img.chat-msg-photo');
                if (image) image.src = job.localUrl;
            }
            const nameNode = job.node.querySelector('.chat-msg-doc-name');
            if (nameNode) nameNode.textContent = file.name;
            const sizeNode = job.node.querySelector('.chat-msg-doc-meta');
            if (sizeNode) sizeNode.textContent = formatFileSize(file.size);
            void deliverAttachment(clientId);
        };
        input.click();
        return;
    }
    if (job.kind === 'text') {
        setOptimisticState(job.node, 'sending');
        await deliverTextMessage(job.contactId, { id: job.clientId, type: 'text', text: job.text, sender: 'me', timestamp: Date.now() }, job.node);
        return;
    }
    await deliverAttachment(clientId);
}

function chatPicker(kind) {
    const id = 'chatAttachmentInput-' + kind;
    let input = document.getElementById(id);
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = id;
        input.hidden = true;
        if (kind === 'photo') input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp';
        if (kind === 'camera') {
            input.accept = 'image/*';
            input.setAttribute('capture', 'environment');
        }
        if (kind === 'document') input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods,.odp';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            void sendChatAttachment(file, kind === 'document' ? 'document' : 'photo');
        });
        document.body.appendChild(input);
    }
    return input;
}

async function dataUrlToFile(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const type = blob.type || 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], 'photo.' + ext, { type });
}

async function captureChatPhoto() {
    const native = typeof window.isNativePlatform === 'function' && window.isNativePlatform() && window.Capacitor?.Plugins?.Camera;
    if (native) {
        try {
            const image = await window.Capacitor.Plugins.Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: 'dataUrl',
                source: 'CAMERA',
                correctOrientation: true
            });
            if (!image?.dataUrl) return;
            const file = await dataUrlToFile(image.dataUrl);
            await sendChatAttachment(file, 'photo');
        } catch (error) {
            const message = String(error?.message || error || '');
            if (!/cancel/i.test(message)) console.warn('[CHAT] camera', message);
        }
        return;
    }
    chatPicker('camera').click();
}

function compareCursor(a, b) {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

function serverNodes(container) {
    return [...container.querySelectorAll('[data-message-id][data-created-at]')].filter((node) => node.dataset.messageId && !String(node.dataset.messageId).startsWith('optimistic_'));
}

function newestServerCursor(container) {
    let best = null;
    serverNodes(container).forEach((node) => {
        const cursor = { createdAt: node.dataset.createdAt, id: node.dataset.messageId };
        if (!best || compareCursor(cursor, best) > 0) best = cursor;
    });
    return best;
}

function oldestServerNode(container) {
    let best = null;
    serverNodes(container).forEach((node) => {
        const cursor = { createdAt: node.dataset.createdAt, id: node.dataset.messageId };
        if (!best || compareCursor(cursor, { createdAt: best.dataset.createdAt, id: best.dataset.messageId }) < 0) best = node;
    });
    return best;
}

function compensateScroll(container, previousHeight, previousTop) {
    container.scrollTop = previousTop + (container.scrollHeight - previousHeight);
}

function armThreadHistory(loadedCount) {
    if (!currentChatContact?.id) return;
    threadHistory.contactId = currentChatContact.id;
    threadHistory.hasMore = loadedCount >= 50;
    threadHistory.loading = false;
    const container = document.getElementById('chatMessagesContainer');
    if (!container || container.dataset.historyArmed === '1') return;
    container.dataset.historyArmed = '1';
    container.addEventListener('scroll', () => {
        if (container.scrollTop < 160) void loadOlderMessages();
    }, { passive: true });
}

async function loadOlderMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !currentChatContact?.id) return;
    if (threadHistory.loading || !threadHistory.hasMore || threadHistory.contactId !== currentChatContact.id) return;
    if (container.scrollHeight <= container.clientHeight + 8) return;
    const oldest = oldestServerNode(container);
    if (!oldest) {
        threadHistory.hasMore = false;
        return;
    }
    threadHistory.loading = true;
    const contactId = currentChatContact.id;
    const loader = document.createElement('div');
    loader.className = 'chat-history-loader';
    loader.textContent = 'Chargement…';
    const loaderBefore = container.scrollHeight;
    const loaderTop = container.scrollTop;
    container.insertBefore(loader, container.firstChild);
    compensateScroll(container, loaderBefore, loaderTop);
    try {
        const page = await getChatMessages(contactId, {
            fresh: true,
            limit: 50,
            before: { createdAt: oldest.dataset.createdAt, id: oldest.dataset.messageId }
        });
        if (!currentChatContact || currentChatContact.id !== contactId) return;
        const fresh = (Array.isArray(page) ? page : []).filter((msg) => msg && msg.id && msg.type !== 'transactional' && !container.querySelector(chatMessageSelector(msg.id)));
        if (!Array.isArray(page) || page.length < 50) threadHistory.hasMore = false;
        if (!fresh.length) {
            threadHistory.hasMore = false;
            return;
        }
        const beforeHeight = container.scrollHeight;
        const beforeTop = container.scrollTop;
        const fragment = document.createDocumentFragment();
        fresh.forEach((msg) => {
            const node = createThreadBubble(msg);
            if (node) fragment.appendChild(node);
        });
        container.insertBefore(fragment, loader.nextSibling);
        compensateScroll(container, beforeHeight, beforeTop);
    } catch (error) {
        console.warn('[CHAT] older history', error?.message || error);
    } finally {
        const beforeHeight = container.scrollHeight;
        const beforeTop = container.scrollTop;
        loader.remove();
        compensateScroll(container, beforeHeight, beforeTop);
        threadHistory.loading = false;
    }
}

// Intercept form submit and initialize chat contacts
function initChatSubmitAndContacts() {
    const form = document.getElementById('chatInputForm');
    const input = document.getElementById('chatInputField');

    // Auto-expanding textarea & fluid focus behavior
    if (input) {
        input.addEventListener('input', function () {
            this.style.height = '44px';
            const nextH = Math.min(this.scrollHeight, 120);
            this.style.height = nextH + 'px';
            const container = document.getElementById('chatMessagesContainer');
            if (container && threadIsNearBottom(container)) scrollThreadToBottom(container, false);
        });

        input.addEventListener('focus', function () {
            const container = document.getElementById('chatMessagesContainer');
            if (container && threadIsNearBottom(container)) {
                setTimeout(() => {
                    if (threadIsNearBottom(container)) scrollThreadToBottom(container, false);
                }, 120);
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input ? input.value.trim() : '';
            if (!text || !currentChatContact) return;

            addMessageToContact(currentChatContact.id, {
                type: 'text',
                sender: getMyId(),
                text: text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (input) {
                input.value = '';
                input.style.height = '44px';
            }

            window.dispatchEvent(new CustomEvent('lyann_chat_message_sent', { detail: { text, contactId: currentChatContact.id } }));
        });
    }

    // Submit on Enter key (unless Shift is pressed)
    if (input && form) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });
    }

    // Header "Proposer un prix" button click
    const chatHeaderProposeBtn = document.getElementById('chatHeaderProposeBtn');
    if (chatHeaderProposeBtn) {
        chatHeaderProposeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
            const overlay = document.getElementById('chatActionChoicesOverlay');
            if (overlay) overlay.style.display = 'flex';
        });
    }

    // Open Bottom Sheet (+)
    const chatAttachBtn = document.getElementById('chatAttachBtn');
    const bottomSheet = document.getElementById('chatActionsBottomSheet');
    const closeBottomSheetBtn = document.getElementById('closeBottomSheetBtn');

    if (chatAttachBtn && bottomSheet) {
        chatAttachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof triggerHaptic === 'function') triggerHaptic('light');
            bottomSheet.style.display = 'flex';
        });
    }
    if (closeBottomSheetBtn && bottomSheet) {
        closeBottomSheetBtn.addEventListener('click', () => {
            bottomSheet.style.display = 'none';
        });
    }
    if (bottomSheet) {
        bottomSheet.addEventListener('click', (e) => {
            if (e.target === bottomSheet) bottomSheet.style.display = 'none';
        });
    }

    // Bottom Sheet Action Buttons
    const bsActionRequestHelp = document.getElementById('bsActionRequestHelp');
    const bsActionPhoto = document.getElementById('bsActionPhoto');
    const bsActionCamera = document.getElementById('bsActionCamera');
    const bsActionPrice = document.getElementById('bsActionPrice');
    const bsActionDate = document.getElementById('bsActionDate');
    const bsActionDevis = document.getElementById('bsActionDevis');
    const bsActionDocument = document.getElementById('bsActionDocument');
    const fileInput = document.getElementById('chatFileInput');

    if (bsActionRequestHelp) {
        bsActionRequestHelp.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            handleChatAction('REQUEST_HELP', null);
        });
    }

    if (bsActionPhoto) {
        bsActionPhoto.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            chatPicker('photo').click();
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file || !currentChatContact) return;
            const kind = file.type.startsWith('image/') || PHOTO_EXT.has(fileExtension(file)) ? 'photo' : 'document';
            void sendChatAttachment(file, kind);
        });
    }
    if (bsActionCamera) {
        bsActionCamera.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            void captureChatPhoto();
        });
    }
    if (bsActionPrice) {
        bsActionPrice.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatActionChoicesOverlay');
            if (overlay) overlay.style.display = 'flex';
        });
    }
    if (bsActionDate) {
        bsActionDate.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatProposeDateForm');
            if (overlay) openChatChildSurface('chatProposeDateForm');
        });
    }
    if (bsActionDevis) {
        bsActionDevis.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatMilestoneDevisForm');
            if (overlay) openChatChildSurface('chatMilestoneDevisForm');
        });
    }
    if (bsActionDocument) {
        bsActionDocument.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            chatPicker('document').click();
        });
    }

window.toggleChatHeaderDropdown = function (e) {
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const dropdownMenu = document.getElementById('chatHeaderDropdownMenu');
    if (dropdownMenu) {
        const isCurrentlyActive = dropdownMenu.classList.contains('active') || dropdownMenu.style.display === 'block';
        if (isCurrentlyActive) {
            dropdownMenu.classList.remove('active');
            dropdownMenu.style.setProperty('display', 'none', 'important');
        } else {
            dropdownMenu.classList.add('active');
            dropdownMenu.style.setProperty('display', 'block', 'important');
            dropdownMenu.style.setProperty('z-index', '999999', 'important');
        }
    }
};

window.backToChatContacts = function (e) {
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (typeof triggerHaptic === 'function') {
        try { triggerHaptic('light'); } catch (err) {}
    }
    document.body.classList.remove('in-chat-active', 'hide-bottom-nav');
    document.querySelectorAll('.chat-modal-layout').forEach(l => {
        l.classList.remove('mobile-conversation-active');
    });
    document.querySelectorAll('.chat-contacts-sidebar').forEach(s => {
        s.style.removeProperty('display');
        s.classList.remove('hidden');
    });
    document.querySelectorAll('.chat-main-area, .chat-main-pane').forEach(m => {
        m.style.setProperty('display', 'none', 'important');
    });
    const dropdownMenu = document.getElementById('chatHeaderDropdownMenu');
    if (dropdownMenu) {
        dropdownMenu.classList.remove('active');
        dropdownMenu.style.setProperty('display', 'none', 'important');
    }
};

// Global Delegated Interaction Handler (Click + Touch) for Chat Header Buttons
const handleChatHeaderClicks = async (e) => {
    const backBtn = e.target.closest('.chat-back-to-contacts-btn');
    if (backBtn) {
        window.backToChatContacts(e);
        return;
    }

    const moreBtn = e.target.closest('#chatMoreOptionsBtn') || e.target.closest('.chat-more-btn');
    if (moreBtn) {
        window.toggleChatHeaderDropdown(e);
        return;
    }

    // Handle dropdown items directly via delegation
    const dropViewProfile = e.target.closest('#chatDropViewProfile');
    const dropShareProfile = e.target.closest('#chatDropShareProfile');
    const dropBlockUser = e.target.closest('#chatDropBlockUser');
    const dropReportUser = e.target.closest('#chatDropReportUser');

    if (dropViewProfile || dropShareProfile || dropBlockUser || dropReportUser) {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        
        const dropdownMenu = document.getElementById('chatHeaderDropdownMenu');
        if (dropdownMenu) {
            dropdownMenu.classList.remove('active');
            dropdownMenu.style.setProperty('display', 'none', 'important');
        }

        if (dropViewProfile) {
            if (currentChatContact && typeof window.openQuickProfileModal === 'function') {
                window.openQuickProfileModal(currentChatContact.id || currentChatContact.name);
            } else if (window.lyannAlert) {
                window.lyannAlert(`Profil de ${currentChatContact ? currentChatContact.name : 'ce membre'}`);
            }
        } else if (dropShareProfile) {
            if (window.lyannAlert) window.lyannAlert(`Lien du profil de ${currentChatContact ? currentChatContact.name : 'ce membre'} copié !`);
        } else if (dropBlockUser) {
            if (!currentChatContact) return;
            if (window.lyannConfirm) {
                const confirmBlock = await window.lyannConfirm(`🚫 Bloquer ${currentChatContact.name} ?\nCet utilisateur ne pourra plus vous contacter ni échanger avec vous.`);
                if (confirmBlock) {
                    window.blockUser(currentChatContact.id, currentChatContact.name);
                }
            } else {
                window.blockUser(currentChatContact.id, currentChatContact.name);
            }
        } else if (dropReportUser) {
            window.openReportModal(currentChatContact ? currentChatContact.name : null);
        }
        return;
    }

    // Close dropdown menu if clicking outside
    const dropdownMenu = document.getElementById('chatHeaderDropdownMenu');
    if (dropdownMenu && !e.target.closest('#chatHeaderDropdownMenu')) {
        dropdownMenu.classList.remove('active');
        dropdownMenu.style.setProperty('display', 'none', 'important');
    }
};

document.addEventListener('click', handleChatHeaderClicks, true);
document.addEventListener('touchstart', (e) => {
    const backBtn = e.target.closest('.chat-back-to-contacts-btn');
    const moreBtn = e.target.closest('#chatMoreOptionsBtn') || e.target.closest('.chat-more-btn');
    const dropItem = e.target.closest('.chat-dropdown-item');
    if (backBtn || moreBtn || dropItem) {
        handleChatHeaderClicks(e);
    }
}, { passive: true });

    // Close Photo Viewer Lightbox
    const closePhotoViewerBtn = document.getElementById('closePhotoViewerBtn');
    const photoViewerModal = document.getElementById('chatPhotoViewerModal');
    if (closePhotoViewerBtn && photoViewerModal) {
        closePhotoViewerBtn.addEventListener('click', () => {
            photoViewerModal.style.display = 'none';
        });
        photoViewerModal.addEventListener('click', (event) => {
            if (event.target === photoViewerModal) photoViewerModal.style.display = 'none';
        });
    }

    // Real-time Contact Search Filter
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll('#chatContactsList .chat-contact-item').forEach(item => {
                const nameEl = item.querySelector('.chat-contact-name');
                const name = nameEl ? nameEl.textContent.toLowerCase() : '';
                if (name.includes(query)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // Setup overlays click listeners
    const chatProposeBtn = document.getElementById('chatProposeBtn');
    const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
    const chatDirectPriceForm = document.getElementById('chatDirectPriceForm');
    const chatMilestoneDevisForm = document.getElementById('chatMilestoneDevisForm');

    if (chatProposeBtn) {
        chatProposeBtn.addEventListener('click', () => {
            closeAllOverlays();
            if (chatActionChoicesOverlay) {
                openChatChildSurface('chatActionChoicesOverlay');
            }
        });
    }

    const btnChooseDirectPrice = document.getElementById('btnChooseDirectPrice');
    if (btnChooseDirectPrice) {
        btnChooseDirectPrice.addEventListener('click', () => {
            closeAllOverlays();
            if (chatDirectPriceForm) {
                openChatChildSurface('chatDirectPriceForm');
                const firstRequired = chatDirectPriceForm.querySelector('[required]');
                if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
            }
        });
    }

    const btnChooseMilestoneDevis = document.getElementById('btnChooseMilestoneDevis');
    if (btnChooseMilestoneDevis) {
        btnChooseMilestoneDevis.addEventListener('click', () => {
            closeAllOverlays();
            if (chatMilestoneDevisForm) {
                openChatChildSurface('chatMilestoneDevisForm');
                if (typeof window.lyannRefreshMilestoneAllocation === 'function') window.lyannRefreshMilestoneAllocation();
                const firstRequired = chatMilestoneDevisForm.querySelector('[required]');
                if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
            }
        });
    }

    // Cancel / Close buttons on overlays
    document.querySelectorAll('.chat-overlay-pane .cancel-overlay-btn, .chat-overlay-pane .close-overlay-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    });

    // SUBMIT DIRECT PRICE
    async function handleDirectPriceFormSubmit(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        try {
            const descInput = document.getElementById('dpDescription');
            const amountInput = document.getElementById('dpAmount');
            const desc = descInput ? descInput.value.trim() : '';
            const amount = amountInput ? parseFloat(amountInput.value) : 0;

            let contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
            if (!contact || !contact.id) {
                try {
                    const saved = localStorage.getItem('lyann_last_active_contact');
                    if (saved) contact = JSON.parse(saved);
                } catch(e) {}
            }

            if (!contact || !contact.id) {
                throw new Error("Aucun contact sélectionné pour la discussion.");
            }

            if (!desc || isNaN(amount) || amount <= 0) {
                const alertMsg = "Veuillez remplir la description et indiquer un montant valide.";
                if (window.showToast) window.showToast(alertMsg, 'error');
                else if (window.lyannAlert) window.lyannAlert(alertMsg);
                else alert(alertMsg);
                return;
            }

            try {
                await createProductionQuoteForContact(contact.id, desc, amount);
            } catch (invErr) {
                notifyQuoteUnavailable(invErr);
                return;
            }

            if (descInput) descInput.value = '';
            if (amountInput) amountInput.value = '';
            closeAllOverlays();
            if (typeof refreshChatUI === 'function') {
                await refreshOpenBusinessCards();
            }

            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_PRICE', contactId: contact.id } }));
        } catch (err) {
            console.error("Error in directPriceForm submit:", err);
            if (window.showToast) window.showToast("Erreur lors de l'envoi de l'offre : " + err.message, 'error');
            else if (window.lyannAlert) window.lyannAlert("Erreur lors de l'envoi de l'offre : " + err.message);
        }
    }
    window.handleDirectPriceFormSubmit = handleDirectPriceFormSubmit;

    const directPriceForm = document.getElementById('directPriceForm');
    if (directPriceForm) {
        directPriceForm.addEventListener('submit', handleDirectPriceFormSubmit);
    }
    document.addEventListener('submit', (e) => {
        if (e.target && (e.target.id === 'directPriceForm' || e.target.closest('#directPriceForm'))) {
            handleDirectPriceFormSubmit(e);
        }
    });

    // SUBMIT PROPOSE DATE
    async function handleProposeDateFormSubmit(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        try {
            let contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
            if (!contact || !contact.id) {
                try {
                    const saved = localStorage.getItem('lyann_last_active_contact');
                    if (saved) contact = JSON.parse(saved);
                } catch(e) {}
            }

            if (!contact || !contact.id) {
                throw new Error("Aucun contact sélectionné pour la discussion.");
            }

            const dateInput = document.getElementById('pdDate');
            const dateVal = dateInput ? dateInput.value : '';
            const slotVal = document.getElementById('pdTimeSlot')?.value || '';
            const noteVal = document.getElementById('pdNote')?.value || '';

            if (!dateVal) {
                const alertMsg = "Veuillez sélectionner une date d'intervention.";
                if (window.showToast) window.showToast(alertMsg, 'error');
                else if (window.lyannAlert) window.lyannAlert(alertMsg);
                else alert(alertMsg);
                return;
            }

            const dateParts = String(dateVal).split('-').map(Number);
            const localDate = dateParts.length === 3
                ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
                : new Date(dateVal);
            const formattedDate = localDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            const msgText = `📅 Visite proposée · ${formattedDate}${slotVal ? ' · ' + slotVal : ''}`;

            await addMessageToContact(contact.id, {
                type: 'text',
                messageType: 'visit_proposed',
                metadata: { label: formattedDate, slot: slotVal, note: noteVal },
                sender: getMyId(),
                text: msgText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (dateInput) dateInput.value = '';
            const noteInput = document.getElementById('pdNote');
            if (noteInput) noteInput.value = '';

            closeAllOverlays();
            if (typeof refreshChatUI === 'function') {
                await refreshOpenBusinessCards();
            }

            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_DATE', contactId: contact.id } }));
        } catch (err) {
            console.error("Error in proposeDateForm submit:", err);
            if (window.showToast) window.showToast("Erreur lors de la proposition : " + err.message, 'error');
            else if (window.lyannAlert) window.lyannAlert("Erreur lors de la proposition : " + err.message);
        }
    }
    window.handleProposeDateFormSubmit = handleProposeDateFormSubmit;

    const proposeDateForm = document.getElementById('proposeDateForm');
    if (proposeDateForm) {
        proposeDateForm.addEventListener('submit', handleProposeDateFormSubmit);
    }
    document.addEventListener('submit', (e) => {
        if (e.defaultPrevented) return;
        if (e.target && (e.target.id === 'proposeDateForm' || e.target.closest('#proposeDateForm'))) {
            handleProposeDateFormSubmit(e);
        }
    });

    // SUBMIT LEAVE REVIEW
    const leaveReviewForm = document.getElementById('leaveReviewForm');
    if (leaveReviewForm) {
        leaveReviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentChatContact) return;

            const rating = document.getElementById('revRating')?.value || '5';
            const comment = document.getElementById('revComment')?.value || '';

            const stars = '⭐'.repeat(parseInt(rating));
            const msgText = `${stars} Avis laissé : "${comment}"`;

            await addMessageToContact(currentChatContact.id, {
                type: 'text',
                sender: getMyId(),
                text: msgText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (window.lyannAlert) window.lyannAlert("Merci ! Votre avis a été publié.");
            closeAllOverlays();
            refreshOpenBusinessCards();
        });
    }

    // Milestone allocation: 30/30/40 by default, euros follow the total, either side stays editable.
    const MILESTONE_DEFAULT_PERCENTS = [30, 30, 40];
    const roundMilestoneMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
    const roundMilestonePercent = (value) => Math.round((Number(value) || 0) * 100) / 100;

    function milestoneTotal() {
        return Math.max(0, parseFloat(document.getElementById('mdTotalAmount')?.value) || 0);
    }

    function milestonePercentInputs() {
        return [1, 2, 3].map((i) => document.getElementById('mdJ' + i + 'Percent'));
    }

    function milestoneAmountInputs() {
        return [1, 2, 3].map((i) => document.getElementById('mdJ' + i + 'Amount'));
    }

    function readMilestonePercents() {
        return milestonePercentInputs().map((input) => Math.min(100, Math.max(0, parseFloat(input?.value) || 0)));
    }

    function readMilestoneAmounts() {
        return milestoneAmountInputs().map((input) => Math.max(0, parseFloat(input?.value) || 0));
    }

    function ensureMilestoneAmountInput(index) {
        const existing = document.getElementById('mdJ' + index + 'Amount');
        if (existing) return existing;
        const percentInput = document.getElementById('mdJ' + index + 'Percent');
        if (!percentInput) return null;
        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.id = 'mdJ' + index + 'Amount';
        amountInput.className = 'modal-input';
        amountInput.min = '0';
        amountInput.step = '0.01';
        amountInput.inputMode = 'decimal';
        amountInput.setAttribute('aria-label', 'Montant en euros du jalon ' + index);
        amountInput.placeholder = '0,00';
        amountInput.style.cssText = 'flex:1.15; min-width:72px; font-size:0.8rem; height:32px; padding:2px 8px; box-sizing:border-box;';
        const euro = document.createElement('span');
        euro.textContent = '€';
        euro.style.cssText = 'font-size:0.8rem; font-weight:700;';
        const percentMark = percentInput.nextElementSibling;
        const anchor = percentMark && percentMark.tagName === 'SPAN' ? percentMark : percentInput;
        anchor.insertAdjacentElement('afterend', amountInput);
        amountInput.insertAdjacentElement('afterend', euro);
        const titleInput = document.getElementById('mdJ' + index + 'Title');
        if (titleInput) {
            titleInput.style.flex = '1.3';
            titleInput.style.minWidth = '0';
            titleInput.removeAttribute('required');
            titleInput.placeholder = 'Titre';
        }
        return amountInput;
    }

    function seedMilestoneDefaults() {
        const inputs = milestonePercentInputs();
        if (inputs.some((input) => !input)) return;
        if (inputs.some((input) => input.value !== '')) return;
        inputs.forEach((input, index) => {
            input.value = String(MILESTONE_DEFAULT_PERCENTS[index]);
        });
    }

    function amountsFromMilestonePercents(total, percents) {
        if (!(total > 0)) return [0, 0, 0];
        const amounts = percents.map((percent) => roundMilestoneMoney(total * percent / 100));
        const percentSum = roundMilestonePercent(percents.reduce((sum, percent) => sum + percent, 0));
        if (Math.abs(percentSum - 100) <= 0.05) {
            amounts[2] = roundMilestoneMoney(total - amounts[0] - amounts[1]);
        }
        return amounts;
    }

    function formatMilestonePercent(value) {
        return roundMilestonePercent(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';
    }

    function formatMilestoneMoney(value) {
        return roundMilestoneMoney(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function updateMilestoneSummary() {
        const total = milestoneTotal();
        const percents = readMilestonePercents();
        const amounts = readMilestoneAmounts();
        const percentSum = roundMilestonePercent(percents.reduce((sum, percent) => sum + percent, 0));
        const amountSum = roundMilestoneMoney(amounts.reduce((sum, amount) => sum + amount, 0));
        const remaining = roundMilestoneMoney(total - amountSum);
        const pctEl = document.getElementById('mdAllocationPercentTotal');
        const amtEl = document.getElementById('mdAllocationAmountTotal');
        const remEl = document.getElementById('mdAllocationRemaining');
        if (pctEl) pctEl.textContent = formatMilestonePercent(percentSum);
        if (amtEl) amtEl.textContent = formatMilestoneMoney(amountSum);
        if (remEl) {
            remEl.textContent = formatMilestoneMoney(remaining);
            remEl.style.color = Math.abs(remaining) <= 0.01 ? 'var(--primary)' : (remaining < 0 ? '#B91C1C' : '#475569');
        }
        const live = document.getElementById('mdAllocationLive');
        if (!live) return;
        const balanced = total > 0 && Math.abs(percentSum - 100) <= 0.05 && Math.abs(amountSum - total) <= 0.05;
        live.style.color = balanced ? 'var(--primary-dark, #1B4332)' : '#B91C1C';
        if (!(total > 0)) {
            live.textContent = 'Saisissez le montant total : les jalons passent à 30 % / 30 % / 40 %.';
            live.style.color = '#475569';
            return;
        }
        live.textContent = balanced
            ? 'Répartition complète : ' + formatMilestonePercent(percentSum) + ' · ' + formatMilestoneMoney(amountSum)
            : 'Répartition : ' + formatMilestonePercent(percentSum) + ' · montants ' + formatMilestoneMoney(amountSum) + ' sur ' + formatMilestoneMoney(total);
    }

    function applyMilestoneAmountsFromPercents() {
        const total = milestoneTotal();
        const amounts = amountsFromMilestonePercents(total, readMilestonePercents());
        milestoneAmountInputs().forEach((input, index) => {
            if (!input || document.activeElement === input) return;
            input.value = total > 0 ? amounts[index].toFixed(2) : '';
        });
        updateMilestoneSummary();
    }

    function rebalanceMilestones(editedIndex, source) {
        const total = milestoneTotal();
        const percentInputs = milestonePercentInputs();
        const amountInputs = milestoneAmountInputs();
        const edited = editedIndex - 1;
        const percents = readMilestonePercents();
        const amounts = readMilestoneAmounts();
        const others = [0, 1, 2].filter((index) => index !== edited);

        if (source === 'amount' && total > 0) {
            percents[edited] = roundMilestonePercent(Math.min(total, amounts[edited]) / total * 100);
        }
        percents[edited] = Math.min(100, Math.max(0, percents[edited]));

        const otherSum = others.reduce((sum, index) => sum + percents[index], 0);
        const remaining = roundMilestonePercent(100 - percents[edited]);
        if (otherSum <= 0) {
            const share = roundMilestonePercent(remaining / others.length);
            others.forEach((index, position) => {
                percents[index] = position === others.length - 1
                    ? roundMilestonePercent(remaining - share * (others.length - 1))
                    : share;
            });
        } else {
            let assigned = 0;
            others.forEach((index, position) => {
                if (position === others.length - 1) {
                    percents[index] = roundMilestonePercent(remaining - assigned);
                } else {
                    percents[index] = roundMilestonePercent(remaining * percents[index] / otherSum);
                    assigned = roundMilestonePercent(assigned + percents[index]);
                }
            });
        }

        percentInputs.forEach((input, index) => {
            if (!input) return;
            if (source === 'percent' && index === edited && document.activeElement === input) return;
            input.value = String(percents[index]);
        });

        const computed = amountsFromMilestonePercents(total, readMilestonePercents());
        if (source === 'amount' && total > 0) computed[edited] = roundMilestoneMoney(Math.min(total, amounts[edited]));
        const restIndex = others[others.length - 1];
        if (total > 0) {
            const used = computed.reduce((sum, amount, index) => index === restIndex ? sum : sum + amount, 0);
            computed[restIndex] = roundMilestoneMoney(total - used);
            if (!(source === 'percent' && restIndex === edited && document.activeElement === percentInputs[restIndex])) {
                percents[restIndex] = roundMilestonePercent(computed[restIndex] / total * 100);
                if (percentInputs[restIndex]) percentInputs[restIndex].value = String(percents[restIndex]);
            }
        }

        amountInputs.forEach((input, index) => {
            if (!input || document.activeElement === input) return;
            input.value = total > 0 ? computed[index].toFixed(2) : '';
        });
        updateMilestoneSummary();
    }

    function initMilestoneAllocationSync() {
        const totalInput = document.getElementById('mdTotalAmount');
        const form = document.getElementById('milestoneDevisForm');
        if (!totalInput || !form || totalInput.dataset.allocationSyncBound === 'true') return;
        totalInput.dataset.allocationSyncBound = 'true';

        for (let i = 1; i <= 3; i++) ensureMilestoneAmountInput(i);

        form.querySelectorAll('label').forEach((label) => {
            if (label.textContent.includes('Jalons de paiement')) label.textContent = 'Jalons de paiement';
        });
        const hint = [...form.querySelectorAll('p')].find((paragraph) => /100\s*%/.test(paragraph.textContent));
        if (hint) {
            hint.innerHTML = '<i class="ph ph-info"></i> Départ proposé : 30 % / 30 % / 40 %. Un pourcentage ou un montant modifié recalcule l’autre.';
        }
        if (!document.getElementById('mdAllocationLive')) {
            const live = document.createElement('p');
            live.id = 'mdAllocationLive';
            live.style.cssText = 'font-size:0.75rem; margin:6px 0 0; font-weight:700;';
            if (hint) hint.insertAdjacentElement('afterend', live);
        }

        seedMilestoneDefaults();

        for (let i = 1; i <= 3; i++) {
            const percentInput = document.getElementById('mdJ' + i + 'Percent');
            const amountInput = document.getElementById('mdJ' + i + 'Amount');
            if (percentInput) {
                percentInput.step = '0.01';
                percentInput.min = '0';
                percentInput.max = '100';
                percentInput.removeAttribute('required');
                percentInput.addEventListener('input', () => rebalanceMilestones(i, 'percent'));
            }
            if (amountInput) amountInput.addEventListener('input', () => rebalanceMilestones(i, 'amount'));
        }

        totalInput.addEventListener('input', () => {
            seedMilestoneDefaults();
            applyMilestoneAmountsFromPercents();
        });
        applyMilestoneAmountsFromPercents();
    }

    window.lyannRefreshMilestoneAllocation = function lyannRefreshMilestoneAllocation() {
        seedMilestoneDefaults();
        applyMilestoneAmountsFromPercents();
    };

    initMilestoneAllocationSync();

    // SUBMIT MILESTONE DEVIS
    const milestoneDevisForm = document.getElementById('milestoneDevisForm');
    if (milestoneDevisForm) {
        milestoneDevisForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const titleInput = document.getElementById('mdTitle');
                const totalInput = document.getElementById('mdTotalAmount');
                const title = titleInput ? titleInput.value.trim() : '';
                const total = totalInput ? parseFloat(totalInput.value) : 0;

                seedMilestoneDefaults();
                const rawPercents = readMilestonePercents();
                const rawAmounts = readMilestoneAmounts();
                const percentSum = roundMilestonePercent(rawPercents.reduce((sum, percent) => sum + percent, 0));
                const amountSum = roundMilestoneMoney(rawAmounts.reduce((sum, amount) => sum + amount, 0));
                let percents = rawPercents.slice();
                let amounts = rawAmounts.slice();

                if (!currentChatContact) {
                    throw new Error("Aucun contact sélectionné pour la discussion.");
                }

                if (!title || isNaN(total) || total <= 0) {
                    if (window.lyannAlert) window.lyannAlert("Indiquez le libellé et un montant total.");
                    else alert("Indiquez le libellé et un montant total.");
                    return;
                }

                if (Math.abs(percentSum - 100) <= 0.05) {
                    amounts = amountsFromMilestonePercents(total, percents);
                } else if (Math.abs(amountSum - total) <= 0.05) {
                    percents = amounts.map((amount) => roundMilestonePercent(amount / total * 100));
                    percents[2] = roundMilestonePercent(100 - percents[0] - percents[1]);
                    amounts = amountsFromMilestonePercents(total, percents);
                } else {
                    const msg = 'Les jalons doivent faire 100 % du total. Pourcentages : ' + formatMilestonePercent(percentSum) + '. Montants : ' + formatMilestoneMoney(amountSum) + ' sur ' + formatMilestoneMoney(total) + '.';
                    if (window.lyannAlert) window.lyannAlert(msg);
                    else alert(msg);
                    return;
                }

                milestoneAmountInputs().forEach((input, index) => {
                    if (input) input.value = amounts[index].toFixed(2);
                });
                milestonePercentInputs().forEach((input, index) => {
                    if (input) input.value = String(percents[index]);
                });

                const [m1, m2, m3] = amounts;
                const [p1, p2, p3] = percents;

                const j1Title = document.getElementById('mdJ1Title')?.value.trim() || "Jalon 1 - Préparation";
                const j2Title = document.getElementById('mdJ2Title')?.value.trim() || "Jalon 2 - Intervention";
                const j3Title = document.getElementById('mdJ3Title')?.value.trim() || "Jalon 3 - Finalisation";

                const milestonesPayload = [
                    { title: j1Title, description: "Phase 1", amount: m1, percentage: p1 },
                    { title: j2Title, description: "Phase 2", amount: m2, percentage: p2 },
                    { title: j3Title, description: "Phase 3", amount: m3, percentage: p3 }
                ];

                try {
                    await createProductionQuoteForContact(currentChatContact.id, title, total, milestonesPayload);
                } catch (quoteErr) {
                    notifyQuoteUnavailable(quoteErr);
                    return;
                }

                // Clean & close
                if (titleInput) titleInput.value = '';
                if (totalInput) totalInput.value = '';
                [1, 2, 3].forEach((index) => {
                    const titleField = document.getElementById('mdJ' + index + 'Title');
                    const percentField = document.getElementById('mdJ' + index + 'Percent');
                    const amountField = document.getElementById('mdJ' + index + 'Amount');
                    if (titleField) titleField.value = '';
                    if (percentField) percentField.value = '';
                    if (amountField) amountField.value = '';
                });
                seedMilestoneDefaults();
                applyMilestoneAmountsFromPercents();
                closeAllOverlays();
                await refreshOpenBusinessCards();

                window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_PRICE', contactId: currentChatContact.id } }));
            } catch (err) {
                console.error("Error in milestoneDevisForm submit:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'envoi du devis : " + err.message);
                else alert("Erreur lors de l'envoi du devis : " + err.message);
            }
        });
    }

    // SUBMIT CHECKOUT PAYMENT
    const checkoutPaymentForm = document.getElementById('checkoutPaymentForm');
    if (checkoutPaymentForm) {
        checkoutPaymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const runConfirm = async () => {
                if (!window.LYANN_STRIPE || typeof window.LYANN_STRIPE.confirmCheckout !== 'function') {
                    notifyActionUnavailable({ message: 'Paiement indisponible : Stripe.js n’est pas chargé. Aucun versement n’a été confirmé.' });
                    return;
                }
                const confirmResult = await window.LYANN_STRIPE.confirmCheckout();
                if (confirmResult && confirmResult.error) notifyActionUnavailable(confirmResult.error);
            };
            if (!window.LYANN_STRIPE || typeof window.LYANN_STRIPE.confirmCheckout !== 'function') {
                try {
                    if (window.LYANN_FEATURES && typeof window.LYANN_FEATURES.ensure === 'function') {
                        await window.LYANN_FEATURES.ensure('stripeCheckout');
                    } else {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'lyann-stripe.js?v=20260922v';
                            script.addEventListener('load', resolve, { once: true });
                            script.addEventListener('error', () => reject(new Error('Stripe checkout unavailable')), { once: true });
                            document.head.appendChild(script);
                        });
                    }
                } catch (err) {
                    notifyActionUnavailable({ message: 'Paiement indisponible : Stripe.js n’a pas pu être chargé.' });
                    return;
                }
            }
            await runConfirm();
        });
    }

    const btnCancelCheckout = document.getElementById('btnCancelCheckout');
    if (btnCancelCheckout) {
        btnCancelCheckout.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    }

    const btnExitTracking = document.getElementById('btnExitTracking');
    if (btnExitTracking) {
        btnExitTracking.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    }

    // Conversation-list ownership moved to LYANN_MESSAGING + messaging-repository.js.
    // Keep only a compatibility bridge for old internal call sites during migration.
    window.renderChatContacts = async function renderChatContactsCompatibility() {
        if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.renderConversationList === 'function') {
            return window.LYANN_MESSAGING.renderConversationList();
        }
    };

    window.deleteConversation = async function deleteConversationCompatibility() {
        if (window.NotificationService?.showToast) {
            window.NotificationService.showToast('info', 'La suppression de conversation sera réactivée avec le stockage serveur.');
        }
        return false;
    };

    window.openLyannChatModal = function openLyannChatModalCompatibility() {
        if (window.LYANN_ROUTER) return window.LYANN_ROUTER.go('messages');
        if (window.LYANN_MESSAGING) return window.LYANN_MESSAGING.openList();
        return false;
    };
}

window.toggleChatAttachMenu = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('chatAttachMenu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

window.handleGuardedAttachment = function(type) {
    const menu = document.getElementById('chatAttachMenu');
    if (menu) menu.style.display = 'none';
    if (!currentChatContact) return;
    if (type === 'camera') {
        void captureChatPhoto();
        return;
    }
    if (type === 'file' || type === 'document') {
        chatPicker('document').click();
        return;
    }
    chatPicker('photo').click();
};

document.addEventListener('click', (e) => {
    const menu = document.getElementById('chatAttachMenu');
    if (menu && !e.target.closest('#chatAttachMenu') && !e.target.closest('#chatAttachBtn')) {
        menu.style.display = 'none';
    }
});

window.closeLyannChatModal = function (e) {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.close === 'function') {
        return window.LYANN_MESSAGING.close(e);
    }
    return false;
};

function initChatCloseBtn() {
    const closeTriggers = document.querySelectorAll('#closeChatModalBtn, .close-chat-modal-trigger, .chat-close-modal-btn');
    closeTriggers.forEach(btn => {
        if (btn.dataset.closeBound === 'true') return;
        btn.dataset.closeBound = 'true';
        btn.addEventListener('click', (e) => window.closeLyannChatModal(e));
    });
}

document.addEventListener('click', function(e) {
    const closeBtn = e.target.closest('#closeChatModalBtn, .close-chat-modal-trigger, .chat-close-modal-btn');
    if (closeBtn && closeBtn.closest('#chatModal')) {
        window.closeLyannChatModal(e);
    }
    // Conversation-list clicks are owned by LYANN_MESSAGING.renderConversationRows.
    // A second document listener here re-opened the chat with the visible name
    // whenever data-chat-member-id was absent, wiping the UUID conversation.
});

window.addEventListener('lyann_missions_updated', () => refreshOpenBusinessCards());

// === MOBILE KEYBOARD VISUAL VIEWPORT ADAPTATION ===
if (window.visualViewport) {
    const handleVisualViewportResize = () => {
        const modal = document.getElementById('chatModal');
        if (modal && (modal.classList.contains('active') || modal.style.display === 'flex')) {
            const modalCard = modal.querySelector('.modal-card-chat');
            if (modalCard) {
                // Shrink modal height to exact visible viewport above software keyboard
                modalCard.style.height = `${window.visualViewport.height}px`;
            }
            const msgScroll = document.getElementById('chatMessagesScroll') || document.querySelector('.chat-messages-scroll');
            if (msgScroll) {
                msgScroll.scrollTop = msgScroll.scrollHeight;
            }
        }
    };
    window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    window.visualViewport.addEventListener('scroll', handleVisualViewportResize);
}

// Safe startup execution. No chat DOM MutationObserver is allowed.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChatSubmitAndContacts();
        initChatCloseBtn();
    }, { once: true });
} else {
    initChatSubmitAndContacts();
    initChatCloseBtn();
}

// === FAVORITES MANAGEMENT FOR CHAT CONTACTS & MEMBERS ===
window.getLyannFavorites = function() {
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.getMyFavorites === 'function') {
        // Return active promise or cached state if needed
        return window.LyannFavoritesService.getMyFavorites();
    }
    return [];
};

window.shareProfile = async function(memberOrName, role) {
    const name = (typeof memberOrName === 'object' && memberOrName) ? (memberOrName.name || memberOrName.first_name || 'ce membre') : (memberOrName || 'ce membre');
    const memberRole = (typeof memberOrName === 'object' && memberOrName) ? (memberOrName.role || memberOrName.primary_activity || role || 'Lyanneur') : (role || 'Lyanneur');
    const shareText = `Découvrez le profil de ${name} (${memberRole}) sur LYANN !`;
    const shareUrl = window.location.href;

    let shared = false;
    if (typeof window.shareNative === 'function') {
        try { shared = await window.shareNative("Profil LYANN", shareText, shareUrl); } catch(e) {}
    } else if (navigator.share) {
        try {
            await navigator.share({ title: "Profil LYANN", text: shareText, url: shareUrl });
            shared = true;
        } catch (e) {
            shared = false;
        }
    }

    if (!shared && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(shareUrl);
            shared = true;
        } catch(e) {}
    }

    const msg = `🔗 Lien du profil de ${name} copié dans votre presse-papier !`;
    if (typeof window.showToast === 'function') window.showToast(msg, 'success');
    else if (typeof window.lyannAlert === 'function') window.lyannAlert(msg);
    else alert(msg);
};

window.isContactFavorite = function(contactId) {
    if (!contactId) return false;
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.isFavorite === 'function') {
        try {
            const isFav = window.LyannFavoritesService.isFavorite('PROFILE', contactId);
            if (typeof isFav === 'boolean') return isFav;
        } catch(e) {}
    }
    try {
        const localFavs = JSON.parse(localStorage.getItem('lyann_local_favorites') || '[]');
        return localFavs.includes(contactId);
    } catch(e) {
        return false;
    }
};

window.toggleContactFavorite = async function(contactId, contactName) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('favorite', { entityType: 'PROFILE', entityId: contactId || currentChatContact?.id })) return;
    const targetId = contactId || (currentChatContact ? currentChatContact.id : null);
    if (!targetId) return;
    const name = contactName || (currentChatContact ? currentChatContact.name : 'ce membre');
    let isNowFav = false;

    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.toggleFavorite === 'function') {
        try {
            const res = await window.LyannFavoritesService.toggleFavorite('PROFILE', targetId);
            if (res && typeof res.isFavorite === 'boolean') {
                isNowFav = res.isFavorite;
            } else {
                isNowFav = !window.isContactFavorite(targetId);
            }
        } catch(e) {
            isNowFav = !window.isContactFavorite(targetId);
        }
    } else {
        isNowFav = !window.isContactFavorite(targetId);
    }

    try {
        let localFavs = JSON.parse(localStorage.getItem('lyann_local_favorites') || '[]');
        if (isNowFav) {
            if (!localFavs.includes(targetId)) localFavs.push(targetId);
        } else {
            localFavs = localFavs.filter(id => id !== targetId);
        }
        localStorage.setItem('lyann_local_favorites', JSON.stringify(localFavs));
    } catch(e) {}

    const msg = isNowFav ? `⭐ ${name} ajouté(e) à vos favoris.` : `💔 ${name} retiré(e) de vos favoris.`;
    if (window.showToast) window.showToast(msg, isNowFav ? 'success' : 'info');
    else if (window.NotificationService && typeof window.NotificationService.showToast === 'function') {
        window.NotificationService.showToast(isNowFav ? 'success' : 'info', msg);
    } else if (window.lyannAlert) window.lyannAlert(msg);
    else alert(msg);

    if (typeof window.updateChatFavHeaderUI === 'function') {
        window.updateChatFavHeaderUI();
    }
};

window.updateChatFavHeaderUI = function() {
    if (!currentChatContact) return;
    const isFav = window.isContactFavorite(currentChatContact.id);
    const favIcon = document.getElementById('chatFavHeaderIcon');
    const dropAddFavBtn = document.getElementById('chatDropAddFavorite');
    
    if (favIcon) {
        if (isFav) {
            favIcon.className = 'ph-fill ph-heart';
            favIcon.style.color = 'var(--primary)';
        } else {
            favIcon.className = 'ph ph-heart';
            favIcon.style.color = 'var(--primary)';
        }
    }
    
    if (dropAddFavBtn) {
        dropAddFavBtn.innerHTML = isFav 
            ? `<i class="ph-fill ph-heart" style="color: var(--primary);"></i> Retirer des favoris`
            : `<i class="ph ph-heart" style="color: var(--primary);"></i> Ajouter aux favoris`;
    }
};

document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('#chatToggleFavoriteBtn, #chatDropAddFavorite, #shareFavoriteBtn, .btn-favorite, [data-action="favorite"]');
    if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
        const targetId = favBtn.dataset.contactId || (contact ? contact.id : null);
        const targetName = favBtn.dataset.contactName || (contact ? contact.name : 'ce membre');
        if (targetId) {
            window.toggleContactFavorite(targetId, targetName);
        }
    }

    const shareBtn = e.target.closest('#shareProfileBtn, .btn-share-profile, #chatDropShareProfile');
    if (shareBtn) {
        e.preventDefault();
        e.stopPropagation();
        const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT || window.currentVisitingMember;
        window.shareProfile(contact || 'ce membre');
    }

    const dateBtn = e.target.closest('#btnCtxDate, #bsActionDate, #btnChooseDate, #btnProposeDate, .btn-propose-date');
    if (dateBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeAllOverlays();
        const overlay = document.getElementById('chatProposeDateForm');
        if (overlay) {
            openChatChildSurface('chatProposeDateForm');
            setChatContextCoveredByOverlay(true);
            const firstRequired = overlay.querySelector('[required]');
            if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
        }
    }
});


// ---------------------------------------------------------
// SUPABASE REALTIME SUBSCRIPTIONS
// ---------------------------------------------------------
let chatSubscription = null;
let chatRealtimeGeneration = 0;
let realtimeEverConnected = false;
let realtimeDropped = false;
let catchUpPromise = null;
let readReceiptLogQueued = false;
let readBadgeQueued = false;

function isJsonMessageContent(text) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw.startsWith('{')) return false;
    try { JSON.parse(raw); return true; } catch (_) { return false; }
}

function reconcileLiveRow(row) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !row) return false;
    const messageId = row.id ? String(row.id) : '';
    if (messageId && container.querySelector(chatMessageSelector(messageId))) {
        if (row.is_read && row.sender_id === getMyId()) markOwnBubbleRead(messageId);
        return true;
    }
    const text = typeof row.content === 'string' ? row.content : '';
    const mine = row.sender_id && row.sender_id === getMyId();
    if (mine && currentChatContact) {
        if (messageId && pendingOptimisticFor(currentChatContact.id).length) {
            parkedLiveRows.set(messageId, row);
            return 'parked';
        }
        if (!messageId) {
            const pending = claimUniqueOptimistic(currentChatContact.id, text);
            if (pending) {
                settleOptimisticNode(pending, '');
                return true;
            }
        }
    }
    return false;
}

function appendLiveChatMessage(row, options = {}) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !row || !currentChatContact) return;
    const messageId = row.id ? String(row.id) : '';
    if (messageId && container.querySelector(chatMessageSelector(messageId))) return;
    const mine = row.sender_id && row.sender_id === getMyId();
    const text = typeof row.content === 'string' ? row.content : '';
    const attachmentType = row.attachment_type === 'photo' || row.attachment_type === 'document' ? row.attachment_type : '';
    if (!attachmentType && isJsonMessageContent(text)) return;
    const stick = Object.prototype.hasOwnProperty.call(options, 'stickToBottom') ? options.stickToBottom : threadIsNearBottom(container);
    if (!attachmentType && isQuoteAcceptedNotice(text)) {
        return;
        if (stick) scrollThreadToBottom(container, !options.quiet);
        return;
    }
    container.querySelector('.chat-empty-state')?.remove();
    if (!container.querySelector('.chat-date-separator')) {
        const dateSep = document.createElement('div');
        dateSep.className = 'chat-date-separator';
        const span = document.createElement('span');
        span.textContent = "Aujourd'hui";
        dateSep.appendChild(span);
        container.appendChild(dateSep);
    }
    const mapped = {
        id: row.id,
        text: text,
        sender: mine ? 'me' : 'them',
        timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        createdAt: row.created_at || null,
        type: row.message_type || attachmentType || 'text',
        messageType: row.message_type || '',
        entityType: row.entity_type || '',
        entityId: row.entity_id || '',
        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
        status: row.is_read ? 'read' : 'sent',
        attachmentPath: row.attachment_url || '',
        attachmentName: row.attachment_name || '',
        attachmentSize: row.attachment_size,
        attachmentMime: row.attachment_mime || ''
    };
    if (!attachmentType && isJsonMessageContent(text) && !isTimelineMessage(mapped)) return;
    const node = isTimelineMessage(mapped) ? renderTimelineCard(mapped) : createThreadBubble(mapped);
    if (!node) return;
    if (node.dataset.messageId && container.querySelector(chatMessageSelector(node.dataset.messageId))) return;
    placeThreadNode(container, node);
    const followed = !node.nextElementSibling || !node.nextElementSibling.dataset || !node.nextElementSibling.dataset.messageId;
    if (stick && followed) scrollThreadToBottom(container, !options.quiet);
}
window.appendLiveChatMessage = appendLiveChatMessage;

function liveRowFromMapped(msg, contactId) {
    return {
        id: msg.id,
        sender_id: msg.sender === 'me' ? getMyId() : contactId,
        content: msg.text || '',
        created_at: msg.createdAt || null,
        is_read: msg.status === 'read',
        attachment_type: msg.attachmentType || (msg.type === 'photo' || msg.type === 'document' ? msg.type : null),
        attachment_url: msg.attachmentPath || '',
        attachment_name: msg.attachmentName || '',
        attachment_size: msg.attachmentSize,
        attachment_mime: msg.attachmentMime || '',
        message_type: msg.messageType || (msg.type && msg.type !== 'text' ? msg.type : null),
        entity_type: msg.entityType || null,
        entity_id: msg.entityId || null,
        metadata: msg.metadata || null
    };
}

function placeLiveMessage(row, options = {}) {
    const outcome = reconcileLiveRow(row);
    if (outcome === 'parked') return 'parked';
    if (outcome) return 'reconciled';
    appendLiveChatMessage(row, options);
    return 'appended';
}

async function catchUpOpenThread(reason) {
    if (!currentChatContact?.id || !isUUID(currentChatContact.id)) return;
    if (catchUpPromise) return catchUpPromise;
    const contactId = currentChatContact.id;
    if (reason === 'foreground') console.log('[CHAT] foreground catchup');
    catchUpPromise = (async () => {
        const container = document.getElementById('chatMessagesContainer');
        if (!container || !currentChatContact || currentChatContact.id !== contactId) return;
        const placePage = (msgs, stick) => {
            (msgs || []).forEach((msg) => {
                if (!msg || msg.type === 'transactional') return;
                placeLiveMessage(liveRowFromMapped(msg, contactId), { stickToBottom: stick, quiet: true });
            });
        };
        if (!container.querySelector('.chat-msg-bubble-wrap, .chat-msg-card, .chat-empty-state')) {
            const msgs = await getChatMessages(contactId, { fresh: true, limit: 50 });
            if (!currentChatContact || currentChatContact.id !== contactId) return;
            await renderMessages(msgs);
            return;
        }
        const stick = threadIsNearBottom(container);
        let cursor = newestServerCursor(container);
        if (!cursor) {
            placePage(await getChatMessages(contactId, { fresh: true, limit: 50 }), stick);
            return;
        }
        let pages = 0;
        while (pages < 40 && currentChatContact && currentChatContact.id === contactId) {
            const batch = await getChatMessages(contactId, { fresh: true, limit: 50, after: cursor });
            pages += 1;
            if (!Array.isArray(batch) || !batch.length) break;
            placePage(batch, stick);
            const last = batch[batch.length - 1];
            if (!last?.id || !last.createdAt) break;
            const next = { createdAt: last.createdAt, id: String(last.id) };
            if (compareCursor(next, cursor) <= 0) break;
            cursor = next;
            if (batch.length < 50) break;
        }
    })().finally(() => { catchUpPromise = null; });
    return catchUpPromise;
}

async function noteChatPreview(userId, row, contactId) {
    const unread = !!(row.sender_id && row.sender_id !== userId && !contactId);
    const extra = {
        attachment_type: row.attachment_type || null,
        attachment_name: row.attachment_name || '',
        unread
    };
    let noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, row.conversation_id, row.content, row.created_at, extra);
    if (!noted && userId && row.conversation_id) {
        noted = await window.LYANN_MESSAGING_REPOSITORY?.ensureInboxConversation?.(userId, row.conversation_id, {
            content: row.content,
            createdAt: row.created_at,
            ...extra
        });
    }
    const preview = noted?.preview || window.LYANN_MESSAGING_REPOSITORY?.formatMessagePreview?.(row) || inboxPreviewText(row.content);
    publishChatActivity({
        contactId: noted?.contactId || contactId || null,
        preview,
        conversationId: row.conversation_id,
        lastMessageAt: row.created_at || null,
        unread: noted ? !!noted.unread : unread,
        name: noted?.name || '',
        avatar: noted?.avatar || ''
    });
}

function setupRealtime() {
    if (!window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) return;
    if (chatSubscription) return;
    const supabase = window.LYANN_API_CLIENT.supabase;
    const generation = ++chatRealtimeGeneration;

    chatSubscription = supabase.channel('lyann-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const row = payload?.new;
            if (!row) return;
            console.log('[CHAT] realtime insert');
            const userId = getMyId();
            const convId = row.conversation_id;
            const mineOrContact = currentChatContact && (row.sender_id === userId || row.sender_id === currentChatContact.id);
            const openHere = mineOrContact && (!currentChatContact.conversationId || currentChatContact.conversationId === convId);
            if (openHere) {
                if (convId && !currentChatContact.conversationId) currentChatContact.conversationId = convId;
                window.LYANN_MESSAGING_REPOSITORY?.invalidateMessages?.(convId);
                const placed = placeLiveMessage(row);
                if (placed === 'reconciled') console.log('[CHAT] reconciled');
            } else if (userId) {
                window.LYANN_MESSAGING_REPOSITORY?.invalidateMessages?.(convId);
            }
            void noteChatPreview(userId, row, openHere ? currentChatContact.id : null);
            if (row.sender_id && row.sender_id !== userId) {
                if (openHere && window.LYANN_MESSAGING_REPOSITORY?.markConversationRead && currentChatContact?.id) {
                    window.LYANN_MESSAGING_REPOSITORY.markConversationRead(userId, currentChatContact.id).catch(() => {});
                } else if (typeof window.refreshMessageBadge === 'function') {
                    window.refreshMessageBadge(userId);
                }
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
            const row = payload?.new;
            if (!row || row.is_read !== true || !row.id) return;
            const userId = getMyId();
            if (row.sender_id !== userId) {
                const listed = window.LYANN_MESSAGING_REPOSITORY?.peekConversations?.(userId) || [];
                listed.forEach((item) => {
                    if (item.conversationId === row.conversation_id) item.unread = false;
                });
                window.dispatchEvent(new CustomEvent('lyann:chat-read', { detail: { conversationId: row.conversation_id, userId } }));
                if (!readBadgeQueued && typeof window.refreshMessageBadge === 'function') {
                    readBadgeQueued = true;
                    const badgeUser = userId;
                    queueMicrotask(() => {
                        readBadgeQueued = false;
                        window.refreshMessageBadge(badgeUser);
                    });
                }
                return;
            }
            if (!currentChatContact) return;
            if (currentChatContact.conversationId && row.conversation_id !== currentChatContact.conversationId) return;
            if (!markOwnBubbleRead(row.id)) return;
            if (readReceiptLogQueued) return;
            readReceiptLogQueued = true;
            queueMicrotask(() => {
                readReceiptLogQueued = false;
                console.log('[CHAT] realtime update read');
            });
        })
        .subscribe((status) => {
            if (generation !== chatRealtimeGeneration) return;
            if (status === 'SUBSCRIBED') {
                if (realtimeDropped) {
                    console.log('[CHAT] realtime reconnected');
                    realtimeDropped = false;
                    catchUpOpenThread('reconnect');
                    if (typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(getMyId());
                }
                realtimeEverConnected = true;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                if (realtimeEverConnected) realtimeDropped = true;
            }
        });
}

if (window.LYANN_AUTH_STATE?.getSnapshot?.().status === 'ready') setupRealtime();
else window.addEventListener('lyann:auth-ready', setupRealtime, { once: true });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    catchUpOpenThread('foreground');
});
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const photoViewerModal = document.getElementById('chatPhotoViewerModal');
    if (photoViewerModal && photoViewerModal.style.display !== 'none') photoViewerModal.style.display = 'none';
});
window.addEventListener('online', () => {
    catchUpOpenThread('reconnect');
    if (typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(getMyId());
});

// =============================================================================
// LYANN STEP 19 — ESPACE MISSION UI & JALONS CONTROLLER
// =============================================================================
window.openMissionDetailsModal = async function(missionId) {
    if (!missionId) return;
    const modal = document.getElementById('missionDetailsModal');
    if (!modal) return;

    modal.style.display = 'flex';

    const titleEl = document.getElementById('missionModalTitle');
    const badgeEl = document.getElementById('missionModalStatusBadge');
    const amountEl = document.getElementById('missionModalTotalAmount');
    const textEl = document.getElementById('missionModalProgressionText');
    const barEl = document.getElementById('missionModalProgressBar');
    const startPane = document.getElementById('missionStartActionPane');
    const listEl = document.getElementById('missionModalMilestonesList');

    if (listEl) listEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px;">Chargement des jalons...</p>';

    if (!window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.getMissionDetailsSecure !== 'function') {
        if (listEl) listEl.innerHTML = '<p style="font-size:0.85rem; color:red;">Client API indisponible</p>';
        return;
    }

    const res = await window.LYANN_API_CLIENT.getMissionDetailsSecure(missionId);
    if (res.error || !res.data) {
        if (listEl) listEl.innerHTML = `<p style="font-size:0.85rem; color:red;">${res.error?.message || 'Erreur de chargement'}</p>`;
        return;
    }

    const { user_role, mission, milestones, stats } = res.data;

    if (titleEl) titleEl.textContent = mission.title || 'Mission LYANN';
    if (badgeEl) {
        badgeEl.textContent = mission.status === 'AGREED' ? 'ACCORD CONCLU' :
                              mission.status === 'IN_PROGRESS' ? 'EN COURS' :
                              mission.status === 'COMPLETED' ? 'TERMINÉE' : mission.status;
    }
    if (amountEl) amountEl.textContent = `${mission.total_amount || 0} €`;

    const total = stats.total || 0;
    const validated = stats.validated || 0;
    const percent = total > 0 ? Math.round((validated / total) * 100) : 0;

    if (textEl) textEl.textContent = `${validated} / ${total} validés`;
    if (barEl) barEl.style.width = `${percent}%`;

    // Start Mission Button (Helper + AGREED)
    if (startPane) {
        if (user_role === 'HELPER' && mission.status === 'AGREED') {
            startPane.style.display = 'block';
            const btnStart = document.getElementById('btnStartMissionAction');
            if (btnStart) {
                btnStart.onclick = async () => {
                    const startRes = await window.LYANN_API_CLIENT.startMissionSecure(missionId);
                    if (startRes.error) {
                        alert('⚠️ ' + startRes.error.message);
                    } else {
                        if (window.lyannAlert) window.lyannAlert('🚀 Mission démarrée ! Les travaux sont désormais en cours.');
                        window.openMissionDetailsModal(missionId);
                    }
                };
            }
        } else {
            startPane.style.display = 'none';
        }
    }

    // Milestones Render
    if (listEl) {
        if (!milestones || milestones.length === 0) {
            listEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center;">Aucun jalon configuré sur ce devis.</p>';
            return;
        }

        listEl.innerHTML = milestones.map((m, idx) => {
            const isDone = m.status === 'COMPLETED' || m.status === 'VALIDATED' || m.status === 'RELEASED';
            const isValidated = m.status === 'VALIDATED' || m.status === 'RELEASED';

            let actionBtnHtml = '';
            if (user_role === 'HELPER' && (m.status === 'PENDING' || m.status === 'IN_PROGRESS')) {
                actionBtnHtml = `<button type="button" class="btn btn-outline" onclick="window.handleMarkMilestoneDone('${m.id}', '${missionId}')" style="font-size:0.8rem; padding:4px 10px; font-weight:700;"><i class="ph ph-check"></i> Marquer comme effectué</button>`;
            } else if (user_role === 'REQUESTER' && m.status === 'COMPLETED') {
                actionBtnHtml = `<button type="button" class="btn btn-primary" onclick="window.handleValidateMilestone('${m.id}', '${missionId}')" style="font-size:0.8rem; padding:4px 10px; font-weight:700; background:#10B981; border:none;"><i class="ph ph-check-circle"></i> Valider le travail</button>`;
            } else if (isValidated) {
                actionBtnHtml = `<span style="font-size:0.8rem; font-weight:800; color:#10B981;"><i class="ph ph-check-fat"></i> Validé ✔</span>`;
            } else if (isDone) {
                actionBtnHtml = `<span style="font-size:0.8rem; font-weight:700; color:#F59E0B;"><i class="ph ph-clock"></i> À valider par le client</span>`;
            } else {
                actionBtnHtml = `<span style="font-size:0.8rem; color:var(--text-muted);">À venir</span>`;
            }

            return `
                <div style="background:white; border:1px solid var(--border); border-radius:14px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div>
                        <div style="font-size:0.9rem; font-weight:800; color:#1F3827;">${idx + 1}. ${m.title}</div>
                        ${m.description ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${m.description}</div>` : ''}
                        <div style="font-size:0.85rem; font-weight:700; color:#059669; margin-top:4px;">${m.amount} €</div>
                    </div>
                    <div>
                        ${actionBtnHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
};

window.handleMarkMilestoneDone = async function(milestoneId, missionId) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('missionAction', { missionId, milestoneId, contactId: currentChatContact?.id })) return;
    if (!milestoneId) return;
    const res = await window.LYANN_API_CLIENT.markMilestoneDoneSecure(milestoneId);
    if (res.error) {
        alert('⚠️ ' + res.error.message);
    } else {
        if (window.lyannAlert) window.lyannAlert('✅ Jalon marqué comme effectué ! Le demandeur a été notifié pour validation.');
        window.openMissionDetailsModal(missionId);
    }
};

window.handleValidateMilestone = async function(milestoneId, missionId) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('missionAction', { missionId, milestoneId, contactId: currentChatContact?.id })) return;
    if (!milestoneId) return;
    const res = await window.LYANN_API_CLIENT.validateMilestoneSecure(milestoneId);
    if (res.error) {
        alert('⚠️ ' + res.error.message);
    } else {
        if (res.data?.mission_completed) {
            if (window.lyannAlert) window.lyannAlert('🎉 Félicitations ! Tous les jalons ont été validés. La mission est désormais TERMINÉE !');
        } else {
            if (window.lyannAlert) window.lyannAlert('👍 Jalon validé avec succès !');
        }
        window.openMissionDetailsModal(missionId);
    }
};

