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

window.isUserBlocked = function(idOrName) {
    if (!idOrName) return false;
    const list = window.getBlockedUsers();
    return list.some(item => (typeof item === 'string' ? item === idOrName : (item.id === idOrName || item.name === idOrName)));
};

window.blockUser = function(contactId, contactName) {
    if (!contactId && !contactName) return;
    const name = contactName || (currentChatContact ? currentChatContact.name : 'Ce membre');
    const id = contactId || (currentChatContact ? currentChatContact.id : name);

    let list = window.getBlockedUsers();
    if (!list.some(item => (typeof item === 'string' ? item === id : item.id === id))) {
        list.push({ id, name, timestamp: new Date().toISOString() });
        localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));
    }

    if (window.lyannAlert) {
        window.lyannAlert(`🔒 ${name} est désormais bloqué.\n\nCet utilisateur ne peut plus vous envoyer de messages ni interagir avec vos offres. Vous pouvez le débloquer à tout moment.`);
    }

    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.renderChatContacts === 'function') window.renderChatContacts();
};

window.unblockUser = function(contactId) {
    if (!contactId) return;
    let list = window.getBlockedUsers();
    list = list.filter(item => (typeof item === 'string' ? item !== contactId : item.id !== contactId && item.name !== contactId));
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));

    if (window.lyannAlert) {
        window.lyannAlert(`🔓 L'utilisateur a été débloqué avec succès.`);
    }

    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.renderChatContacts === 'function') window.renderChatContacts();
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
    const time = typeof msgObj.timestamp === 'number'
        ? new Date(msgObj.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : (msgObj.timestamp || '');
    meta.textContent = time + ' · Envoi…';
    meta.dataset.optimisticStatus = 'sending';
    bubble.appendChild(meta);

    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return wrapper;
}

async function addMessageToContact(contactId, msgObj) {
    const userId = getMyId();
    const normalizedMsg = {
        ...msgObj,
        id: msgObj && msgObj.id ? msgObj.id : ('optimistic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
        sender: (msgObj && msgObj.sender) || 'me',
        timestamp: (msgObj && msgObj.timestamp) || Date.now()
    };

    // Immediate local response: never make the user wait for Supabase before seeing their text.
    const optimisticNode = normalizedMsg.type === 'text' ? renderOptimisticChatMessage(normalizedMsg) : null;

    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_API_CLIENT?.supabase) {
        if (optimisticNode && optimisticNode.isConnected) {
            const status = optimisticNode.querySelector('[data-optimistic-status]');
            if (status) status.textContent = 'Non envoyé · connexion requise';
            optimisticNode.classList.add('chat-message-send-failed');
        }
        return;
    }

    try {
        const { data: convRes } = await window.LYANN_API_CLIENT.getOrCreateConversation(userId, contactId);
        if (!convRes || !convRes.id) {
            throw new Error("Impossible d'initialiser la conversation.");
        }

        const sharedConvId = convRes.id;
        const contentToSave = normalizedMsg.type === 'transactional' ? JSON.stringify(normalizedMsg.txData) : normalizedMsg.text;
        const { error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, userId, contentToSave);
        if (sendErr) throw sendErr;

        if (window.LYANN_MESSAGING_REPOSITORY) {
            window.LYANN_MESSAGING_REPOSITORY.invalidateMessages(sharedConvId);
        }

        if (currentChatContact && currentChatContact.id === contactId) {
            await renderMessages();
        }
    } catch(e) {
        console.warn("Supabase message send failed:", e);
        if (optimisticNode && optimisticNode.isConnected) {
            const status = optimisticNode.querySelector('[data-optimistic-status]');
            if (status) {
                const time = typeof normalizedMsg.timestamp === 'number'
                    ? new Date(normalizedMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : (normalizedMsg.timestamp || '');
                status.textContent = time + ' · Non envoyé';
                status.dataset.optimisticStatus = 'failed';
            }
            optimisticNode.classList.add('chat-message-send-failed');
        }
    }
}
window.addMessageToContact = addMessageToContact;

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
    
    // Safety gate: If contactId is a request UUID, resolve the true requester_id first
    if (contactId && isUUID(contactId) && window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
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

    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getUserProfile === 'function' && contactId && isUUID(contactId)) {
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
    window.LYANN_ACTIVE_CHAT_CONTACT = { ...currentChatContact };
    
    try {
        localStorage.setItem('lyann_last_active_contact', JSON.stringify({ id: contactId, name: displayName, avatar: displayAvatar }));
    } catch(e) {}

    // Link conversation to request in DB safely via initiateLyannHelp (Step 17.4 Security Gate)
    if (initialNeed && initialNeed.requestId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.initiateLyannHelp === 'function') {
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

window.refreshChatUI = async function () {
    if (!currentChatContact) return;

    if (typeof window.updateChatFavHeaderUI === 'function') {
        window.updateChatFavHeaderUI();
    }

    // Start message rendering immediately; mission/request context can resolve in parallel.
    const messagesPromise = renderMessages();

    const myUserId = getMyId();
    let sharedConvId = currentChatContact.conversationId;
    if (!sharedConvId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getOrCreateConversation === 'function' && currentChatContact.id && currentChatContact.id !== 'me') {
        try {
            const convRes = await window.LYANN_API_CLIENT.getOrCreateConversation(myUserId, currentChatContact.id);
            if (convRes && convRes.data && convRes.data.id) {
                sharedConvId = convRes.data.id;
                currentChatContact.conversationId = sharedConvId;
            }
        } catch(e) {}
    }

    // 1. Fetch persistent request context for this conversation from request_invitations / requests
    let requestContext = null;
    const reqHint = (currentChatContact && currentChatContact.requestId) ? currentChatContact.requestId : null;
    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getConversationRequestContext === 'function') {
        requestContext = await window.LYANN_API_CLIENT.getConversationRequestContext(sharedConvId, reqHint);
    }

    // 2. Fetch active mission (if any)
    let mission = null;
    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getActiveMissionBetween === 'function') {
        mission = await window.LYANN_API_CLIENT.getActiveMissionBetween(myUserId, currentChatContact.id);
    }

    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    const bannerTitle = document.getElementById('chatBannerTitle');
    const bannerMeta = document.getElementById('chatBannerMeta');
    const dropViewMission = document.getElementById('chatDropViewMission');

    if (requestContext && requestContext.request) {
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
        if (dropViewMission) dropViewMission.style.display = 'flex';
    } else if (mission) {
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
        if (banner) banner.style.display = 'none';
        if (dropViewMission) dropViewMission.style.display = 'none';
    }

    // Hide floating separate actions toolbar completely (actions are integrated into the Context Card)
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) {
        actionContainer.style.display = 'none';
    }

    await messagesPromise;
}

window.handleAcceptQuote = async function(quoteId) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { quoteId, contactId: currentChatContact?.id })) return;
    if (!quoteId) return;
    try {
        if (window.lyannConfirm) {
            const ok = await window.lyannConfirm("Confirmez-vous l'acceptation de ce devis ? Une mission sera créée.");
            if (!ok) return;
        }
        const res = await window.LYANN_API_CLIENT.acceptRequestQuote(quoteId);
        console.log("⚡ Devis accepté avec succès via RPC Supabase:", res);
        if (window.lyannAlert) {
            window.lyannAlert("✅ Devis accepté ! La mission a été créée.");
        }
        if (typeof window.refreshChatUI === 'function') {
            await window.refreshChatUI();
        }
    } catch(err) {
        console.error("Erreur lors de l'acceptation du devis:", err);
        const msg = err.message || err.details || "Erreur lors de l'acceptation.";
        if (window.lyannAlert) window.lyannAlert("⚠️ " + msg);
        else alert("⚠️ " + msg);
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
        const res = await window.LYANN_API_CLIENT.rejectRequestQuote(quoteId);
        console.log("⚡ Devis refusé via RPC Supabase:", res);
        if (window.lyannAlert) {
            window.lyannAlert("Devis refusé.");
        }
        if (typeof window.refreshChatUI === 'function') {
            await window.refreshChatUI();
        }
    } catch(err) {
        console.error("Erreur lors du refus du devis:", err);
        const msg = err.message || err.details || "Erreur lors du refus.";
        if (window.lyannAlert) window.lyannAlert("⚠️ " + msg);
        else alert("⚠️ " + msg);
    }
};

async function handleChatAction(actionId, missionOrExtra = null, extraDataInput = null) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { actionId, contactId: currentChatContact?.id, requestId: currentChatContact?.requestId })) return;
    const extraData = (missionOrExtra && missionOrExtra.quoteId) ? missionOrExtra : (extraDataInput || {});
    const mission = (missionOrExtra && !missionOrExtra.quoteId) ? missionOrExtra : null;
    const contactId = currentChatContact ? currentChatContact.id : null;
    if (!contactId) return;

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

            if (window.LYANN_API_CLIENT) window.LYANN_API_CLIENT.mockProposePrice(getMyId(), contactId, parseFloat(amount), desc);
            addMessageToContact(contactId, {
                type: 'system_card',
                cardType: 'PRICE_PROPOSAL',
                sender: getMyId(),
                amount: parseFloat(amount),
                title: desc,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            refreshChatUI();
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
            refreshChatUI();
        }
        return;
    }

    else if (actionId === 'REQUEST_HELP') {
        const desc = await window.lyannPrompt("De quoi avez-vous besoin ? (ex: Aide au déménagement, réparation fuite)");
        if (!desc) return;
        if (window.LYANN_API_CLIENT) {
            await window.LYANN_API_CLIENT.mockCreateNeed(getMyId(), contactId, desc);
        }
        addMessageToContact(contactId, {
            type: 'text',
            sender: getMyId(),
            text: `🤝 Demande d'aide : "${desc}"`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        refreshChatUI();
        return;
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
        let acceptRes = null;
        const propId = extraData.proposalId || (missionOrExtra && missionOrExtra.proposalId) || (extraData && extraData.quoteId);
        if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.acceptProposalSecure === 'function' && propId) {
            try {
                const res = await window.LYANN_API_CLIENT.acceptProposalSecure(propId);
                if (res && res.error) {
                    if (window.lyannAlert) window.lyannAlert(res.error.message || res.error);
                    return;
                }
                console.log("⚡ Proposition acceptée via RPC Supabase Production:", res);
                if (typeof window.showToast === 'function') window.showToast("Proposition acceptée ! La mission est activée.", "success");
                refreshChatUI();
                return;
            } catch (err) {
                console.warn("Erreur acceptation Proposition Supabase:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'acceptation : " + (err.message || err));
                return;
            }
        } else if (mission && window.LYANN_API_CLIENT) {
            await window.LYANN_API_CLIENT.mockAcceptPrice(mission.id, getMyId());
        }

        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'AGREEMENT_REACHED',
            amount: acceptRes ? acceptRes.total_amount : (mission ? mission.agreed_price : 0),
            title: mission ? mission.title : 'Prestation convenue',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        refreshChatUI();
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
        refreshChatUI();
    }

    else if (actionId === 'PAY_MISSION') {
        const coPrestationTitle = document.getElementById('coPrestationTitle');
        const coDevisAmount = document.getElementById('coDevisAmount');
        const coLyannFee = document.getElementById('coLyannFee');
        const coAssuranceFee = document.getElementById('coAssuranceFee');
        const coTotalAmount = document.getElementById('coTotalAmount');

        const agreedPrice = mission ? mission.agreed_price : 50;
        const title = mission ? mission.title : 'Intervention LYANN';

        if (coPrestationTitle) coPrestationTitle.textContent = title;
        if (coDevisAmount) coDevisAmount.textContent = `${agreedPrice.toFixed(2)} €`;

        const fee = agreedPrice * 0.03;
        if (coLyannFee) coLyannFee.textContent = `${fee.toFixed(2)} €`;

        const assuranceCheck = document.getElementById('coAssuranceCheck');
        const hasAssurance = assuranceCheck ? assuranceCheck.checked : true;
        const prot = hasAssurance ? agreedPrice * 0.07 : 0;
        if (coAssuranceFee) coAssuranceFee.textContent = `${prot.toFixed(2)} €`;

        if (coTotalAmount) coTotalAmount.textContent = `${(agreedPrice + fee + prot).toFixed(2)} €`;

        closeAllOverlays();
        const chatCheckoutOverlay = document.getElementById('chatCheckoutOverlay');
        if (chatCheckoutOverlay) {
            openChatChildSurface('chatCheckoutOverlay');
        } else {
            if (mission && window.LYANN_API_CLIENT) window.LYANN_API_CLIENT.mockPayMission(mission.id);
            addMessageToContact(contactId, {
                type: 'system_card',
                cardType: 'PAYMENT_CONFIRMED',
                amount: agreedPrice,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            refreshChatUI();
        }
        return;
    }

    else if (actionId === 'MARK_DONE') {
        if (mission && window.LYANN_API_CLIENT) window.LYANN_API_CLIENT.mockMarkMissionDone(mission.id);
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'WORK_DONE',
            title: mission ? mission.title : 'Travaux',
            sender: getMyId(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'CONFIRM_DONE') {
        if (mission && window.LYANN_API_CLIENT) window.LYANN_API_CLIENT.mockConfirmMissionCompletion(mission.id);
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'MISSION_COMPLETED',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'LEAVE_REVIEW') {
        closeAllOverlays();
        const overlay = document.getElementById('chatLeaveReviewForm');
        if (overlay) overlay.style.display = 'flex';
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
        if (mission && window.LYANN_API_CLIENT) window.LYANN_API_CLIENT.mockReportProblem(mission.id);
        addMessageToContact(contactId, {
            type: 'text',
            sender: getMyId(),
            text: `⚠️ Signalement de litige : ${reason}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    refreshChatUI();
    window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId, contactId } }));
}

window.deleteMessage = function(msgId) {
    if (!currentChatContact || !msgId) return;
    const contactId = currentChatContact.id;
    let storedMsgs = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) storedMsgs = JSON.parse(stored);
    } catch(e) {}
    
    if (storedMsgs[contactId]) {
        storedMsgs[contactId] = storedMsgs[contactId].filter(m => m.id !== msgId);
        localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(storedMsgs));
        renderMessages();
        renderChatContacts();
    }
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
    if (!currentChatContact || !msgId) return;
    const contactId = currentChatContact.id;
    let storedMsgs = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) storedMsgs = JSON.parse(stored);
    } catch(e) {}
    
    const msgs = storedMsgs[contactId] || [];
    const msg = msgs.find(m => m.id === msgId);
    if (msg) {
        if (!msg.reactions) msg.reactions = {};
        if (msg.reactions[emoji]) {
            delete msg.reactions[emoji];
        } else {
            msg.reactions[emoji] = 1;
        }
        localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(storedMsgs));
        renderMessages();
    }
};

function renderEmptyConversationState(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="chat-empty-state">
            <i class="ph ph-chat-circle-dots"></i>
            <h4 style="font-weight: 700; color: #1E2822; margin: 8px 0 4px 0;">Commencez l’échange</h4>
            <p style="color: #64748B; font-size: 0.88rem; margin: 0;">Présentez-vous ou posez une question à propos de ce Lyann.</p>
        </div>
    `;
}

let chatRenderGeneration = 0;

async function renderMessages(passedMessages = null) {
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
    if (!Array.isArray(msgs)) {
        msgs = await getChatMessages(currentChatContact.id);
    }

    console.log('[CHAT FINAL ARRAY]', msgs);
    console.trace('[CHAT RENDER CALL]');

    // Quote context is prepared by the shared messaging repository in one cached batch.
    let realQuotes = [];
    if (window.LYANN_MESSAGING_REPOSITORY && isUUID(currentChatContact.id)) {
        try {
            realQuotes = await window.LYANN_MESSAGING_REPOSITORY.getQuoteContext(getMyId(), currentChatContact.id);
        } catch(err) {
            console.warn("Erreur chargement contexte devis:", err);
        }
    }

    // Ignore stale async renders. A newer refresh already owns the DOM.
    if (renderGeneration !== chatRenderGeneration) return;

    // Commit the fully prepared conversation in one DOM swap. Until this point, the old
    // messages (including an optimistic outgoing message) stay visible.
    container.innerHTML = '';

    if (!Array.isArray(msgs) || (msgs.length === 0 && realQuotes.length === 0)) {
        renderEmptyConversationState(container);
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

        const checkIcon = isMe ? `<span class="chat-msg-status read" title="Vu"><i class="ph ph-checks"></i> Vu</span>` : '';

        // Quoted block HTML
        let quotedHTML = '';
        if (msg.replyToAuthor && msg.replyToText) {
            quotedHTML = `<div class="chat-quoted-block"><strong>${msg.replyToAuthor}</strong>: ${msg.replyToText}</div>`;
        }

        // Reactions HTML
        let reactionsHTML = '';
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            reactionsHTML = `<div class="chat-msg-reactions">` + 
                Object.keys(msg.reactions).map(e => `<span class="chat-reaction-badge" onclick="window.toggleMessageReaction('${msgId}', '${e}')">${e} ${msg.reactions[e]}</span>`).join('') +
                `</div>`;
        }

        // Action bar (Reply + Delete)
        const escapedText = (msg.text || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const authorName = isMe ? 'Vous' : (currentChatContact ? currentChatContact.name : 'Membre');
        const deleteBtnHTML = isMe ? `<button type="button" class="chat-msg-act-btn danger" onclick="window.deleteMessage('${msgId}')" title="Supprimer ce message"><i class="ph ph-trash"></i></button>` : '';
        const actionBarHTML = `
            <div class="chat-msg-action-bar">
                <button type="button" class="chat-msg-act-btn" onclick="window.quoteMessage('${msgId}', '${authorName}', '${escapedText}')" title="Répondre"><i class="ph ph-arrow-u-up-left"></i></button>
                ${deleteBtnHTML}
            </div>
        `;

        wrapper.className = `chat-msg-bubble-wrap ${isMe ? 'sent' : 'received'}`;

        if (msg.type === 'text') {
            wrapper.innerHTML = `
                <div class="chat-msg-bubble ${isMe ? 'sent' : 'received'}">
                    ${quotedHTML}
                    ${msg.text}
                    <div class="chat-msg-time">${timeStr} ${checkIcon}</div>
                    ${reactionsHTML}
                </div>
                ${actionBarHTML}
            `;
            container.appendChild(wrapper);
        }
        else if (msg.type === 'photo') {
            wrapper.innerHTML = `
                <div class="chat-msg-bubble ${isMe ? 'sent' : 'received'}">
                    ${quotedHTML}
                    <div class="chat-msg-photo-wrap" onclick="window.openPhotoLightbox('${msg.photoUrl}')">
                        <img src="${msg.photoUrl}" alt="Photo" class="chat-msg-photo">
                    </div>
                    <div class="chat-msg-time">${timeStr} ${checkIcon}</div>
                    ${reactionsHTML}
                </div>
                ${actionBarHTML}
            `;
            container.appendChild(wrapper);
        }
        else if (msg.type === 'document') {
            wrapper.innerHTML = `
                <div class="chat-msg-bubble ${isMe ? 'sent' : 'received'}">
                    ${quotedHTML}
                    <div class="chat-msg-doc-card">
                        <i class="ph ph-file-pdf chat-msg-doc-icon"></i>
                        <div>
                            <div class="chat-msg-doc-name">${msg.docName || 'Document.pdf'}</div>
                            <div class="chat-msg-doc-meta">${msg.docSize || 'PDF · 280 Ko'}</div>
                        </div>
                    </div>
                    <div class="chat-msg-time">${timeStr} ${checkIcon}</div>
                    ${reactionsHTML}
                </div>
                ${actionBarHTML}
            `;
            container.appendChild(wrapper);
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
                    <div class="chat-card-header"><i class="ph ph-lightning"></i> PROPOSITION · ${name.toUpperCase()}</div>
                    <div class="chat-card-body">
                        <div style="font-size: 1.05rem; font-weight: 700; color: var(--text);">${msg.title}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                        ${inlineActions}
                    </div>
                `;

                setTimeout(() => {
                    const accBtn = div.querySelector('.btn-accept-inline');
                    const ctrBtn = div.querySelector('.btn-counter-inline');
                    if (accBtn) {
                        accBtn.onclick = () => handleChatAction('ACCEPT_PRICE', { title: msg.title, agreed_price: msg.amount, id: 'm_' + Date.now() });
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
                        <div>${msg.title}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                        ${inlinePay}
                    </div>
                `;
                setTimeout(() => {
                    const payBtn = div.querySelector('.btn-pay-inline');
                    if (payBtn) payBtn.onclick = () => handleChatAction('PAY_MISSION', { title: msg.title, agreed_price: msg.amount, id: 'm_' + Date.now() });
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
                    <div class="chat-card-header"><i class="ph ph-flag-checkered"></i> ${name}</div>
                    <div class="chat-card-body">
                        <div>Veuillez valider la fin de la mission pour déclencher le versement.</div>
                        ${confirmBtn}
                    </div>
                `;
                setTimeout(() => {
                    const cBtn = div.querySelector('.btn-confirm-work');
                    if (cBtn) cBtn.onclick = () => handleChatAction('CONFIRM_DONE', { id: 'm_' + Date.now() });
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
    realQuotes.forEach(q => {
        const isMyQuote = q.helper_id === getMyId();
        const quoteDiv = document.createElement('div');
        quoteDiv.className = `chat-msg-card ${isMyQuote ? 'align-right' : 'align-left'}`;
        quoteDiv.style.cssText = 'width: 100%; max-width: 440px; border: 1.5px solid var(--border); border-radius: 16px; background: #ffffff; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); margin: 12px 0;';

        const quoteNum = q.quote_number || ('DEV-' + q.id.slice(0, 8).toUpperCase());
        const providerName = isMyQuote ? 'Vous (Prestataire)' : `${currentChatContact.name}`;
        
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
                                <strong style="color: var(--text);">${m.title}</strong>
                                ${m.description ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${m.description}</div>` : ''}
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
            actionsHTML = `
                <div style="font-size: 0.85rem; color: #15803d; font-weight: 700; text-align: center; margin-top: 8px; padding: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                    <i class="ph ph-check-circle"></i> Devis Accepté · Mission Créée
                </div>
            `;
        } else if (q.status === 'REJECTED') {
            actionsHTML = `
                <div style="font-size: 0.85rem; color: #b91c1c; font-weight: 700; text-align: center; margin-top: 8px; padding: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                    <i class="ph ph-x-circle"></i> Devis Refusé
                </div>
            `;
        }

        quoteDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 10px;">
                <div>
                    <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--text-muted); letter-spacing: 0.5px;">${quoteNum}</div>
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary-dark);">Prestataire : ${providerName}</div>
                </div>
                <span style="font-weight: 800; font-size: 0.72rem; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; ${statusBadgeClass}">${q.status}</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--text); margin-bottom: 4px;">${q.description || 'Devis détaillé'}</div>
            <div style="font-size: 1.3rem; font-weight: 900; color: var(--primary); margin-bottom: 8px;">${q.total_amount} €</div>
            ${q.valid_until ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;"><i class="ph ph-calendar"></i> Valable jusqu'au ${new Date(q.valid_until).toLocaleDateString('fr-FR')}</div>` : ''}
            ${milestonesHTML}
            ${actionsHTML}
        `;
        container.appendChild(quoteDiv);
    });

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
                <div>🚫 <strong>${currentChatContact.name}</strong> est désormais bloqué.</div>
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

    container.scrollTop = container.scrollHeight;
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
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });

        input.addEventListener('focus', function () {
            const container = document.getElementById('chatMessagesContainer');
            if (container) {
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
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
            if (fileInput) fileInput.click();
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || !currentChatContact) return;
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    addMessageToContact(currentChatContact.id, {
                        type: 'photo',
                        photoUrl: ev.target.result,
                        sender: getMyId(),
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                };
                reader.readAsDataURL(file);
            } else {
                addMessageToContact(currentChatContact.id, {
                    type: 'document',
                    docName: file.name,
                    docSize: `${Math.round(file.size / 1024)} Ko`,
                    sender: getMyId(),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        });
    }
    if (bsActionCamera) {
        bsActionCamera.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            if (!currentChatContact) return;
            addMessageToContact(currentChatContact.id, {
                type: 'photo',
                photoUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
                sender: getMyId(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
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
            if (!currentChatContact) return;
            addMessageToContact(currentChatContact.id, {
                type: 'document',
                docName: 'Devis_Prestation_LYANN.pdf',
                docSize: '284 Ko',
                sender: getMyId(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
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

            let createdQuoteResult = null;
            // RPC Supabase proposition si invitation active
            if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getActiveInvitationBetween === 'function' && typeof window.LYANN_API_CLIENT.createRequestQuote === 'function') {
                try {
                    const activeInv = await window.LYANN_API_CLIENT.getActiveInvitationBetween(getMyId(), contact.id);
                    if (activeInv && activeInv.id) {
                        const milestonePayload = [{ title: desc || "Tarif Direct", description: "Tarif direct convenu", amount: amount, percentage: 100 }];
                        createdQuoteResult = await window.LYANN_API_CLIENT.createRequestQuote(activeInv.id, desc, null, milestonePayload);
                        console.log("⚡ Offre directe créée via RPC Supabase:", createdQuoteResult);
                    }
                } catch (invErr) {
                    console.warn("Notice: RPC createRequestQuote note:", invErr);
                }
            }

            // Fallback mockProposePrice s'il n'y a pas d'invitation RPC active
            if (!createdQuoteResult && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.mockProposePrice === 'function') {
                try {
                    await window.LYANN_API_CLIENT.mockProposePrice(getMyId(), contact.id, amount, desc);
                } catch (mockErr) {
                    console.warn("Notice: mockProposePrice note:", mockErr);
                }
            }

            await addMessageToContact(contact.id, {
                type: 'system_card',
                cardType: 'PRICE_PROPOSAL',
                sender: getMyId(),
                amount: amount,
                title: desc,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (descInput) descInput.value = '';
            if (amountInput) amountInput.value = '';
            closeAllOverlays();
            if (typeof refreshChatUI === 'function') {
                await refreshChatUI();
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

            const formattedDate = new Date(dateVal).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            const msgText = `📅 Proposition de rendez-vous : ${formattedDate} (${slotVal})${noteVal ? ' — ' + noteVal : ''}`;

            await addMessageToContact(contact.id, {
                type: 'text',
                sender: getMyId(),
                text: msgText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (dateInput) dateInput.value = '';
            const noteInput = document.getElementById('pdNote');
            if (noteInput) noteInput.value = '';

            closeAllOverlays();
            if (typeof refreshChatUI === 'function') {
                await refreshChatUI();
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
            refreshChatUI();
        });
    }

    // Recalculate total on checkout assurance checkbox toggle
    const coAssuranceCheck = document.getElementById('coAssuranceCheck');
    if (coAssuranceCheck) {
        coAssuranceCheck.addEventListener('change', async () => {
            if (!currentChatContact) return;
            const mission = window.LYANN_API_CLIENT ? await window.LYANN_API_CLIENT.getActiveMissionBetween(getMyId(), currentChatContact.id) : null;
            const agreedPrice = mission ? mission.agreed_price : 50;
            const fee = agreedPrice * 0.03;
            const prot = coAssuranceCheck.checked ? agreedPrice * 0.07 : 0;
            const coAssuranceFee = document.getElementById('coAssuranceFee');
            const coTotalAmount = document.getElementById('coTotalAmount');
            if (coAssuranceFee) coAssuranceFee.textContent = `${prot.toFixed(2)} €`;
            if (coTotalAmount) coTotalAmount.textContent = `${(agreedPrice + fee + prot).toFixed(2)} €`;
        });
    }

    // Milestone allocation: percentage <-> amount, always reconciled to total.
    function initMilestoneAllocationSync() {
        const totalInput = document.getElementById('mdTotalAmount');
        if (!totalInput || totalInput.dataset.allocationSyncBound === 'true') return;
        totalInput.dataset.allocationSyncBound = 'true';

        const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
        const roundPercent = (value) => Math.round((Number(value) || 0) * 100) / 100;
        const getTotal = () => Math.max(0, parseFloat(totalInput.value) || 0);

        const updateSummary = () => {
            const total = getTotal();
            let amountSum = 0;
            let percentSum = 0;
            for (let i = 1; i <= 3; i++) {
                amountSum += Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Amount')?.value) || 0);
                percentSum += Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Percent')?.value) || 0);
            }
            amountSum = roundMoney(amountSum);
            percentSum = roundPercent(percentSum);
            const remaining = roundMoney(total - amountSum);
            const pctEl = document.getElementById('mdAllocationPercentTotal');
            const amtEl = document.getElementById('mdAllocationAmountTotal');
            const remEl = document.getElementById('mdAllocationRemaining');
            if (pctEl) pctEl.textContent = percentSum.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';
            if (amtEl) amtEl.textContent = amountSum.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
            if (remEl) {
                remEl.textContent = remaining.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
                remEl.style.color = Math.abs(remaining) <= 0.01 ? 'var(--primary)' : (remaining < 0 ? '#B91C1C' : '#475569');
            }
        };

        const syncFromPercent = (index) => {
            const total = getTotal();
            const pct = Math.min(100, Math.max(0, parseFloat(document.getElementById('mdJ' + index + 'Percent')?.value) || 0));
            const amountInput = document.getElementById('mdJ' + index + 'Amount');
            if (amountInput) amountInput.value = total > 0 ? roundMoney(total * pct / 100).toFixed(2) : '';
            updateSummary();
        };

        const syncFromAmount = (index) => {
            const total = getTotal();
            const amount = Math.max(0, parseFloat(document.getElementById('mdJ' + index + 'Amount')?.value) || 0);
            const pctInput = document.getElementById('mdJ' + index + 'Percent');
            if (pctInput) pctInput.value = total > 0 ? String(roundPercent(amount / total * 100)) : '';
            updateSummary();
        };

        for (let i = 1; i <= 3; i++) {
            const pctInput = document.getElementById('mdJ' + i + 'Percent');
            const amountInput = document.getElementById('mdJ' + i + 'Amount');
            if (pctInput) {
                pctInput.step = '0.01';
                pctInput.min = '0';
                pctInput.max = '100';
                pctInput.removeAttribute('required');
                pctInput.addEventListener('input', () => syncFromPercent(i));
            }
            if (amountInput) amountInput.addEventListener('input', () => syncFromAmount(i));
        }

        totalInput.addEventListener('input', () => {
            for (let i = 1; i <= 3; i++) {
                const pctInput = document.getElementById('mdJ' + i + 'Percent');
                if (pctInput && pctInput.value !== '') syncFromPercent(i);
            }
            updateSummary();
        });
        updateSummary();
    }

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

                const rawAmounts = [1, 2, 3].map(i => Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Amount')?.value) || 0));
                const rawPercents = [1, 2, 3].map(i => Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Percent')?.value) || 0));
                const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
                const roundPercent = (value) => Math.round((Number(value) || 0) * 100) / 100;

                const amounts = rawAmounts.map((amount, idx) => amount > 0 ? roundMoney(amount) : roundMoney(total * rawPercents[idx] / 100));
                const percents = amounts.map(amount => total > 0 ? roundPercent(amount / total * 100) : 0);
                const [p1, p2, p3] = percents;

                if (!currentChatContact) {
                    throw new Error("Aucun contact sélectionné pour la discussion.");
                }

                if (!title || isNaN(total) || total <= 0) {
                    if (window.lyannAlert) window.lyannAlert("Veuillez remplir tous les champs correctement.");
                    else alert("Veuillez remplir tous les champs correctement.");
                    return;
                }

                if (p1 + p2 + p3 !== 100) {
                    const msg = "⚠️ Erreur : La somme des pourcentages des Parties doit être exactement égale à 100%. (Actuellement : " + (p1+p2+p3) + "%)";
                    if (window.lyannAlert) window.lyannAlert(msg);
                    else alert(msg);
                    return;
                }

                // Montants et pourcentages restent synchronisés quelle que soit l'unité saisie.
                const [m1, m2, m3] = amounts;
                const allocatedTotal = roundMoney(m1 + m2 + m3);
                if (Math.abs(allocatedTotal - total) > 0.01) {
                    const msg = 'La somme des jalons doit correspondre au montant total (' + total.toFixed(2) + ' €). Montant actuellement réparti : ' + allocatedTotal.toFixed(2) + ' €.';
                    if (window.lyannAlert) window.lyannAlert(msg);
                    else alert(msg);
                    return;
                }

                const j1Title = document.getElementById('mdJ1Title')?.value.trim() || "Jalon 1 - Préparation";
                const j2Title = document.getElementById('mdJ2Title')?.value.trim() || "Jalon 2 - Intervention";
                const j3Title = document.getElementById('mdJ3Title')?.value.trim() || "Jalon 3 - Finalisation";

                const milestonesPayload = [
                    { title: j1Title, description: "Phase 1", amount: m1, percentage: p1 },
                    { title: j2Title, description: "Phase 2", amount: m2, percentage: p2 },
                    { title: j3Title, description: "Phase 3", amount: m3, percentage: p3 }
                ];

                let createdQuoteResult = null;
                // Tentative via backend production RPC Supabase
                if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getActiveInvitationBetween === 'function') {
                    const activeInv = await window.LYANN_API_CLIENT.getActiveInvitationBetween(getMyId(), currentChatContact.id);
                    if (activeInv) {
                        createdQuoteResult = await window.LYANN_API_CLIENT.createRequestQuote(activeInv.id, title, null, milestonesPayload);
                        console.log("⚡ Devis réel créé via RPC Supabase:", createdQuoteResult);
                    }
                }

                // Fallback local si pas d'invitation active ou mode dev
                if (!createdQuoteResult) {
                    await window.LYANN_API_CLIENT.mockProposePrice(getMyId(), currentChatContact.id, total, title);
                    await addMessageToContact(currentChatContact.id, {
                        type: 'system_card',
                        cardType: 'PRICE_PROPOSAL',
                        sender: getMyId(),
                        amount: total,
                        title: `${title} (Devis à Jalons)`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                }

                // Clean & close
                if (titleInput) titleInput.value = '';
                if (totalInput) totalInput.value = '';
                closeAllOverlays();
                await refreshChatUI();

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
            if (!currentChatContact) return;

            const mission = await window.LYANN_API_CLIENT.getActiveMissionBetween(getMyId(), currentChatContact.id);
            if (mission) {
                await window.LYANN_API_CLIENT.mockPayMission(mission.id);
                addMessageToContact(currentChatContact.id, {
                    type: 'system_card',
                    cardType: 'PAYMENT_CONFIRMED',
                    amount: mission.agreed_price,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
            closeAllOverlays();
            refreshChatUI();

            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PAY_MISSION', contactId: currentChatContact.id } }));
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
    if (window.NotificationService && window.NotificationService.showToast) {
        window.NotificationService.showToast('info', '🔒 Le stockage sécurisé des fichiers sera disponible très prochainement.');
    } else if (window.lyannAlert) {
        window.lyannAlert('🔒 Le stockage sécurisé des fichiers sera disponible très prochainement.');
    }
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

window.addEventListener('lyann_missions_updated', () => refreshChatUI());

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
let missionSubscription = null;

function setupRealtime() {
    if (!window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) return;
    const supabase = window.LYANN_API_CLIENT.supabase;

    if (chatSubscription) supabase.removeChannel(chatSubscription);
    if (missionSubscription) supabase.removeChannel(missionSubscription);

    chatSubscription = supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            if (currentChatContact) {
                // Ideally check if conversation_id matches, but for now just re-render
                renderMessages();
            }
        })
        .subscribe();

    missionSubscription = supabase.channel('public:missions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, payload => {
            if (currentChatContact) {
                renderMessages(); // This will refresh the context actions bar
            }
        })
        .subscribe();
}

// Realtime starts only after canonical auth resolution.
if (window.LYANN_AUTH_STATE?.getSnapshot?.().status === 'ready') setupRealtime();
else window.addEventListener('lyann:auth-ready', setupRealtime, { once: true });

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

