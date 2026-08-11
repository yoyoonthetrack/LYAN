/**
 * LYANN DOM — AI DEMO SIMULATOR
 * Intercepts chat actions and responds automatically using the Mock API.
 */

window.DEMO_AI_ENABLED = true;

const AI_PROFILES = {
    "David Jean-Baptiste": { role: "Plombier / Bricoleur", style: "pro, sympa", price: 80, delay: 1500 },
    "Tati Huguette Cazeau": { role: "Cliente senior", style: "douce, remercie", price: 40, delay: 2000 },
    "Sarah Manicon": { role: "Créatrice", style: "directe", price: 150, delay: 1000 }
};

document.addEventListener('lyann_chat_opened', (e) => {
    if (!window.DEMO_AI_ENABLED) return;
    const contactId = e.detail.contactId;
    console.log(`🤖 [AI Simulator] Chat opened with ${contactId}`);
});

document.addEventListener('lyann_chat_message_sent', (e) => {
    if (!window.DEMO_AI_ENABLED) return;
    const { text, contactId } = e.detail;
    
    // Simulate AI typing delay
    setTimeout(() => {
        let reply = "Je comprends. Laissez-moi regarder ça.";
        
        if (text.toLowerCase().includes("fuite") || text.toLowerCase().includes("portail")) {
            reply = "Oui je peux passer demain. Est-ce que ça vous convient ?";
        } else if (text.toLowerCase().includes("oui")) {
            reply = "Parfait, je vous propose un tarif pour bloquer le créneau.";
            // AI triggers a proposal shortly after
            setTimeout(() => {
                const amount = AI_PROFILES[contactId]?.price || 50;
                window.LYANN_API_CLIENT.mockProposePrice(contactId, "me", amount, "Intervention (Devis Automatique)");
                window.addMessageToContact(contactId, {
                    type: 'system_card',
                    cardType: 'PRICE_PROPOSAL',
                    sender: contactId,
                    amount: amount,
                    title: "Intervention",
                    timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }, 1000);
        }

        window.addMessageToContact(contactId, {
            type: 'text',
            sender: contactId,
            text: reply,
            timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        });
    }, AI_PROFILES[contactId]?.delay || 1500);
});

document.addEventListener('lyann_chat_action_taken', (e) => {
    if (!window.DEMO_AI_ENABLED) return;
    const { actionId, contactId } = e.detail;
    const mission = window.LYANN_API_CLIENT.getActiveMissionBetween("me", contactId);
    
    setTimeout(() => {
        if (actionId === 'PROPOSE_PRICE') {
            // User proposed price -> AI accepts it automatically
            window.LYANN_API_CLIENT.mockAcceptPrice(mission.id, contactId);
            window.addMessageToContact(contactId, {
                type: 'text',
                sender: contactId,
                text: "Ce tarif me convient parfaitement. J'accepte !",
                timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
            window.addMessageToContact(contactId, {
                type: 'system_card',
                cardType: 'AGREEMENT_REACHED',
                amount: mission.agreed_price,
                title: mission.title,
                timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
        }
        else if (actionId === 'PAY_MISSION') {
            // User paid -> AI says thanks and marks in progress
            window.addMessageToContact(contactId, {
                type: 'text',
                sender: contactId,
                text: "Paiement bien reçu sur le séquestre. J'attaque !",
                timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
            
            // AI finishes work quickly for demo purposes
            setTimeout(() => {
                window.LYANN_API_CLIENT.mockMarkMissionDone(mission.id);
                window.addMessageToContact(contactId, {
                    type: 'system_card',
                    cardType: 'WORK_DONE',
                    title: mission.title,
                    sender: contactId,
                    timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }, 3000);
        }
        else if (actionId === 'CONFIRM_DONE') {
            // User confirmed done
            window.addMessageToContact(contactId, {
                type: 'text',
                sender: contactId,
                text: "Merci beaucoup ! N'hésitez pas à me recommander.",
                timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
        }
    }, AI_PROFILES[contactId]?.delay || 1500);
});
