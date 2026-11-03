const assert = require('node:assert/strict');
const fs = require('node:fs');
const page = fs.readFileSync('discover.html', 'utf8');
const source = fs.readFileSync('discover-page.js', 'utf8');
const shell = fs.readFileSync('app-shell.js', 'utf8');

assert.match(page, /Un besoin \? Un talent près de vous/);
assert.match(page, /Trouver de l'aide/);
assert.match(page, /Proposer mes talents/);
assert.match(page, /Quel service recherchez-vous \?/);
assert.match(page, /Les talents de votre quartier/i);
assert.match(page, /id="discoverOfferTalents"/);
assert.match(page, /discoverOfferTalents[\s\S]*mode=annonces/);
assert.match(page, /Explorer les services/);
assert.match(page, /Les talents près de vous/);
assert.match(page, /Des besoins près de vous/);
assert.match(page, /Explorer les besoins sur la carte/);
assert.match(page, /Bientôt disponible/);
assert.doesNotMatch(page, /href="[^"]*carte[^"]*"/i);
assert.match(page, /id="discoverAdvice"[^>]*hidden/);
assert.match(page, /category=Entretien%20Jardin/);
assert.match(page, /category=Bricolage/);
assert.match(page, /category=M%C3%A9nage/);
assert.match(page, /results\.html\?mode=annonces/);
assert.match(page, /results\.html\?mode=lyanneurs/);
assert.match(page, /discover-page\.js/);
assert.match(page, /explorer-repository\.js/);
assert.match(page, /id="publicMemberProfileModal"/);
assert.doesNotMatch(page, /nav-link-bokantaj/);
assert.doesNotMatch(page, /id="explorer"/);

assert.match(source, /visibility !== 'PUBLIC'/);
assert.match(source, /discover-need-card/);
assert.match(source, /discover-talent-card/);
assert.match(source, /goOfferTalents/);
assert.match(source, /results\.html\?mode=annonces/);
assert.match(source, /openLyannDetailModal/);
assert.match(source, /openPublicMemberProfile/);
assert.match(source, /loadRequests\(\)/);
assert.match(source, /repo\.load\(\)/);
assert.doesNotMatch(source, /bokantaj/i);

assert.match(shell, /tab-discover', 'discover\.html', 'ph-house', 'Découvrir'/);

const { eligibleRequest, territoryName } = require('../discover-page.js');
const open = { id: 'a', visibility: 'PUBLIC', status: 'OPEN', safety_status: 'SAFE', target_user_id: null, classification_status: 'CLASSIFIED', public_moderation_status: 'approved' };
assert.equal(eligibleRequest(open), true);

const css = fs.readFileSync('discover.css', 'utf8');
assert.match(css, /\.discover-hero/);
assert.match(css, /\.discover-search-bar/);
assert.match(css, /\.discover-talent-card/);
assert.match(css, /\.discover-category-grid/);
assert.match(css, /#discoverAdvice\[hidden\]/);

console.log('discover page contract passed');
