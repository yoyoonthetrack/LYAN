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
