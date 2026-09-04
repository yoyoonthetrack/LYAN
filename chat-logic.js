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
    let data = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) data = JSON.parse(stored);
    } catch(e) {
        console.error(e);
    }
    
    if (!data[contactId]) {
        if (contactId === "David Jean-Baptiste") {
            data[contactId] = [
                { id: "m1", text: "Bonjour ! Je suis dispo cet après-midi pour votre problème électrique.", sender: "them", timestamp: "14:32", type: "text", status: "read" }
            ];
        } else if (contactId === "Tati Huguette Cazeau") {
            data[contactId] = [
                { id: "m2", text: "Merci beaucoup pour votre aide ! Le portail fonctionne parfaitement.", sender: "them", timestamp: "Hier", type: "text", status: "read" }
            ];
        } else if (contactId === "Sarah Manicon") {
            data[contactId] = [
                { id: "m3", text: "À très bientôt pour la rénovation de la cuisine !", sender: "them", timestamp: "Lundi", type: "text", status: "read" }
            ];
        } else {
            data[contactId] = [];
        }
        localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(data));
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

async function getChatMessages(contactId) {
    const userId = getMyId();
    if (userId === "me" || !isUUID(contactId) || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
        return getLocalChatMessages(contactId);
    }

    try {
        let { data: convs } = await window.LYANN_API_CLIENT.supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', getMyId());

        let sharedConvId = null;
        if (convs && convs.length > 0) {
            const convIds = convs.map(c => c.conversation_id);
            const { data: shared } = await window.LYANN_API_CLIENT.supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', contactId)
                .in('conversation_id', convIds);

            if (shared && shared.length > 0) {
                sharedConvId = shared[0].conversation_id;
            }
        }

        if (!sharedConvId) return [];

        const { data: msgs, error } = await window.LYANN_API_CLIENT.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', sharedConvId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return msgs.map(m => ({
            id: m.id,
            text: m.content,
            sender: m.sender_id === getMyId() ? 'me' : 'them',
            timestamp: new Date(m.created_at).getTime(),
            type: m.content.startsWith('{') ? 'transactional' : 'text',
            txData: m.content.startsWith('{') ? JSON.parse(m.content) : null,
            status: 'read'
        }));
    } catch(e) {
        console.warn("Supabase chat query failed, falling back to local:", e);
        return getLocalChatMessages(contactId);
    }
}

async function addMessageToContact(contactId, msgObj) {
    const userId = getMyId();
    if (userId === "me" || !isUUID(contactId) || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
        saveLocalChatMessage(contactId, msgObj);
        if (currentChatContact && currentChatContact.id === contactId) {
            await renderMessages();
        }
        return;
    }

    try {
        const { data: convRes } = await window.LYANN_API_CLIENT.getOrCreateConversation(getMyId(), contactId);
        if (!convRes || !convRes.id) {
            throw new Error("Impossible d'initialiser la conversation.");
        }

        const sharedConvId = convRes.id;
        const contentToSave = msgObj.type === 'transactional' ? JSON.stringify(msgObj.txData) : msgObj.text;

        const { error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, getMyId(), contentToSave);
        if (sendErr) throw sendErr;
    } catch(e) {
        console.warn("Supabase message send failed, saving locally:", e);
        saveLocalChatMessage(contactId, msgObj);
    }

    if (currentChatContact && currentChatContact.id === contactId) {
        await renderMessages();
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

    if ((!avatar || avatar === "david-34.png") && name !== "David Jean-Baptiste" && window.LYANN_MEMBERS) {
        const member = window.LYANN_MEMBERS.find(m => m.name === name || `${m.name} (${m.age} ans)` === name);
        if (member) avatar = member.avatar;
    }

    currentChatContact = { id: contactId, name, avatar };
    
    try {
        localStorage.setItem('lyann_last_active_contact', JSON.stringify({ id: contactId, name, avatar }));
    } catch(e) {}

    // If an explicit initial need/context is passed (e.g. from Bokantaj or Explorer)
    if (initialNeed && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.mockCreateNeed === 'function') {
        await window.LYANN_API_CLIENT.mockCreateNeed(initialNeed.requesterId, initialNeed.helperId, initialNeed.title);
    }

    const headerName = document.getElementById('chatHeaderName');
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerName) headerName.textContent = name;
    if (headerAvatar) headerAvatar.src = avatar;

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

    refreshChatUI();
};

window.refreshChatUI = async function () {
    if (!currentChatContact) return;

    if (typeof window.updateChatFavHeaderUI === 'function') {
        window.updateChatFavHeaderUI();
    }

    let mission = null;
    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getActiveMissionBetween === 'function') {
        mission = await window.LYANN_API_CLIENT.getActiveMissionBetween(getMyId(), currentChatContact.id);
    }

    // Compact Mission Banner Under Header
    const banner = document.getElementById('chatMissionContextBar');
    const bannerTitle = document.getElementById('chatBannerTitle');
    const bannerMeta = document.getElementById('chatBannerMeta');
    const dropViewMission = document.getElementById('chatDropViewMission');

    if (mission) {
        if (banner) banner.style.display = 'flex';
        if (bannerTitle) bannerTitle.textContent = mission.title;
        if (bannerMeta) bannerMeta.textContent = `${mission.agreed_price} € · ${mission.status}`;
        if (dropViewMission) dropViewMission.style.display = 'flex';

        if (banner) {
            banner.onclick = () => {
                const chatTrackingOverlay = document.getElementById('chatTrackingOverlay');
                if (chatTrackingOverlay && (mission.status === 'IN_PROGRESS' || mission.status === 'WORK_MARKED_COMPLETE' || mission.status === 'COMPLETED')) {
                    closeAllOverlays();
                    chatTrackingOverlay.style.display = 'flex';
                } else if (window.lyannAlert) {
                    window.lyannAlert(`Mission "${mission.title}" (${mission.agreed_price}€) — Statut : ${mission.status}`);
                }
            };
        }
    } else {
        if (banner) banner.style.display = 'none';
        if (dropViewMission) dropViewMission.style.display = 'none';
    }

    // Update Header Action Button
    const headerProposeBtn = document.getElementById('chatHeaderProposeBtn');
    if (headerProposeBtn) {
        if (mission && mission.requester_id === getMyId()) {
            headerProposeBtn.innerHTML = `<i class="ph ph-hand-heart"></i> Demander une estimation`;
            headerProposeBtn.onclick = () => handleChatAction('REQUEST_HELP', mission);
        } else {
            headerProposeBtn.innerHTML = `<i class="ph ph-tag"></i> Faire une proposition`;
            headerProposeBtn.onclick = () => handleChatAction('MAKE_PROPOSAL', mission);
        }
    }

    // Contextual actions
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) {
        actionContainer.innerHTML = '';
        let actions = [];
        if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getAvailableMissionActions === 'function') {
            actions = window.LYANN_API_CLIENT.getAvailableMissionActions(getMyId(), mission);
        } else {
            actions = [{ id: 'MAKE_PROPOSAL', label: 'Faire une proposition', type: 'primary' }];
        }

        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = action.type === 'primary' ? 'btn btn-primary' : (action.type === 'outline' ? 'btn btn-outline' : 'btn btn-secondary');
            if (action.type === 'disabled') btn.disabled = true;
            btn.style.padding = '6px 14px';
            btn.style.fontSize = '0.82rem';
            btn.style.borderRadius = 'var(--radius-full)';
            btn.textContent = action.label;

            btn.onclick = () => handleChatAction(action.id, mission);
            actionContainer.appendChild(btn);
        });
    }

    await renderMessages();
}

async function handleChatAction(actionId, mission) {
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

    else if (actionId === 'ACCEPT_PRICE') {
        if (mission && window.LYANN_API_CLIENT) {
            window.LYANN_API_CLIENT.mockAcceptPrice(mission.id, getMyId());
        }
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'AGREEMENT_REACHED',
            amount: mission ? mission.agreed_price : 0,
            title: mission ? mission.title : 'Prestation convenue',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
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

async function renderMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !currentChatContact) return;
    container.innerHTML = '';

    const msgs = await getChatMessages(currentChatContact.id);

    if (msgs.length === 0) {
        container.innerHTML = `
            <div class="chat-empty-state">
                <i class="ph ph-chat-circle-dots"></i>
                <h3>Démarrez la discussion avec ${currentChatContact.name}</h3>
                <p>Échangez des messages, des devis ou proposez un tarif en toute sérénité.</p>
            </div>
        `;
        return;
    }

    // Add Date Separator at top
    const dateSep = document.createElement('div');
    dateSep.className = 'chat-date-separator';
    dateSep.innerHTML = `<span>Aujourd'hui</span>`;
    container.appendChild(dateSep);

    msgs.forEach(msg => {
        const wrapper = document.createElement('div');
        const isMe = msg.sender === getMyId();
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

        // Action bar (Reactions + Quote + Delete)
        const escapedText = (msg.text || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const authorName = isMe ? 'Vous' : (currentChatContact ? currentChatContact.name : 'Membre');
        const actionBarHTML = `
            <div class="chat-msg-action-bar">
                <button type="button" class="chat-msg-act-btn" onclick="window.toggleMessageReaction('${msgId}', '👍')" title="Réagir 👍">👍</button>
                <button type="button" class="chat-msg-act-btn" onclick="window.toggleMessageReaction('${msgId}', '❤️')" title="Réagir ❤️">❤️</button>
                <button type="button" class="chat-msg-act-btn" onclick="window.toggleMessageReaction('${msgId}', '😂')" title="Réagir 😂">😂</button>
                <button type="button" class="chat-msg-act-btn" onclick="window.quoteMessage('${msgId}', '${authorName}', '${escapedText}')" title="Répondre"><i class="ph ph-arrow-u-up-left"></i></button>
                <button type="button" class="chat-msg-act-btn" onclick="window.deleteMessage('${msgId}')" title="Supprimer ce message"><i class="ph ph-trash"></i></button>
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

                // Bind inline action buttons
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
                    const msg = "⚠️ Erreur : La somme des pourcentages des jalons doit être exactement égale à 100%. (Actuellement : " + (p1+p2+p3) + "%)";
                    if (window.lyannAlert) window.lyannAlert(msg);
                    else alert(msg);
                    return;
                }

                // Propose Devis total
                await window.LYANN_API_CLIENT.mockProposePrice(getMyId(), currentChatContact.id, total, title);

                // Add system card
                await addMessageToContact(currentChatContact.id, {
                    type: 'system_card',
                    cardType: 'PRICE_PROPOSAL',
                    sender: getMyId(),
                    amount: total,
                    title: `${title} (Devis à Jalons)`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                // Clean & close
                if (titleInput) titleInput.value = '';
                if (totalInput) totalInput.value = '';
                closeAllOverlays();
                refreshChatUI();

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

    // Initialize & render chat contacts sidebar dynamically
    function initializeChatContacts() {
        let data = {};
        try {
            const stored = localStorage.getItem(CHAT_MSG_KEY);
            if (stored) data = JSON.parse(stored);
        } catch(e) {}
        
        // Ensure default contacts exist
        if (!data["David Jean-Baptiste"]) {
            data["David Jean-Baptiste"] = [
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

    function renderChatContacts() {
        const listContainer = document.getElementById('chatContactsList');
        if (!listContainer) return;
        
        const defaultContacts = [
            { id: "David Jean-Baptiste", name: "David Jean-Baptiste", avatar: "david-34.png", preview: "Bonjour ! Je suis dispo cet ap..." },
            { id: "Tati Huguette Cazeau", name: "Tati Huguette Cazeau", avatar: "huguette-68.png", preview: "Merci beaucoup pour votre aide !" },
            { id: "Sarah Manicon", name: "Sarah Manicon", avatar: "sarah-29.png", preview: "À très bientôt pour la rénovation !" }
        ];

        let storedMsgs = {};
        try {
            const stored = localStorage.getItem(CHAT_MSG_KEY);
            if (stored) storedMsgs = JSON.parse(stored);
        } catch(e) {}

        let deletedConvs = [];
        try {
            deletedConvs = JSON.parse(localStorage.getItem('lyann_deleted_conversations') || '[]');
        } catch(e) {}

        const allContacts = [...defaultContacts];
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

        const activeContacts = allContacts.filter(c => !deletedConvs.includes(c.id));

        const searchInput = document.getElementById('chatSearchInput');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const contactsToRender = query
            ? activeContacts.filter(c => c.name.toLowerCase().includes(query) || (c.preview && c.preview.toLowerCase().includes(query)))
            : activeContacts;

        if (contactsToRender.length === 0) {
            listContainer.innerHTML = `<div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">Aucune conversation trouvée</div>`;
            return;
        }

        listContainer.innerHTML = contactsToRender.map(c => {
            const isActive = currentChatContact && currentChatContact.id === c.id;
            const lastMsgs = storedMsgs[c.id] || [];
            const lastMsg = lastMsgs[lastMsgs.length - 1];
            const previewText = lastMsg ? (lastMsg.sender === 'me' ? 'Vous : ' + lastMsg.text : lastMsg.text) : c.preview;
            const escapedId = c.id.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div class="chat-contact-swipe-wrapper" data-chat-member-id="${c.id}">
                    <div class="chat-contact-item ${isActive ? 'active' : ''}" data-chat-member-id="${c.id}">
                        <div class="chat-contact-avatar-wrap">
                            <img src="${c.avatar}" alt="${c.name}" class="chat-contact-avatar" onerror="this.src='avatar-male-blue.png'">
                            <span class="online-dot"></span>
                        </div>
                        <div class="chat-contact-info">
                            <div class="chat-contact-name">${c.name}</div>
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

    initializeChatContacts();
    renderChatContacts();

    // Bind triggers to open chat directly
    document.querySelectorAll('.btn-open-chat, .btn-open-chat-direct, .open-chat-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const name = btn.dataset.memberName || 'David Jean-Baptiste';
            const avatar = btn.dataset.memberAvatar || 'david-34.png';
            openChatWithUser(name, avatar, name);
        });
    });
}

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

// Safe startup execution
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChatSubmitAndContacts();
        initChatCloseBtn();
    });
} else {
    initChatSubmitAndContacts();
    initChatCloseBtn();
}

// === FAVORITES MANAGEMENT FOR CHAT CONTACTS & MEMBERS ===
window.getLyannFavorites = function() {
    try {
        const stored = localStorage.getItem('lyann_user_favorites');
        return stored ? JSON.parse(stored) : [];
    } catch(e) {
        return [];
    }
};

window.isContactFavorite = function(contactName) {
    const favs = window.getLyannFavorites();
    return favs.some(f => f.name === contactName || f.id === contactName);
};

window.toggleContactFavorite = function(contactName, contactAvatar) {
    let favs = window.getLyannFavorites();
    const index = favs.findIndex(f => f.name === contactName || f.id === contactName);
    
    if (index >= 0) {
        favs.splice(index, 1);
        if (window.NotificationService) {
            window.NotificationService.showToast('info', `${contactName} retiré(e) de vos favoris.`);
        } else if (window.lyannAlert) {
            window.lyannAlert(`${contactName} retiré(e) de vos favoris.`);
        }
    } else {
        favs.push({
            id: contactName,
            name: contactName,
            avatar: contactAvatar || 'david-34.png',
            addedAt: new Date().toISOString()
        });
        if (window.NotificationService) {
            window.NotificationService.showToast('success', `⭐ ${contactName} ajouté(e) à vos favoris !`);
        } else if (window.lyannAlert) {
            window.lyannAlert(`⭐ ${contactName} ajouté(e) à vos favoris !`);
        }
    }
    
    try {
        localStorage.setItem('lyann_user_favorites', JSON.stringify(favs));
    } catch(e) {}
    
    window.dispatchEvent(new CustomEvent('lyann_favorites_updated', { detail: { favs } }));
    window.updateChatFavHeaderUI();
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
