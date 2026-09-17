const fs = require('fs');

const chatPath = 'chat-logic.js';
const shellPath = 'app-shell.js';
const cssPath = 'style.css';

let chat = fs.readFileSync(chatPath, 'utf8');
let shell = fs.readFileSync(shellPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

// Keep the exact selected conversation available to every app entry point.
const contactAssignment = `currentChatContact = { id: contactId, name: displayName, avatar: displayAvatar };`;
const contactMirror = `${contactAssignment}\n    window.LYANN_ACTIVE_CHAT_CONTACT = { ...currentChatContact };`;
if (chat.includes(contactAssignment) && !chat.includes('window.LYANN_ACTIVE_CHAT_CONTACT = { ...currentChatContact };')) {
    chat = chat.replace(contactAssignment, contactMirror);
}

// Bottom Messages tab must reopen the exact canonical conversation selected by
// “Je peux aider”, preferring the live in-memory contact over stale storage.
const oldRestore = `const raw = localStorage.getItem('lyann_last_active_contact');\n        const last = raw ? JSON.parse(raw) : null;`;
const newRestore = `const liveContact = window.LYANN_ACTIVE_CHAT_CONTACT && window.LYANN_ACTIVE_CHAT_CONTACT.id\n            ? window.LYANN_ACTIVE_CHAT_CONTACT\n            : null;\n        const raw = localStorage.getItem('lyann_last_active_contact');\n        const storedContact = raw ? JSON.parse(raw) : null;\n        const last = liveContact || storedContact;`;
if (shell.includes(oldRestore)) {
    shell = shell.replace(oldRestore, newRestore);
}

// Capture the bottom-tab click before any legacy listener can route to another chat surface.
const oldTabHandler = `tabMessages.addEventListener('click', (e) => {\n                e.preventDefault();\n                window.openLyannMessagesModal();\n            });`;
const newTabHandler = `tabMessages.addEventListener('click', async (e) => {\n                e.preventDefault();\n                e.stopPropagation();\n                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();\n                await window.openLyannMessagesModal();\n            }, true);`;
if (shell.includes(oldTabHandler)) {
    shell = shell.replace(oldTabHandler, newTabHandler);
}

// Structural CSS fallback: when a child chat surface is visibly open, the
// parent mission card must never sit above it, even before JS state catches up.
const marker = '/* LYANN CHAT CHILD SURFACE ROUTING CONTRACT v1 */';
if (!css.includes(marker)) {
    css += `\n${marker}\nbody:has(#chatActionChoicesOverlay[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatDirectPriceForm[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatMilestoneDevisForm[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatCheckoutOverlay[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatTrackingOverlay[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatSubmitProofOverlay[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatProposeDateForm[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatLeaveReviewForm[style*="display: flex"]) #chatMissionContextBar,\nbody:has(#chatActionChoicesOverlay[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatDirectPriceForm[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatMilestoneDevisForm[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatCheckoutOverlay[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatTrackingOverlay[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatSubmitProofOverlay[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatProposeDateForm[style*="display:flex"]) #chatMissionContextBar,\nbody:has(#chatLeaveReviewForm[style*="display:flex"]) #chatMissionContextBar {\n    display: none !important;\n}\n\nbody:has(#chatTrackingOverlay[style*="display: flex"]) #chatTrackingOverlay,\nbody:has(#chatTrackingOverlay[style*="display:flex"]) #chatTrackingOverlay {\n    z-index: 400 !important;\n}\n`;
}

fs.writeFileSync(chatPath, chat);
fs.writeFileSync(shellPath, shell);
fs.writeFileSync(cssPath, css);
console.log('Chat surface routing normalization complete.');
