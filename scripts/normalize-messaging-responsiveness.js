const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'chat-logic.js');
let src = fs.readFileSync(file, 'utf8');
let changed = false;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) throw new Error(`Messaging normalizer could not find ${label}`);
  src = src.replace(from, to);
  changed = true;
}

replaceOnce(
  "        const isMe = msg.sender === getMyId();",
  "        const isMe = msg.sender === 'me' || msg.sender === getMyId();",
  'message ownership comparison'
);

replaceOnce(
  "    let displayName = name;\n    let displayAvatar = avatar;\n\n    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getUserProfile === 'function' && contactId && isUUID(contactId)) {",
  "    let displayName = name;\n    let displayAvatar = avatar;\n\n    // IMMEDIATE CHAT SHELL: show the conversation before any profile/network lookup.\n    const initialHeaderName = document.getElementById('chatHeaderName');\n    const initialHeaderAvatar = document.getElementById('chatHeaderAvatar');\n    if (initialHeaderName) initialHeaderName.textContent = displayName || 'Membre LYANN';\n    if (initialHeaderAvatar && displayAvatar) initialHeaderAvatar.src = displayAvatar;\n    if (modal) {\n        modal.removeAttribute('style');\n        modal.style.display = 'flex';\n        modal.classList.add('active');\n    }\n    document.body.style.overflow = 'hidden';\n    document.querySelectorAll('.chat-modal-layout').forEach(l => l.classList.add('mobile-conversation-active'));\n\n    if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getUserProfile === 'function' && contactId && isUUID(contactId)) {",
  'immediate chat shell insertion'
);

replaceOnce(
  "    if (typeof window.updateChatFavHeaderUI === 'function') {\n        window.updateChatFavHeaderUI();\n    }\n\n    const myUserId = getMyId();",
  "    if (typeof window.updateChatFavHeaderUI === 'function') {\n        window.updateChatFavHeaderUI();\n    }\n\n    // Start message rendering immediately; mission/request context can resolve in parallel.\n    const messagesPromise = renderMessages();\n\n    const myUserId = getMyId();",
  'parallel message rendering start'
);

replaceOnce(
  "    await renderMessages();\n}\n\nwindow.handleAcceptQuote",
  "    await messagesPromise;\n}\n\nwindow.handleAcceptQuote",
  'parallel message rendering completion'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log('Messaging responsiveness normalization applied.');
} else {
  console.log('Messaging responsiveness already normalized.');
}
