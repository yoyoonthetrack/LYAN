// ---------------------------------------------------------
// CHAT LOGIC (NO ROLES)
// ---------------------------------------------------------

const CHAT_MSG_KEY = 'lyann_mock_chat_msgs';
let currentChatContact = null;
function getMyId() { return window.getMyId() || "me"; }


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
                { id: "m1", text: "Bonjour ! Je suis dispo cet après-midi pour votre problème électrique.", sender: "them", timestamp: "14:32", type: "text" }
            ];
        } else if (contactId === "Tati Huguette Cazeau") {
            data[contactId] = [
                { id: "m2", text: "Merci beaucoup pour votre aide ! Le portail fonctionne parfaitement.", sender: "them", timestamp: "Hier", type: "text" }
            ];
        } else if (contactId === "Sarah Manicon") {
            data[contactId] = [
                { id: "m3", text: "À très bientôt pour la rénovation de la cuisine !", sender: "them", timestamp: "Lundi", type: "text" }
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

async function getChatMessages(contactId) {
    const userId = getMyId();
    if (userId === "me" || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
        return getLocalChatMessages(contactId);
    }

    try {
        // Check if conversation exists
        let { data: convs } = await window.LYANN_API_CLIENT.supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', getMyId());

        // Find shared conversation
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
            txData: m.content.startsWith('{') ? JSON.parse(m.content) : null
        }));
    } catch(e) {
        console.warn("Supabase chat query failed, falling back to local:", e);
        return getLocalChatMessages(contactId);
    }
}

window.addMessageToContact = async function (contactId, msgObj) {
    const userId = getMyId();
    if (userId === "me" || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
        saveLocalChatMessage(contactId, msgObj);
        if (currentChatContact && currentChatContact.id === contactId) {
            await renderMessages();
        }
        return;
    }

    try {
        const supabase = window.LYANN_API_CLIENT.supabase;

        // Find or create conversation
        let { data: convs } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', getMyId());
        let sharedConvId = null;
        if (convs && convs.length > 0) {
            const convIds = convs.map(c => c.conversation_id);
            const { data: shared } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', contactId).in('conversation_id', convIds);
            if (shared && shared.length > 0) sharedConvId = shared[0].conversation_id;
        }

        if (!sharedConvId) {
            // Create
            const { data: newConv } = await supabase.from('conversations').insert({}).select().single();
            sharedConvId = newConv.id;
            await supabase.from('conversation_participants').insert([
                { conversation_id: sharedConvId, user_id: getMyId() },
                { conversation_id: sharedConvId, user_id: contactId }
            ]);
        }

        // Insert message
        const contentToSave = msgObj.type === 'transactional' ? JSON.stringify(msgObj.txData) : msgObj.text;

        await supabase.from('messages').insert({
            conversation_id: sharedConvId,
            sender_id: msgObj.sender === 'me' ? getMyId() : contactId,
            content: contentToSave
        });
    } catch(e) {
        console.warn("Supabase message send failed, saving locally:", e);
        saveLocalChatMessage(contactId, msgObj);
    }

    if (currentChatContact && currentChatContact.id === contactId) {
        await renderMessages();
    }
}

window.openChatWithUser = async function (name, avatar, contactId = name) {
    const modal = document.getElementById('chatModal');
    if (!modal) {
        window.location.href = `index.html?action=openchat&name=${encodeURIComponent(name)}`;
        return;
    }
    currentChatContact = { id: contactId, name, avatar };

    // Update Header
    document.getElementById('chatHeaderName').textContent = name;
    document.getElementById('chatHeaderAvatar').src = avatar;

    // Highlight active contact in sidebar list
    document.querySelectorAll('.chat-contact-item').forEach(item => {
        const nameEl = item.querySelector('.chat-contact-name');
        if (nameEl && nameEl.textContent.trim() === name.trim()) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // DEV AI Badge (Permanently hidden to not disclose AI status in frontend)
    const aiBadge = document.getElementById('chatDevAiBadge');
    if (aiBadge) {
        aiBadge.style.display = 'none';
    }

    // Modal Display
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
    document.body.style.overflow = 'hidden';

    // Activate Layout
    const chatLayout = document.querySelector('.chat-modal-layout');
    if (chatLayout) chatLayout.classList.add('mobile-conversation-active');

    // Trigger AI if it's the first time we open
    window.dispatchEvent(new CustomEvent('lyann_chat_opened', { detail: { contactId } }));

    refreshChatUI();
};

window.refreshChatUI = async function () {
    if (!currentChatContact) return;

    // 1. Find active mission context
    const mission = await window.LYANN_API_CLIENT.getActiveMissionBetween(getMyId(), currentChatContact.id);

    // 2. Render Header Context
    const contextBox = document.getElementById('chatMissionContext');
    const viewMissionBtn = document.getElementById('chatViewMissionBtn');

    if (mission) {
        contextBox.style.display = 'block';
        contextBox.innerHTML = `${mission.title} • ${mission.agreed_price}€ <span style="color:#E63B2E">(${mission.status})</span>`;
        viewMissionBtn.style.display = 'block';
        viewMissionBtn.onclick = () => window.lyannAlert("Redirection vers la vue détaillée de la mission (à implémenter)");
    } else {
        contextBox.style.display = 'none';
        viewMissionBtn.style.display = 'none';
    }

    // 3. Render Actions
    const actions = window.LYANN_API_CLIENT.getAvailableMissionActions(getMyId(), mission);
    const actionContainer = document.getElementById('chatContextualActionsBar');
    actionContainer.innerHTML = '';

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = action.type === 'primary' ? 'btn btn-primary' : (action.type === 'outline' ? 'btn btn-outline' : 'btn btn-secondary');
        if (action.type === 'disabled') btn.disabled = true;
        btn.style.padding = '6px 12px';
        btn.style.fontSize = '0.82rem';
        btn.textContent = action.label;

        btn.onclick = () => handleChatAction(action.id, mission);
        actionContainer.appendChild(btn);
    });

    // 4. Render Messages
    await renderMessages();
}

async function handleChatAction(actionId, mission) {
    const contactId = currentChatContact.id;

    if (actionId === 'PROPOSE_PRICE') {
        const amount = await window.lyannPrompt("Quel montant proposez-vous (en €) ?");
        if (!amount) return;
        const desc = await window.lyannPrompt("Description de l'intervention (ex: Réparation portail) :");
        if (!desc) return;

        window.LYANN_API_CLIENT.mockProposePrice(getMyId(), contactId, parseFloat(amount), desc);
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'PRICE_PROPOSAL',
            sender: getMyId(),
            amount: parseFloat(amount),
            title: desc,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'ACCEPT_PRICE') {
        window.LYANN_API_CLIENT.mockAcceptPrice(mission.id, getMyId());
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'AGREEMENT_REACHED',
            amount: mission.agreed_price,
            title: mission.title,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'PAY_MISSION') {
        window.lyannAlert("🔒 Redirection vers le paiement Stripe Element...");
        window.LYANN_API_CLIENT.mockPayMission(mission.id);
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'PAYMENT_CONFIRMED',
            amount: mission.agreed_price,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'MARK_DONE') {
        window.LYANN_API_CLIENT.mockMarkMissionDone(mission.id);
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'WORK_DONE',
            title: mission.title,
            sender: getMyId(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'CONFIRM_DONE') {
        window.LYANN_API_CLIENT.mockConfirmMissionCompletion(mission.id);
        addMessageToContact(contactId, {
            type: 'system_card',
            cardType: 'MISSION_COMPLETED',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    else if (actionId === 'REPORT_PROBLEM') {
        const reason = await window.lyannPrompt("Quel est le problème ?");
        if (!reason) return;
        window.LYANN_API_CLIENT.mockReportProblem(mission.id);
        addMessageToContact(contactId, {
            type: 'text',
            sender: getMyId(),
            text: `⚠️ Signalement : ${reason}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    refreshChatUI();
    window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId, contactId } }));
}

async function renderMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;
    container.innerHTML = '';

    const msgs = await getChatMessages(currentChatContact.id);

    msgs.forEach(msg => {
        const div = document.createElement('div');
        const isMe = msg.sender === getMyId();

        let timeStr = msg.timestamp;
        if (typeof msg.timestamp === 'number') {
            const d = new Date(msg.timestamp);
            timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        if (msg.type === 'text') {
            div.className = `chat-msg-bubble ${isMe ? 'sent' : 'received'}`;
            div.innerHTML = `${msg.text} <div class="chat-msg-time" style="text-align:right; margin-top:4px;">${timeStr}</div>`;
        }
        else if (msg.type === 'system_card') {
            div.className = `chat-msg-card ${isMe ? 'align-right' : 'align-left'}`;

            if (msg.cardType === 'PRICE_PROPOSAL') {
                const name = isMe ? 'Vous proposez' : `${currentChatContact.name} vous propose`;
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph ph-handshake"></i> ${name}</div>
                    <div class="chat-card-body">
                        <div>${msg.title}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                    </div>
                `;
            }
            else if (msg.cardType === 'AGREEMENT_REACHED') {
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-check-circle" style="color:#2E7D32"></i> Accord trouvé</div>
                    <div class="chat-card-body">
                        <div>${msg.title}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                    </div>
                `;
            }
            else if (msg.cardType === 'PAYMENT_CONFIRMED') {
                div.className = 'chat-msg-card align-left'; // Centered or system look
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
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph ph-flag-checkered"></i> ${name}</div>
                    <div class="chat-card-body">
                        <div>Veuillez valider la fin de la mission pour déclencher le versement.</div>
                    </div>
                `;
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
        }

        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

// Intercept form submit
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('chatInputForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chatInputField');
            const text = input.value.trim();
            if (!text || !currentChatContact) return;

            addMessageToContact(currentChatContact.id, {
                type: 'text',
                sender: getMyId(),
                text: text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            input.value = '';

            window.dispatchEvent(new CustomEvent('lyann_chat_message_sent', { detail: { text, contactId: currentChatContact.id } }));
        });
    }

    // Bind contacts in UI
    document.querySelectorAll('.chat-contact-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const nameEl = item.querySelector('.chat-contact-name');
            const avatarEl = item.querySelector('.chat-contact-avatar');
            const name = nameEl ? nameEl.textContent.trim() : 'David Jean-Baptiste';
            const avatar = avatarEl ? avatarEl.getAttribute('src') : 'david-34.png';
            openChatWithUser(name, avatar, name); // Using name as ID for mock
        });
    });

    document.querySelectorAll('.btn-open-chat, .btn-open-chat-direct, .open-chat-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const name = btn.dataset.memberName || 'David Jean-Baptiste';
            const avatar = btn.dataset.memberAvatar || 'david-34.png';
            openChatWithUser(name, avatar, name);
        });
    });
});

window.addEventListener('lyann_missions_updated', () => refreshChatUI());

// Handle Chat Close Button
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeChatModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('chatModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
            }
            document.body.style.overflow = 'auto';
            const chatLayout = document.querySelector('.chat-modal-layout');
            if (chatLayout) chatLayout.classList.remove('mobile-conversation-active');
        });
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
