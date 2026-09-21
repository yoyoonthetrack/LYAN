const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productPages = [
  'index.html',
  'feed.html',
  'results.html',
  'payment-portal.html',
  'pricing.html',
  'how-it-works.html',
  'about.html',
  'legal.html',
  'confidentialite.html',
  'confirm-signup.html'
].filter((name) => fs.existsSync(path.join(root, name)));

const failures = [];
const warnings = [];

function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function indexOfOrInfinity(source, needle) {
  const i = source.indexOf(needle);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

for (const file of productPages) {
  const html = read(file);
  const bodyClose = html.lastIndexOf('</body>');
  const htmlClose = html.lastIndexOf('</html>');

  if (bodyClose === -1) fail(`${file}: missing </body>`);
  if (htmlClose === -1) fail(`${file}: missing </html>`);
  if (bodyClose !== -1 && htmlClose !== -1 && bodyClose > htmlClose) {
    fail(`${file}: </body> appears after </html>`);
  }

  const head = html.includes('</head>') ? html.slice(0, html.indexOf('</head>')) : html;
  const blockingExternalScripts = [...head.matchAll(/<script\s+[^>]*src=["']https?:\/\/[^"']+["'][^>]*><\/script>/gi)]
    .map((m) => m[0])
    .filter((tag) => !/\bdefer\b|\basync\b/i.test(tag));
  if (blockingExternalScripts.length) {
    warn(`${file}: ${blockingExternalScripts.length} head-blocking external script(s) without defer/async`);
  }

  const demoTokens = [
    'david-34.png',
    'Photo / Vidéo de preuve (Simulé)',
    '4242 4242 4242 4242',
    '12/29',
    'value="123"'
  ];
  for (const token of demoTokens) {
    if (html.includes(token)) warn(`${file}: production-visible/demo token remains: ${token}`);
  }

  if (html.includes('<script src="script.js')) {
    const platformCore = indexOfOrInfinity(html, '<script src="platform-core.js"></script>');
    const notificationsUi = indexOfOrInfinity(html, '<script src="notifications-ui.js"></script>');
    const appShell = indexOfOrInfinity(html, '<script src="app-shell.js"></script>');
    const legacyScript = indexOfOrInfinity(html, '<script src="script.js');
    if (!Number.isFinite(platformCore) || !Number.isFinite(notificationsUi) || !Number.isFinite(appShell)) {
      fail(`${file}: extracted platform/notification/app shell domains are missing before script.js`);
    } else if (!(platformCore < notificationsUi && notificationsUi < appShell && appShell < legacyScript)) {
      fail(`${file}: extracted domain scripts must load platform-core -> notifications-ui -> app-shell -> script.js`);
    }
  }
}

for (const file of productPages) {
  const html = read(file);
  if (!html.includes('<script src="script.js')) continue;
  const authState = indexOfOrInfinity(html, '<script src="auth-state.js');
  const dataCache = indexOfOrInfinity(html, '<script src="data-cache.js');
  const scriptJs = indexOfOrInfinity(html, '<script src="script.js');
  if (!Number.isFinite(authState) || !Number.isFinite(dataCache)) {
    fail(`${file}: auth-state/data-cache boot layer is missing`);
  } else if (!(authState < dataCache && dataCache < scriptJs)) {
    fail(`${file}: data-cache.js must load after auth-state and before script.js`);
  }
}

if (fs.existsSync(path.join(root, 'feed.html'))) {
  const html = read('feed.html');
  const detailOpen = html.indexOf('id="lyannDetailModal"');
  const filterOpen = html.indexOf('id="bokantajFilterSheetModal"');

  if (detailOpen !== -1 && filterOpen !== -1 && detailOpen < filterOpen) {
    const between = html.slice(detailOpen, filterOpen);
    const opens = (between.match(/<div\b/gi) || []).length;
    const closes = (between.match(/<\/div>/gi) || []).length;
    if (opens > closes) {
      fail(`feed.html: bokantajFilterSheetModal is nested inside an unclosed lyannDetailModal region (div balance +${opens - closes})`);
    }
  }

  const scriptJs = indexOfOrInfinity(html, '<script src="script.js');
  const completeProfile = indexOfOrInfinity(html, 'id="modalCompleteProfile"');
  if (scriptJs < completeProfile) fail('feed.html: script.js loads before later UI DOM (modalCompleteProfile)');

  const apiClient = indexOfOrInfinity(html, '<script src="api-client.js');
  const sessionStore = indexOfOrInfinity(html, '<script src="session-store.js');
  const authState = indexOfOrInfinity(html, '<script src="auth-state.js"></script>');
  const dataCache = indexOfOrInfinity(html, '<script src="data-cache.js');
  const featureLoader = indexOfOrInfinity(html, '<script src="feature-loader.js');
  if (!Number.isFinite(sessionStore) || !Number.isFinite(authState) || !Number.isFinite(dataCache)) {
    fail('feed.html: shared session/auth/data boot layer is missing');
  }
  if (!Number.isFinite(featureLoader)) fail('feed.html: deferred feature loader is missing');
  if (!(apiClient < sessionStore && sessionStore < authState && authState < dataCache && dataCache < featureLoader && featureLoader < scriptJs)) {
    fail('feed.html: core boot order must be api-client -> session-store -> auth-state -> data-cache -> feature-loader -> script.js');
  }

  if (html.includes('https://js.stripe.com/v3/')) fail('feed.html: Stripe SDK must not be eager-loaded on the Bokantaj critical path');
  if (html.includes('lyann-stripe.js')) fail('feed.html: lyann-stripe.js must be deferred through feature-loader.js');

  for (const src of ['safety-disputes-engine.js', 'subscriptions-engine.js', 'pro-verification-engine.js']) {
    if (html.includes(`<script src="${src}"></script>`)) fail(`feed.html: ${src} must be deferred through feature-loader.js`);
  }

  const eagerScripts = ['payment-script.js', 'chat-logic.js', 'search-engine.js', 'matching-engine.js', 'ai-classifier.js']
    .filter((src) => html.includes(src));
  if (eagerScripts.length >= 5) warn(`feed.html: ${eagerScripts.length} feature scripts remain on the Bokantaj critical path; continue modularization`);
}

for (const requiredModule of ['platform-core.js', 'notifications-ui.js', 'app-shell.js', 'session-store.js', 'auth-state.js', 'data-cache.js', 'lyann-stripe.js']) {
  if (!fs.existsSync(path.join(root, requiredModule))) fail(`${requiredModule}: extracted/shared domain file missing`);
}

if (fs.existsSync(path.join(root, 'lyann-stripe.js'))) {
  const stripeCheckout = read('lyann-stripe.js');
  if (!stripeCheckout.includes('confirmCardPayment')) fail('lyann-stripe.js: card confirmation must use Stripe.js confirmCardPayment');
  if (!stripeCheckout.includes("create('card'")) fail('lyann-stripe.js: must mount a Stripe Card Element');
  if (/sk_(live|test)_/.test(stripeCheckout)) fail('lyann-stripe.js: must not embed a Stripe secret key');
}

if (fs.existsSync(path.join(root, 'auth-state.js'))) {
  const authState = read('auth-state.js');
  if (!authState.includes('window.LYANN_SESSION.subscribe')) fail('auth-state.js: must subscribe to the shared session store');
  if (!authState.includes("classList.toggle('user-is-logged-in'")) fail('auth-state.js: must own authenticated body state');
  if (!authState.includes('window.CURRENT_USER_ID')) fail('auth-state.js: legacy user id bridge is missing');
}

if (fs.existsSync(path.join(root, 'app-shell.js'))) {
  const shell = read('app-shell.js');
  if (!shell.includes('// === APP HOME V1 CONNECTED VIEW RENDERER (APP NATIVE ONLY) ===')) fail('app-shell.js: connected home renderer is missing');
  if (!shell.includes('// === HEADER NATIVE DÉTERMINISTE (APP MOBILE) ===')) fail('app-shell.js: native header renderer is missing');
  if (shell.includes('david-34.png')) fail('app-shell.js: fake dashboard/chat avatar must not be used');
  if (shell.includes("localStorage.getItem('lyan_user_logged_in') === 'true'")) fail('app-shell.js: localStorage must not be an authentication source of truth');
  if (!shell.includes('window.LYANN_AUTH_STATE.ready()')) fail('app-shell.js: native shell must wait for centralized auth resolution');
}

if (fs.existsSync(path.join(root, 'script.js'))) {
  const source = read('script.js');
  const lineCount = source.split(/\r?\n/).length;
  const mutationObservers = (source.match(/new\s+MutationObserver\s*\(/g) || []).length;
  const setTimeouts = (source.match(/\bsetTimeout\s*\(/g) || []).length;

  if (source.includes('// === LYANN SINGLE SOURCE OF TRUTH DEFAULT USER AVATAR ===')) fail('script.js: platform/avatar domain was reintroduced into the monolith');
  if (source.includes('// === NOTIFICATIONS MODAL & BADGE SYSTEM ===')) fail('script.js: notification UI domain was reintroduced into the monolith');
  if (source.includes('// === APP WELCOME SCREEN (GUEST MODE / ONBOARDING / LOGIN) ===')) fail('script.js: app shell domain was reintroduced into the monolith');
  if (source.includes('// === APP HOME V1 CONNECTED VIEW RENDERER (APP NATIVE ONLY) ===')) fail('script.js: connected home renderer was reintroduced into the monolith');
  if (source.includes('// === HEADER NATIVE DÉTERMINISTE (APP MOBILE) ===')) fail('script.js: native header renderer was reintroduced into the monolith');
  if (source.includes("let activeContactAvatar = 'david-34.png';")) fail('script.js: fake chat avatar default remains');
  if (lineCount > 3000) warn(`script.js: monolithic file has ${lineCount} lines`);
  if (mutationObservers > 3) warn(`script.js: ${mutationObservers} MutationObserver instances; review lifecycle ownership`);
  if (setTimeouts > 20) warn(`script.js: ${setTimeouts} setTimeout calls; review timing-based UI synchronization`);
}

if (!fs.existsSync(path.join(root, 'lyann-boot-logo.gif'))) fail('lyann-boot-logo.gif: boot splash asset missing');
if (!read('shared-html-build.js').includes('lyann-boot-logo.gif')) fail('shared-html-build.js: boot splash must inject the logo GIF');
if (!read('style.css').includes('.lyann-boot-splash')) fail('style.css: boot splash styles missing');
if (!read('build_mobile.js').includes("'.gif'")) fail('build_mobile.js: Capacitor artifact must copy the boot GIF');
if (!fs.existsSync(path.join(root, 'lyann-home-story.mp4'))) fail('lyann-home-story.mp4: home story video missing');
if (!fs.existsSync(path.join(root, 'legal.html'))) fail('legal.html: informations légales page missing');
if (!read('legal.html').includes('Conditions &amp; informations légales') && !read('legal.html').includes('Conditions & informations légales')) fail('legal.html: conditions hub title missing');
if (!read('legal.html').includes('Consulter les CGU')) fail('legal.html: CGU hub action missing');
if (!read('legal.html').includes('class="legal-drawer"')) fail('legal.html: long legal documents missing');
if ((read('legal.html').match(/class="legal-drawer"/g) || []).length !== 8) fail('legal.html: expected 8 long legal documents');
if (!read('index.html').includes('href="legal.html"')) fail('index.html: footer must link to conditions');
if (!fs.existsSync(path.join(root, 'confidentialite.html'))) fail('confidentialite.html: privacy policy page missing');
if (!read('confidentialite.html').includes('Politique de confidentialité')) fail('confidentialite.html: privacy policy title missing');
if (!read('index.html').includes('href="confidentialite.html"')) fail('index.html: footer must link to privacy policy');
if (!fs.existsSync(path.join(root, 'lyann-home-story-square.mp4'))) fail('lyann-home-story-square.mp4: native home story video missing');
if (!read('index.html').includes('data-src-web="lyann-home-story.mp4')) fail('index.html: web home story must use the 16:9 video');
if (!read('index.html').includes('data-src-native="lyann-home-story-square.mp4')) fail('index.html: native home story must use the square video');
if (!read('script.js').includes('function bindHeroStoryMedia()')) fail('script.js: home story must pick web vs native source at runtime');
if (!read('build_mobile.js').includes("'.mp4'")) fail('build_mobile.js: Capacitor artifact must copy the home story video');

console.log('LYANN architecture audit');
console.log(`Pages checked: ${productPages.length}`);
if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach((message) => console.log(`  ⚠ ${message}`));
}
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}
console.log('\n✓ Structural architecture gate passed');
