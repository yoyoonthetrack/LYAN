const fs = require('fs');

const file = 'chat-logic.js';
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `    // Fetch real quotes from Supabase for this conversation / invitation if authenticated\n    let realQuotes = [];\n    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase && isUUID(currentChatContact.id)) {\n        try {\n            const activeInv = await window.LYANN_API_CLIENT.getActiveInvitationBetween(getMyId(), currentChatContact.id);\n            if (activeInv) {\n                const fetchedQuotes = await window.LYANN_API_CLIENT.getQuotesForInvitation(activeInv.id);\n                for (let q of fetchedQuotes) {\n                    q.milestones = await window.LYANN_API_CLIENT.getMilestonesForQuote(q.id);\n                    realQuotes.push(q);\n                }\n            }\n        } catch(err) {\n            console.warn(\"Erreur chargement devis réels Supabase:\", err);\n        }\n    }`;

const newBlock = `    // Quote context is prepared by the shared messaging repository in one cached batch.\n    let realQuotes = [];\n    if (window.LYANN_MESSAGING_REPOSITORY && isUUID(currentChatContact.id)) {\n        try {\n            realQuotes = await window.LYANN_MESSAGING_REPOSITORY.getQuoteContext(getMyId(), currentChatContact.id);\n        } catch(err) {\n            console.warn(\"Erreur chargement contexte devis:\", err);\n        }\n    }`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes('LYANN_MESSAGING_REPOSITORY.getQuoteContext')) {
  throw new Error('Legacy quote loading block not found');
}

fs.writeFileSync(file, source);
console.log('Chat quote context normalized.');
