'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin-script.js'), 'utf8');
const failures = [];

function fail(message) {
  failures.push(message);
}

const nav = [...html.matchAll(/class="admin-nav-item[^"]*"[^>]*data-section="([^"]+)"/g)].map((m) => m[1]);
if (nav.length < 33) fail(`admin nav must list the 33 rubriques, found ${nav.length}`);

if (!script.includes('function adminSealDeadControls') && !script.includes('window.adminSealDeadControls')) {
  fail('admin-script.js must seal unwired controls');
}
if (!script.includes('window.adminMarkUnavailable')) {
  fail('admin-script.js must mark unavailable controls with a reason');
}
if (!script.includes('window.adminShowOutcome')) {
  fail('admin-script.js must show an honest outcome instead of a fake success');
}

const forbidden = [
  /alert\(\s*['"`]🎁/,
  /onclick="alert\('🎁/,
  /alert\(\s*['"`]Fonction indisponible/,
  /alert\(\s*['"`]Signalement classé sans suite/,
  /alert\(\s*['"`]⏸️ Tout le réseau/
];
forbidden.forEach((re) => {
  if (re.test(html) || re.test(script)) fail(`fake or empty success remains: ${re}`);
});

if (!/btn-grant-subscription[\s\S]{0,200}disabled/.test(html) && !script.includes("adminMarkUnavailable(btn, 'Offrir un abonnement Pro")) {
  fail('grant-subscription must be explicitly unavailable');
}

if (failures.length) {
  console.error('ZERO DEAD CONTROLS GATE failed:');
  failures.forEach((item) => console.error(' -', item));
  process.exit(1);
}

console.log(`ZERO DEAD CONTROLS GATE: static ok (${nav.length} nav sections)`);
