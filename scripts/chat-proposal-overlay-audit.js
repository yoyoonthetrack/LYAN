const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const checks = [
  ['proposal overlay context helper exists', source.includes('function setChatContextCoveredByOverlay(isCovered)')],
  ['closing overlays restores context', source.includes('setChatContextCoveredByOverlay(false);')],
  ['proposal choice hides context', source.includes("chatActionChoicesOverlay.style.display = 'flex';\n            setChatContextCoveredByOverlay(true);"))],
  ['direct price hides context', source.includes("chatDirectPriceForm.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);"))],
  ['milestone quote hides context', source.includes("chatMilestoneDevisForm.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);"))],
  ['direct price focuses first required field', source.includes("chatDirectPriceForm.querySelector('[required]')"))],
  ['milestone quote focuses first required field', source.includes("chatMilestoneDevisForm.querySelector('[required]')"))]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log('Chat proposal overlay audit passed.');
