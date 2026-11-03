const assert = require('node:assert/strict');
const fs = require('node:fs');

const shell = fs.readFileSync('app-shell.js', 'utf8');
const router = fs.readFileSync('app-router.js', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

const tabOrder = ['tab-discover', 'tab-lyanneurs', 'tab-annonces', 'tab-messages', 'tab-profile'];
const shellIdx = tabOrder.map((id) => shell.indexOf(id));
assert.deepEqual(shellIdx.every((i) => i >= 0), true);
for (let i = 1; i < shellIdx.length; i += 1) {
  assert.ok(shellIdx[i] > shellIdx[i - 1], 'mobile tabs must stay in marketplace order');
}

assert.match(shell, /ph-house', 'Découvrir'/);
assert.doesNotMatch(shell, /tab-bokantaj/);
assert.match(shell, /discover\.html/);
assert.match(router, /\['#tab-discover', 'discover'\]/);
assert.match(router, /register\('discover'/);
assert.match(router, /register\('bokantaj'/);
assert.doesNotMatch(router, /#tab-bokantaj/);
assert.match(script, /data-drawer-nav="discover"/);
assert.doesNotMatch(script, /data-drawer-nav="bokantaj"/);

console.log('marketplace navigation contract passed');
