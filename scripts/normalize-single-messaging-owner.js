const fs = require('fs');

const chatPath = 'chat-logic.js';
const shellPath = 'app-shell.js';
const controllerPath = 'messaging-ui.js';

let chat = fs.readFileSync(chatPath, 'utf8');
let shell = fs.readFileSync(shellPath, 'utf8');
let controller = fs.readFileSync(controllerPath, 'utf8');

// chat-logic owns the conversation implementation only; it no longer publishes
// a competing global navigation API.
chat = chat.replace(
  'window.openChatWithUser = async function (name, avatar, contactId = name, initialNeed = null) {',
  'window.__LYANN_CHAT_CORE_OPEN = async function (name, avatar, contactId = name, initialNeed = null) {'
);

// The canonical controller captures the private core implementation.
controller = controller.replace(
  "const legacyOpenConversation = typeof window.openChatWithUser === 'function'\n        ? window.openChatWithUser.bind(window)\n        : null;",
  "const legacyOpenConversation = typeof window.__LYANN_CHAT_CORE_OPEN === 'function'\n        ? window.__LYANN_CHAT_CORE_OPEN.bind(window)\n        : null;"
);

// app-shell no longer contains its own messaging state machine. Keep only a
// compatibility bridge for code that executes before messaging-ui.js is loaded.
const startMarker = 'window.openLyannMessagesModal = async function() {';
const endMarker = '\n};\n\nasync function injectMobileInterface()';
const start = shell.indexOf(startMarker);
const end = start === -1 ? -1 : shell.indexOf(endMarker, start);
if (start !== -1 && end !== -1) {
  const bridge = `window.openLyannMessagesModal = function() {\n    if (window.LYANN_MESSAGING) return window.LYANN_MESSAGING.openList();\n    console.warn('[MESSAGING] canonical controller not ready yet');\n    return Promise.resolve();\n};`;
  shell = shell.slice(0, start) + bridge + shell.slice(end + 3);
}

fs.writeFileSync(chatPath, chat);
fs.writeFileSync(shellPath, shell);
fs.writeFileSync(controllerPath, controller);
console.log('Legacy public chat openers retired; canonical controller is sole owner.');
