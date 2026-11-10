'use strict';

// Phase 3.0C-2 / 3.0C-3 contract for the premium guest onboarding (static checks only: the visual conformity itself is
// verified by real WebKit captures, see scripts/capture-onboarding-slides.js and artifacts/onboarding-premium-v1/).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const bienvenue = read('bienvenue.html');
const css = read('native-guest-premium.css');
const guestStart = bienvenue.indexOf('id="nativeGuestHome"');
const guestEnd = bienvenue.indexOf('id="nativeGuestAuthSheet"');
const guest = bienvenue.slice(guestStart, guestEnd);
const slides = guest.split('<section ').slice(1).map((s) => s.split('</section>')[0]);

assert.match(bienvenue, /native-guest-premium-v1/);
assert.equal(slides.length, 5, 'five premium slides');
assert.equal((guest.match(/class="native-guest-slide native-guest-premium"/g) || []).length, 5);

// §1 — one single header with the official symbol, outside the pager, none inside the slides.
assert.equal((guest.match(/<header class="ngp-app-header"/g) || []).length, 1, 'exactly one LYANN header');
assert.equal((guest.match(/assets\/brand\/lyann-symbol\.png/g) || []).length, 1, 'official symbol used once');
assert.equal((guest.match(/ngp-brand-wordmark/g) || []).length, 1, 'wordmark used once');
assert.ok(guest.indexOf('ngp-app-header') < guest.indexOf('id="nativeGuestPager"'), 'header precedes the pager');
slides.forEach((s, i) => assert.ok(!/ngp-brand|lyann-symbol/.test(s), 'no logo inside slide ' + (i + 1)));
assert.ok(!/étapes simples/i.test(guest), 'no foreign "étapes simples" banner in the guest landing');
assert.match(css, /:has\(#nativeGuestHome\.native-guest-premium-v1:not\(\[hidden\]\)\)[\s\S]{0,80}\.navbar/, 'native navbar hidden under the guest landing');
assert.match(css, /#how[\s\S]{0,40}#app-preview/, 'website sections hidden under the guest landing');

// Assets — real files with the right format, no reuse across slides.
const png = fs.readFileSync(path.join(root, 'assets/brand/lyann-symbol.png'));
assert.equal(png.slice(1, 4).toString(), 'PNG', 'symbol is a real PNG');
assert.equal(png[25], 6, 'symbol PNG keeps its alpha channel (RGBA)');
const photos = { gardener: 0, chef: 0, electrician: 0, cleaner: 0, plumber: 1, hairdresser: 3 };
Object.keys(photos).forEach((name) => {
    const f = path.join(root, 'assets/onboarding', `photo-${name}.webp`);
    const buf = fs.readFileSync(f);
    assert.equal(buf.slice(0, 4).toString(), 'RIFF', name + ' is a RIFF container');
    assert.equal(buf.slice(8, 12).toString(), 'WEBP', name + ' is a real WebP');
    assert.ok(buf.length < 150 * 1024, name + ' is optimised (<150 KB)');
});
['slide-01-connection', 'slide-02-professional', 'slide-04-trust'].forEach((old) => assert.ok(!guest.includes(old), 'stale photo ' + old));
const photoSrcs = guest.match(/assets\/onboarding\/photo-[a-z]+\.webp/g) || [];
assert.equal(new Set(photoSrcs).size, photoSrcs.length, 'no photo repeated across the slides');
assert.equal(photoSrcs.length, 6, 'six distinct photographs');
assert.ok(/photo-plumber/.test(slides[1]) && !/photo-plumber/.test(slides[0]), 'slide 2 = plumber only');
assert.ok(/photo-hairdresser/.test(slides[3]) && !/photo-chef/.test(slides[3]), 'slide 4 = hairdresser (coherent with the Coiffure card)');
assert.ok(/Coiffure/.test(slides[3]), 'slide 4 mentions Coiffure');
['gardener', 'chef', 'electrician', 'cleaner'].forEach((n) => assert.ok(slides[0].includes(`photo-${n}.webp`), 'slide 1 mosaic has ' + n));

// Wording (definitive texts).
const titles = [
    'Des talents et des pros près de chez vous',
    'Votre savoir-faire a sa place ici',
    'Paiement sécurisé, mission sereine',
    'La confiance au cœur de LYANN',
    'Explorez votre île, votre quartier, autrement'
];
titles.forEach((t, i) => assert.ok(strip(slides[i]).includes(t), 'title: ' + t));
// 3.0C-3 §1 — the five hashtag pills are gone, nothing replaces them, no empty margin left for them.
['# Découvrir', '# Proposer', '# Sécuriser', '# Confiance', '# Explorer'].forEach((t) => assert.ok(!guest.includes(t), 'no hashtag ' + t));
assert.ok(!/ngp-tag/.test(guest) && !/\.ngp-tag/.test(css), 'no ngp-tag element or style');
slides.forEach((s, i) => assert.match(s, /<div class="native-guest-slide-inner">\s*<h2 class="ngp-title"/, 'title is the first element of slide ' + (i + 1)));
// 3.0C-3 §4 — slide 1 keeps only the relationship cues, not the redundant category row.
['Un projet à réaliser', 'Un talent à proximité'].forEach((t) => assert.ok(strip(slides[0]).includes(t), t));
assert.ok(!/ngp-cats/.test(guest), 'redundant category labels removed under the mosaic');
['Pour les talents indépendants', 'Pour les professionnels', 'Plomberie', 'Électricité', 'Jardinage', 'Transport et déménagement'].forEach((t) => assert.ok(strip(slides[1]).includes(t), t));
// 3.0C-3 §6 — three big moments, detailed business steps as secondary legends.
assert.equal((slides[2].match(/class="ngp-moment ngp-moment--/g) || []).length, 3, 'three moments');
['Accord sur la prestation', 'Paiement sécurisé', 'Avant intervention', 'Mission réalisée, validée, puis paiement libéré'].forEach((t) => assert.ok(strip(slides[2]).includes(t), t));
['Demande', 'Devis ou tarif convenu', 'Prestation', 'Validation', 'Libération'].forEach((t) => assert.ok(new RegExp('ngp-legend-item">' + t + '<').test(slides[2]), 'legend ' + t));
assert.match(css, /\.ngp-moment--2 \{[^}]*border: 2px solid/, 'secure payment is the visually central card');
assert.doesNotMatch(strip(slides[2]), /garanti|100\s?%|sans risque|aucun risque/i, 'no absolute guarantee promise');

// Slide 4 — no verified badge, review clearly an illustration.
assert.doesNotMatch(guest, /Profil vérifié/, 'no verified profile badge on slides');
assert.match(slides[3], /Une lyanneuse sérieuse et professionnelle/);
assert.match(slides[3], /Exemple d'affichage, sans données réelles/);

// Slide 5 — generic island, 4 distinct pins, nothing presented as an unavailable feature, no real place name.
assert.equal((slides[4].match(/class="ngp-pin ngp-pin--/g) || []).length, 4, 'four pins');
assert.equal(new Set(slides[4].match(/ngp-pin--[a-z]+/g)).size, 4, 'four distinct pin categories');
assert.doesNotMatch(slides[4], /Guadeloupe|Pointe-à-Pitre|Basse-Terre|Martinique/i, 'island is generic');
assert.ok(!/ngp-tile"><i class="ph ph-users-three"/.test(slides[4]), 'no "Talents on the map" claim');

// Actions — real ids kept, order primary then secondary, solid colours (no gradient).
assert.match(guest, /id="btnNativeJoin"[^>]*>Créer mon compte</);
assert.match(guest, /id="btnNativeLogin"[^>]*>Se connecter</);
assert.ok(guest.indexOf('id="btnNativeJoin"') < guest.indexOf('id="btnNativeLogin"'), 'primary action first');
assert.ok(!/native-guest-login-slide/.test(guest), 'login is not a 6th slide');
assert.match(bienvenue, /id="nativeGuestAuthSheet"/);
assert.match(css, /\.btn-primary \{[^}]*background-image: none !important/, 'primary CTA is solid');
assert.match(css, /\.btn-outline \{[^}]*border: 2px solid var\(--ngp-green\)/, 'secondary CTA has a green outline');
assert.equal((guest.match(/class="native-guest-dot"/g) || []).length, 0, 'dots are built by script');

// Design tokens.
assert.match(css, /#F7F2E8/);
assert.match(css, /\.ngp-title/);
assert.match(css, /--ngp-safe-top: env\(safe-area-inset-top/);
// 3.0C-3 §9 — one common bottom zone for pagination and actions, outside the pager.
assert.ok(guest.indexOf('id="nativeGuestPager"') < guest.indexOf('class="ngp-nav"'), 'nav zone follows the pager');
const nav = guest.slice(guest.indexOf('class="ngp-nav"'));
assert.ok(nav.includes('id="nativeGuestDots"') && nav.includes('id="btnNativeJoin"') && nav.includes('id="btnNativeLogin"'), 'dots and both actions live in the common bottom zone');
assert.match(css, /\.ngp-nav \{[^}]*flex: none/, 'bottom zone never shrinks under the content');
assert.match(css, /--ngp-safe-bottom: env\(safe-area-inset-bottom/);

console.log('onboarding-premium contract ok');
