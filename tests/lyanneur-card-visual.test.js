const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('explorer-ui.js', 'utf8');
const css = fs.readFileSync('explorer.css', 'utf8');

assert.match(ui, /explorer-profile-card/);
assert.match(ui, /explorer-profile-primary-skill/);
assert.match(ui, /explorer-profile-secondary-skills/);
assert.match(ui, /rawSkills\.slice\(1, 3\)/);
assert.match(ui, /data-action="contact"/);
assert.match(ui, /Contacter/);
assert.match(ui, /explorer-quote-text/);
assert.match(ui, /explorer-skills-text/);
assert.doesNotMatch(ui, /lyann-cta-primary explorer-btn-contact/);

assert.match(css, /\.explorer-profile-card/);
assert.match(css, /\.explorer-profile-bio/);
assert.match(css, /-webkit-line-clamp:2/);
assert.match(css, /\.explorer-annonce-title/);

console.log('lyanneur card visual contract passed');
