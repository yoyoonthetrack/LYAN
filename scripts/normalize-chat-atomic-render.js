const fs = require('fs');

const file = 'chat-logic.js';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes('let chatRenderGeneration = 0;')) {
  const anchor = 'async function renderMessages(passedMessages = null) {';
  if (!source.includes(anchor)) throw new Error('renderMessages anchor not found');
  source = source.replace(anchor, 'let chatRenderGeneration = 0;\n\n' + anchor);
}

const oldStart = `async function renderMessages(passedMessages = null) {\n    const container = document.getElementById('chatMessagesContainer');\n    if (!container) return;\n\n    // MANDATORY CONTRACT: ALWAYS CLEAR CONTAINER FIRST BEFORE ANY CHECK OR ASYNC FETCH\n    container.innerHTML = '';\n\n    if (!currentChatContact) {\n        renderEmptyConversationState(container);\n        return;\n    }`;

const newStart = `async function renderMessages(passedMessages = null) {\n    const container = document.getElementById('chatMessagesContainer');\n    if (!container) return;\n\n    // ATOMIC CHAT RENDER: keep the current conversation visible while fresh data is loading.\n    // Only the newest render is allowed to commit, preventing overlapping refreshes from flickering.\n    const renderGeneration = ++chatRenderGeneration;\n\n    if (!currentChatContact) {\n        container.innerHTML = '';\n        renderEmptyConversationState(container);\n        return;\n    }`;

if (source.includes(oldStart)) {
  source = source.replace(oldStart, newStart);
} else if (!source.includes('const renderGeneration = ++chatRenderGeneration;')) {
  throw new Error('renderMessages start shape changed');
}

const renderStart = source.indexOf('async function renderMessages(passedMessages = null) {');
const emptyAnchorText = `    if (!Array.isArray(msgs) || (msgs.length === 0 && realQuotes.length === 0)) {`;
const emptyAnchor = source.indexOf(emptyAnchorText, renderStart);
if (emptyAnchor < 0) throw new Error('renderMessages empty-state anchor changed');

const staleMarker = '    // Ignore stale async renders. A newer refresh already owns the DOM.';
const firstStale = source.indexOf(staleMarker, renderStart);
const canonicalCommit = `    // Ignore stale async renders. A newer refresh already owns the DOM.\n    if (renderGeneration !== chatRenderGeneration) return;\n\n    // Commit the fully prepared conversation in one DOM swap. Until this point, the old\n    // messages (including an optimistic outgoing message) stay visible.\n    container.innerHTML = '';\n\n`;

if (firstStale >= 0 && firstStale < emptyAnchor) {
  // Collapse any duplicated commit guards left by previous normalization runs.
  source = source.slice(0, firstStale) + canonicalCommit + source.slice(emptyAnchor);
} else {
  source = source.slice(0, emptyAnchor) + canonicalCommit + source.slice(emptyAnchor);
}

fs.writeFileSync(file, source);
console.log('Atomic chat rendering normalized idempotently.');
