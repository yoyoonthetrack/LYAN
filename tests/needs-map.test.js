const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Real commune dataset and geo helpers, loaded the way the browser loads them.
const sandbox = { window: {}, navigator: {}, sessionStorage: { getItem() { return null; } } };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['commune-geo.js', 'commune-distance.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
const geo = sandbox.LYANN_GEO;

const map = require('../needs-map.js');
const { eligibleRequest: discoverEligible } = require('../discover-page.js');

const base = { id: 'r', title: 'Tondre la pelouse', category: 'Entretien Jardin', visibility: 'PUBLIC', status: 'OPEN',
    safety_status: 'SAFE', target_user_id: null, classification_status: 'CLASSIFIED', public_moderation_status: 'approved',
    location: 'Les Abymes (971 - Guadeloupe)', budget: 40 };
const row = (id, patch = {}) => ({ ...base, id, ...patch });

// 3. Visibility: identical to the public list and to Découvrir, for every blocked state.
const blocked = [
    { visibility: 'PRIVATE' }, { status: 'CLOSED' }, { status: 'RESERVED' }, { safety_status: 'FLAGGED' },
    { target_user_id: 'someone' }, { classification_status: 'REFUSED' }, { public_moderation_status: 'rejected' },
    { public_moderation_status: 'pending' }
];
for (const patch of blocked) {
    assert.equal(map.eligibleRequest(row('x', patch)), false, JSON.stringify(patch));
    assert.equal(map.eligibleRequest(row('x', patch)), discoverEligible(row('x', patch)));
}
assert.equal(map.eligibleRequest(row('ok')), true);
assert.equal(map.eligibleRequest(row('ok', { public_moderation_status: undefined })), discoverEligible(row('ok', { public_moderation_status: undefined })));
assert.equal(map.eligibleRequest(null), false);

// 2 + 3. Known communes are grouped; the map never shows more than the allowed list.
const rows = [
    row('a1'), row('a2'), row('a3', { visibility: 'PRIVATE' }),
    row('b1', { location: 'Le Gosier (971 - Guadeloupe)' }),
    row('c1', { location: 'Fort-de-France (972 - Martinique)' }),
    row('a1')
];
const grouped = map.groupByCommune(rows, geo);
assert.equal(grouped.total, 4, 'blocked and duplicate rows are not counted');
assert.equal(grouped.mapped, 4);
assert.equal(grouped.unmapped, 0);
assert.deepEqual(grouped.groups.map((g) => [g.label, g.items.length]), [['Les Abymes', 2], ['Fort-de-France', 1], ['Le Gosier', 1]].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'fr')));
const mappedIds = grouped.groups.flatMap((g) => g.items.map((r) => r.id)).sort();
assert.deepEqual(mappedIds, ['a1', 'a2', 'b1', 'c1']);
assert.equal(mappedIds.includes('a3'), false);
// Pins sit on the official commune centre, never on anything read from the annonce.
const abymes = grouped.groups.find((g) => g.label === 'Les Abymes');
assert.deepEqual([abymes.lat, abymes.lng], [...sandbox.LYANN_COMMUNE_GEO['971|les abymes']]);

// 8. No private address: precise coordinates carried by the row are ignored.
const leaky = map.groupByCommune([row('p1', { lat: 16.2001, lng: -61.5001, place_lat: 16.2002, place_lng: -61.5002, address: '12 rue des Lilas' })], geo);
assert.deepEqual([leaky.groups[0].lat, leaky.groups[0].lng], [...sandbox.LYANN_COMMUNE_GEO['971|les abymes']]);

// 6. Unknown / ambiguous / free-text locations are not placed, but still counted for the list.
const unplaced = map.groupByCommune([
    row('u1', { location: '12 rue des Lilas, Les Abymes' }),
    row('u2', { location: 'Guadeloupe (971)' }),
    row('u3', { location: 'Sainte-Anne' }),
    row('u4', { location: 'Saint-Denis' }),
    row('u5', { location: '' }),
    row('u6', { location: null }),
    row('u7', { location: 'Commune inconnue (971 - Guadeloupe)' }),
    row('k1', { location: 'Sainte-Anne (971 - Guadeloupe)' })
], geo);
assert.equal(unplaced.total, 8);
assert.equal(unplaced.mapped, 1);
assert.equal(unplaced.unmapped, 7);
assert.deepEqual(unplaced.groups.map((g) => g.items[0].id), ['k1']);
// Anonymous public API: only "Guadeloupe (971)" is exposed, so nothing is invented.
assert.equal(map.groupByCommune([row('anon', { location: 'Guadeloupe (971)' })], geo).mapped, 0);
assert.equal(map.groupByCommune([], geo).total, 0);
assert.equal(map.groupByCommune(undefined, geo).total, 0);
assert.equal(map.groupByCommune([row('n')], null).mapped, 0);

// Pin cap.
assert.equal(map.groupByCommune(Object.keys(sandbox.LYANN_COMMUNE_GEO).slice(0, 10).map((key, i) => {
    const [code, name] = key.split('|');
    return row('m' + i, { location: `${name} (${code})` });
}), geo, 3).groups.length, 3);

// 5. Panel: category, title, commune, price, action; user content is escaped; no author data.
const format = {
    categoryLine: (r) => r.category, shortTitle: (t) => t, priceLabel: (r) => (r.budget ? `${r.budget} €` : 'Sur devis')
};
const panel = map.renderPanel({ label: 'Les Abymes', items: [row('a1', { title: '<img src=x onerror=alert(1)>', requester_id: 'secret-id', profiles: { first_name: 'Marie' } }), row('a2', { budget: null })] }, { format });
assert.match(panel, /Les Abymes/);
assert.match(panel, /2 annonces/);
assert.match(panel, /Entretien Jardin/);
assert.match(panel, /40 €/);
assert.match(panel, /Sur devis/);
assert.match(panel, /Voir l'annonce/);
assert.match(panel, /data-needs-map-open="a1"/);
assert.doesNotMatch(panel, /<img/);
assert.doesNotMatch(panel, /secret-id|Marie/);
assert.match(map.renderPanel({ label: 'Le Gosier', items: [row('b1')] }, { format }), /1 annonce</);

// Wiring contracts.
const source = fs.readFileSync('needs-map.js', 'utf8');
assert.doesNotMatch(source, /getMappedBokantajPosts|place_lat|place_lng|getCurrentPosition|geolocation|requestPreciseLocation/);
assert.match(source, /vendor\/leaflet\/leaflet\.js/);
assert.match(source, /ensureMapLibraries\(\)\.then/);
assert.match(source, /map\.remove\(\)/);
assert.match(source, /removeEventListener\('click'/);
assert.match(source, /prefers-reduced-motion/);
assert.match(source, /setAttribute\('aria-label', name\)/);
const results = fs.readFileSync('results.html', 'utf8');
assert.doesNotMatch(results, /<script[^>]+vendor\/leaflet/, 'Leaflet is not loaded until the map is requested');
assert.match(results, /needs-map\.js/);
assert.match(results, /needs-map\.css/);
assert.match(results, /id="explorerViewToggle"/);
assert.match(results, /data-view="list"[\s\S]*data-view="map"/);
assert.ok(results.indexOf('commune-geo.js') < results.indexOf('needs-map.js'));
const ui = fs.readFileSync('explorer-ui.js', 'utf8');
assert.match(ui, /params\.get\('view'\) === 'map'/);
assert.match(ui, /repo\.discover\(records, leaves, filters, mode\)[\s\S]*update\(\{ rows: results/);
assert.match(ui, /openLyannDetailModal\(row\.id, row\)/);
assert.match(ui, /setView\('list'\)/);
assert.doesNotMatch(ui, /getMappedBokantajPosts/);
const css = fs.readFileSync('needs-map.css', 'utf8');
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /min-height: 44px/);
const shell = fs.readFileSync('app-shell.js', 'utf8');
assert.doesNotMatch(shell, /tab-carte|tab-map/);

console.log('needs map contract passed');
