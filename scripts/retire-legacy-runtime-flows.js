const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

function removeBetween(startMarker, endMarker, replacement = '') {
  const start = source.indexOf(startMarker);
  if (start === -1) return false;
  const end = source.indexOf(endMarker, start);
  if (end === -1 || end <= start) throw new Error(`Missing end marker for ${startMarker}`);
  source = source.slice(0, start) + replacement + source.slice(end);
  return true;
}

// Diagnostic-only observer: safe to remove as one complete block.
removeBetween(
  '(function setupWizardDomObserver() {',
  '    async function syncWizardTaxonomyDropdowns(result) {',
  '    async function syncWizardTaxonomyDropdowns(result) {'
);

// Remove only self-contained delayed debug logs; do not rewrite surrounding control flow.
source = source.replace(
  /\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+500ms :'[\s\S]*?\n\s*\}, 500\);\n\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+1500ms :'[\s\S]*?\n\s*\}, 1500\);/g,
  ''
);

// Retire the entire self-contained fake transaction/chat demo engine. This is bounded by
// its section marker and the next explicit DOM-ready bootstrap marker.
removeBetween(
  '/* ==========================================================================\n   SIMULATED TRANSACTION CHAT (BOKANTAJ JOB FLOW)',
  "// --- DOM READY : deep-link chat bootstrap ---",
  ''
);

if (source === before) {
  console.log('Legacy runtime flows already retired.');
  process.exit(0);
}
fs.writeFileSync(file, source, 'utf8');
console.log('Retired temporary wizard observer and simulated transaction/chat engine.');
