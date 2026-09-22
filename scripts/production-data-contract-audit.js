const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => failures.push(message);

const api = read('api-client.js');
const chat = read('chat-logic.js');
const shell = read('app-shell.js');
const script = read('script.js');
const router = read('app-router.js');

for (const [name, source] of [['api-client.js', api], ['chat-logic.js', chat], ['app-shell.js', shell]]) {
  if (/lyann_mock_(?:missions|chat|services)/i.test(source)) {
    fail(`${name}: local mock business-data storage is still referenced`);
  }
}

if (/getMockMissions|saveMockMissions|MOCK_STORAGE_KEY/.test(api)) {
  fail('api-client.js: local mission database helpers must be removed');
}
if (/falling back to local/i.test(api)) {
  fail('api-client.js: production API methods must fail closed instead of falling back to local state');
}
if (/Object\.keys\(localStorage\).*sb-/s.test(chat)) {
  fail('chat-logic.js: chat identity must not inspect Supabase auth storage directly');
}
if (/new MutationObserver[\s\S]{0,500}CHAT_CHILD_SURFACE_IDS/.test(chat)) {
  fail('chat-logic.js: child-surface ownership must not be duplicated by a legacy MutationObserver');
}
if (!chat.includes('window.LYANN_AUTH_STATE?.getSnapshot?.().userId')) {
  fail('chat-logic.js: canonical auth-state identity lookup missing');
}

// Production member discovery must come from repositories/Supabase.
if (/ADDITIONAL_MEMBERS_DATA|const\s+additionalMembers\s*=|LYANN_MEMBERS\.unshift/.test(script)) {
  fail('script.js: embedded production member pool must not be rebuilt from static personas');
}
if (!/const LYANN_MEMBERS = \[\];/.test(script) || !/window\.LYANN_MEMBERS = LYANN_MEMBERS;/.test(script)) {
  fail('script.js: legacy member compatibility container must remain empty');
}

// No embedded fake feed or fake transaction engines may be executable in production runtime.
if (/SIMULATED TRANSACTION CHAT|triggerSimulatedTransactionChat|window\.acceptOffer\s*=|window\.payMission\s*=|window\.validateMission\s*=/.test(script)) {
  fail('script.js: simulated transaction/chat engine must be retired');
}
if (!/const INITIAL_FLASH_POSTS = \[\];/.test(script)) {
  fail('script.js: embedded Bokantaj flash fallback must remain empty');
}

// Canonical messaging/router own every public chat entry point in script.js.
if (/openChatWithUser\s*\(/.test(script)) {
  fail('script.js: public flow still calls legacy openChatWithUser directly');
}
if (/openLyannChatModal\s*\(/.test(script)) {
  fail('script.js: public flow still calls legacy openLyannChatModal directly');
}
if (/feed\.html\?action=openchat|chatActionParam === ['"]openchat['"]/.test(script)) {
  fail('script.js: duplicate legacy chat deep-link routing remains');
}
if (!script.includes("LYANN_ROUTER?.go?.('messages'")) {
  fail('script.js: canonical messaging route is not used by shared runtime');
}

// Canonical router owns global account/support navigation as well as primary tabs.
for (const route of ['home', 'explorer', 'bokantaj', 'messages', 'publish', 'mission', 'profile', 'account', 'activity', 'favorites', 'finances', 'settings', 'pricing', 'payment', 'help', 'support', 'about']) {
  if (!router.includes(`register('${route}'`)) fail(`app-router.js: missing canonical ${route} route`);
}
if (!/openLyannDetailModal\(requestId, payload\.initialData \|\| null\)/.test(router)) {
  fail('app-router.js: mission route must preserve initialData for deterministic post-publish/detail rendering');
}

// The hamburger drawer must route through data-lyann-route, never call account/profile owners inline.
if (/drawer-(?:profile-link|direct-link)[^>]+onclick="[^"]*(?:openPublicProfileModal|openAccountModalSubView)/.test(script)) {
  fail('script.js: hamburger drawer still bypasses canonical router with inline navigation');
}
for (const route of ['profile', 'account', 'activity', 'favorites', 'finances', 'settings']) {
  if (!script.includes(`data-lyann-route="${route}"`)) {
    fail(`script.js: hamburger drawer missing canonical ${route} route binding`);
  }
}
if (!script.includes('data-lyann-route="support"')) {
  fail('script.js: hamburger drawer missing Aide LYANN support route');
}

if (failures.length) {
  console.error('PRODUCTION DATA CONTRACT: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('PRODUCTION DATA CONTRACT: PASS');
console.log('Production business state is repository-backed; navigation and messaging have canonical owners; embedded member/feed/transaction mocks are retired.');
