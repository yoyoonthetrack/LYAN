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

if (!sharedBuild.includes('surface-manager.js?v=20260914')) fail('shared build must inject surface manager');
if (!sharedBuild.includes('app-router.js?v=20260914')) fail('shared build must inject application router');

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
