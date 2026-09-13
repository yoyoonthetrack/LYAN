const fs = require('fs');
const source = fs.readFileSync('chat-logic.js', 'utf8');

const checks = [
  ['proposal overlay context helper exists', source.includes('function setChatContextCoveredByOverlay(isCovered)')],
  ['canonical child surface opener exists', source.includes('function openChatChildSurface(id)')],
  ['closing overlays restores context', source.includes('setChatContextCoveredByOverlay(false);')],
  ['proposal choice uses canonical child surface', source.includes("openChatChildSurface('chatActionChoicesOverlay')")],
  ['direct price hides context', source.includes("chatDirectPriceForm.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);") || source.includes("openChatChildSurface('chatDirectPriceForm')")],
  ['milestone quote hides context', source.includes("chatMilestoneDevisForm.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);") || source.includes("openChatChildSurface('chatMilestoneDevisForm')")],
  ['direct price focuses first required field', source.includes("chatDirectPriceForm.querySelector('[required]')")],
  ['milestone quote focuses first required field', source.includes("chatMilestoneDevisForm.querySelector('[required]')")]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log('Chat proposal overlay audit passed.');
