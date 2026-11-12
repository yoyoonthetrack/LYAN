'use strict';
// Phase 3.2C — présentation de la taxonomie V2 sur Découvrir / Lyanneurs / Annonces.
// Contrôles statiques et fonctions pures : aucune écriture, aucun drapeau, aucune seconde taxonomie.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const T = require('../marketplace-taxonomy.js');
const spec = JSON.parse(fs.readFileSync('docs/taxonomy/generated/taxonomy-v2.json', 'utf8'));
const discover = fs.readFileSync('discover.html', 'utf8');
const results = fs.readFileSync('results.html', 'utf8');
const ui = fs.readFileSync('explorer-ui.js', 'utf8');
const css = fs.readFileSync('results-v3.css', 'utf8');
const discoverMain = discover.slice(discover.indexOf('<main id="discover"'), discover.indexOf('</main>'));

const NODES = [
    { code: 'plomberie', kind: 'trade', parent_code: null, family_code: 'maison', group_code: 'depannage', label_fr: 'Plomberie', sort_order: 1, selectable: true, active: true },
    { code: 'plomberie_fuite', kind: 'specialty', parent_code: 'plomberie', family_code: 'maison', group_code: 'depannage', label_fr: 'Fuite', sort_order: 1, selectable: true, active: true },
    { code: 'electricite', kind: 'trade', parent_code: null, family_code: 'maison', group_code: 'depannage', label_fr: 'Électricité', sort_order: 2, selectable: true, active: true },
    { code: 'peinture', kind: 'trade', parent_code: null, family_code: 'maison', group_code: 'travaux', label_fr: 'Peinture', sort_order: 1, selectable: true, active: true },
    { code: 'tonte', kind: 'trade', parent_code: null, family_code: 'jardin', group_code: 'entretien_jardin', label_fr: 'Tonte', sort_order: 1, selectable: true, active: true },
    { code: 'ancien', kind: 'trade', parent_code: null, family_code: 'jardin', group_code: 'entretien_jardin', label_fr: 'Ancien', sort_order: 2, selectable: true, active: false }
];
const GROUPS = [{ code: 'depannage', family_code: 'maison', label_fr: 'Dépannage & installations', sort_order: 1 }, { code: 'travaux', family_code: 'maison', label_fr: 'Rénovation & construction', sort_order: 2 }];

test('8 real families and 10 discovery entries use the stable V2 codes', () => {
    assert.equal(T.FAMILIES.length, 8);
    assert.deepEqual(T.FAMILIES.map((f) => f.code), ['maison', 'jardin', 'entretien', 'beaute', 'transport', 'famille', 'evenement', 'numerique']);
    const specFamilies = spec.families.map((f) => f.code);
    for (const f of T.FAMILIES) assert.ok(specFamilies.includes(f.code), `${f.code} exists in taxonomy-v2.json`);
    assert.equal(T.TILES.length, 10);
    const specTiles = new Map(spec.discoverTiles.map((t) => [t.code, t]));
    for (const tile of T.TILES) {
        const ref = specTiles.get(tile.code);
        assert.ok(ref, `${tile.code} exists in taxonomy-v2.json`);
        assert.equal(tile.family, ref.family, `${tile.code}: family`);
        assert.deepEqual(tile.groups, ref.groups, `${tile.code}: groups`);
    }
    assert.deepEqual(T.TILES.slice(0, 2).map((t) => t.family), ['maison', 'maison'], 'the first two entries are the Maison family');
    assert.deepEqual(T.TILES.map((t) => t.label), ['Dépannage maison', 'Travaux & rénovation', 'Jardin & extérieur', 'Ménage & entretien', 'Beauté & bien-être', 'Transport & véhicules', 'Famille & assistance', 'Événementiel & cuisine', 'Numérique & services pros', 'Autres']);
});

test('« Autres » is a discovery entry only: never a family, never a selectable skill, leads to annonces', () => {
    const autres = T.tileByCode('tile_autres');
    assert.equal(autres.discoverOnly || autres.discoveryOnly, true);
    assert.ok(!T.FAMILY_CODES.includes('autres'));
    assert.match(T.tileHref(autres), /^results\.html\?mode=annonces&family=autres$/);
    assert.equal(T.normalizeFamilyParam('autres'), 'autres');
    const index = T.buildIndex(NODES, GROUPS);
    assert.equal(index.families.autres, undefined, 'no « autres » family in the skill hierarchy');
});

test('Découvrir markup mirrors the tiles: codes, labels, links and pictograms', () => {
    const anchors = [...discoverMain.matchAll(/<a class="discover-domain[^"]*" data-tile="([^"]+)" href="([^"]+)">([\s\S]*?)<\/a>/g)];
    assert.equal(anchors.length, 10, 'ten domains');
    anchors.forEach(([, code, href, inner], i) => {
        const tile = T.TILES[i];
        assert.equal(code, tile.code);
        assert.equal(href.replace(/&amp;/g, '&'), T.tileHref(tile));
        assert.ok(inner.includes(tile.label.replace(/&/g, '&amp;')) || inner.includes(tile.label), `${tile.code}: label`);
        assert.ok(inner.includes(T.ICONS[tile.icon]), `${tile.code}: pictogram identical to the shared one`);
    });
});

test('legacy links keep working and unknown families are ignored', () => {
    assert.equal(T.normalizeFamilyParam('jardinage'), 'jardin');
    assert.equal(T.normalizeFamilyParam('menage'), 'entretien');
    assert.equal(T.normalizeFamilyParam('maison'), 'maison');
    assert.equal(T.normalizeFamilyParam('inconnu'), '');
    assert.equal(T.normalizeFamilyParam(''), '');
});

test('index: groups → trades → specialties read from the V2 rows; inactive nodes are dropped; empty input degrades to null', () => {
    assert.equal(T.buildIndex([], []), null);
    assert.equal(T.buildIndex(null, null), null);
    const index = T.buildIndex(NODES, GROUPS);
    const maison = index.families.maison;
    assert.deepEqual(maison.groups.map((g) => g.code), ['depannage', 'travaux']);
    assert.deepEqual(maison.groups[0].trades.map((t) => t.code), ['plomberie', 'electricite']);
    assert.deepEqual(maison.groups[0].trades[0].specialties.map((s) => s.code), ['plomberie_fuite']);
    assert.equal(maison.groups[0].label, 'Dépannage & installations');
    assert.equal(index.byCode.has('ancien'), false);
});

test('rowMatches: family, groups, job and specialty combine; autres also takes unclassified rows', () => {
    const index = T.buildIndex(NODES, GROUPS);
    const ctx = { index, leaves: [{ id: 'leaf-1', node_code: 'plomberie_fuite' }] };
    const fuite = { taxonomy_node_code: 'plomberie_fuite' };
    const tonte = { taxonomy_node_code: 'tonte' };
    const legacy = { taxonomy_id: 'leaf-1' };
    const unknown = { title: 'Autre chose' };
    assert.equal(T.rowMatches(fuite, { family: 'maison' }, ctx), true);
    assert.equal(T.rowMatches(tonte, { family: 'maison' }, ctx), false);
    assert.equal(T.rowMatches(fuite, { family: 'maison', groups: ['travaux'] }, ctx), false);
    assert.equal(T.rowMatches(fuite, { family: 'maison', groups: ['depannage', 'equipement'] }, ctx), true);
    assert.equal(T.rowMatches(fuite, { job: 'plomberie' }, ctx), true, 'a specialty belongs to its trade');
    assert.equal(T.rowMatches(fuite, { job: 'electricite' }, ctx), false);
    assert.equal(T.rowMatches(fuite, { specialty: 'plomberie_fuite' }, ctx), true);
    assert.equal(T.rowMatches({ taxonomy_node_code: 'plomberie' }, { specialty: 'plomberie_fuite' }, ctx), false);
    assert.equal(T.rowMatches(legacy, { family: 'maison', job: 'plomberie' }, ctx), true, 'the legacy leaf resolves through its node code');
    assert.equal(T.rowMatches(unknown, { family: 'autres' }, ctx), true);
    assert.equal(T.rowMatches(fuite, { family: 'autres' }, ctx), false);
});

test('legacy bridge only maps unambiguous historic families, « quotidien » stays unclassified', () => {
    const ctx = { index: null, leaves: [], legacyFamilyForRow: (row) => row.legacy };
    assert.equal(T.familyOf({ legacy: 'plomberie' }, ctx), 'maison');
    assert.equal(T.familyOf({ legacy: 'jardinage' }, ctx), 'jardin');
    assert.equal(T.familyOf({ legacy: 'quotidien' }, ctx), '');
    assert.equal(T.familyOf({}, { index: null }), '');
});

test('countByTrade counts rows per trade code', () => {
    const index = T.buildIndex(NODES, GROUPS);
    const counts = T.countByTrade([{ taxonomy_node_code: 'plomberie_fuite' }, { taxonomy_node_code: 'plomberie' }, { taxonomy_node_code: 'electricite' }, {}], { index, leaves: [] });
    assert.deepEqual(counts, { plomberie: 2, electricite: 1 });
});

test('load never throws and returns null without a client or without data', async () => {
    assert.equal(await T.load(null, true), null);
    const failing = { from: () => { throw new Error('offline'); } };
    assert.equal(await T.load(failing, true), null);
});

test('Lyanneurs and Annonces: eight family discs, compact bar + Affiner sheet, quick territory next to the search, filters kept', () => {
    assert.match(results, /id="explorerCategoryPills"[^>]*explorer-family-grid/);
    assert.match(results, /id="explorerTaxoBar"/);
    assert.match(results, /id="explorerRefine"/);
    assert.doesNotMatch(results, /id="explorerJobPanel"/);
    assert.match(results, /id="explorerTerritoryQuick"/);
    assert.match(results, /id="explorerFiltersIcon"/);
    assert.match(results, /marketplace-taxonomy\.js[\s\S]*explorer-repository\.js/, 'the taxonomy helper loads before the explorer');
    assert.ok(results.indexOf('explorerSearchForm') < results.indexOf('explorerTerritoryQuick') && results.indexOf('explorerTerritoryQuick') < results.indexOf('explorerCategoryPills'));
    assert.match(results, /data-view="list"[\s\S]*data-view="map"/, 'the map stays a sub-view of Annonces');
    assert.match(ui, /button.dataset.action === 'taxo-refine'/, 'the sub-trade browser opens only from « Affiner »');
    assert.match(ui, /FAMILIES\.map/);
});

test('Annonces cards carry the author avatar left of the title; it opens the profile', () => {
    assert.match(ui, /explorer-annonce-titlerow/);
    assert.match(ui, /authorAvatar\(/);
    assert.match(ui, /data-action="profile"/);
    assert.match(css, /\.explorer-annonce-avatar/);
});

test('Lyanneurs are green, Annonces honey; pictograms contrast; no stray yellow dot', () => {
    assert.match(css, /main#explorer \{\s*--fam-disc: var\(--lyann-green-primary\); --fam-ink: #fff;/);
    assert.match(css, /main#explorer\[data-mode="annonces"\] \{\s*--fam-disc: var\(--lyann-honey\); --fam-ink: var\(--lyann-green-deep\);/);
    assert.match(css, /has-active-filters::after \{ content: none; display: none; \}/);
    assert.doesNotMatch(css, /::after \{[^}]*background: var\(--lyann-yellow\)[^}]*border-radius: 50%/);
});

test('Messages title uses the shared title style, not the historic serif', () => {
    const style = fs.readFileSync('style.css', 'utf8');
    const last = style.slice(style.lastIndexOf('body #chatModal .lyann-inbox-title {'));
    assert.match(last, /font-family: 'Outfit', sans-serif !important;/);
    assert.match(last, /font-weight: 800 !important;/);
    assert.match(last, /text-align: left !important;/);
});

test('navigation: five tabs unchanged, no new tab, 3.2C changes no payment, messaging or flag file', () => {
    const shell = fs.readFileSync('app-shell.js', 'utf8');
    for (const label of ['Découvrir', 'Lyanneurs', 'Annonces', 'Messages', 'Profil']) assert.match(shell, new RegExp(label));
    assert.doesNotMatch(shell, /tab-carte/);
    const ours = ['marketplace-taxonomy.js', 'explorer-ui.js', 'discover-page.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(ours, /\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(|\.rpc\(/, 'display layer only: no database write');
    assert.doesNotMatch(ours, /feature_flags|lyann_flags|SKILLS_V2|enableFlag/i, 'no flag activation');
});

test('no Production reference and no secret in the 3.2C files', () => {
    for (const f of ['marketplace-taxonomy.js', 'explorer-ui.js', 'discover-page.js', 'results-v3.css', 'discover-v3.css', 'scripts/preview-v32c.js', 'scripts/capture-v32c.js']) {
        const src = fs.readFileSync(f, 'utf8');
        assert.doesNotMatch(src, /gzispjfoywklpqatjyop/, `${f}: Production ref`);
        assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}|sb_secret_|service_role\s*[:=]\s*['"]/, `${f}: secret`);
    }
});
