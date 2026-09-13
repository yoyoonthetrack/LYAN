const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => failures.push(message);

const api = read('api-client.js');
const chat = read('chat-logic.js');
const shell = read('app-shell.js');

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

if (failures.length) {
  console.error('PRODUCTION DATA CONTRACT: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('PRODUCTION DATA CONTRACT: PASS');
console.log('Chat, missions and services no longer depend on local mock business state.');
