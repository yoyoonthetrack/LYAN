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
const webRender = read('api/render.js');
const router = read('app-router.js');
const surfaces = read('surface-manager.js');

if (!messaging.includes('window.LYANN_MESSAGING = api')) {
  fail('messaging-ui.js: canonical public messaging owner is missing');
}
if (!messaging.includes("window.openLyannMessagesModal = () => window.LYANN_ROUTER ? window.LYANN_ROUTER.go('messages') : api.openList();")) {
  fail('messaging-ui.js: generic messaging compatibility entry must route through LYANN_ROUTER');
}
if (!messaging.includes('window.openChatWithUser =')) {
  fail('messaging-ui.js: direct conversation compatibility entry must forward to canonical controller');
}
if (!messaging.includes("manager.register(CHAT_SURFACE")) {
  fail('messaging-ui.js: messaging shell must be registered with shared surface manager');
}
if (!messaging.includes("document.body.classList.add('in-chat-active', 'lyann-messaging-open')")) {
  fail('messaging-ui.js: messaging-open state must be applied by canonical controller');
}
if (!router.includes("register('messages'")) {
  fail('app-router.js: shared messages route missing');
}
if (!surfaces.includes('window.LYANN_SURFACES')) {
  fail('surface-manager.js: shared surface manager public contract missing');
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

// Web and Capacitor must use the same HTML build transformation.
if (!webRender.includes("require('../shared-html-build')")) {
  fail('api/render.js: Web must use shared-html-build.js');
}
if (!mobileBuild.includes("require('./shared-html-build')")) {
  fail('build_mobile.js: Capacitor must use shared-html-build.js');
}
if (!mobileBuild.includes('copyDirectoryExact(sharedDist, iosPublic)')) {
  fail('build_mobile.js: iOS must consume the generated shared www artifact');
}
if (!mobileBuild.includes('assertExactArtifact(sharedDist, iosPublic')) {
  fail('build_mobile.js: iOS parity assertion missing');
}
if (!mobileBuild.includes('const srcDir = __dirname')) {
  fail('build_mobile.js: shared source directory must remain the repository root');
}

if (failures.length) {
  console.error('WEB/MOBILE STRUCTURAL PARITY: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('WEB/MOBILE STRUCTURAL PARITY: PASS');
console.log(`Canonical messaging verified on ${pages.length} Web product pages and the shared Web/Capacitor artifact path.`);
