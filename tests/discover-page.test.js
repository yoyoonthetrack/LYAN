const assert = require('node:assert/strict');
const fs = require('node:fs');
const page = fs.readFileSync('discover.html', 'utf8');
const source = fs.readFileSync('discover-page.js', 'utf8');
const shell = fs.readFileSync('app-shell.js', 'utf8');
const main = page.slice(page.indexOf('<main id="discover"'), page.indexOf('</main>'));

// Phase 3.1A: Découvrir is the compact home. Order of the sections inside <main>.
const order = ['id="discoverSearchForm"', 'discover-actions', 'id="discoverHighlights"', 'Explorer les services', 'Découvrez nos talents', 'Les annonces du moment', 'discover-map-banner'];
let last = -1;
for (const marker of order) {
    const at = main.indexOf(marker);
    assert.ok(at > last, `section out of order or missing: ${marker}`);
    last = at;
}
assert.doesNotMatch(main, /discover-hero|Un besoin \? Un talent près de vous|Les talents de votre quartier|discover-kicker/, 'no marketing hero');
assert.match(main, /Quel service recherchez-vous \?/);
assert.match(main, /is-help[\s\S]*mode=lyanneurs[\s\S]*Trouver de l'aide/);
assert.match(main, /mode=annonces" id="discoverOfferTalents"[\s\S]*Proposer mes talents/);
assert.match(main, /À la une près de chez vous/);
assert.match(main, /id="discoverHighlights"[^>]*hidden/, 'the editorial section stays hidden until real cards exist');
assert.match(main, /family=jardinage/);
assert.match(main, /family=bricolage/);
assert.match(main, /family=menage/);
assert.match(main, /family=beaute/);
assert.match(main, /id="discoverTalents"/);
assert.match(main, /id="discoverNeeds"/);
assert.match(main, /discover-map-banner" href="results\.html\?mode=annonces&amp;view=map"/);
assert.match(main, /id="discoverAdvice"[^>]*hidden/);
assert.doesNotMatch(page, /Bientôt disponible/);
assert.doesNotMatch(page, /nav-link-bokantaj/);
assert.doesNotMatch(page, /id="explorer"/);
assert.match(page, /editorial-highlights-view\.js[\s\S]*discover-page\.js/);
assert.match(page, /editorial-highlights\.css/);
assert.match(page, /discover-page\.js/);
assert.match(page, /explorer-repository\.js/);
assert.match(page, /id="publicMemberProfileModal"/);

assert.match(source, /visibility !== 'PUBLIC'/);
assert.match(source, /discover-need-row/);
assert.match(source, /discover-talent-mini/);
assert.match(source, /\.slice\(0, 4\)/);
assert.match(source, /\.slice\(0, 3\)/);
assert.match(source, /goOfferTalents/);
assert.match(source, /results\.html\?mode=annonces/);
assert.match(source, /openLyannDetailModal/);
assert.match(source, /openPublicMemberProfile/);
assert.match(source, /loadRequests\(\)/);
assert.match(source, /repo\.load\(\)/);
assert.match(source, /prioritizeTerritory/);
assert.match(source, /editorial_highlights/);
assert.match(source, /HIGHLIGHT_COLUMNS/);
assert.doesNotMatch(source, /select\('\*'\)[^;]*editorial_highlights|editorial_highlights'\)\.select\('\*'\)/, 'columns are listed: created_by is not readable by clients');
assert.match(source, /section\.hidden = true/);
assert.match(source, /no demo|Aucune carte de démonstration/i);

assert.match(shell, /tab-discover', 'discover\.html', 'ph-house', 'Découvrir'/);

const { eligibleRequest, territoryName, prioritizeTerritory } = require('../discover-page.js');
const open = { id: 'a', visibility: 'PUBLIC', status: 'OPEN', safety_status: 'SAFE', target_user_id: null, classification_status: 'CLASSIFIED', public_moderation_status: 'approved' };
assert.equal(eligibleRequest(open), true);
assert.equal(eligibleRequest({ ...open, visibility: 'PRIVATE' }), false);
assert.equal(eligibleRequest({ ...open, target_user_id: 'u1' }), false);
assert.equal(eligibleRequest({ ...open, public_moderation_status: 'pending' }), false);
const ranked = prioritizeTerritory([{ id: 'b' }, { id: 'a' }], 'guadeloupe', (row) => (row.id === 'a' ? 'guadeloupe' : 'martinique'));
assert.equal(ranked.localCount, 1);
assert.equal(ranked.items[0].id, 'a');

const v3 = fs.readFileSync('discover-v3.css', 'utf8');
assert.match(v3, /\.discover-v3 \.discover-search-bar/);
assert.match(v3, /\.discover-v3 \.discover-service-rail/);
assert.match(v3, /\.discover-v3 \.discover-talent-mini/);
assert.match(v3, /\.discover-v3 \.discover-need-row/);
assert.match(v3, /\.discover-v3 \.discover-map-banner/);

console.log('discover page contract passed');
