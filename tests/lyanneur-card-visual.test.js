const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('explorer-ui.js', 'utf8');
const css = fs.readFileSync('explorer.css', 'utf8');
const v3 = fs.readFileSync('results-v3.css', 'utf8');

// Phase 3.1A: Lyanneurs results are compact rows (photo, public name, skill, authentic rating, approximate zone, favourite, chevron).
assert.match(ui, /explorer-profile-card explorer-profile-row/);
assert.match(ui, /explorer-profile-primary-skill/);
assert.match(ui, /explorer-profile-meta/);
assert.match(ui, /favorite\('PROFILE', p\.id\)/);
assert.match(ui, /explorer-row-chevron/);
assert.match(ui, /profileZoneTrigger\(p\.id, displayName\)/);
assert.doesNotMatch(ui, /Nouveau sur LYANN<\/span>/, 'no filler rating: a rating is shown only when it is real');
assert.doesNotMatch(ui, /explorer-profile-bio/);
assert.doesNotMatch(ui, /lyann-cta-primary explorer-btn-contact/);
// The card list is rendered with an explicit one-argument call: a bare map(fn) would pass the index as `showType`.
assert.match(ui, /results\.map\(record => \(mode === 'annonces' \? requestCard\(record\) : profileCard\(record\)\)\)/);

assert.match(css, /\.explorer-profile-card/);
assert.match(css, /\.explorer-annonce-title/);
assert.match(v3, /\.explorer-profile-row/);

console.log('lyanneur card visual contract passed');
