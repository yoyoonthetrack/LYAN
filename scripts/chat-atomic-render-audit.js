const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const staleToken = 'if (renderGeneration !== chatRenderGeneration) return;';
const fetchToken = 'msgs = await getChatMessages(currentChatContact.id';
const atomicComment = 'ATOMIC CHAT RENDER';
const staleGuard = source.indexOf(staleToken);
const fetchAt = source.indexOf(fetchToken);
const atomicClear = source.indexOf("container.innerHTML = '';", staleGuard);
const staleGuardCount = source.split(staleToken).length - 1;
const pendingOptimistic = source.includes('[data-optimistic-status="sending"]');

const checks = [
  ['render generation state exists', source.includes('let chatRenderGeneration = 0;')],
  ['render increments generation', source.includes('const renderGeneration = ++chatRenderGeneration;')],
  ['stale renders are discarded', staleGuard >= 0],
  ['conversation is not cleared before async fetch', !source.includes('MANDATORY CONTRACT: ALWAYS CLEAR CONTAINER FIRST BEFORE ANY CHECK OR ASYNC FETCH')],
  ['atomic render keeps the thread visible while loading', source.includes(atomicComment)],
  ['DOM clear happens only after message fetch and stale-render guard', fetchAt >= 0 && staleGuard > fetchAt && atomicClear > staleGuard],
  ['exactly one stale-render guard is present', staleGuardCount === 1],
  ['pending outgoing bubbles are preserved across rebuild', pendingOptimistic]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
