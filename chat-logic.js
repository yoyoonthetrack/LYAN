// ---------------------------------------------------------
// CHAT LOGIC (NO ROLES)
// ---------------------------------------------------------

const CHAT_MSG_KEY = 'lyann_mock_chat_msgs';
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
    const ids = ['chatActionChoicesOverlay', 'chatDirectPriceForm', 'chatMilestoneDevisForm', 'chatCheckoutOverlay', 'chatTrackingOverlay', 'chatSubmitProofOverlay'];
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
window.addMessageToContact = addMessageToContact;

window.openChatWithUser = async function (name, avatar, contactId = name) {
    const modal = document.getElementById('chatModal');
    if (!modal) {
        window.location.href = `index.html?action=openchat&name=${encodeURIComponent(name)}`;
        return;
    }
    
    // Ensure contact exists in local storage conversations list
    let storedMsgs = {};
    try {
        const stored = localStorage.getItem(CHAT_MSG_KEY);
        if (stored) storedMsgs = JSON.parse(stored);
    } catch(e) {}
    if (!storedMsgs[contactId]) {
        storedMsgs[contactId] = [];
        localStorage.setItem(CHAT_MSG_KEY, JSON.stringify(storedMsgs));
    }

    // Auto-resolve avatar from LYANN_MEMBERS if it is a default placeholder or missing
    if ((!avatar || avatar === "david-34.png") && name !== "David Jean-Baptiste" && window.LYANN_MEMBERS) {
        const member = window.LYANN_MEMBERS.find(m => m.name === name || `${m.name} (${m.age} ans)` === name);
        if (member) avatar = member.avatar;
    }

    currentChatContact = { id: contactId, name, avatar };
    
    // Save last active contact
    try {
        localStorage.setItem('lyann_last_active_contact', JSON.stringify({ id: contactId, name, avatar }));
    } catch(e) {}

    // Update Header
    const headerName = document.getElementById('chatHeaderName');
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerName) headerName.textContent = name;
    if (headerAvatar) headerAvatar.src = avatar;

    // Highlight active contact in sidebar list
    document.querySelectorAll('.chat-contact-item').forEach(item => {
        const cid = item.getAttribute('data-chat-member-id');
        if (cid === contactId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // DEV AI Badge (Permanently hidden)
    const aiBadge = document.getElementById('chatDevAiBadge');
    if (aiBadge) aiBadge.style.display = 'none';

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

    // Re-render sidebar to include the new contact if not present
    if (typeof window.renderChatContacts === 'function') {
        window.renderChatContacts();
    }

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
        if (contextBox) {
            contextBox.style.display = 'block';
            contextBox.innerHTML = `${mission.title} • ${mission.agreed_price}€ <span style="color:#E63B2E">(${mission.status})</span>`;
        }
        if (viewMissionBtn) {
            viewMissionBtn.style.display = 'block';
            viewMissionBtn.onclick = () => window.lyannAlert("Redirection vers la vue détaillée de la mission (à implémenter)");
        }
    } else {
        if (contextBox) contextBox.style.display = 'none';
        if (viewMissionBtn) viewMissionBtn.style.display = 'none';
    }

    // Toggle header action buttons based on mission state
    const chatProposeBtn = document.getElementById('chatProposeBtn');
    const chatTrackingBtn = document.getElementById('chatTrackingBtn');

    if (chatProposeBtn) {
        if (!mission || mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
            chatProposeBtn.style.display = 'block';
        } else {
            chatProposeBtn.style.display = 'none';
        }
    }

    if (chatTrackingBtn) {
        if (mission && (mission.status === 'IN_PROGRESS' || mission.status === 'WORK_MARKED_COMPLETE' || mission.status === 'COMPLETED')) {
            chatTrackingBtn.style.display = 'block';
        } else {
            chatTrackingBtn.style.display = 'none';
        }
    }

    // 3. Render Actions
    const actions = window.LYANN_API_CLIENT.getAvailableMissionActions(getMyId(), mission);
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) {
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
    }

    // 4. Render Messages
    await renderMessages();
}

async function handleChatAction(actionId, mission) {
    const contactId = currentChatContact.id;

    if (actionId === 'PROPOSE_PRICE') {
        closeAllOverlays();
        const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
        if (chatActionChoicesOverlay) {
            chatActionChoicesOverlay.style.display = 'flex';
        } else {
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
            refreshChatUI();
            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId, contactId } }));
        }
        return;
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
        const coPrestationTitle = document.getElementById('coPrestationTitle');
        const coDevisAmount = document.getElementById('coDevisAmount');
        const coLyannFee = document.getElementById('coLyannFee');
        const coAssuranceFee = document.getElementById('coAssuranceFee');
        const coTotalAmount = document.getElementById('coTotalAmount');

        if (coPrestationTitle) coPrestationTitle.textContent = mission.title;
        if (coDevisAmount) coDevisAmount.textContent = `${mission.agreed_price.toFixed(2)} €`;

        const fee = mission.agreed_price * 0.03;
        if (coLyannFee) coLyannFee.textContent = `${fee.toFixed(2)} €`;

        const prot = 4.90; // Fixed protection fee
        if (coAssuranceFee) coAssuranceFee.textContent = `${prot.toFixed(2)} €`;

        if (coTotalAmount) coTotalAmount.textContent = `${(mission.agreed_price + fee + prot).toFixed(2)} €`;

        closeAllOverlays();
        const chatCheckoutOverlay = document.getElementById('chatCheckoutOverlay');
        if (chatCheckoutOverlay) {
            chatCheckoutOverlay.style.display = 'flex';
        } else {
            window.LYANN_API_CLIENT.mockPayMission(mission.id);
            addMessageToContact(contactId, {
                type: 'system_card',
                cardType: 'PAYMENT_CONFIRMED',
                amount: mission.agreed_price,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            refreshChatUI();
            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId, contactId } }));
        }
        return;
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

// Intercept form submit and initialize chat contacts
function initChatSubmitAndContacts() {
    const dpForm = document.getElementById('directPriceForm');
    const mdForm = document.getElementById('milestoneDevisForm');
    if (window.lyannAlert) window.lyannAlert("DEBUG STARTUP: directPriceForm = " + (!!dpForm) + ", milestoneDevisForm = " + (!!mdForm));
    else alert("DEBUG STARTUP: directPriceForm = " + (!!dpForm) + ", milestoneDevisForm = " + (!!mdForm));

    const form = document.getElementById('chatInputForm');
    const input = document.getElementById('chatInputField');

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
            if (input) input.value = '';

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

    // Setup overlays click listeners
    const chatProposeBtn = document.getElementById('chatProposeBtn');
    const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
    const chatDirectPriceForm = document.getElementById('chatDirectPriceForm');
    const chatMilestoneDevisForm = document.getElementById('chatMilestoneDevisForm');
    const chatCheckoutOverlay = document.getElementById('chatCheckoutOverlay');
    const chatTrackingOverlay = document.getElementById('chatTrackingOverlay');
    const chatSubmitProofOverlay = document.getElementById('chatSubmitProofOverlay');

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
    document.querySelectorAll('.chat-overlay-pane .cancel-overlay-btn, .chat-overlay-pane .close-overlay-btn, .chat-overlay-pane .cancel-overlay-btn').forEach(btn => {
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
            if (window.lyannAlert) window.lyannAlert("DEBUG: Soumission du Tarif Direct détectée !");
            else alert("DEBUG: Soumission du Tarif Direct détectée !");
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

                // Submit offer
                await window.LYANN_API_CLIENT.mockProposePrice(getMyId(), currentChatContact.id, amount, desc);

                // Add system card
                await addMessageToContact(currentChatContact.id, {
                    type: 'system_card',
                    cardType: 'PRICE_PROPOSAL',
                    sender: getMyId(),
                    amount: amount,
                    title: desc,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                // Clean & close
                if (descInput) descInput.value = '';
                if (amountInput) amountInput.value = '';
                closeAllOverlays();
                refreshChatUI();

                window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_PRICE', contactId: currentChatContact.id } }));
            } catch (err) {
                console.error("Error in directPriceForm submit:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'envoi de l'offre : " + err.message);
                else alert("Erreur lors de l'envoi de l'offre : " + err.message);
            }
        });
    }

    // SUBMIT MILESTONE DEVIS
    const milestoneDevisForm = document.getElementById('milestoneDevisForm');
    if (milestoneDevisForm) {
        milestoneDevisForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (window.lyannAlert) window.lyannAlert("DEBUG: Soumission du Devis par Jalons détectée !");
            else alert("DEBUG: Soumission du Devis par Jalons détectée !");
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

        const contactList = [...defaultContacts];
        Object.keys(storedMsgs).forEach(contactId => {
            if (!contactList.some(c => c.id === contactId)) {
                // Find avatar from member list
                let avatar = 'david-34.png';
                if (window.LYANN_MEMBERS) {
                    const member = window.LYANN_MEMBERS.find(m => m.name === contactId || `${m.name} (${m.age} ans)` === contactId);
                    if (member) avatar = member.avatar;
                }
                
                const msgs = storedMsgs[contactId] || [];
                const lastMsg = msgs[msgs.length - 1];
                const preview = lastMsg ? (lastMsg.sender === 'me' ? 'Vous : ' + lastMsg.text : lastMsg.text) : 'Nouvelle conversation';

                contactList.push({
                    id: contactId,
                    name: contactId,
                    avatar: avatar,
                    preview: preview
                });
            }
        });

        listContainer.innerHTML = contactList.map(c => {
            const isActive = currentChatContact && currentChatContact.id === c.id;
            const lastMsgs = storedMsgs[c.id] || [];
            const lastMsg = lastMsgs[lastMsgs.length - 1];
            const previewText = lastMsg ? (lastMsg.sender === 'me' ? 'Vous : ' + lastMsg.text : lastMsg.text) : c.preview;
            return `
                <div class="chat-contact-item ${isActive ? 'active' : ''}" data-chat-member-id="${c.id}" style="cursor: pointer;">
                    <div class="chat-contact-avatar-wrap">
                        <img src="${c.avatar}" alt="${c.name}" class="chat-contact-avatar" onerror="this.src='david-34.png'">
                        <span class="online-dot"></span>
                    </div>
                    <div class="chat-contact-info">
                        <div class="chat-contact-name">${c.name}</div>
                        <div class="chat-contact-preview">${previewText}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Re-bind click events
        listContainer.querySelectorAll('.chat-contact-item').forEach(item => {
            item.addEventListener('click', () => {
                const contactId = item.getAttribute('data-chat-member-id');
                const contact = contactList.find(c => c.id === contactId);
                if (contact) {
                    openChatWithUser(contact.name, contact.avatar, contact.id);
                }
            });
        });
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

function initChatCloseBtn() {
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
}

window.addEventListener('lyann_missions_updated', () => refreshChatUI());

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
