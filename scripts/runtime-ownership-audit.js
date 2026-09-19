const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => failures.push(message);

const router = read('app-router.js');
const surfaces = read('surface-manager.js');
const sharedBuild = read('shared-html-build.js');
const hygiene = read('production-hygiene.js');
const legacyWorkflow = read('.github/workflows/architecture-source-fix.yml');

if (!router.includes('window.LYANN_ROUTER = api')) fail('app-router.js must own window.LYANN_ROUTER');
if (!router.includes("register('messages'")) fail('app-router.js must own the messages route');
if (!router.includes("register('publish'")) fail('app-router.js must own the publish route');
if (!router.includes("['#tab-home', 'home']")) fail('app-router.js must own bottom navigation routing');

if (!surfaces.includes('window.LYANN_SURFACES = api')) fail('surface-manager.js must own window.LYANN_SURFACES');
if (!surfaces.includes("config.mode === 'major'")) fail('surface-manager.js must enforce major-surface exclusivity');

const script = read('script.js');
if (!/LYANN_SURFACES\.register\(['"]lyann-detail['"]/.test(script)) {
  fail('script.js must register lyann-detail with LYANN_SURFACES');
}
if (!script.includes('window.closeLyannDetailSurface')) {
  fail('script.js must close lyann-detail through a canonical surface helper');
}
if (!/LYANN_SURFACES\.close\(['"]lyann-detail['"]/.test(script)) {
  fail('lyann-detail close must go through LYANN_SURFACES');
}
if (!/closeLyannDetailFooterBtn[\s\S]{0,250}closeLyannDetailSurface/.test(script)) {
  fail('Lyann detail footer Fermer must close through LYANN_SURFACES, not ad-hoc display:none');
}
if (!/btnHelpLyannFromModal[\s\S]{0,400}closeLyannDetailSurface/.test(script)) {
  fail('Je peux aider from Lyann detail must close the surface before opening messaging');
}
if (!/LYANN_SURFACES\.register\(['"]account['"]/.test(script)) {
  fail('script.js must register account with LYANN_SURFACES');
}
if (!/LYANN_SURFACES\.open\(['"]account['"]/.test(script)) {
  fail('account must open through LYANN_SURFACES');
}
if (!/LYANN_SURFACES\.close\(['"]account['"]/.test(script)) {
  fail('account close must go through LYANN_SURFACES');
}
if (script.includes("Demande de versement transmise.")) {
  fail('account finances must not fake a payout success toast');
}
if (script.includes('let availableBal = \'0,00 €\'')) {
  fail('account finances must not invent a 0,00 € Stripe balance');
}
if (script.includes("openHelpRequestModal==='function'")) {
  fail('activity publish CTA must use the canonical publish route, not a missing openHelpRequestModal');
}
if (!/btnManageMyLyann[\s\S]{0,400}openAccountModalSubView\('activity'\)/.test(script)) {
  fail('Gérer mon Lyann must open real account activity');
}

const chat = read('chat-logic.js');
if (chat.includes("'m_' + Date.now()")) {
  fail('chat payment/accept actions must not invent mission ids');
}
if (chat.includes('mockProposePrice')) {
  fail('chat must create quotes via createRequestQuote, not mockProposePrice');
}
if (chat.includes('mockPayMission')) {
  fail('chat checkout must not invent a paid escrow via mockPayMission');
}
if (chat.includes('CHAT_MSG_KEY')) {
  fail('chat delete/reactions must not use the retired localStorage CHAT_MSG_KEY');
}
if (chat.includes('mockMarkMissionDone') || chat.includes('mockConfirmMissionCompletion')) {
  fail('chat completion must use milestone APIs, not client mission status writes');
}

const apiClient = read('api-client.js');
if (apiClient.includes('this.backendUrl')) {
  fail('milestone payment APIs must not call undefined this.backendUrl');
}
if (!apiClient.includes('function getLyannBackendOrigin')) {
  fail('api-client.js must resolve the backend origin for Web vs Capacitor');
}
if (!apiClient.includes('function lyannBackendFetch')) {
  fail('api-client.js must fetch /v1 through lyannBackendFetch');
}
if (!apiClient.includes("const LYANN_PRODUCTION_ORIGIN = 'https://lyann.app'")) {
  fail('native API origin must be the public production host, not a relative Capacitor origin');
}
if (apiClient.includes("STRIPE_SECRET_KEY") && /STRIPE_SECRET_KEY\s*=\s*['"]sk_/.test(apiClient)) {
  fail('api-client.js must not embed a Stripe secret key');
}

if (!chat.includes('window.resolveChatMilestoneId = resolveChatMilestoneId')) {
  fail('chat must expose resolveChatMilestoneId for quote-context milestone provenance');
}
if (/if \(isPersistedUuid\(preferredId\)\) return preferredId;/.test(chat)) {
  fail('chat must not treat an arbitrary UUID as a milestone id');
}

const notificationsUi = read('notifications-ui.js');
if (notificationsUi.includes('demo_user')) {
  fail('notifications-ui.js must not fall back to demo_user');
}

const productPages = [
  'index.html',
  'feed.html',
  'results.html',
  'payment-portal.html',
  'pricing.html',
  'how-it-works.html',
  'about.html'
];
for (const file of productPages) {
  const html = read(file);
  if (!html.includes('<script src="script.js')) continue;
  if (!html.includes('<script src="data-cache.js"></script>')) {
    fail(`${file}: data-cache.js must load on every authenticated product page`);
  }
}

if (!sharedBuild.includes('function injectDataCache')) {
  fail('shared HTML build must inject data-cache.js when a page has auth-state');
}
if (!sharedBuild.includes('injectDataCache(sanitizeStaticHtml')) {
  fail('shared HTML build must run injectDataCache inside buildHtml');
}

const apiGateway = read('api/index.js');
if (!apiGateway.includes("capacitor://localhost")) {
  fail('production API gateway must allow Capacitor native Origin, not only lyann.app');
}
if (!apiGateway.includes('ALLOWED_NATIVE_ORIGINS')) {
  fail('production API gateway must distinguish native Capacitor origins from unknown browsers');
}

const payments = read('payment-script.js');
if (!payments.includes("return this.financialUnavailable('Versement')")) {
  fail('payment portal must not simulate a Stripe payout');
}

if (script.includes('Gérer mes versements Stripe')) {
  fail('account must not present payment-portal as a live Stripe wallet');
}

if (!sharedBuild.includes('surface-manager.js?v=')) fail('shared build must inject surface manager');
if (!sharedBuild.includes('app-router.js?v=')) fail('shared build must inject application router');

if (hygiene.includes('new MutationObserver')) fail('production hygiene must not observe/mutate the live DOM continuously');
if (!hygiene.includes('No ongoing observer')) fail('production hygiene must document one-shot behavior');

if (legacyWorkflow.includes('on:\n  push:') || legacyWorkflow.includes('git push origin HEAD:architecture-stabilization')) {
  fail('legacy source normalizers must not auto-mutate architecture-stabilization');
}
if (!legacyWorkflow.includes('workflow_dispatch')) fail('legacy normalizers should be manual-only during migration');

if (failures.length) {
  console.error('RUNTIME OWNERSHIP: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('RUNTIME OWNERSHIP: PASS');
console.log('Canonical router, surface manager, shared runtime injection, one-shot hygiene, and manual-only legacy normalizers verified.');
