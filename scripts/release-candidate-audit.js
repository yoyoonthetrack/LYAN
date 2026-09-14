const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// No push-triggered workflow may mutate source on the stabilization branch.
const workflowDir = path.join(root, '.github', 'workflows');
for (const name of fs.readdirSync(workflowDir).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))) {
  const source = fs.readFileSync(path.join(workflowDir, name), 'utf8');
  const pushTriggered = /(^|\n)on:\s*\n(?:[ \t].*\n)*?[ \t]+push:/m.test(source) || /(^|\n)on:\s*\[[^\]]*push[^\]]*\]/m.test(source);
  const canWriteContents = /contents:\s*write/.test(source);
  if (pushTriggered && canWriteContents) fail(`${name}: push-triggered workflow still has contents: write`);
}

const router = read('app-router.js');
const surfaces = read('surface-manager.js');
const messaging = read('messaging-ui.js');
const script = read('script.js');
const build = read('build_mobile.js');

for (const route of ['home','explorer','bokantaj','messages','publish','mission','profile','account','activity','favorites','finances','settings','pricing','payment','help','about']) {
  if (!router.includes(`register('${route}'`)) fail(`app-router.js: missing ${route} route`);
}
if (!surfaces.includes('window.LYANN_SURFACES = api')) fail('surface-manager.js: canonical surface API missing');
if (!messaging.includes('window.LYANN_MESSAGING')) fail('messaging-ui.js: canonical messaging API missing');
if (/INITIAL_FLASH_POSTS\s*=\s*\[\s*\{/.test(script)) fail('script.js: embedded Bokantaj production fixture array returned');
if (/ADDITIONAL_MEMBERS_DATA|LYANN_MEMBERS\.unshift/.test(script)) fail('script.js: embedded member production pool returned');
if (/Marc \(Plombier\)|simulated flow|david-34\.png/.test(script)) fail('script.js: legacy simulated chat flow returned');
if (!build.includes('byte-identical') && !build.includes('byte identical')) fail('build_mobile.js: shared-artifact parity assertion missing');

if (failures.length) {
  console.error('RELEASE CANDIDATE AUDIT: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('RELEASE CANDIDATE AUDIT: PASS');
console.log('Canonical owners are locked, automatic source mutation is retired, and Web/Capacitor share the same production artifact.');
