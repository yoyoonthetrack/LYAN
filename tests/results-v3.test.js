'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('results.html', 'utf8');
const ui = fs.readFileSync('explorer-ui.js', 'utf8');
const css = fs.readFileSync('results-v3.css', 'utf8');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

// Order inside the results page: header, search, filters, (toggle), results. Nothing in between.
const marks = ['results-v3-header', 'explorerSearchForm', 'explorerCategoryPills', 'explorerViewToggle', 'id="explorerResults"'];
let last = -1;
for (const m of marks) {
    const at = main.indexOf(m);
    assert.ok(at > last, `results.html order broken at ${m}`);
    last = at;
}

// Forbidden on Lyanneurs / Annonces: discovery, news, editorial, "see more", refine cards.
const forbidden = [/À la une/i, /Les annonces du moment/i, /Découvrez nos talents/i, /Explorer les services/i, /Explorer les besoins sur la carte/i, /highlight/i, /Voir plus/i, /Voir tout/i, /refineCard/, /discover-/];
for (const re of forbidden) {
    assert.doesNotMatch(main, re, `results.html must not contain ${re}`);
    assert.doesNotMatch(ui, re.source === 'highlight' ? /editorial/i : re, `explorer-ui.js must not contain ${re}`);
}
assert.doesNotMatch(html, /editorial-highlights/, 'the editorial module is Découvrir-only');

// Header (V3.1C): photo ratio, compact (capped at 160 px), official copy, WebP assets that exist.
const headerH = Number((css.match(/\.results-v3-header \{[^}]*?max-height:\s*(\d+)px/) || [])[1]);
assert.ok(headerH >= 140 && headerH <= 165, `header max height ${headerH}px must be 140-165px`);
assert.match(css, /\.results-v3-header \{[^}]*aspect-ratio: 758 \/ 331/);
assert.match(html, /<h1 id="explorerTitle">Lyanneurs<\/h1>/);
assert.match(ui, /title: 'Lyanneurs', subtitle: 'Des talents et des pros près de chez vous'/);
assert.match(ui, /title: 'Annonces', subtitle: 'Des besoins réels autour de vous'/);
for (const f of ['header-lyanneurs.webp', 'header-annonces.webp']) {
    assert.ok(fs.statSync(`assets/universe-v3/${f}`).size < 120 * 1024, `${f} is light`);
    assert.match(html + ui, new RegExp(f.replace('.', '\\.')));
}

// Search placeholders.
assert.match(ui, /Rechercher un talent, un service…/);
assert.match(ui, /Rechercher une annonce, un besoin…/);

// Rail: at most six entries, Plus opens the real categories, sober SVG icons.
// Tous + at most 4 families + Plus = 6 visible entries
assert.match(ui, /let domains = ranked\.slice\(0, 4\)/);
assert.match(ui, /domains = \[\.\.\.domains\.slice\(0, 3\), selectedFamily\]/);
assert.match(ui, /data-action="more-categories"/);
assert.match(html, /id="explorerCategorySheet"/);
assert.match(ui, /<svg/);

// Toggle: Liste / Carte, equal weight, only in Annonces; no sixth tab.
assert.match(html, /data-view="list"[\s\S]*Liste[\s\S]*data-view="map"[\s\S]*Carte/);
assert.doesNotMatch(fs.readFileSync('app-shell.js', 'utf8'), /tab-carte|'Carte'\)/);
assert.match(css, /main#explorer\[data-mode="annonces"\] \.explorer-view-toggle/);
assert.match(css, /main#explorer \.explorer-view-toggle\[hidden\] \{ display: none !important; \}/);

// Map mode fills the space above the 5-tab bar, no global scroll.
assert.match(css, /body\.results-page\.explorer-annonces-map-view main#explorer \.results-v3-header \{ display: none; \}/);
assert.match(ui, /document\.body\.classList\.toggle\('explorer-annonces-map-view', mapAvailable\(\)\)/);

// Every rule of the page-level stylesheet is scoped.
const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '{}').split('{}').map((s) => s.trim()).filter((s) => s && !s.startsWith('@'));
const unscoped = selectors.flatMap((s) => s.split(',').map((x) => x.trim())).filter((x) => x && !/main#explorer|^(:root|body\.results-page|body\[data-explorer-mode="annonces"\] \.mobile-bottom-nav \.nav-tab\.active$|\.explorer-category-sheet|\})/.test(x) && !/^\d+%$|^(from|to)$/.test(x));
assert.deepEqual(unscoped.slice(0, 5), [], 'results-v3.css selectors must be scoped to main#explorer');

// No fabricated data in the cards.
assert.doesNotMatch(ui, /Marie D\.|Jean P\.|4\.9 ?★|Lucas|Sophie M\./);

console.log('results v3 contract passed');
