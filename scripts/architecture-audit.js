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
  'confirm-signup.html'
].filter((name) => fs.existsSync(path.join(root, name)));

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

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
  if (scriptJs < completeProfile) {
    fail('feed.html: script.js loads before later UI DOM (modalCompleteProfile)');
  }

  const apiClient = indexOfOrInfinity(html, '<script src="api-client.js');
  const sessionStore = indexOfOrInfinity(html, '<script src="session-store.js');
  const dataCache = indexOfOrInfinity(html, '<script src="data-cache.js');
  const featureLoader = indexOfOrInfinity(html, '<script src="feature-loader.js');
  if (!Number.isFinite(sessionStore) || !Number.isFinite(dataCache)) {
    fail('feed.html: shared session/data cache boot layer is missing');
  }
  if (!Number.isFinite(featureLoader)) {
    fail('feed.html: deferred feature loader is missing');
  }
  if (!(apiClient < sessionStore && sessionStore < dataCache && dataCache < featureLoader && featureLoader < scriptJs)) {
    fail('feed.html: core boot order must be api-client -> session-store -> data-cache -> feature-loader -> script.js');
  }

  if (html.includes('https://js.stripe.com/v3/')) {
    fail('feed.html: Stripe SDK must not be eager-loaded on the Bokantaj critical path');
  }

  const forbiddenEagerEngines = [
    'safety-disputes-engine.js',
    'subscriptions-engine.js',
    'pro-verification-engine.js'
  ];
  for (const src of forbiddenEagerEngines) {
    if (html.includes(`<script src="${src}"></script>`)) {
      fail(`feed.html: ${src} must be deferred through feature-loader.js`);
    }
  }

  const eagerScripts = [
    'payment-script.js',
    'chat-logic.js',
    'search-engine.js',
    'matching-engine.js',
    'ai-classifier.js'
  ].filter((src) => html.includes(src));
  if (eagerScripts.length >= 5) {
    warn(`feed.html: ${eagerScripts.length} feature scripts remain on the Bokantaj critical path; continue modularization`);
  }
}

if (fs.existsSync(path.join(root, 'script.js'))) {
  const source = read('script.js');
  const lineCount = source.split(/\r?\n/).length;
  const mutationObservers = (source.match(/new\s+MutationObserver\s*\(/g) || []).length;
  const setTimeouts = (source.match(/\bsetTimeout\s*\(/g) || []).length;

  if (lineCount > 3000) warn(`script.js: monolithic file has ${lineCount} lines`);
  if (mutationObservers > 3) warn(`script.js: ${mutationObservers} MutationObserver instances; review lifecycle ownership`);
  if (setTimeouts > 20) warn(`script.js: ${setTimeouts} setTimeout calls; review timing-based UI synchronization`);
}

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
