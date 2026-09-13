const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const pages = [
  'index.html',
  'feed.html',
  'results.html',
  'pricing.html',
  'payment-portal.html',
  'how-it-works.html',
  'about.html'
].filter((file) => fs.existsSync(path.join(root, file)));

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function fail(message) {
  failures.push(message);
}

const messaging = read('messaging-ui.js');
const style = read('style.css');
const mobileBuild = read('build_mobile.js');

if (!messaging.includes('window.LYANN_MESSAGING = api')) {
  fail('messaging-ui.js: canonical public messaging owner is missing');
}
if (!messaging.includes('window.openLyannMessagesModal = () => api.openList()')) {
  fail('messaging-ui.js: generic messaging compatibility entry must forward to canonical openList');
}
if (!messaging.includes('window.openChatWithUser =')) {
  fail('messaging-ui.js: direct conversation compatibility entry must forward to canonical controller');
}
if (!messaging.includes("document.body.classList.add('hide-bottom-nav', 'in-chat-active', 'lyann-messaging-open')")) {
  fail('messaging-ui.js: shared messaging-open state must be owned by canonical controller');
}

for (const page of pages) {
  const html = read(page);
  if (!html.includes('id="chatModal"')) continue;
  const count = (html.match(/<script src="messaging-ui\.js"><\/script>/g) || []).length;
  if (count !== 1) {
    fail(`${page}: expected exactly one canonical messaging-ui.js include, found ${count}`);
  }
}

if (!style.includes('/* LYANN CANONICAL MESSAGING SHELL v4 */')) {
  fail('style.css: canonical messaging shell v4 missing');
}
if (!style.includes('body.lyann-messaging-open #chatModal')) {
  fail('style.css: shared Web/mobile messaging route styles missing');
}
if (!style.includes('body.is-native-app.lyann-messaging-open #chatModal')) {
  fail('style.css: native safe-area specialization missing');
}

// Mobile bundles must be copies of the same root functional sources used by Web.
if (!mobileBuild.includes("fs.copyFileSync(srcPath, destPath)")) {
  fail('build_mobile.js: mobile assets must copy from shared root sources');
}
if (!mobileBuild.includes("const srcDir = __dirname")) {
  fail('build_mobile.js: mobile source directory must remain the shared repository root');
}

if (failures.length) {
  console.error('WEB/MOBILE STRUCTURAL PARITY: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('WEB/MOBILE STRUCTURAL PARITY: PASS');
console.log(`Canonical messaging verified on ${pages.length} Web product pages and the shared Capacitor build path.`);
