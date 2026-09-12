const fs = require('fs');
const path = require('path');

const chat = fs.readFileSync(path.join(process.cwd(), 'chat-logic.js'), 'utf8');
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

expect(chat.includes("const isMe = msg.sender === 'me' || msg.sender === getMyId();"), 'Message ownership must accept normalized me/them sender values.');
expect(chat.includes('IMMEDIATE CHAT SHELL: show the conversation before any profile/network lookup.'), 'Chat shell must open before profile/network lookup.');
expect(chat.includes('const messagesPromise = renderMessages();'), 'Messages must start rendering before request/mission context finishes.');
expect(chat.includes('await messagesPromise;'), 'Chat refresh must await the already-started message render.');

const shellIndex = chat.indexOf('IMMEDIATE CHAT SHELL:');
const profileAwaitIndex = chat.indexOf("const prof = await window.LYANN_API_CLIENT.getUserProfile(contactId);");
expect(shellIndex !== -1 && profileAwaitIndex !== -1 && shellIndex < profileAwaitIndex, 'Immediate chat shell must precede awaited profile lookup.');

if (errors.length) {
  console.error('Messaging responsiveness audit failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('Messaging responsiveness audit passed.');
