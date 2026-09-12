const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const checks = [
  ['render generation state exists', source.includes('let chatRenderGeneration = 0;')],
  ['render increments generation', source.includes('const renderGeneration = ++chatRenderGeneration;')],
  ['stale renders are discarded', source.includes('if (renderGeneration !== chatRenderGeneration) return;')],
  ['conversation is not cleared before async fetch', !source.includes('MANDATORY CONTRACT: ALWAYS CLEAR CONTAINER FIRST BEFORE ANY CHECK OR ASYNC FETCH')],
  ['atomic commit marker exists', source.includes('Commit the fully prepared conversation in one DOM swap')]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
