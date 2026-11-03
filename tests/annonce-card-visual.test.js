const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('explorer-ui.js', 'utf8');
const css = fs.readFileSync('explorer.css', 'utf8');

assert.match(ui, /Voir l'annonce/);
assert.match(ui, /data-action="detail"/);
assert.match(ui, /data-action="help"/);
assert.match(ui, /annonceFact\('ph-map-pin', 'Lieu'/);
assert.match(ui, /annonceFact\('ph-currency-eur', 'Prix'/);
assert.match(ui, /explorer-fact-price/);
assert.doesNotMatch(ui, /trois heures/);

assert.match(css, /\.explorer-annonce-title/);
assert.match(css, /\.explorer-annonce-taxonomy/);
assert.match(css, /#F6EEDD/);
assert.match(css, /\.explorer-fact-price/);
assert.match(css, /\.explorer-annonce-actions/);

console.log('annonce card visual contract passed');
