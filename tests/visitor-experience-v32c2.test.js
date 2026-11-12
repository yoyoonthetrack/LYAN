'use strict';
// Phase 3.2C-2: visitor access rule, compact category filter + bottom sheet, headers, publish button, shared desktop widths.
// Static / pure checks on the shipped files. Real browser behaviour (WebKit) is covered by artifacts/phase-3-2c/*.js probes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const read = (f) => fs.readFileSync(f, 'utf8');
const router = read('app-router.js');
const gate = read('visitor-gate.js');
const gateCss = read('visitor-gate.css');
const script = read('script.js');
const ui = read('explorer-ui.js');
const results = read('results.html');
const resultsCss = read('results-v3.css');
const discoverCss = read('discover-v3.css');
const layoutCss = read('lyann-layout.css');
const palette = read('lyann-palette-v31b.css');
const repo = read('explorer-repository.js');
const handlerSource = read('api/public-explorer-requests.js');

const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ── 5. Visitor invitation ─────────────────────────────────────────────────────────────────────────────────────────

test('visitor dialog carries the exact copy, three actions and dialog semantics', () => {
    const G = require('../visitor-gate.js');
    assert.equal(G.COPY.title, "Envie d'en savoir plus ?");
    assert.equal(G.COPY.text, 'Rejoignez LYANN pour découvrir les détails, échanger et profiter des talents près de chez vous.');
    assert.equal(G.COPY.signup, 'Créer mon compte');
    assert.equal(G.COPY.login, 'Me connecter');
    assert.equal(G.COPY.explore, 'Continuer à explorer');
    assert.match(gate, /role="dialog" aria-modal="true" aria-labelledby="lyannVgateTitle" aria-describedby="lyannVgateText"/);
    assert.match(gate, /data-vgate="signup"[\s\S]*data-vgate="login"[\s\S]*lyann-vgate-link/);
    assert.match(gate, /Escape/, 'closes with Escape');
    assert.match(gate, /cancelAuthIntent/, 'dismissing forgets the intent');
    assert.match(gateCss, /prefers-reduced-motion/);
});

test('every page that lists profiles or annonces loads the dialog after the router', () => {
    for (const page of ['results.html', 'discover.html', 'feed.html', 'bienvenue.html']) {
        const html = read(page);
        assert.match(html, /visitor-gate\.css/, `${page}: stylesheet`);
        assert.ok(html.indexOf('app-router.js') > 0 && html.indexOf('visitor-gate.js') > html.indexOf('app-router.js'), `${page}: visitor-gate.js after app-router.js`);
    }
});

test('profile and annonce details are gated BEFORE any read, in the router policy and at both entry points', () => {
    assert.match(router, /requestDetail: 'context'/);
    assert.match(router, /publicProfile: 'context'/);
    assert.match(router, /VISITOR_GATE_ACTIONS = new Set\(\['requestDetail', 'publicProfile', 'favorite', 'requestHelp', 'requestAuthor'\]\)/);
    assert.match(router, /intent\.action === 'requestDetail'[\s\S]*openLyannDetailModal/);
    assert.match(router, /intent\.action === 'publicProfile'[\s\S]*openPublicMemberProfile/);
    const profile = script.slice(script.indexOf('async function openPublicMemberProfile('));
    assert.ok(profile.indexOf("requireAuthForInteraction('publicProfile'") > 0 && profile.indexOf("requireAuthForInteraction('publicProfile'") < profile.indexOf('window.LYANN_API_CLIENT'), 'profile: gate precedes the first client use');
    const detail = script.slice(script.indexOf('window.openLyannDetailModal = async function'));
    assert.ok(detail.indexOf("requireAuthForInteraction('requestDetail'") > 0 && detail.indexOf("requireAuthForInteraction('requestDetail'") < detail.indexOf('++lyannDetailOpenGeneration'), 'detail: gate precedes the first read');
    // The map opens its detail through the same function, so the pin sheet is gated too.
    assert.match(ui, /onOpen: row => window\.openLyannDetailModal\(row\.id, row\)/);
});

test('visitor list reads use explicit public columns, never the biography', () => {
    assert.match(repo, /PUBLIC_LIST_COLUMNS = 'id,first_name,last_name,avatar_url,territory,city,is_pro,professional_status,created_at,is_verified,is_pro_verified,average_rating,reviews_count'/);
    assert.doesNotMatch(repo.match(/PUBLIC_LIST_COLUMNS = '[^']*'/)[0], /\bbio\b/);
    assert.match(repo, /isMember\(\) \? '\*' : PUBLIC_LIST_COLUMNS/);
});

test('public annonce projection: a commune is returned only when the text IS a commune of the official set, never an address', () => {
    const { publicLocation } = require('../api/public-explorer-requests.js');
    assert.equal(publicLocation('Le Gosier (971)'), 'Le Gosier (971)');
    assert.equal(publicLocation('Les Abymes (971 - Guadeloupe)'), 'Les Abymes (971)');
    assert.equal(publicLocation('Le Gosier'), 'Le Gosier (971)');
    assert.equal(publicLocation('Le Gosier (chez moi, rue des Lilas)'), 'Le Gosier (971)', 'a parenthetical is dropped, not forwarded');
    assert.equal(publicLocation('12 rue des Palmiers, Le Gosier'), null, 'a street address is never forwarded');
    assert.equal(publicLocation('Résidence Les Palmiers'), null);
    assert.equal(publicLocation('Le Gosier 97190'), null);
    assert.equal(publicLocation('Sainte-Anne'), null, 'an ambiguous commune name stays unplaced');
    assert.equal(publicLocation('Guadeloupe'), 'Guadeloupe (971)');
    assert.equal(publicLocation(''), null);
    assert.doesNotMatch(handlerSource, /requester_id[^,}]*,\s*display_name/, 'the author id is not part of the projection');
    assert.match(handlerSource, /Object\.keys\(req\.query\)\.some\(k => k !== 'offset'\)/, 'no caller-supplied filter or select');
});

test('the database lock is PREPARED (not applied) with a rollback and post-conditions', () => {
    const up = read('94_visitor_member_detail_lock_staging.sql');
    const down = read('94_visitor_member_detail_lock_rollback.sql');
    assert.match(up, /NOT APPLIED/);
    assert.match(up, /REVOKE SELECT ON public\.reviews FROM anon/);
    assert.match(up, /REVOKE SELECT ON public\.user_portfolio_items FROM anon/);
    assert.match(up, /column_name <> 'bio'/);
    assert.match(up, /has_column_privilege\('anon', 'public\.public_profiles', 'bio', 'SELECT'\)/);
    assert.doesNotMatch(up, /gzispjfoywklpqatjyop/, 'no Production reference');
    assert.match(up, /^BEGIN;/m);
    assert.match(up, /COMMIT;\s*$/);
    assert.match(down, /Public read reviews/);
    assert.match(down, /GRANT SELECT ON public\.public_profiles TO anon/);
});

test('the local preview serves the real public handler against Staging and never ships the service key to the browser bundle', () => {
    const preview = read('scripts/preview-v32c.js');
    assert.match(preview, /createPublicRequestsHandler\(db, true\)/);
    assert.match(preview, /'\/v1\/explorer\/requests'/);
    const backend = preview.slice(preview.indexOf('function createPreviewBackend()'), preview.indexOf('const git = '));
    const outside = preview.replace(backend, '').replace(/delete process\.env\.[A-Z_]+; delete process\.env\.[A-Z_]+;/, '');
    assert.doesNotMatch(outside, /SERVICE_ROLE/, 'the service key is only read inside the server-side backend factory');
    assert.doesNotMatch(preview, /gzispjfoywklpqatjyop/);
});

// ── 4. Categories: compact bar + bottom sheet ────────────────────────────────────────────────────────────────────

test('choosing a family filters immediately and never opens the sub-trade browser, selects no specialty', () => {
    const choose = ui.slice(ui.indexOf('function chooseFamily('), ui.indexOf('function chooseJob('));
    assert.doesNotMatch(choose, /openRefine|refineOpen\s*=\s*true/, 'a family tap opens nothing');
    assert.doesNotMatch(choose, /filters\.(job|specialty)\s*=\s*(?!'')/, 'no job or specialty is picked automatically');
    assert.match(choose, /render\(\{ quiet: true \}\)/);
    assert.doesNotMatch(ui, /renderJobPanel|jobPanelClosed|explorerJobPanel/);
    assert.match(ui, /function renderTaxoBar\(\)/);
    assert.match(ui, /\$\{scope\.total\} métier\$\{scope\.total > 1 \? 's' : ''\}/, '« Maison & travaux · 20 métiers »');
    assert.match(ui, /if \(!taxonomyActive\(\) \|\| !V2\(\)\) \{ bar\.hidden = true;/, 'no family: the bar is hidden (no space)');
    assert.match(results, /data-action="taxo-refine"[\s\S]*Affiner/);
    assert.match(results, /data-action="taxo-reset"[^>]*>Réinitialiser/);
});

test('the Affiner panel is an accessible bottom sheet with swipe, expand, Escape and a desktop popover; it never moves the page', () => {
    assert.match(results, /id="explorerRefine" class="explorer-refine" role="dialog" aria-modal="true" aria-labelledby="explorerRefineTitle" tabindex="-1" hidden/);
    assert.match(results, /data-action="refine-close" aria-label="Fermer"/);
    assert.match(results, /data-action="refine-expand" aria-pressed="false"/);
    assert.match(resultsCss, /height: 60vh; height: 60dvh;/, 'about 60 % initial height');
    assert.match(resultsCss, /\.explorer-refine\.is-expanded \{ height: 92vh; height: 92dvh; \}/);
    assert.match(resultsCss, /\.explorer-refine-body \{[^}]*overflow-y: auto; overscroll-behavior: contain/, 'internal scroll');
    assert.match(resultsCss, /\.explorer-refine \{[^}]*position: fixed;/, 'overlay: the results and the map keep their size');
    assert.match(resultsCss, /@media \(min-width: 900px\)[\s\S]*\.explorer-refine \{\s*position: absolute; top: calc\(100% \+ 8px\)/, 'desktop popover anchored under the bar');
    assert.match(ui, /event\.key === 'Escape'/);
    assert.match(ui, /pointerdown[\s\S]*pointermove[\s\S]*pointerup/, 'swipe');
    assert.match(ui, /dy > 90/, 'swipe down closes');
    assert.match(ui, /event\.composedPath\(\)/, 'a re-render does not read as an outside click');
    assert.match(ui, /focus\(\{ preventScroll: true \}\)/, 'focus moves without scrolling the page');
    assert.doesNotMatch(ui.slice(ui.indexOf('function openRefine('), ui.indexOf('function closeRefine(')), /scrollIntoView|scrollTo|overflow\s*=\s*'hidden'/);
    // The taxonomy stays the V2 one: no second taxonomy, a specialty is a tap.
    assert.match(ui, /data-specialty="\$\{escape\(sp\.code\)\}"/);
    assert.match(ui, /v2Index\?\.families\[filters\.family\]/);
});

// ── 1. Headers ───────────────────────────────────────────────────────────────────────────────────────────────────

test('headers: natural photo, no gradient veil, no dark badge, title below (mobile) or beside (desktop) the photo', () => {
    const block = resultsCss.slice(resultsCss.indexOf('main#explorer .results-v3-header {'), resultsCss.indexOf('body.is-native-app[data-explorer-mode]'));
    assert.doesNotMatch(block, /gradient\(|mask-image: linear|rgba\(22, 61, 45/);
    assert.match(block, /--hdr-bg: var\(--lyann-green-pastel\)/);
    assert.match(block, /h1::after \{[^}]*background: var\(--hdr-accent\)/);
    assert.match(resultsCss, /@media \(min-width: 720px\) \{[\s\S]*\.results-v3-header \{ flex-direction: row;/);
    assert.match(results, /Des talents et des pros près de chez vous/);
    assert.match(ui, /subtitle: 'Des besoins réels autour de vous'/);
    assert.ok(ratio('#163D2D', '#E5F0E6') >= 7 && ratio('#163D2D', '#F9E9BC') >= 7);
});

// ── 3. Publish button ────────────────────────────────────────────────────────────────────────────────────────────

test('publish button: bright honey to deep green, white text whose zone starts on green (AA), + circle, arrow, light hover', () => {
    const cta = discoverCss.slice(discoverCss.indexOf('.discover-v3 .discover-post-cta {'), discoverCss.indexOf('.discover-v3 .discover-post-icon {'));
    assert.match(cta, /var\(--lyann-honey-bright\) 0, var\(--lyann-honey-bright\) 40px, var\(--lyann-green-primary\) 104px, var\(--lyann-green-deep\) 100%/);
    assert.match(cta, /in oklch/, 'vivid yellow-green passage, no grey / beige middle');
    const discoverHtml = read('discover.html');
    assert.match(discoverHtml, /<strong>Poster une annonce<\/strong><span>Décrivez votre besoin, les Lyanneurs vous répondent<\/span>/);
    assert.match(discoverHtml, /discover-post-icon[\s\S]*ph-plus[\s\S]*ph-arrow-right discover-post-go/);
    assert.match(discoverCss, /\.discover-post-text strong \{[^}]*color: var\(--lyann-white\)/);
    assert.match(discoverCss, /\.discover-post-cta:hover \{ transform: translateY\(-2px\)/);
    assert.match(discoverCss, /prefers-reduced-motion[\s\S]*\.discover-post-cta:hover/);
    assert.doesNotMatch(discoverCss, /#[0-9A-Fa-f]{6}\b/);
    // The text starts at x = 16 + 54 + 26 = 96 px, after the 40 px honey cap and almost at the green stop (104 px): worst case colour at 96 px.
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const honey = [0xF6, 0xC2, 0x3E];
    const green = [0x24, 0x6B, 0x49];
    const at96 = mix(honey, green, (96 - 40) / (104 - 40));
    const hex = '#' + at96.map((v) => v.toString(16).padStart(2, '0')).join('');
    assert.ok(ratio('#FFFFFF', hex) >= 4.5, `white on the gradient where the text starts (${hex}): ${ratio('#FFFFFF', hex).toFixed(2)}:1`);
    assert.ok(ratio('#FFFFFF', '#246B49') >= 6, 'white on green primary');
    assert.ok(ratio('#FFFFFF', '#163D2D') >= 10, 'white on deep green');
    assert.match(palette, /--lyann-honey-bright: #F6C23E;/);
});

// ── 2. Widths ────────────────────────────────────────────────────────────────────────────────────────────────────

test('Découvrir, Lyanneurs and Annonces share one set of width tokens; mobile keeps its margins', () => {
    assert.match(layoutCss, /:root \{\s*--lyann-page-max: 100%;\s*--lyann-page-gutter: 16px;/, 'mobile: full width, 16 px gutters');
    const steps = [...layoutCss.matchAll(/min-width: (\d+)px\) \{\s*:root \{ --lyann-page-max: (\d+)px;/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(steps.length >= 3);
    const desktop = steps.filter(([bp]) => bp >= 1280);
    assert.ok(desktop.every(([, max]) => max >= 1200 && max <= 1360), 'desktop container 1200-1360 px');
    for (const css of [resultsCss, discoverCss]) assert.match(css, /var\(--lyann-page-max/);
    assert.doesNotMatch(resultsCss, /max-width: 820px|max-width: 720px/);
    assert.match(discoverCss, /\.discover-main\.discover-v3 \{ width: 100%; max-width: var\(--lyann-page-max/, 'overrides the 1120 px cap of discover.css');
    assert.match(read('discover.html'), /lyann-layout\.css/);
    assert.match(results, /lyann-layout\.css/);
});

test('desktop results use several columns and Découvrir recomposes instead of stretching', () => {
    assert.match(resultsCss, /@media \(min-width: 720px\) \{\s*main#explorer \.explorer-grid \{ display: grid; grid-template-columns: repeat\(2/);
    assert.match(resultsCss, /@media \(min-width: 1280px\) \{\s*main#explorer \.explorer-grid \{ grid-template-columns: repeat\(3/);
    assert.match(discoverCss, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
    assert.match(discoverCss, /repeat\(10, minmax\(0, 1fr\)\)/, 'ten domains on one row at ≥ 1100 px');
});
