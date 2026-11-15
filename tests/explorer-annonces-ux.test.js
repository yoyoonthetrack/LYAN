'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const results = fs.readFileSync('results.html', 'utf8');
const ui = fs.readFileSync('explorer-ui.js', 'utf8');
const css = fs.readFileSync('explorer-annonces-ux.css', 'utf8');

assert.match(ui, /title: 'Annonces', subtitle: 'Des besoins réels autour de vous'/);
assert.match(results, /explorer-annonces-ux\.css/);
assert.match(results, /needs-map-category-families\.js/);
assert.match(results, /explorerMapCategorySheet/);
assert.match(ui, /mapPinStyle/);
assert.doesNotMatch(ui, /explorerMapCategoryApply/);
assert.doesNotMatch(results, /explorerMapCategoryApply/);
assert.match(results, /explorerFiltersIcon/);
assert.match(results, /data-view="list"[\s\S]*data-view="map"/);
assert.doesNotMatch(ui, /De quoi avez-vous besoin/);
assert.match(ui, /Rechercher une annonce, un besoin…/);
assert.match(ui, /explorer-annonces-map-view/);
assert.match(results, /id="explorerRefine"/);
assert.doesNotMatch(ui, /data-action="more-categories"/);
assert.match(ui, /area: filters\.area/);
assert.match(ui, /reframe: options\.reframe/);
assert.match(ui, /explorer-annonce-compact/);
assert.doesNotMatch(ui, /if \(view === 'list'\) destroyNeedsMap/);
assert.match(css, /explorer-annonces-map-view/);
assert.match(css, /100dvh/);
assert.match(css, /overflow: hidden/);

console.log('explorer annonces ux contract passed');
