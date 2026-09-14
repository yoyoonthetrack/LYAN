const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

const startMarker = '/* ==========================================================================\n   SIMULATED TRANSACTION CHAT (BOKANTAJ JOB FLOW)';
const start = source.indexOf(startMarker);
if (start !== -1) {
  const endMarker = "if (document.readyState === 'loading') {";
  const end = source.indexOf(endMarker, start);
  if (end === -1 || end <= start) throw new Error('Unable to bound simulated transaction chat section');
  source = source.slice(0, start) + source.slice(end);
}

// Remove delayed taxonomy debug logs only; they are observational and not product behavior.
source = source.replace(
  /\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+500ms :'[\s\S]*?\n\s*\}, 500\);\n\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+1500ms :'[\s\S]*?\n\s*\}, 1500\);/g,
  ''
);

if (source === before) {
  console.log('Simulated runtime flow already retired.');
  process.exit(0);
}
fs.writeFileSync(file, source, 'utf8');
console.log('Retired simulated transaction/chat engine and delayed taxonomy traces.');
