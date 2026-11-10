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

test('Both headers share one structure: rounded photo, no shadow, no filter, no veil, text on the right', () => {
    const header = rule(css, 'main#explorer .results-v3-header');
    assert.match(header, /border-radius: 20px;/);
    assert.match(header, /box-shadow: none;/);
    assert.match(header, /filter: none;/);
    assert.match(header, /aspect-ratio: 758 \/ 331/);
    assert.match(header, /max-height: 160px/);
    assert.doesNotMatch(header, /gradient|background-image|vignette|margin: 0 calc/);
    const photo = rule(css, 'main#explorer .results-v3-photo');
    assert.match(photo, /filter: none;/);
    assert.match(photo, /box-shadow: none;/);
    assert.match(photo, /object-position: center 0%;/);
    // No full-size veil: the overlay is a small block pinned bottom-right, with a flat translucent green (no gradient).
    const overlay = rule(css, 'main#explorer .results-v3-overlay');
    assert.doesNotMatch(overlay, /gradient|inset: 0/);
    assert.match(overlay, /width: fit-content/);
    assert.match(overlay, /text-align: right/);
    assert.match(overlay, /right: 8px/);
    assert.match(rule(css, 'main#explorer .results-v3-overlay h1'), /text-align: right/);
    assert.match(rule(css, 'main#explorer .results-v3-overlay p'), /text-align: right/);
    assert.doesNotMatch(css, /text-shadow: 0/);
    // The same header rules apply to both modes (the only per-mode rule is the Annonces vertical centring and accent).
    assert.equal((css.match(/\.results-v3-header \{/g) || []).length, 3, 'base, map-view hide, desktop width');
    assert.ok(html.includes('class="results-v3-photo is-lyanneurs"') && html.includes('class="results-v3-photo is-annonces"'));
    assert.match(html, /is-lyanneurs" src="assets\/universe-v3\/header-lyanneurs\.webp[^"]*" alt="" width="758" height="331"/);
    assert.match(html, /is-annonces" src="assets\/universe-v3\/header-annonces\.webp[^"]*" alt="" width="758" height="331"/);
});

test('Title block keeps white text readable on the local chip', () => {
    const chip = (rule(css, 'main#explorer .results-v3-overlay').match(/background: rgba\(22, 61, 45, ([0-9.]+)\)/) || [])[1];
    assert.ok(Number(chip) >= 0.6, 'chip alpha');
    // Worst case: a pure white photo pixel behind the chip.
    const a = Number(chip);
    const mixed = [22, 61, 45].map((v) => Math.round(v * a + 255 * (1 - a)));
    const hex = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    assert.ok(ratio('#FFFFFF', hex) >= 3, `white title over the lightest pixel: ${ratio('#FFFFFF', hex).toFixed(2)}:1 (large text, 3:1)`);
});

test('Annonces: honey accents only, scoped to the annonces mode', () => {
    for (const re of [
        /main#explorer\[data-mode="annonces"\] \.explorer-annonce \.explorer-annonce-taxonomy \{[^}]*var\(--lyann-honey-pastel\)/,
        /main#explorer\[data-mode="annonces"\] \.explorer-annonce \.explorer-fact-price \.explorer-fact-text \{[^}]*var\(--lyann-honey-pastel\)/,
        /main#explorer\[data-mode="annonces"\] \.explorer-annonce \.explorer-fact-icon \{ color: var\(--lyann-honey-icon\); \}/,
        /main#explorer\[data-mode="annonces"\] \.explorer-search \.explorer-search-icon \{ color: var\(--lyann-honey-icon\); \}/,
        /main#explorer\[data-mode="annonces"\] \.lyann-pill\.is-active \{ box-shadow: inset 0 0 0 2px var\(--lyann-honey\); \}/,
        /\.results-v3-overlay h1::after \{[^}]*background: var\(--lyann-yellow\)/
    ]) assert.match(css, re);
    assert.doesNotMatch(css, /\[data-mode="lyanneurs"\][^{]*\{[^}]*honey/);
    // The common components stay green: search border, Liste / Carte, filter rail.
    assert.match(css, /main#explorer \.explorer-view-toggle button\.is-active \{ background: var\(--r3-green\)/);
    assert.match(css, /main#explorer \.lyann-pill\.is-active \{ background: var\(--r3-green\)/);
});

test('"Voir l\'annonce" is soft honey with deep green text, no gloss', () => {
    const button = rule(css, 'main#explorer[data-mode="annonces"] .explorer-annonce-actions .btn-primary');
    assert.match(button, /background: var\(--lyann-honey\) !important;/);
    assert.match(button, /background-image: none !important;/);
    assert.match(button, /color: var\(--lyann-text-primary\) !important;/);
    assert.doesNotMatch(button, /#fff|white|gradient|glow|brightness/i);
    assert.ok(ratio('#163D2D', '#EBC568') >= 7, 'deep green on honey');
});

test('Annonces tab in the native bar: very light honey, scoped to the annonces mode', () => {
    assert.match(css, /body\[data-explorer-mode="annonces"\] \.mobile-bottom-nav \.nav-tab\.active \{ background: var\(--lyann-honey-pastel\); border-radius: 18px; color: var\(--lyann-text-primary\); \}/);
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
