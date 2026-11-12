'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const palette = fs.readFileSync('lyann-palette-v31b.css', 'utf8');
const tokens = Object.fromEntries([...palette.matchAll(/--(lyann-[a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2].toUpperCase()]));

const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('the validated reference values are the single source of truth', () => {
    assert.deepEqual(
        { ...tokens },
        { ...tokens, 'lyann-green-deep': '#163D2D', 'lyann-green-primary': '#246B49', 'lyann-green-action': '#176640', 'lyann-green-pastel': '#E5F0E6', 'lyann-green-soft': '#D7E7DA', 'lyann-yellow': '#F4D570', 'lyann-cream': '#F7F3EB', 'lyann-white': '#FFFFFF', 'lyann-border': '#C6D6CA', 'lyann-text-primary': '#163D2D', 'lyann-text-secondary': '#687F72' }
    );
    for (const file of ['discover.html', 'results.html', 'admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.match(html, /lyann-palette-v31b\.css/, `${file} loads the palette`);
    }
    const results = fs.readFileSync('results.html', 'utf8');
    assert.ok(results.indexOf('lyann-palette-v31b.css') < results.indexOf('results-v3.css'), 'tokens are declared before they are read');
});

test('the three pages read tokens: no second definition of the brand colours', () => {
    for (const file of ['discover-v3.css', 'results-v3.css']) {
        const css = fs.readFileSync(file, 'utf8');
        const hex = [...css.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase());
        assert.deepEqual(hex, [], `${file} has no literal brand hex (found ${hex.join(', ')})`);
        assert.doesNotMatch(css, /rgba\(15, 61, 42/, `${file}: the old green 15,61,42 is gone`);
    }
    for (const old of ['#0F3D2A', '#1F5A3D', '#E4EFDF', '#F7F2E8', '#F5D77A', '#E5B345']) {
        assert.doesNotMatch(fs.readFileSync('discover-v3.css', 'utf8') + fs.readFileSync('results-v3.css', 'utf8') + fs.readFileSync('editorial-highlights.css', 'utf8'), new RegExp(old, 'i'), `${old} no longer appears`);
    }
});

test('application rules', () => {
    const d = fs.readFileSync('discover-v3.css', 'utf8');
    const r = fs.readFileSync('results-v3.css', 'utf8');
    assert.match(d, /body\.discover-page \{ background: var\(--lyann-cream\); \}/);
    assert.match(r, /body\.results-page\[data-explorer-mode="annonces"\][\s\S]*\{ background: var\(--lyann-cream\); \}/, 'one cream for every results mode');
    assert.match(d, /\.discover-post-cta \{[^}]*var\(--lyann-honey-bright\)[^}]*var\(--lyann-green-primary\)[^}]*var\(--lyann-green-deep\)/, 'publish button: bright honey into deep green, tokens only');
    assert.match(d, /\.discover-post-text strong \{[^}]*color: var\(--lyann-white\)/, 'publish button text is white');
    assert.match(r, /--r3-green: var\(--lyann-green-primary\)/, 'active filters and primary actions');
    assert.match(r, /--r3-pastel: var\(--lyann-green-pastel\)/, 'inactive filters');
    assert.match(r, /\.explorer-annonce\.explorer-card \{ background: var\(--lyann-white\); border: 1px solid var\(--lyann-border\)/);
    assert.match(r, /\.explorer-profile-row \{[^}]*border: 1px solid var\(--lyann-border\)[^}]*background: var\(--lyann-white\)/);
    assert.match(r, /\.explorer-job-chip\.is-active \{[^}]*background: var\(--fam-chip-on\)/);
    assert.match(r, /--fam-disc: var\(--lyann-green-primary\); --fam-ink: #fff;/, 'Lyanneurs discs: green with white pictograms');
    assert.match(r, /\.btn-primary,[\s\S]*background: var\(--lyann-green-primary\) !important/);
});

test('every text/background pair of the palette is WCAG AA', () => {
    const t = tokens;
    const pairs = [
        ['lyann-white', 'lyann-green-primary', 4.5], ['lyann-white', 'lyann-green-action', 4.5],
        ['lyann-text-primary', 'lyann-yellow', 4.5], ['lyann-text-primary', 'lyann-green-pastel', 4.5],
        ['lyann-text-primary', 'lyann-cream', 4.5], ['lyann-text-primary', 'lyann-white', 4.5],
        ['lyann-green-primary', 'lyann-white', 4.5], ['lyann-green-primary', 'lyann-cream', 4.5], ['lyann-green-primary', 'lyann-green-pastel', 4.5],
        ['lyann-text-secondary-aa', 'lyann-white', 4.5], ['lyann-text-secondary-aa', 'lyann-cream', 4.5],
        ['lyann-text-secondary-aa', 'lyann-green-pastel', 4.5], ['lyann-text-secondary-aa', 'lyann-green-soft', 4.5],
        ['lyann-border-control', 'lyann-white', 3], ['lyann-border-control', 'lyann-cream', 3],
        ['lyann-star', 'lyann-white', 3], ['lyann-star', 'lyann-cream', 3]
    ];
    for (const [fg, bg, need] of pairs) assert.ok(ratio(t[fg], t[bg]) >= need, `${fg} on ${bg}: ${ratio(t[fg], t[bg]).toFixed(2)} < ${need}`);
});

test('the reference secondary text colour is NOT used for text: it fails AA', () => {
    for (const bg of ['lyann-white', 'lyann-cream', 'lyann-green-pastel']) assert.ok(ratio(tokens['lyann-text-secondary'], tokens[bg]) < 4.5, `#687F72 on ${bg} must stay documented as insufficient`);
    const css = fs.readFileSync('discover-v3.css', 'utf8') + fs.readFileSync('results-v3.css', 'utf8') + fs.readFileSync('editorial-highlights.css', 'utf8');
    assert.doesNotMatch(css, /color:\s*var\(--lyann-text-secondary\)/, 'only the AA variant is used for text');
    assert.match(palette, /#687F72[^\n]*INSUFFISANT|INSUFFISANT/);
});

test('the decorative border stays decorative; fields and controls use the 3:1 border', () => {
    const r = fs.readFileSync('results-v3.css', 'utf8');
    const d = fs.readFileSync('discover-v3.css', 'utf8');
    assert.match(r, /\.explorer-search \{[^}]*border: 1(\.5)?px solid var\(--lyann-border-control\)/);
    assert.match(d, /\.discover-search-bar \{[^}]*border: 1px solid var\(--lyann-border-control\)/);
    assert.ok(ratio(tokens['lyann-border'], tokens['lyann-white']) < 3, 'documented: #C6D6CA is below 3:1, so it never outlines a control');
});

test('functional colours, logo and photographs are untouched', () => {
    for (const file of ['discover-v3.css', 'results-v3.css', 'editorial-highlights.css']) {
        const css = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(css, /\.(nav-logo|lyann-logo|brand-logo)|filter:\s*(hue-rotate|sepia|saturate|grayscale)/, `${file} does not recolour the logo or photos`);
    }
    assert.doesNotMatch(fs.readFileSync('needs-map.css', 'utf8'), /lyann-palette|--lyann-green/, 'map styles untouched');
});
