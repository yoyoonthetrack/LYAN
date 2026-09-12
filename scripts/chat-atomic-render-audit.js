const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const staleToken = 'if (renderGeneration !== chatRenderGeneration) return;';
const commitToken = 'Commit the fully prepared conversation in one DOM swap';
const staleGuard = source.indexOf(staleToken);
const atomicClear = source.indexOf("container.innerHTML = '';", staleGuard);
const messageFetch = source.indexOf('msgs = await getChatMessages(currentChatContact.id);');
const staleGuardCount = source.split(staleToken).length - 1;
const commitMarkerCount = source.split(commitToken).length - 1;

const checks = [
  ['render generation state exists', source.includes('let chatRenderGeneration = 0;')],
  ['render increments generation', source.includes('const renderGeneration = ++chatRenderGeneration;')],
  ['stale renders are discarded', staleGuard >= 0],
  ['conversation is not cleared before async fetch', !source.includes('MANDATORY CONTRACT: ALWAYS CLEAR CONTAINER FIRST BEFORE ANY CHECK OR ASYNC FETCH')],
  ['atomic commit marker exists', source.includes(commitToken)],
  ['DOM clear happens only after message fetch and stale-render guard', messageFetch >= 0 && staleGuard > messageFetch && atomicClear > staleGuard],
  ['exactly one stale-render guard is present', staleGuardCount === 1],
  ['exactly one atomic commit block is present', commitMarkerCount === 1]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
