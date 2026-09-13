const fs = require('fs');

const failures = [];
const pages = ['index.html', 'feed.html', 'results.html', 'pricing.html', 'payment-portal.html', 'how-it-works.html', 'about.html']
  .filter(fs.existsSync);

function read(file) { return fs.readFileSync(file, 'utf8'); }
function fail(message) { failures.push(message); }
function count(source, needle) { return source.split(needle).length - 1; }
function countMatches(source, regex) { return (source.match(regex) || []).length; }

if (!fs.existsSync('messaging-ui.js')) fail('messaging-ui.js is missing');
else {
  const controller = read('messaging-ui.js');
  for (const required of [
    'window.LYANN_MESSAGING = api',
    'window.openLyannMessagesModal = () => api.openList()',
    'window.openChatWithUser =',
    'window.backToChatContacts =',
    'lyann-child-surface-open'
  ]) {
    if (!controller.includes(required)) fail(`messaging-ui.js missing canonical contract: ${required}`);
  }
}

for (const file of pages) {
  const html = read(file);
  const shells = count(html, 'id="chatModal"');
  if (shells > 1) fail(`${file}: ${shells} chatModal shells found; only one is allowed`);
  if (shells === 1) {
    const controllerLoads = count(html, '<script src="messaging-ui.js"></script>');
    if (controllerLoads !== 1) fail(`${file}: chat shell requires exactly one messaging-ui.js load (found ${controllerLoads})`);
    if (html.includes('<script src="chat-surface-stack.js"></script>')) {
      fail(`${file}: obsolete chat-surface-stack.js must not run beside canonical messaging controller`);
    }
    const shellIndex = html.indexOf('<script src="app-shell.js"></script>');
    const controllerIndex = html.indexOf('<script src="messaging-ui.js"></script>');
    const legacyIndex = html.indexOf('<script src="script.js');
    if (shellIndex !== -1 && !(shellIndex < controllerIndex)) fail(`${file}: messaging-ui.js must load after app-shell.js`);
    if (legacyIndex !== -1 && !(controllerIndex < legacyIndex)) fail(`${file}: messaging-ui.js must load before script.js`);
  }
}

const shell = read('app-shell.js');
const chat = read('chat-logic.js');
const shellOpenerDefinitions = countMatches(shell, /window\.openLyannMessagesModal\s*=\s*(?:async\s+)?function\s*\(/g);
const conversationOpenerDefinitions = countMatches(chat, /window\.openChatWithUser\s*=\s*(?:async\s+)?function\s*\(/g);
if (shellOpenerDefinitions > 1) fail(`app-shell.js contains ${shellOpenerDefinitions} messaging opener definitions`);
if (conversationOpenerDefinitions > 1) fail(`chat-logic.js contains ${conversationOpenerDefinitions} conversation opener definitions`);

if (failures.length) {
  console.error('LYANN canonical messaging audit FAILED');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}
console.log('✓ LYANN canonical messaging architecture gate passed');
