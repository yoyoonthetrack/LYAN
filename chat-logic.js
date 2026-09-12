// ---------------------------------------------------------
// CHAT LOGIC (NO ROLES)
// ---------------------------------------------------------

const CHAT_MSG_KEY = 'lyann_mock_chat_msgs';
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
    
    if (reportModal) {
        reportModal.setAttribute('data-target-user', nameToReport);
        const modalTitle = reportModal.querySelector('.step-title');
        if (modalTitle) modalTitle.textContent = `Signaler ${nameToReport}`;
        reportModal.classList.add('active');
        reportModal.style.display = 'flex';
    } else {
        if (window.lyannPrompt) {
            window.lyannPrompt(`Quel est le motif du signalement concernant ${nameToReport} ?`).then(reason => {
                if (!reason) return;
                const newReport = {
                    id: 'REP-' + Math.floor(100000 + Math.random() * 900000),
                    reporterName: 'Utilisateur Connecté',
                    targetName: nameToReport,
                    reason: 'signalement',
                    reasonLabel: 'Problème de comportement / litige',
                    details: reason,
                    timestamp: new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: 'En cours'
                };
                try {
                    const existing = JSON.parse(localStorage.getItem('LYANN_REPORTS') || '[]');
                    existing.unshift(newReport);
                    localStorage.setItem('LYANN_REPORTS', JSON.stringify(existing));
                } catch(e) {}
                if (window.lyannAlert) window.lyannAlert(`🛡️ Signalement concernant ${nameToReport} transmis à l'équipe de modération.`);
                window.dispatchEvent(new CustomEvent('lyann_report_added', { detail: newReport }));
            });
        }
    }
};
let currentChatContact = null;
function getMyId() {
    try {
        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            // Synchronous check via cached session (supabase-js v2 stores it)
            const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            if (storageKey) {
                const session = JSON.parse(localStorage.getItem(storageKey));
                if (session && session.user && session.user.id) return session.user.id;
            }
        }
    } catch(e) {}
    return "me";
}

function closeAllOverlays() {
    const ids = [
        'chatActionChoicesOverlay', 'chatDirectPriceForm', 'chatMilestoneDevisForm', 
        'chatCheckoutOverlay', 'chatTrackingOverlay', 'chatSubmitProofOverlay', 
        'chatProposeDateForm', 'chatLeaveReviewForm'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function getLocalChatMessages(contactId) {
    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
        return []; // Zero mock messages allowed when Supabase is active
    }
    let data = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) data = JSON.parse(stored);
    } catch(e) {
        console.error(e);
    }
    
    if (!data[contactId]) {
        data[contactId] = [];
    }
    return data[contactId];
}

function saveLocalChatMessage(contactId, msgObj) {
    let data = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) data = JSON.parse(stored);
    } catch(e) {
        console.error(e);
    }
    if (!data[contactId]) data[contactId] = [];
    data[contactId].push(msgObj);
    localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(data));
}

function isUUID(str) {
    if (typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

async function getChatMessages(contactId, options = {}) {
    const userId = getMyId();
    if (userId === "me" || !isUUID(contactId) || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
        return getLocalChatMessages(contactId);
    }

    if (!window.LYANN_MESSAGING_REPOSITORY) {
        console.warn('Messaging repository unavailable; returning no remote messages.');
        return [];
    }

    try {
        return await window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, options);
    } catch(e) {
        console.warn("Supabase chat query failed:", e);
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

    if (userId === "me" || !isUUID(contactId) || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
        saveLocalChatMessage(contactId, normalizedMsg);
        if (currentChatContact && currentChatContact.id === contactId) {
            await renderMessages(null);
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

window.openChatWithUser = async function (name, avatar, contactId = name, initialNeed = null) {
    const myId = getMyId();
    if (contactId && myId && contactId === myId && contactId !== "me") {
        if (window.lyannAlert) window.lyannAlert("⚠️ Vous ne pouvez pas démarrer une mise en relation avec vous-même.");
        return;
    }

    document.body.classList.add('hide-bottom-nav');
    document.body.classList.add('in-chat-active');
    const modal = document.getElementById('chatModal');
    if (!modal) {
        window.location.href = `index.html?action=openchat&name=${encodeURIComponent(name)}`;
        return;
    }
    
    let storedMsgs = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) storedMsgs = JSON.parse(stored);
    } catch(e) {}
    if (!storedMsgs[contactId]) {
        storedMsgs[contactId] = [];
        localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(storedMsgs));
    }

    let displayName = name;
    let displayAvatar = avatar;

    // IMMEDIATE CHAT SHELL: show the conversation before any profile/network lookup.
    const initialHeaderName = document.getElementById('chatHeaderName');
    const initialHeaderAvatar = document.getElementById('chatHeaderAvatar');
    if (initialHeaderName) initialHeaderName.textContent = displayName || 'Membre LYANN';
    if (initialHeaderAvatar && displayAvatar) initialHeaderAvatar.src = displayAvatar;
    if (modal) {
        modal.removeAttribute('style');
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('.chat-modal-layout').forEach(l => l.classList.add('mobile-conversation-active'));

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

    if (modal) {
        modal.removeAttribute('style');
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
    document.body.style.overflow = 'hidden';

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
                    if (typeof window.openLyannDetailModal === 'function') {
                        window.openLyannDetailModal(requestContext.requestId);
                    }
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
    const extraData = (missionOrExtra && missionOrExtra.quoteId) ? missionOrExtra : (extraDataInput || {});
    const mission = (missionOrExtra && !missionOrExtra.quoteId) ? missionOrExtra : null;
    const contactId = currentChatContact ? currentChatContact.id : null;
    if (!contactId) return;

    if (actionId === 'MAKE_PROPOSAL' || actionId === 'PROPOSE_PRICE') {
        closeAllOverlays();
        const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
        if (chatActionChoicesOverlay) {
            chatActionChoicesOverlay.style.display = 'flex';
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
            overlay.style.display = 'flex';
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
            chatCheckoutOverlay.style.display = 'flex';
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

    // Fetch real quotes from Supabase for this conversation / invitation if authenticated
    let realQuotes = [];
    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase && isUUID(currentChatContact.id)) {
        try {
            const activeInv = await window.LYANN_API_CLIENT.getActiveInvitationBetween(getMyId(), currentChatContact.id);
            if (activeInv) {
                const fetchedQuotes = await window.LYANN_API_CLIENT.getQuotesForInvitation(activeInv.id);
                for (let q of fetchedQuotes) {
                    q.milestones = await window.LYANN_API_CLIENT.getMilestonesForQuote(q.id);
                    realQuotes.push(q);
                }
            }
        } catch(err) {
            console.warn("Erreur chargement devis réels Supabase:", err);
        }
    }

    // Ignore stale async renders. A newer refresh already owns the DOM.
    if (renderGeneration !== chatRenderGeneration) return;

    // Commit the fully prepared conversation in one DOM swap. Until this point, the old
    // messages (including an optimistic outgoing message) stay visible.
    container.innerHTML = '';

    // Ignore stale async renders. A newer refresh already owns the DOM.
    if (renderGeneration !== chatRenderGeneration) return;

    // Commit the fully prepared conversation in one DOM swap. Until this point, the old
    // messages (including an optimistic outgoing message) stay visible.
    container.innerHTML = '';

    // Ignore stale async renders. A newer refresh already owns the DOM.
    if (renderGeneration !== chatRenderGeneration) return;

    // Commit the fully prepared conversation in one DOM swap. Until this point, the old
    // messages (including an optimistic outgoing message) stay visible.
    container.innerHTML = '';

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
            if (overlay) overlay.style.display = 'flex';
        });
    }
    if (bsActionDevis) {
        bsActionDevis.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatMilestoneDevisForm');
            if (overlay) overlay.style.display = 'flex';
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
            if (chatActionChoicesOverlay) chatActionChoicesOverlay.style.display = 'flex';
        });
    }

    const btnChooseDirectPrice = document.getElementById('btnChooseDirectPrice');
    if (btnChooseDirectPrice) {
        btnChooseDirectPrice.addEventListener('click', () => {
            closeAllOverlays();
            if (chatDirectPriceForm) chatDirectPriceForm.style.display = 'flex';
        });
    }

    const btnChooseMilestoneDevis = document.getElementById('btnChooseMilestoneDevis');
    if (btnChooseMilestoneDevis) {
        btnChooseMilestoneDevis.addEventListener('click', () => {
            closeAllOverlays();
            if (chatMilestoneDevisForm) chatMilestoneDevisForm.style.display = 'flex';
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
    const directPriceForm = document.getElementById('directPriceForm');
    if (directPriceForm) {
        directPriceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const descInput = document.getElementById('dpDescription');
                const amountInput = document.getElementById('dpAmount');
                const desc = descInput ? descInput.value.trim() : '';
                const amount = amountInput ? parseFloat(amountInput.value) : 0;

                if (!currentChatContact) {
                    throw new Error("Aucun contact sélectionné pour la discussion.");
                }

                if (!desc || isNaN(amount) || amount <= 0) {
                    if (window.lyannAlert) window.lyannAlert("Veuillez remplir tous les champs correctement.");
                    else alert("Veuillez remplir tous les champs correctement.");
                    return;
                }

                if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.mockProposePrice === 'function') {
                    await window.LYANN_API_CLIENT.mockProposePrice(getMyId(), currentChatContact.id, amount, desc);
                }

                await addMessageToContact(currentChatContact.id, {
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
                refreshChatUI();

                window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_PRICE', contactId: currentChatContact.id } }));
            } catch (err) {
                console.error("Error in directPriceForm submit:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'envoi de l'offre : " + err.message);
            }
        });
    }

    // SUBMIT PROPOSE DATE
    const proposeDateForm = document.getElementById('proposeDateForm');
    if (proposeDateForm) {
        proposeDateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentChatContact) return;

            const dateVal = document.getElementById('pdDate')?.value;
            const slotVal = document.getElementById('pdTimeSlot')?.value || '';
            const noteVal = document.getElementById('pdNote')?.value || '';

            if (!dateVal) {
                if (window.lyannAlert) window.lyannAlert("Veuillez sélectionner une date.");
                return;
            }

            const formattedDate = new Date(dateVal).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            const msgText = `📅 Proposition de rendez-vous : ${formattedDate} (${slotVal})${noteVal ? ' — ' + noteVal : ''}`;

            await addMessageToContact(currentChatContact.id, {
                type: 'text',
                sender: getMyId(),
                text: msgText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            closeAllOverlays();
            refreshChatUI();
        });
    }

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

                const p1 = parseInt(document.getElementById('mdJ1Percent')?.value) || 0;
                const p2 = parseInt(document.getElementById('mdJ2Percent')?.value) || 0;
                const p3 = parseInt(document.getElementById('mdJ3Percent')?.value) || 0;

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

                // Calcul atomique des montants de jalons
                const m1 = Math.round(total * (p1 / 100) * 100) / 100;
                const m2 = Math.round(total * (p2 / 100) * 100) / 100;
                const m3 = Math.round((total - m1 - m2) * 100) / 100;

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

    // CHAT PRODUCTION HYGIENE: Idempotent cleanup of legacy demo contacts from localStorage
    function cleanupLegacyDemoChatData() {
        const demoSignatures = [
            "Prestataire LYANN",
            "David Jean-Baptiste",
            "David M.",
            "David M. (34 ans)",
            "David",
            "1",
            "Tati Huguette Cazeau",
            "Sarah Manicon",
            "Marc (Plombier)",
            "contact 1",
            "contact 6",
            "contact 9"
        ];
        try {
            const isRealSupabase = (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase && !(typeof window.LYANN_DEMO_MODE !== 'undefined' && window.LYANN_DEMO_MODE === true));
            const stored = localStorage.getItem(CHAT_MSG_KEY);
            if (stored) {
                let data = JSON.parse(stored);
                let changed = false;
                Object.keys(data).forEach(k => {
                    if (demoSignatures.includes(k) || (isRealSupabase && !isUUID(k))) {
                        delete data[k];
                        changed = true;
                    }
                });
                if (changed) {
                    localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(data));
                    console.log("🧹 [Chat Hygiene] Purged legacy demo contacts from localStorage.");
                }
            }
            const lastActive = localStorage.getItem('lyann_last_active_contact');
            if (lastActive) {
                const parsed = JSON.parse(lastActive);
                if (parsed && (demoSignatures.includes(parsed.id) || (isRealSupabase && !isUUID(parsed.id)))) {
                    localStorage.removeItem('lyann_last_active_contact');
                }
            }
        } catch(e) {}
    }

    // Initialize & render chat contacts sidebar dynamically
    function initializeChatContacts() {
        cleanupLegacyDemoChatData();

        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            return; // Zero mock contacts when Supabase is active
        }
        let data = {};
        try {
            const stored = localStorage.getItem(CHAT_MSG_KEY);
            if (stored) data = JSON.parse(stored);
        } catch(e) {}
        
        // Ensure default contacts exist ONLY when explicit demo mode is set
        const isDemoMode = (typeof window.LYANN_DEMO_MODE !== 'undefined' && window.LYANN_DEMO_MODE === true);
        if (isDemoMode) {
            if (!data["Prestataire LYANN"]) {
                data["Prestataire LYANN"] = [
                    { id: "m1", text: "Bonjour ! Je suis dispo cet après-midi pour votre problème électrique.", sender: "them", timestamp: "14:32", type: "text" }
                ];
            }
            if (!data["Tati Huguette Cazeau"]) {
                data["Tati Huguette Cazeau"] = [
                    { id: "m2", text: "Merci beaucoup pour votre aide ! Le portail fonctionne parfaitement.", sender: "them", timestamp: "Hier", type: "text" }
                ];
            }
            if (!data["Sarah Manicon"]) {
                data["Sarah Manicon"] = [
                    { id: "m3", text: "À très bientôt pour la rénovation de la cuisine !", sender: "them", timestamp: "Lundi", type: "text" }
                ];
            }
            localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(data));
        }
    }

    window.deleteConversation = function(contactId) {
        if (!contactId) return;
        
        let deletedConvs = [];
        try {
            deletedConvs = JSON.parse(localStorage.getItem('lyann_deleted_conversations') || '[]');
        } catch(e) {}
        if (!deletedConvs.includes(contactId)) {
            deletedConvs.push(contactId);
            localStorage.setItem('lyann_deleted_conversations', JSON.stringify(deletedConvs));
        }
        
        try {
            const stored = localStorage.getItem(CHAT_MSG_KEY);
            if (stored) {
                let data = JSON.parse(stored);
                delete data[contactId];
                localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(data));
            }
        } catch(e) {}

        if (currentChatContact && currentChatContact.id === contactId) {
            currentChatContact = null;
            const msgContainer = document.getElementById('chatMessagesContainer');
            if (msgContainer) {
                msgContainer.innerHTML = `
                    <div class="chat-empty-state">
                        <i class="ph ph-chat-circle-dots"></i>
                        <h3>Discussion supprimée</h3>
                        <p>Sélectionnez une autre conversation dans la liste.</p>
                    </div>
                `;
            }
        }

        renderChatContacts();

        if (window.NotificationService && window.NotificationService.showToast) {
            window.NotificationService.showToast('info', 'Discussion supprimée.');
        } else if (window.lyannAlert) {
            window.lyannAlert('Discussion supprimée.');
        }
    };

    async function renderChatContacts() {
        const listContainer = document.getElementById('chatContactsList');
        if (!listContainer) return;
        
        cleanupLegacyDemoChatData();

        const isDemoMode = (typeof window.LYANN_DEMO_MODE !== 'undefined' && window.LYANN_DEMO_MODE === true);
        const isRealSupabase = (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase && !isDemoMode);

        let allContacts = [];
        let storedMsgs = {};
        try {
            const stored = localStorage.getItem(CHAT_MSG_KEY);
            if (stored) storedMsgs = JSON.parse(stored);
        } catch(e) {}

        let deletedConvs = [];
        try {
            deletedConvs = JSON.parse(localStorage.getItem('lyann_deleted_conversations') || '[]');
        } catch(e) {}

        if (isRealSupabase) {
            const myUserId = getMyId();
            if (myUserId && isUUID(myUserId)) {
                try {
                    const { data: convParts } = await window.LYANN_API_CLIENT.getUserConversations(myUserId);
                    if (convParts && Array.isArray(convParts) && convParts.length > 0) {
                        const convIds = convParts.map(cp => cp.conversation_id).filter(Boolean);
                        const { data: allParts } = await window.LYANN_API_CLIENT.supabase
                            .from('conversation_participants')
                            .select('conversation_id, user_id')
                            .in('conversation_id', convIds)
                            .neq('user_id', myUserId);
                        
                        const partnerMap = {};
                        if (allParts) {
                            allParts.forEach(p => { partnerMap[p.conversation_id] = p.user_id; });
                        }

                        window.LYANN_PROFILES_CACHE = window.LYANN_PROFILES_CACHE || {};

                        for (const convId of convIds) {
                            const partnerId = partnerMap[convId];
                            if (!partnerId) continue;

                            let partnerProfile = window.LYANN_PROFILES_CACHE[partnerId];
                            if (!partnerProfile) {
                                const { data: pData } = await window.LYANN_API_CLIENT.supabase
                                    .from('public_profiles')
                                    .select('id, first_name, last_name, avatar_url')
                                    .eq('id', partnerId)
                                    .maybeSingle();
                                if (pData) {
                                    partnerProfile = {
                                        displayName: window.formatPublicName ? window.formatPublicName(pData, null, 'Membre LYANN') : (pData.first_name || 'Membre LYANN'),
                                        avatar: window.getLyannAvatarUrl(pData.avatar_url)
                                    };
                                    window.LYANN_PROFILES_CACHE[partnerId] = partnerProfile;
                                }
                            }

                            const { data: msgs } = await window.LYANN_API_CLIENT.supabase
                                .from('messages')
                                .select('content, sender_id, created_at')
                                .eq('conversation_id', convId)
                                .order('created_at', { ascending: false })
                                .limit(1);

                            const lastMsg = (msgs && msgs.length > 0) ? msgs[0] : null;
                            const preview = lastMsg
                                ? (lastMsg.sender_id === myUserId ? 'Vous : ' + lastMsg.content : lastMsg.content)
                                : 'Nouvelle conversation';

                            allContacts.push({
                                id: partnerId,
                                conversationId: convId,
                                name: partnerProfile ? partnerProfile.displayName : 'Membre LYANN',
                                avatar: partnerProfile ? partnerProfile.avatar : 'avatar-male-blue.png',
                                preview: preview
                            });
                        }
                    }
                } catch(err) {
                    console.warn('[Real Chat Contacts Error]', err);
                }
            }
        } else {
            const defaultContacts = isDemoMode ? [
                { id: "Prestataire LYANN", name: "Prestataire LYANN", avatar: "david-34.png", preview: "Bonjour ! Je suis dispo cet ap..." },
                { id: "Tati Huguette Cazeau", name: "Tati Huguette Cazeau", avatar: "huguette-68.png", preview: "Merci beaucoup pour votre aide !" },
                { id: "Sarah Manicon", name: "Sarah Manicon", avatar: "sarah-29.png", preview: "À très bientôt pour la rénovation !" }
            ] : [];

            allContacts = [...defaultContacts];
            Object.keys(storedMsgs).forEach(contactId => {
                if (!allContacts.some(c => c.id === contactId)) {
                    let avatar = 'avatar-male-blue.png';
                    if (window.LYANN_MEMBERS) {
                        const member = window.LYANN_MEMBERS.find(m => m.name === contactId || `${m.name} (${m.age} ans)` === contactId);
                        if (member) avatar = member.avatar;
                    }
                    
                    const msgs = storedMsgs[contactId] || [];
                    const lastMsg = msgs[msgs.length - 1];
                    const preview = lastMsg ? (lastMsg.sender === 'me' ? 'Vous : ' + lastMsg.text : lastMsg.text) : 'Nouvelle conversation';

                    allContacts.push({
                        id: contactId,
                        name: contactId,
                        avatar: avatar,
                        preview: preview
                    });
                }
            });
        }

        const activeContacts = allContacts.filter(c => !deletedConvs.includes(c.id));

        const searchInput = document.getElementById('chatSearchInput');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const contactsToRender = query
            ? activeContacts.filter(c => c.name.toLowerCase().includes(query) || (c.preview && c.preview.toLowerCase().includes(query)))
            : activeContacts;

        if (contactsToRender.length === 0) {
            listContainer.innerHTML = `
                <div class="chat-empty-state" style="padding: 40px 16px; text-align: center; color: var(--text-muted, #64748B); font-size: 0.88rem;">
                    <i class="ph ph-chat-circle-dots" style="font-size: 2.2rem; color: #CBD5E1; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0 0 6px 0; font-weight: 700; color: #334155; font-size: 0.95rem;">Aucune conversation pour le moment.</p>
                    <p style="margin: 0 0 16px 0; font-size: 0.82rem; color: #64748B;">Vos échanges avec la communauté et les Lyanneurs apparaîtront ici.</p>
                    <button type="button" class="btn btn-outline btn-sm" onclick="if (typeof window.closeLyannChatModal === 'function') window.closeLyannChatModal(); window.location.href='#explorer';" style="border-radius: 20px; padding: 6px 14px; font-size: 0.8rem; font-weight: 700;"><i class="ph ph-compass"></i> Explorer les Lyanns</button>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = contactsToRender.map(c => {
            const isActive = currentChatContact && currentChatContact.id === c.id;
            const lastMsgs = storedMsgs[c.id] || [];
            const lastMsg = lastMsgs[lastMsgs.length - 1];
            const previewText = lastMsg ? (lastMsg.sender === 'me' ? 'Vous : ' + lastMsg.text : lastMsg.text) : c.preview;
            const escapedId = c.id.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            let displayName = c.name;
            let displayAvatar = c.avatar;
            if (typeof isUUID === 'function' && isUUID(c.id)) {
                if (window.LYANN_PROFILES_CACHE[c.id]) {
                    displayName = window.LYANN_PROFILES_CACHE[c.id].displayName;
                    displayAvatar = window.LYANN_PROFILES_CACHE[c.id].avatar;
                } else if (displayName === c.id || displayName === 'Lyanneur') {
                    displayName = "Membre LYANN";
                }
            }

            let subContextHTML = '';
            if (displayName === "Membre LYANN" && c.requestTitle) {
                subContextHTML = `<div class="chat-contact-subcontext" style="font-size: 0.72rem; color: #4A7C59; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><i class="ph ph-hand-heart"></i> ${escapeSearchHtml(c.requestTitle)}</div>`;
            }

            return `
                <div class="chat-contact-swipe-wrapper" data-chat-member-id="${c.id}">
                    <div class="chat-contact-item ${isActive ? 'active' : ''}" data-chat-member-id="${c.id}">
                        <div class="chat-contact-avatar-wrap">
                            <img src="${window.resolveLyannAvatarSrc(displayAvatar)}" alt="${displayName}" class="chat-contact-avatar" onerror="window.handleAvatarError(this)">
                        </div>
                        <div class="chat-contact-info">
                            <div class="chat-contact-name">${displayName}</div>
                            ${subContextHTML}
                            <div class="chat-contact-preview">${previewText}</div>
                        </div>
                        <button type="button" class="btn-delete-conv-desktop" onclick="event.stopPropagation(); window.deleteConversation('${escapedId}');" title="Supprimer la conversation">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                    <button type="button" class="btn-delete-conv-mobile" onclick="event.stopPropagation(); window.deleteConversation('${escapedId}');">
                        <i class="ph ph-trash"></i>
                        <span>Supprimer</span>
                    </button>
                </div>
            `;
        }).join('');

        // Re-bind touch swipe & click events
        listContainer.querySelectorAll('.chat-contact-swipe-wrapper').forEach(wrapper => {
            let startX = 0;
            let currentX = 0;
            const item = wrapper.querySelector('.chat-contact-item');
            
            wrapper.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
            }, { passive: true });
            
            wrapper.addEventListener('touchmove', (e) => {
                currentX = e.touches[0].clientX;
                const diffX = currentX - startX;
                if (diffX < 0 && diffX > -120) {
                    item.style.transform = `translateX(${diffX}px)`;
                }
            }, { passive: true });
            
            wrapper.addEventListener('touchend', () => {
                const diffX = currentX - startX;
                if (diffX < -40) {
                    item.style.transform = 'translateX(-80px)';
                } else {
                    item.style.transform = 'translateX(0)';
                }
                startX = 0;
                currentX = 0;
            });

            if (item) {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-delete-conv-desktop') || e.target.closest('.btn-delete-conv-mobile')) return;
                    const contactId = item.getAttribute('data-chat-member-id');
                    const contact = activeContacts.find(c => c.id === contactId);
                    if (contact) {
                        openChatWithUser(contact.name, contact.avatar, contact.id);
                    }
                });
            }
        });

        // Search input live filtering listener
        if (searchInput && !searchInput.dataset.searchBound) {
            searchInput.dataset.searchBound = 'true';
            searchInput.addEventListener('input', () => {
                renderChatContacts();
            });
        }
    }

    window.renderChatContacts = renderChatContacts;

    window.openLyannChatModal = function() {
        document.body.classList.add('hide-bottom-nav');
        document.body.classList.add('in-chat-active');
        const modal = document.getElementById('chatModal');
        if (modal) {
            modal.removeAttribute('style');
            modal.style.display = 'flex';
            modal.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
        const chatLayout = document.querySelector('.chat-modal-layout');
        if (chatLayout) {
            chatLayout.classList.remove('mobile-conversation-active');
        }
        if (typeof window.renderChatContacts === 'function') {
            window.renderChatContacts();
        }
        if (typeof initChatCloseBtn === 'function') {
            initChatCloseBtn();
        }
    };

    initializeChatContacts();
    renderChatContacts();
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
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (typeof triggerHaptic === 'function') {
        try { triggerHaptic('light'); } catch(err) {}
    }

    document.body.classList.remove('hide-bottom-nav', 'in-chat-active');
    document.body.style.overflow = '';
    document.body.style.position = '';

    const modal = document.getElementById('chatModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.removeAttribute('style');
    }

    const chatLayout = document.querySelector('.chat-modal-layout');
    if (chatLayout) {
        chatLayout.classList.remove('mobile-conversation-active');
    }
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
        return;
    }

    const contactItem = e.target.closest('.chat-contact-item');
    if (contactItem && contactItem.closest('#chatModal')) {
        const contactId = contactItem.getAttribute('data-chat-member-id');
        const nameEl = contactItem.querySelector('.chat-contact-name');
        const imgEl = contactItem.querySelector('.chat-contact-avatar');
        const name = nameEl ? nameEl.textContent.trim() : (contactId || 'Lyanneur');
        const avatar = imgEl ? imgEl.src : 'david-34.png';
        
        if (typeof window.openChatWithUser === 'function') {
            window.openChatWithUser(name, avatar, contactId || name);
        }
    }
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

function attachChatContainerMutationObserver() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || container.dataset.observerBound === 'true') return;
    container.dataset.observerBound = 'true';
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                console.error('[CHAT DOM NODE ADDED]', node);
                console.trace('[CHAT DOM MUTATION TRACE]');
            }
        }
    }).observe(container, { childList: true, subtree: true });
}

// Safe startup execution
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChatSubmitAndContacts();
        initChatCloseBtn();
        attachChatContainerMutationObserver();
    });
} else {
    initChatSubmitAndContacts();
    initChatCloseBtn();
    attachChatContainerMutationObserver();
}

// === FAVORITES MANAGEMENT FOR CHAT CONTACTS & MEMBERS ===
window.getLyannFavorites = function() {
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.getMyFavorites === 'function') {
        // Return active promise or cached state if needed
        return window.LyannFavoritesService.getMyFavorites();
    }
    return [];
};

window.isContactFavorite = function(contactId) {
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.isFavorite === 'function') {
        return window.LyannFavoritesService.isFavorite('PROFILE', contactId);
    }
    return false;
};

window.toggleContactFavorite = async function(contactId, contactName) {
    if (!contactId) return;
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.toggleFavorite === 'function') {
        const res = await window.LyannFavoritesService.toggleFavorite('PROFILE', contactId);
        const name = contactName || 'Membre';
        if (res.isFavorite) {
            if (window.NotificationService) {
                window.NotificationService.showToast('success', `${name} ajouté(e) à vos favoris.`);
            }
        } else {
            if (window.NotificationService) {
                window.NotificationService.showToast('info', `${name} retiré(e) de vos favoris.`);
            }
        }
        window.updateChatFavHeaderUI();
    }
};

window.updateChatFavHeaderUI = function() {
    if (!currentChatContact) return;
    const isFav = window.isContactFavorite(currentChatContact.name);
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
    const favBtn = e.target.closest('#chatToggleFavoriteBtn, #chatDropAddFavorite');
    if (favBtn && currentChatContact) {
        e.preventDefault();
        e.stopPropagation();
        window.toggleContactFavorite(currentChatContact.name, currentChatContact.avatar);
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

// Call setup when script loads
setTimeout(setupRealtime, 1000); // Wait for API client to be ready

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

