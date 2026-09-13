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

// Production member discovery must come from repositories/Supabase. Explicit demo-only
// fixtures may still exist temporarily, but the legacy production member pool must stay empty.
if (/ADDITIONAL_MEMBERS_DATA|const\s+additionalMembers\s*=|LYANN_MEMBERS\.unshift/.test(script)) {
  fail('script.js: embedded production member pool must not be rebuilt from static personas');
}
if (!/const LYANN_MEMBERS = \[\];/.test(script) || !/window\.LYANN_MEMBERS = LYANN_MEMBERS;/.test(script)) {
  fail('script.js: legacy member compatibility container must remain empty');
}

// Canonical router owns global account/support navigation as well as primary tabs.
for (const route of ['profile', 'account', 'activity', 'favorites', 'finances', 'pricing', 'payment', 'help', 'about']) {
  if (!router.includes(`register('${route}'`)) fail(`app-router.js: missing canonical ${route} route`);
}

if (failures.length) {
  console.error('PRODUCTION DATA CONTRACT: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('PRODUCTION DATA CONTRACT: PASS');
console.log('Production business state uses canonical repositories; the legacy member pool and local mock mission/chat state are retired.');
