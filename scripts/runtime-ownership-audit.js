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
