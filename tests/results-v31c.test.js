'use strict';
// Phase 3.1C: Lyanneurs (green) and Annonces (soft honey yellow) finishing. Static checks on the shipped files;
// the real WebKit / Chromium measurements live in scripts/capture-member-screens.js (header geometry, faces, contrast).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const css = fs.readFileSync('results-v3.css', 'utf8');
const palette = fs.readFileSync('lyann-palette-v31b.css', 'utf8');
const html = fs.readFileSync('results.html', 'utf8');
const rule = (source, selector) => {
    const at = source.indexOf(`${selector} {`);
    assert.ok(at >= 0, `rule not found: ${selector}`);
    return source.slice(at, source.indexOf('}', at));
};

function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('Honey tokens are the validated soft values, never saturated yellows', () => {
    assert.match(palette, /--lyann-honey: #EBC568;/);
    assert.match(palette, /--lyann-honey-pastel: #F9E9BC;/);
    assert.match(palette, /--lyann-yellow: #F4D570;/);
    for (const forbidden of ['#FFC400', '#FFCC00', '#FFD000', '#FFD700', '#FFEB3B']) {
        assert.ok(!palette.toUpperCase().includes(forbidden) && !css.toUpperCase().includes(forbidden), `${forbidden} is too saturated`);
    }
});

test('Both headers are the supplied artwork: full width, 24px radius, 2.4:1, no overlay text', () => {
    const header = rule(css, 'main#explorer .results-v3-header');
    assert.match(header, /box-shadow: none;/);
    assert.match(header, /filter: none;/);
    assert.match(header, /border-radius: 24px/);
    assert.doesNotMatch(header, /gradient/);
    const photo = rule(css, 'main#explorer .results-v3-photo');
    assert.match(photo, /aspect-ratio: 2\.4 \/ 1/);
    assert.match(photo, /object-fit: cover/);
    assert.match(photo, /filter: none;/);
    assert.match(photo, /border-radius: 24px/);
    assert.doesNotMatch(photo, /gradient/);
    assert.doesNotMatch(html, /results-v3-overlay/);
    assert.match(html, /<h1 id="explorerTitle" class="sr-only">/);
    assert.match(html, /is-lyanneurs" src="assets\/universe-v3\/header-lyanneurs\.jpg[^"]*" alt="" width="1024" height="438"/);
    assert.match(html, /is-annonces" src="assets\/universe-v3\/header-annonces\.jpg[^"]*" alt="" width="1024" height="438"/);
});

test('Title contrast on the universe colour is WCAG AA (large text and the 0.82 rem subtitle)', () => {
    assert.ok(ratio('#163D2D', '#E5F0E6') >= 7, `deep green on green pastel: ${ratio('#163D2D', '#E5F0E6').toFixed(2)}:1`);
    assert.ok(ratio('#163D2D', '#F9E9BC') >= 7, `deep green on honey pastel: ${ratio('#163D2D', '#F9E9BC').toFixed(2)}:1`);
    assert.ok(ratio('#FFFFFF', '#246B49') >= 4.5, 'white on green primary (publish button text zone)');
});

test('Annonces: honey accents only, scoped to the annonces mode', () => {
    for (const re of [
        /main#explorer\[data-mode="annonces"\] \.explorer-annonce \.explorer-annonce-taxonomy \{[^}]*var\(--lyann-honey-pastel\)/,
        /main#explorer\[data-mode="annonces"\] \.explorer-annonce \.explorer-fact-price \.explorer-fact-text \{[^}]*font-size: 0\.82rem/,
        /main#explorer\[data-mode="annonces"\] \.explorer-annonce \.explorer-fact-icon \{ color: var\(--lyann-honey-icon\); \}/,
        /main#explorer\[data-mode="annonces"\] \.explorer-search \.explorer-search-icon \{ color: var\(--lyann-honey-icon\); \}/,
        /main#explorer\[data-mode="annonces"\] \{\s*--fam-disc: var\(--lyann-honey\); --fam-ink: var\(--lyann-green-deep\);/
    ]) assert.match(css, re);
    assert.doesNotMatch(css, /\[data-mode="lyanneurs"\][^{]*\{[^}]*honey/);
    // The common components stay green: Liste / Carte, Lyanneurs family discs and active job chips.
    assert.match(css, /main#explorer \.explorer-view-toggle button\.is-active \{ background: var\(--r3-green\)/);
    assert.match(css, /main#explorer \{\s*--fam-disc: var\(--lyann-green-primary\); --fam-ink: #fff;/);
    // No stray yellow dot on the filter button or in the navigation.
    assert.match(css, /\.explorer-filters-icon\.has-active-filters::after \{ content: none; display: none; \}/);
});

test('"Voir l\'annonce" is pale green, without a border', () => {
    const button = rule(css, 'main#explorer[data-mode="annonces"] .explorer-annonce-actions .btn-primary');
    assert.match(button, /background: var\(--lyann-green-pastel\) !important;/);
    assert.match(button, /background-image: none !important;/);
    assert.match(button, /border: 0 !important;/);
    assert.match(button, /box-shadow: none !important;/);
    assert.doesNotMatch(button, /gradient|glow|brightness/i);
});

test('Annonces tab in the native bar: very light honey, scoped to the annonces mode', () => {
    assert.match(css, /body\[data-explorer-mode\] \.mobile-bottom-nav \.nav-tab\.active \{[^}]*border-radius: 18px;[^}]*background: var\(--lyann-green-pastel\);/);
    assert.match(css, /body\[data-explorer-mode="annonces"\] \.mobile-bottom-nav \.nav-tab\.active \{ background: var\(--lyann-honey-pastel\); \}/);
    assert.ok(!/mobile-bottom-nav/.test(fs.readFileSync('discover-v3.css', 'utf8')), 'Découvrir untouched');
});

test('Honey contrast pairs stay WCAG AA', () => {
    const ok = (fg, bg, min, label) => assert.ok(ratio(fg, bg) >= min, `${label}: ${ratio(fg, bg).toFixed(2)}:1 < ${min}`);
    ok('#163D2D', '#F9E9BC', 4.5, 'text on honey pastel (category, price, tab)');
    ok('#163D2D', '#EBC568', 4.5, 'button text');
    ok('#56695E', '#F9E9BC', 4.5, 'secondary text on honey pastel');
    ok('#A87B00', '#FFFFFF', 3, 'accent icon on white');
    ok('#A87B00', '#F7F3EB', 3, 'accent icon on cream');
    // The soft honey itself is decorative only: it is below 3:1 on white, so it never carries an icon or a text.
    assert.ok(ratio('#EBC568', '#FFFFFF') < 3);
    assert.doesNotMatch(css, /(^|[\s;{])color: var\(--lyann-honey\)/m);
});
