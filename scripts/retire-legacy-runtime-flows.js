const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

function replaceExact(from, to) {
  if (!source.includes(from)) return false;
  source = source.split(from).join(to);
  return true;
}

function removeBetween(startMarker, endMarker, replacement = '') {
  const start = source.indexOf(startMarker);
  if (start === -1) return false;
  const end = source.indexOf(endMarker, start);
  if (end === -1 || end <= start) throw new Error(`Unable to bound section: ${startMarker}`);
  source = source.slice(0, start) + replacement + source.slice(end);
  return true;
}

// The fake transaction/chat engine has no place in the shared production runtime.
removeBetween(
  '/* ==========================================================================\n   SIMULATED TRANSACTION CHAT (BOKANTAJ JOB FLOW)',
  "if (document.readyState === 'loading') {",
  ''
);

// Retire embedded Bokantaj flash personas as a runtime fallback. Empty/error states must be real.
removeBetween(
  '    let INITIAL_FLASH_POSTS = [',
  '    let currentFlashPosts = [];',
  '    const INITIAL_FLASH_POSTS = [];\n\n'
);

// Invitation actions always use the canonical messaging route.
replaceExact(
`                    // Open chat with user
                    if (typeof window.openChatWithUser === 'function') {
                        await window.openChatWithUser(requesterName, 'david-34.png', requesterId, { title: reqTitle });
                    }`,
`                    // Open the single canonical conversation surface.
                    if (requesterId) {
                        await window.LYANN_ROUTER?.go?.('messages', {
                            contactId: requesterId,
                            name: requesterName,
                            title: reqTitle
                        });
                    }`
);
replaceExact(
`                if (typeof window.openChatWithUser === 'function') {
                    await window.openChatWithUser(requesterName, 'david-34.png', requesterId);
                }`,
`                if (requesterId) {
                    await window.LYANN_ROUTER?.go?.('messages', {
                        contactId: requesterId,
                        name: requesterName
                    });
                }`
);

// The canonical router owns ?action=openchat. Remove the legacy delayed second owner while
// keeping account-confirmation/login deep links below it intact.
const legacyOpenChatStart = source.indexOf('    // Auto-ouvrir la discussion si le paramètre URL est présent');
if (legacyOpenChatStart !== -1) {
  const nextBranch = source.indexOf("    } else if (chatActionParam === 'email_confirmed' || urlParams.has('confirmed')) {", legacyOpenChatStart);
  if (nextBranch === -1) throw new Error('Unable to isolate legacy openchat deep-link branch');
  const prefix = `    // Account/auth deep links remain local; chat deep links are owned by LYANN_ROUTER.\n    const urlParams = new URLSearchParams(window.location.search);\n    const chatActionParam = urlParams.get('action');\n`;
  const authBranch = "    if (chatActionParam === 'email_confirmed' || urlParams.has('confirmed')) {";
  source = source.slice(0, legacyOpenChatStart) + prefix + authBranch + source.slice(nextBranch + "    } else if (chatActionParam === 'email_confirmed' || urlParams.has('confirmed')) {".length);
}

// Remove delayed taxonomy trace-only logs.
source = source.replace(
  /\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+500ms :'[\s\S]*?\n\s*\}, 500\);\n\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+1500ms :'[\s\S]*?\n\s*\}, 1500\);/g,
  ''
);

if (source === before) {
  console.log('Canonical runtime routing cleanup already applied.');
  process.exit(0);
}
fs.writeFileSync(file, source, 'utf8');
console.log('Removed simulated runtime data and routed invitation/deep-link messaging canonically.');
