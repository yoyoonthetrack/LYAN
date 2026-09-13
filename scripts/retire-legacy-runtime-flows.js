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

// Remove the temporary taxonomy DOM observer and trace logging. It was diagnostic-only
// and continuously observed select mutations in production.
removeBetween(
  '(function setupWizardDomObserver() {',
  '    async function syncWizardTaxonomyDropdowns(result) {',
  '    async function syncWizardTaxonomyDropdowns(result) {'
);
source = source
  .replace(/\n\s*console\.trace\('\[REAL FALLBACK WRITE\]'[\s\S]*?\);/g, '')
  .replace(/\n\s*if \(domainSelect\) console\.log\('\[STEP17 OPTIONS DOMAIN\]'[\s\S]*?\n\s*}, 1500\);/g, '');

// Contact actions must enter the canonical messaging route; never open a modal directly.
source = source.replace(
  /const memberId = el\.getAttribute\('data-member-id'\);\n\s*if \(memberId\) \{\n\s*const chatModal = document\.getElementById\('modal-chat'\);\n\s*if \(chatModal\) \{\n\s*chatModal\.classList\.add\('active'\);\n\s*document\.body\.style\.overflow = 'hidden';\n\s*\}\n\s*\}/g,
  "const memberId = el.getAttribute('data-member-id');\n                if (memberId) window.LYANN_ROUTER?.go?.('messages', { contactId: memberId });"
);

source = source.replace(
  /if \(typeof window\.openChatWithUser === 'function'\) \{\n\s*await window\.openChatWithUser\(requesterName, 'david-34\.png', requesterId, \{ title: reqTitle \}\);\n\s*\}/g,
  "if (requesterId) await window.LYANN_ROUTER?.go?.('messages', { contactId: requesterId, name: requesterName, title: reqTitle });"
);
source = source.replace(
  /if \(typeof window\.openChatWithUser === 'function'\) \{\n\s*await window\.openChatWithUser\(requesterName, 'david-34\.png', requesterId\);\n\s*\}/g,
  "if (requesterId) await window.LYANN_ROUTER?.go?.('messages', { contactId: requesterId, name: requesterName });"
);

// Post-publication navigation uses the same router as the rest of Web + Capacitor.
source = source.replace(
  /if \(targetReqId && typeof window\.openLyannDetailModal === 'function'\) \{\n\s*window\.openLyannDetailModal\(targetReqId, targetReqObj\);\n\s*\} else if \(targetReqId\) \{\n\s*window\.location\.assign\(`feed\.html\?openLyann=\$\{targetReqId\}`\);\n\s*\}/g,
  "if (targetReqId) window.LYANN_ROUTER?.go?.('mission', { requestId: targetReqId, initialData: targetReqObj });"
);
source = source.replace(
  /const feedSection = document\.getElementById\('flashFeedContainer'\)[\s\S]*?window\.location\.assign\('feed\.html'\);\n\s*\}/g,
  "window.LYANN_ROUTER?.go?.('bokantaj');"
);

// Retire the old fake payment/mission/chat demo engine entirely. Real quote, payment and
// mission state is owned by repositories/Supabase and the canonical messaging UI.
removeBetween(
  '/* ==========================================================================\n   SIMULATED TRANSACTION CHAT (BOKANTAJ JOB FLOW)',
  "if (document.readyState === 'loading') {",
  "if (document.readyState === 'loading') {"
);

if (source === before) {
  console.log('Legacy runtime flows already retired.');
  process.exit(0);
}
fs.writeFileSync(file, source, 'utf8');
console.log('Retired legacy simulated flows, runtime observers and direct chat navigation.');
