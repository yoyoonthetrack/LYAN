const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const staleGuard = source.indexOf('if (renderGeneration !== chatRenderGeneration) return;');
const atomicClear = source.indexOf("container.innerHTML = '';", staleGuard);
const messageFetch = source.indexOf('msgs = await getChatMessages(currentChatContact.id);');

const checks = [
  ['render generation state exists', source.includes('let chatRenderGeneration = 0;')],
  ['render increments generation', source.includes('const renderGeneration = ++chatRenderGeneration;')],
  ['stale renders are discarded', staleGuard >= 0],
  ['conversation is not cleared before async fetch', !source.includes('MANDATORY CONTRACT: ALWAYS CLEAR CONTAINER FIRST BEFORE ANY CHECK OR ASYNC FETCH')],
  ['atomic commit marker exists', source.includes('Commit the fully prepared conversation in one DOM swap')],
  ['DOM clear happens only after message fetch and stale-render guard', messageFetch >= 0 && staleGuard > messageFetch && atomicClear > staleGuard]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
