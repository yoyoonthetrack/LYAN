const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const checks = [
  ['optimistic renderer exists', source.includes('function renderOptimisticChatMessage(msgObj)')],
  ['message rendered before Supabase conversation lookup', source.indexOf('renderOptimisticChatMessage(normalizedMsg)') < source.indexOf('getOrCreateConversation(userId, contactId)')],
  ['failed sends remain visible', source.includes("status.textContent = time + ' · Non envoyé'")],
  ['sending state visible', source.includes("meta.textContent = time + ' · Envoi…'")],
  ['server reconciliation rerenders canonical messages', source.includes('await renderMessages();')]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log('Optimistic chat send audit passed.');
