'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

global.window = {
    addEventListener() {}, LYANN_ANNONCE_FORMAT: null, LYANN_DATA_CACHE: null,
    LyanAI: { normalizeText: (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() }
};
require('../explorer-repository.js');
const repo = global.window.LYANN_EXPLORER_REPOSITORY;
const needsMap = require('../needs-map.js');

const person = (name, territory) => ({ name, first_name: name, territory, city: 'X', services: [{ title: 'Aide' }] });
const base = { query: '', category: '', service: '', area: '', territory: '', commune: '' };
const names = (list) => list.map((p) => p.name).join(' ');

test('Lyanneurs: territories are grouped, never interleaved alphabetically', () => {
    const profiles = [person('Alain', 'Martinique'), person('Audrey', 'Guadeloupe'), person('Bob', 'martinique'), person('Carole', 'Guadeloupe'), person('Dan', 'Guadeloupe (971)')];
    assert.equal(names(repo.discover(profiles, [], base, 'lyanneurs')), 'Audrey Carole Dan Alain Bob', 'largest territory first, then the other, each sorted by name');
    assert.equal(names(repo.discover(profiles, [], { ...base, viewerTerritory: 'Martinique' }, 'lyanneurs')), 'Alain Bob Audrey Carole Dan', 'the reader\'s own territory comes first');
});

test('Lyanneurs: an explicit territory filter still excludes the other territory', () => {
    const profiles = [person('Alain', 'Martinique'), person('Audrey', 'Guadeloupe'), person('Bob', 'martinique')];
    assert.equal(names(repo.discover(profiles, [], { ...base, territory: 'Guadeloupe' }, 'lyanneurs')), 'Audrey');
    assert.equal(names(repo.discover(profiles, [], { ...base, territory: 'Martinique' }, 'lyanneurs')), 'Alain Bob');
});

test('Lyanneurs: the viewer territory is never written to the URL or the stored filters', () => {
    const ui = fs.readFileSync('explorer-ui.js', 'utf8');
    assert.match(ui, /Object\.defineProperty\(filters, 'viewerTerritory', \{ value: viewerTerritory, enumerable: false/);
    assert.match(ui, /repo\.discover\(records, leaves, filters, mode\)/, 'list and map keep one discover call');
});

test('Map framing: every commune of the dominant territory stays in the frame', () => {
    const group = (lat, lng, n) => ({ lat, lng, items: new Array(n).fill({}) });
    const guadeloupe = [group(16.24, -61.49, 7), group(16.02, -61.74, 1), group(16.23, -61.53, 1), group(16.25, -61.27, 1)];
    assert.equal(needsMap.dominantTerritoryGroups(guadeloupe).length, 4, 'Le Gosier alone must not become the whole frame');
    const mixed = [...guadeloupe, group(14.6, -61.05, 2), group(48.85, 2.35, 1)];
    assert.equal(needsMap.dominantTerritoryGroups(mixed).length, 4, 'Martinique and the Hexagone do not zoom the map out');
    assert.equal(needsMap.dominantTerritoryGroups([group(14.6, -61.05, 3), ...guadeloupe.slice(0, 1)]).length, 1, 'item count, not commune count, decides');
    assert.equal(needsMap.territoryOfPoint(48.85, 2.35), 'hexagone');
    assert.deepEqual(needsMap.dominantTerritoryGroups([]), []);
});

test('Map summary is one short line', () => {
    const source = fs.readFileSync('needs-map.js', 'utf8');
    assert.match(source, /` · \+\$\{result\.unmapped\} dans la liste`/);
    assert.doesNotMatch(source, /sans commune précise \(voir la liste\)/);
});

test('Headers, cards and back-office layout keep the validated direction', () => {
    const css = fs.readFileSync('results-v3.css', 'utf8');
    assert.match(css, /\[data-mode="lyanneurs"\] \.results-v3-photo\.is-lyanneurs \{ display: block; object-position: center 0%; \}/);
    assert.match(css, /\.explorer-annonce\.explorer-card \{ background: #fff;/);
    assert.match(css, /\[data-mode="annonces"\] \.results-v3-overlay \{[^}]*align-items: flex-end/);
    const highlight = fs.readFileSync('editorial-highlights.css', 'utf8');
    assert.match(highlight, /aspect-ratio: 2 \/ 1/);
    const admin = fs.readFileSync('admin.html', 'utf8');
    for (const id of ['hlTitle', 'hlTeaser', 'hlLabel', 'hlFile', 'hlImageInfo', 'hlAlt', 'hlTerritory', 'hlTheme', 'hlTarget', 'hlCategoryRow', 'hlCategory', 'hlStart', 'hlEnd', 'hlPriority', 'hlStatus', 'hlPreview', 'hlSave', 'hlCancel']) {
        assert.equal((admin.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} is kept exactly once`);
    }
    assert.match(fs.readFileSync('admin-design-v2.css', 'utf8'), /\.admin-header-context \{ flex: 0 1 auto; min-width: 0; max-width: 240px; \}/);
});
