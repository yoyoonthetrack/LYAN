const fs = require('fs');

const CHAT = 'chat-logic.js';
const SHELL = 'app-shell.js';

let chat = fs.readFileSync(CHAT, 'utf8');
let shell = fs.readFileSync(SHELL, 'utf8');
let changed = false;

// 1) The first proposal-choice surface must cover the mission context immediately.
const oldProposal = `if (chatProposeBtn) {\n        chatProposeBtn.addEventListener('click', () => {\n            closeAllOverlays();\n            if (chatActionChoicesOverlay) chatActionChoicesOverlay.style.display = 'flex';\n        });\n    }`;
const newProposal = `if (chatProposeBtn) {\n        chatProposeBtn.addEventListener('click', () => {\n            closeAllOverlays();\n            if (chatActionChoicesOverlay) {\n                chatActionChoicesOverlay.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);\n            }\n        });\n    }`;
if (chat.includes(oldProposal)) {
    chat = chat.replace(oldProposal, newProposal);
    changed = true;
} else if (!chat.includes('chatActionChoicesOverlay.style.display = \'flex\';\n                setChatContextCoveredByOverlay(true);')) {
    throw new Error('Unable to normalize initial chat proposal overlay');
}

// 2) Counter-offer/direct price is also a child surface and must cover mission context.
const oldCounter = `if (overlay) {\n            overlay.style.display = 'flex';\n            const titleEl = overlay.querySelector('.mobile-form-title');`;
const newCounter = `if (overlay) {\n            overlay.style.display = 'flex';\n            setChatContextCoveredByOverlay(true);\n            const titleEl = overlay.querySelector('.mobile-form-title');`;
if (chat.includes(oldCounter)) {
    chat = chat.replace(oldCounter, newCounter);
    changed = true;
}

// 3) Messages entry points must resume the exact same canonical conversation UI as “Je peux aider”.
const legacyStartMarker = 'window.openLyannMessagesModal = function() {';
const canonicalStartMarker = 'window.openLyannMessagesModal = async function() {';
const endMarker = '\n};\n\nasync function injectMobileInterface()';
let start = shell.indexOf(legacyStartMarker);
if (start === -1) start = shell.indexOf(canonicalStartMarker);
const end = start === -1 ? -1 : shell.indexOf(endMarker, start);
if (start === -1 || end === -1) throw new Error('openLyannMessagesModal block not found');

const canonical = `window.openLyannMessagesModal = async function() {\n    try { triggerHaptic('light'); } catch(e) {}\n\n    // One canonical chat implementation: resume the last real conversation with\n    // the same openChatWithUser() path used by “Je peux aider”.\n    try {\n        const raw = localStorage.getItem('lyann_last_active_contact');\n        const last = raw ? JSON.parse(raw) : null;\n        if (last && last.id && typeof window.openChatWithUser === 'function') {\n            return await window.openChatWithUser(\n                last.name || 'Membre LYANN',\n                last.avatar || (window.getLyannDefaultAvatar ? window.getLyannDefaultAvatar() : ''),\n                last.id,\n                null\n            );\n        }\n    } catch (e) {\n        console.warn('[MESSAGES ENTRY] Unable to restore last conversation', e);\n    }\n\n    const modal = document.getElementById('chatModal');\n    if (modal) {\n        document.body.classList.add('hide-bottom-nav');\n        document.body.classList.add('in-chat-active');\n        modal.removeAttribute('style');\n        modal.style.display = 'flex';\n        modal.classList.add('active');\n        document.body.style.overflow = 'hidden';\n\n        // With no previous contact, deliberately show the conversation list, but\n        // keep the exact same modal/layout implementation.\n        document.querySelectorAll('.chat-modal-layout').forEach(layout => {\n            layout.classList.remove('mobile-conversation-active');\n        });\n\n        if (typeof window.renderContactsList === 'function') {\n            try { await window.renderContactsList(); } catch(e) {}\n        } else if (typeof window.renderChatContacts === 'function') {\n            try { await window.renderChatContacts(); } catch(e) {}\n        }\n    } else {\n        window.location.href = 'feed.html?action=openchat';\n    }\n};`;

const currentBlock = shell.slice(start, end + 3);
if (!currentBlock.includes("localStorage.getItem('lyann_last_active_contact')") || !currentBlock.includes('window.openChatWithUser')) {
    shell = shell.slice(0, start) + canonical + shell.slice(end + 3);
    changed = true;
}

if (changed) {
    fs.writeFileSync(CHAT, chat);
    fs.writeFileSync(SHELL, shell);
    console.log('Chat proposal layering and messages entry unified.');
} else {
    console.log('Chat proposal layering and messages entry already unified.');
}
