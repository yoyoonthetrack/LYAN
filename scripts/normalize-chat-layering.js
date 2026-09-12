const fs = require('fs');

const chatPath = 'chat-logic.js';
const cssPath = 'style.css';
let chat = fs.readFileSync(chatPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

// Make overlay state structural, not an inline display race that renderMessages can overwrite.
chat = chat.replace(
/function setChatContextCoveredByOverlay\(isCovered\) \{[\s\S]*?\n\}/,
`function setChatContextCoveredByOverlay(isCovered) {
    const mainArea = document.querySelector('.chat-main-area');
    if (!mainArea) return;
    mainArea.classList.toggle('chat-child-surface-active', !!isCovered);
}`
);

// Keep the parent mission/context bar covered whenever ANY child chat surface is actually open.
// This removes the need for every individual button handler to remember to toggle the state.
const overlaySyncMarker = '// LYANN CHAT CHILD SURFACE AUTO-SYNC v1';
if (!chat.includes(overlaySyncMarker)) {
    const insertAfter = `function setChatContextCoveredByOverlay(isCovered) {\n    const mainArea = document.querySelector('.chat-main-area');\n    if (!mainArea) return;\n    mainArea.classList.toggle('chat-child-surface-active', !!isCovered);\n}`;
    const overlaySyncBlock = `\n\n${overlaySyncMarker}\nconst CHAT_CHILD_SURFACE_IDS = [\n    'chatActionChoicesOverlay',\n    'chatDirectPriceForm',\n    'chatMilestoneDevisForm',\n    'chatCheckoutOverlay',\n    'chatTrackingOverlay',\n    'chatSubmitProofOverlay',\n    'chatProposeDateForm',\n    'chatLeaveReviewForm'\n];\n\nfunction syncChatChildSurfaceState() {\n    const anyOpen = CHAT_CHILD_SURFACE_IDS.some(id => {\n        const el = document.getElementById(id);\n        if (!el) return false;\n        return window.getComputedStyle(el).display !== 'none';\n    });\n    setChatContextCoveredByOverlay(anyOpen);\n}\n\nfunction installChatChildSurfaceStateSync() {\n    const surfaces = CHAT_CHILD_SURFACE_IDS\n        .map(id => document.getElementById(id))\n        .filter(Boolean);\n\n    if (!surfaces.length) return;\n\n    const observer = new MutationObserver(() => syncChatChildSurfaceState());\n    surfaces.forEach(surface => observer.observe(surface, { attributes: true, attributeFilter: ['style', 'class'] }));\n    syncChatChildSurfaceState();\n}\n\nif (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', installChatChildSurfaceStateSync, { once: true });\n} else {\n    installChatChildSurfaceStateSync();\n}\n`;
    if (!chat.includes(insertAfter)) throw new Error('Unable to locate chat overlay coverage function.');
    chat = chat.replace(insertAfter, insertAfter + overlaySyncBlock);
}

// Ensure the Lyann detail opened from chat is deliberately stacked above chat.
chat = chat.replace(
`if (typeof window.openLyannDetailModal === 'function') {\n                        window.openLyannDetailModal(requestContext.requestId);\n                    }`,
`if (typeof window.openLyannDetailModal === 'function') {
                        document.body.classList.add('chat-child-modal-open');
                        window.openLyannDetailModal(requestContext.requestId);
                        requestAnimationFrame(() => {
                            const detail = document.getElementById('lyannDetailModal');
                            if (detail) detail.classList.add('opened-from-chat');
                        });
                    }`
);

const marker = '/* LYANN CHAT LAYERING CONTRACT v2 */';
const block = `\n${marker}\n.chat-main-area.chat-child-surface-active #chatMissionContextBar,\n.chat-main-area.chat-child-surface-active #chatMissionContext,\n.chat-main-area.chat-child-surface-active #chatContextualActionsBar,\n.chat-main-area.chat-child-surface-active #chatViewMissionBtn {\n    display: none !important;\n}\n\n.chat-main-area.chat-child-surface-active .chat-overlay-pane {\n    top: 73px !important;\n    z-index: 250 !important;\n}\n\nbody.chat-child-modal-open #lyannDetailModal.opened-from-chat,\nbody.chat-child-modal-open #publicMemberProfileModal,\nbody.chat-child-modal-open #quickProfileModal {\n    z-index: 20050 !important;\n}\n\nbody.chat-child-modal-open #chatModal {\n    z-index: 20000 !important;\n}\n`;

if (!css.includes(marker)) css += block;

fs.writeFileSync(chatPath, chat);
fs.writeFileSync(cssPath, css);
console.log('Chat layering normalization complete.');
