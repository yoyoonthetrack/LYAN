const fs = require('fs');
const path = require('path');

const chat = fs.readFileSync(path.join(process.cwd(), 'chat-logic.js'), 'utf8');
const messaging = fs.readFileSync(path.join(process.cwd(), 'messaging-ui.js'), 'utf8');
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

expect(chat.includes("const isMe = msg.sender === 'me' || msg.sender === getMyId();"), 'Message ownership must accept normalized me/them sender values.');
expect(chat.includes('const messagesPromise = renderMessages();'), 'Messages must start rendering before request/mission context finishes.');
expect(chat.includes('await messagesPromise;'), 'Chat refresh must await the already-started message render.');

// V2 rule: the legacy chat core is an internal hydrator only. It must prepare
// content while hidden, then the canonical messaging controller reveals the shell.
expect(chat.includes('Hydrate header immediately, but do not reveal the shell.'), 'Legacy chat core must hydrate without revealing the shell.');
const coreStart = chat.indexOf('window.__LYANN_CHAT_CORE_OPEN = async function');
const coreEnd = chat.indexOf('window.refreshChatUI = async function', coreStart);
const coreBody = coreStart !== -1 && coreEnd > coreStart ? chat.slice(coreStart, coreEnd) : '';
expect(coreBody.length > 0, 'Legacy chat hydrator body must be discoverable.');
expect(!/modal\.style\.display\s*=\s*['"]flex['"]/.test(coreBody), 'Legacy chat core must not reveal chatModal directly.');
expect(!/modal\.classList\.add\(['"]active['"]\)/.test(coreBody), 'Legacy chat core must not activate chatModal directly.');
expect(messaging.includes("shell.classList.add('lyann-canonical-hydrating')"), 'Canonical controller must guard hydration from visual flashes.');
expect(messaging.includes('await legacyOpenConversation('), 'Canonical controller must await chat hydration.');
expect(messaging.includes('setShellVisible(true);'), 'Canonical controller must reveal the prepared shell.');

const hydrateIndex = messaging.indexOf('await legacyOpenConversation(');
const revealIndex = messaging.indexOf('setShellVisible(true);', hydrateIndex);
expect(hydrateIndex !== -1 && revealIndex > hydrateIndex, 'Shell reveal must happen after awaited hydration.');

if (errors.length) {
  console.error('Messaging responsiveness audit failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('Messaging responsiveness audit passed.');
