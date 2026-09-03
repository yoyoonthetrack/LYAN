/**
 * LYANN DOM — AI DEMO SIMULATOR
 * Intercepts chat actions and responds automatically using the Mock API.
 * Supports all members (static + AI profiles) dynamically.
 */

window.DEMO_AI_ENABLED = true;

// Helper to get member details dynamically
function getMemberByName(name) {
    if (!window.LYANN_MEMBERS) return null;
    return window.LYANN_MEMBERS.find(m => m.name === name || m.name.includes(name) || name.includes(m.name.split(' (')[0]));
}

window.addEventListener('lyann_chat_opened', (e) => {
    if (!window.DEMO_AI_ENABLED) return;
    const contactId = e.detail.contactId;
    console.log(`🤖 [AI Simulator] Chat opened with ${contactId}`);
    
    // If it's a new chat and there are no messages yet, send a welcome greeting
    setTimeout(() => {
        let storedMsgs = {};
        try {
            const stored = localStorage.getItem('lyann_mock_chat_msgs');
            if (stored) storedMsgs = JSON.parse(stored);
        } catch(err) {}
        
        const msgs = storedMsgs[contactId] || [];
        if (msgs.length === 0) {
            const member = getMemberByName(contactId);
            let welcome = "Bonjour ! Comment puis-je vous aider aujourd'hui ?";
            if (member) {
                const nameOnly = member.name.split(' (')[0];
                if (member.category === 'citoyen') {
                    welcome = `Bonjour ! Je suis ${nameOnly}. Je propose de l'entraide gratuite dans le quartier. De quoi avez-vous besoin ?`;
                } else {
                    welcome = `Bonjour, c'est ${nameOnly}. Je suis disponible pour toute prestation de ${member.role}. N'hésitez pas à me décrire votre besoin !`;
                }
            }
            
            window.addMessageToContact(contactId, {
                type: 'text',
                sender: contactId,
                text: welcome,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    }, 1000);
});

window.addEventListener('lyann_chat_message_sent', (e) => {
    if (!window.DEMO_AI_ENABLED) return;
    const { text, contactId } = e.detail;
    
    const member = getMemberByName(contactId);
    const isCitizen = member && (member.category === 'citoyen' || member.hourlyRate.toLowerCase().includes("entraide") || member.hourlyRate.toLowerCase().includes("gratuit"));
    const roleName = member ? member.role.toLowerCase() : "prestataire";

    // Simulate AI typing delay
    setTimeout(() => {
        let reply = "Je comprends tout à fait. Discutons-en pour caler les détails !";
        
        const lowerText = text.toLowerCase();
        
        if (isCitizen) {
            // Citizen (Free support / Mutual aid)
            if (lowerText.includes("aide") || lowerText.includes("coup de main") || lowerText.includes("dispo") || lowerText.includes("bonjour") || lowerText.includes("salut")) {
                reply = `Bonjour ! Oui, je serais ravi de vous donner un coup de main bénévolement. Je suis disponible dans le quartier. Qu'est-ce que je peux faire pour vous aider ?`;
            } else if (lowerText.includes("merci") || lowerText.includes("super") || lowerText.includes("cool") || lowerText.includes("génial")) {
                reply = "Avec plaisir ! C'est ça l'esprit de voisinage sur LYANN. Pas besoin de paiement, on fait ça à la bonne franquette !";
            } else if (lowerText.includes("quand") || lowerText.includes("heure") || lowerText.includes("jour")) {
                reply = "Je suis plutôt disponible en fin d'après-midi ou le week-end. Dites-moi ce qui vous arrange le mieux !";
            } else {
                reply = "Entendu, on s'organise ça très vite. Je reste à votre écoute pour fixer un moment !";
            }
        } else {
            // Professional / Service Provider
            if (lowerText.includes("bonjour") || lowerText.includes("dispo") || lowerText.includes("panne") || lowerText.includes("problème") || lowerText.includes("devis") || lowerText.includes("tarif")) {
                reply = `Bonjour ! Oui, je suis tout à fait disponible pour intervenir. En tant que spécialiste (${member ? member.role : 'professionnel'}), je peux regarder cela de près. Pouvez-vous me donner plus de détails ou me confirmer si je propose un prix pour l'intervention ?`;
            } else if (lowerText.includes("tarif") || lowerText.includes("combien") || lowerText.includes("prix") || lowerText.includes("proposer") || lowerText.includes("ok") || lowerText.includes("oui") || lowerText.includes("d'accord")) {
                // Extract clean numerical rate or default to 45
                let defaultPrice = 45;
                if (member && member.hourlyRate) {
                    const matches = member.hourlyRate.match(/\d+/);
                    if (matches) defaultPrice = parseInt(matches[0], 10);
                }
                
                reply = `Entendu ! Je vous soumets immédiatement une proposition de prix de ${defaultPrice}€ pour cette prestation. Vous pourrez l'accepter directement depuis l'interface de discussion.`;
                
                // AI triggers a proposal shortly after
                setTimeout(() => {
                    const missionTitle = `Prestation de ${member ? member.role : 'Service'}`;
                    window.LYANN_API_CLIENT.mockProposePrice(contactId, "me", defaultPrice, missionTitle);
                    window.addMessageToContact(contactId, {
                        type: 'system_card',
                        cardType: 'PRICE_PROPOSAL',
                        sender: contactId,
                        amount: defaultPrice,
                        title: missionTitle,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                }, 1200);
            } else if (lowerText.includes("merci") || lowerText.includes("parfait")) {
                reply = "À votre service ! N'hésitez pas à valider l'étape en cours pour que nous puissions avancer.";
            } else {
                reply = "C'est bien noté. Dites-moi si vous souhaitez que je vous envoie un devis/proposition de tarif pour valider l'intervention !";
            }
        }

        window.addMessageToContact(contactId, {
            type: 'text',
            sender: contactId,
            text: reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }, 1500);
});

window.addEventListener('lyann_chat_action_taken', (e) => {
    if (!window.DEMO_AI_ENABLED) return;
    const { actionId, contactId } = e.detail;
    const mission = window.LYANN_API_CLIENT.getActiveMissionBetween("me", contactId);
    
    setTimeout(() => {
        if (actionId === 'PROPOSE_PRICE') {
            // User proposed price -> AI accepts it automatically
            if (mission) {
                window.LYANN_API_CLIENT.mockAcceptPrice(mission.id, contactId);
                window.addMessageToContact(contactId, {
                    type: 'text',
                    sender: contactId,
                    text: `C'est parfait pour moi ! J'accepte votre proposition de ${mission.agreed_price}€. Vous pouvez maintenant procéder au paiement sécurisé (séquestre) pour démarrer l'intervention.`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
                window.addMessageToContact(contactId, {
                    type: 'system_card',
                    cardType: 'AGREEMENT_REACHED',
                    amount: mission.agreed_price,
                    title: mission.title,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        }
        else if (actionId === 'PAY_MISSION') {
            // User paid -> AI says thanks and marks in progress
            if (mission) {
                window.addMessageToContact(contactId, {
                    type: 'text',
                    sender: contactId,
                    text: `Super, paiement bien reçu et sécurisé par LYANN ! Je m'occupe de l'intervention immédiatement. Je vous préviens dès que c'est fait.`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
                
                // AI finishes work quickly for demo purposes
                setTimeout(() => {
                    window.LYANN_API_CLIENT.mockMarkMissionDone(mission.id);
                    window.addMessageToContact(contactId, {
                        type: 'text',
                        sender: contactId,
                        text: `Voilà, j'ai terminé l'intervention conformément à notre accord. Pouvez-vous valider et confirmer la fin des travaux de votre côté ? Merci !`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                    window.addMessageToContact(contactId, {
                        type: 'system_card',
                        cardType: 'WORK_DONE',
                        title: mission.title,
                        sender: contactId,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                }, 4000);
            }
        }
        else if (actionId === 'CONFIRM_DONE') {
            // User confirmed done
            window.addMessageToContact(contactId, {
                type: 'text',
                sender: contactId,
                text: "Un grand merci pour votre confiance et la validation ! À très bientôt sur LYANN DOM. Passez une excellente journée !",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    }, 1500);
});
