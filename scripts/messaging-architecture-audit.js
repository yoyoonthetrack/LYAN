const fs = require('fs');

const failures = [];
const pages = ['index.html', 'feed.html', 'results.html', 'pricing.html', 'payment-portal.html', 'how-it-works.html', 'about.html', 'legal.html', 'confidentialite.html']
  .filter(fs.existsSync);

function read(file) { return fs.readFileSync(file, 'utf8'); }
function fail(message) { failures.push(message); }
function count(source, needle) { return source.split(needle).length - 1; }
function countMatches(source, regex) { return (source.match(regex) || []).length; }
function scriptSrcPattern(fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<script\\s+src=["']${escaped}(?:\\?[^"']*)?["']`, 'i');
}
function countScriptSrc(source, fileName) {
  const global = new RegExp(scriptSrcPattern(fileName).source, 'gi');
  return (source.match(global) || []).length;
}
function scriptSrcIndex(source, fileName) {
  const match = source.match(scriptSrcPattern(fileName));
  return match ? match.index : -1;
}

if (!fs.existsSync('messaging-ui.js')) fail('messaging-ui.js is missing');
if (!fs.existsSync('app-router.js')) fail('app-router.js is missing');
else {
  const router = read('app-router.js');
  if (!router.includes("register('messages'")) fail('app-router.js must own the public messages route');
  if (!router.includes("['#tab-messages, [data-lyann-messages], .open-chat-trigger', 'messages']")) {
    fail('app-router.js must own generic messaging entry points');
  }
}

if (fs.existsSync('messaging-ui.js')) {
  const controller = read('messaging-ui.js');
  for (const required of [
    'window.LYANN_MESSAGING = api',
    'window.openLyannMessagesModal = () => window.LYANN_ROUTER',
    'window.openChatWithUser =',
    'window.backToChatContacts =',
    'lyann-child-surface-open',
    "window.LYANN_AUTH_STATE",
    "registerSurfaces()"
  ]) {
    if (!controller.includes(required)) fail(`messaging-ui.js missing canonical contract: ${required}`);
  }
  if (controller.includes('installCanonicalEntryInterception')) {
    fail('messaging-ui.js must not own generic application navigation interception');
  }
  if (controller.includes('new MutationObserver')) {
    fail('messaging-ui.js must not use MutationObserver to synchronize surface ownership');
  }
  if (/supabase\?\.auth|supabase\.auth\.getSession/.test(controller)) {
    fail('messaging-ui.js must resolve identity through canonical auth/session state');
  }
}

for (const file of pages) {
  const html = read(file);
  const shells = count(html, 'id="chatModal"');
  if (shells > 1) fail(`${file}: ${shells} chatModal shells found; only one is allowed`);
  if (shells === 1) {
    const controllerLoads = countScriptSrc(html, 'messaging-ui.js');
    if (controllerLoads !== 1) fail(`${file}: chat shell requires exactly one messaging-ui.js load (found ${controllerLoads})`);
    if (countScriptSrc(html, 'chat-surface-stack.js') > 0) {
      fail(`${file}: obsolete chat-surface-stack.js must not run beside canonical messaging controller`);
    }
    const shellIndex = scriptSrcIndex(html, 'app-shell.js');
    const controllerIndex = scriptSrcIndex(html, 'messaging-ui.js');
    const legacyIndex = scriptSrcIndex(html, 'script.js');
    if (shellIndex !== -1 && !(shellIndex < controllerIndex)) fail(`${file}: messaging-ui.js must load after app-shell.js`);
    if (legacyIndex !== -1 && !(controllerIndex < legacyIndex)) fail(`${file}: messaging-ui.js must load before script.js`);
  }
}

const shell = read('app-shell.js');
const chat = read('chat-logic.js');
const shellOpenerDefinitions = countMatches(shell, /window\.openLyannMessagesModal\s*=\s*(?:async\s+)?function\s*\(/g);
const conversationOpenerDefinitions = countMatches(chat, /window\.openChatWithUser\s*=\s*(?:async\s+)?function\s*\(/g);
if (shellOpenerDefinitions > 0) fail(`app-shell.js contains a competing messaging opener definition`);
if (conversationOpenerDefinitions > 0) fail(`chat-logic.js contains a competing public conversation opener definition`);
if (/closest\(['"]\.chat-contact-item['"]\)[\s\S]{0,500}openChatWithUser/.test(chat)) {
  fail('chat-logic.js must not re-open conversations from list row clicks; LYANN_MESSAGING owns list selection');
}

const legacyOpenerStart = chat.indexOf('window.openLyannChatModal = function');
if (legacyOpenerStart !== -1) {
  const nextTopLevel = chat.indexOf('\nwindow.', legacyOpenerStart + 1);
  const legacyOpenerBody = chat.slice(legacyOpenerStart, nextTopLevel > legacyOpenerStart ? nextTopLevel : chat.length);
  if (/modal\.style\.display\s*=\s*['"]flex['"]/.test(legacyOpenerBody) || /modal\.classList\.add\(['"]active['"]\)/.test(legacyOpenerBody)) {
    fail('chat-logic.js legacy opener must not reveal chatModal directly');
  }
}

if (failures.length) {
  console.error('LYANN canonical messaging audit FAILED');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}
console.log('✓ LYANN router-owned canonical messaging architecture gate passed');
