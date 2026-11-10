'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const api = require('../api/editorial-highlights');
const view = require('../editorial-highlights-view');

const good = { title: 'Préparez Noël', teaser: 'Cuisine, déco, chants de Noël…', cta_target: 'lyanneurs' };
const rejects = (input, field, opts) => assert.throws(() => api.assertConsistent(api.sanitizeHighlight(input, opts)), (e) => e instanceof api.HighlightError && (!field || e.field === field));

test('text is plain: markup is refused, whitespace and control characters are cleaned', () => {
    rejects({ ...good, title: '<b>Noël</b>' }, 'title');
    rejects({ ...good, teaser: 'a <script>x</script>' }, 'teaser');
    rejects({ ...good, title: 'ab' }, 'title');
    rejects({ ...good, title: 'x'.repeat(49) }, 'title');
    rejects({ ...good, teaser: '' }, 'teaser');
    const row = api.sanitizeHighlight({ ...good, title: '  Préparez \u0000 \n Noël  ' });
    assert.equal(row.title, 'Préparez Noël');
});

test('call to action is a whitelisted target, never a URL', () => {
    rejects({ ...good, cta_target: 'https://evil.example' }, 'cta_target');
    rejects({ ...good, cta_target: 'javascript:alert(1)' }, 'cta_target');
    rejects({ ...good, cta_target: 'annonces_category' }, 'cta_value');
    rejects({ ...good, cta_target: 'lyanneurs_category', cta_value: '<x>' }, 'cta_value');
    const ok = api.assertConsistent(api.sanitizeHighlight({ ...good, cta_target: 'lyanneurs_category', cta_value: 'Coiffure & Esthétique' }));
    assert.equal(ok.cta_value, 'Coiffure & Esthétique');
    assert.equal(api.assertConsistent(api.sanitizeHighlight({ ...good, cta_target: 'annonces_map', cta_value: 'ignored' })).cta_value, null);
    for (const target of api.CTA_TARGETS) assert.ok(view.TARGETS[target], `view knows ${target}`);
    assert.deepEqual(Object.keys(view.TARGETS).sort(), [...api.CTA_TARGETS].sort());
});

test('territory, theme, status, priority and dates are validated', () => {
    rejects({ ...good, territory: 'paris' }, 'territory');
    rejects({ ...good, theme: 'halloween' }, 'theme');
    rejects({ ...good, status: 'deleted' }, 'status');
    rejects({ ...good, priority: -1 }, 'priority');
    rejects({ ...good, priority: 2.5 }, 'priority');
    rejects({ ...good, starts_at: 'not a date' }, 'starts_at');
    rejects({ ...good, starts_at: '2026-12-02T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' }, 'ends_at');
    for (const t of api.TERRITORIES) assert.equal(api.sanitizeHighlight({ ...good, territory: t }).territory, t);
});

test('images: only this tool\'s bucket, and a published card needs one', () => {
    const prefix = 'https://x.supabase.co/storage/v1/object/public/editorial-highlights/';
    rejects({ ...good, image_url: 'https://evil.example/a.png' }, 'image_url', { publicImagePrefix: prefix });
    rejects({ ...good, image_url: 'javascript:alert(1)' }, 'image_url');
    rejects({ ...good, image_url: 'https://x.supabase.co/storage/v1/object/public/avatars/a.png' }, 'image_url', { publicImagePrefix: prefix });
    assert.equal(api.sanitizeHighlight({ ...good, image_url: `${prefix}2026/a.webp` }, { publicImagePrefix: prefix }).image_url, `${prefix}2026/a.webp`);
    rejects({ ...good, status: 'published' }, 'image_url');
    // a partial update is checked on the merged row
    const before = { ...good, status: 'draft', image_url: null, cta_value: null };
    assert.throws(() => api.assertConsistent({ ...before, ...api.sanitizeHighlight({ status: 'published' }, { partial: true }) }), api.HighlightError);
});

test('image bytes decide the type (magic bytes), size is capped at 1 MiB', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
    assert.equal(api.detectImageType(png).mime, 'image/png');
    assert.equal(api.detectImageType(jpg).mime, 'image/jpeg');
    assert.equal(api.detectImageType(webp).mime, 'image/webp');
    assert.equal(api.detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null, 'SVG is never accepted');
    assert.equal(api.detectImageType(Buffer.from('GIF89a' + 'x'.repeat(30))), null);
    assert.equal(api.decodeImage(png.toString('base64')).ext, 'png');
    assert.equal(api.decodeImage(`data:image/png;base64,${png.toString('base64')}`).ext, 'png');
    assert.throws(() => api.decodeImage(Buffer.from('plain text file content').toString('base64')), api.HighlightError);
    assert.throws(() => api.decodeImage(Buffer.concat([png, Buffer.alloc(api.MAX_IMAGE_BYTES)]).toString('base64')), api.HighlightError);
    assert.throws(() => api.decodeImage('!!!not base64!!!'), api.HighlightError);
});

test('visibility state mirrors the RLS window', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const base = { status: 'published', starts_at: null, ends_at: null };
    assert.equal(api.highlightState(base, now), 'live');
    assert.equal(api.highlightState({ ...base, starts_at: '2026-11-11T00:00:00Z' }, now), 'scheduled');
    assert.equal(api.highlightState({ ...base, ends_at: '2026-11-10T11:00:00Z' }, now), 'expired');
    assert.equal(api.highlightState({ ...base, status: 'draft' }, now), 'draft');
    assert.equal(api.highlightState({ ...base, status: 'archived' }, now), 'archived');
});

test('Découvrir selection: window, territory, priority, at most three, nothing invented', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const card = (id, extra) => ({ id, title: `Titre ${id}`, teaser: `Accroche ${id}`, territory: 'all', cta_target: 'lyanneurs', priority: 100, ...extra });
    const rows = [
        card('late', { priority: 50, starts_at: '2026-11-20T00:00:00Z' }),
        card('old', { priority: 1, ends_at: '2026-11-01T00:00:00Z' }),
        card('mq', { priority: 20, territory: 'martinique' }),
        card('gp', { priority: 10, territory: 'guadeloupe' }),
        card('all', { priority: 30 }),
        card('also', { priority: 40 }),
        card('bad', { priority: 5, cta_target: 'https://evil.example' })
    ];
    assert.deepEqual(view.select(rows, 'guadeloupe', 3, now).map((r) => r.id), ['gp', 'all', 'also']);
    assert.deepEqual(view.select(rows, 'martinique', 3, now).map((r) => r.id), ['mq', 'all', 'also']);
    assert.deepEqual(view.select(rows, '', 4, now).map((r) => r.id), ['gp', 'mq', 'all', 'also']);
    assert.deepEqual(view.select([], 'guadeloupe'), [], 'no card, no module');
    assert.deepEqual(view.select(null, 'guadeloupe'), []);
});

test('card rendering escapes everything and links only to known routes', () => {
    const html = view.renderCard({ id: 'x"><script>', title: '<img src=x onerror=1>', teaser: 'a & b', label: '"quoted"', image_url: 'https://x/y.webp" onerror="1', cta_target: 'lyanneurs_category', cta_value: 'Entretien Jardin' });
    assert.doesNotMatch(html, /<script>|<img src=x/);
    assert.match(html, /href="results\.html\?mode=lyanneurs&amp;category=Entretien%20Jardin"/);
    assert.match(html, /a &amp; b/);
    assert.equal(view.hrefFor({ cta_target: 'annonces_map' }), 'results.html?mode=annonces&view=map');
    assert.equal(view.hrefFor({ cta_target: 'nope' }), null);
    assert.doesNotMatch(view.renderCard({ title: 'abc', teaser: 'def', cta_target: 'lyanneurs' }, { asLink: false }), /<a /);
});

test('migration 93 and its rollback keep the security model', () => {
    const sql = fs.readFileSync('93_editorial_highlights_staging.sql', 'utf8');
    const rollback = fs.readFileSync('93_editorial_highlights_rollback.sql', 'utf8');
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON public\.editorial_highlights FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT \(id, title, teaser, label, image_url, image_alt, territory, theme, cta_target, cta_value, starts_at, ends_at, priority, published_at\)/);
    assert.doesNotMatch(sql, /GRANT SELECT \([^)]*created_by/);
    assert.doesNotMatch(sql, /FOR (INSERT|UPDATE|DELETE|ALL)/i, 'no client write policy');
    assert.match(sql, /status = 'published'[\s\S]*starts_at <= now\(\)[\s\S]*ends_at > now\(\)/);
    assert.match(sql, /file_size_limit[\s\S]*1048576[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
    assert.doesNotMatch(sql, /gzispjfoywklpqatjyop/, 'never the Production reference');
    assert.match(rollback, /DROP TABLE IF EXISTS public\.editorial_highlights/);
    assert.doesNotMatch(rollback, /DELETE FROM storage/i, 'Supabase forbids direct storage deletes');
});

test('server wiring: every route is permission-checked on the server, tool is mounted once', () => {
    const route = fs.readFileSync('api/editorial-highlights.js', 'utf8');
    const server = fs.readFileSync('api/server.js', 'utf8');
    assert.equal((route.match(/app\.(get|post|patch|delete)\('\/v1\/admin\/editorial\/highlights/g) || []).length, 5);
    assert.equal((route.match(/const auth = await guard\(req, res\); if \(!auth\) return;/g) || []).length, 5);
    assert.match(route, /verifyAdminPermission\(req, PERMISSION\)/);
    assert.match(route, /PERMISSION = 'agents\.approve'/);
    assert.match(route, /admin_audit_events/);
    assert.match(server, /registerEditorialHighlightRoutes\(app, \{ supabaseAdmin, verifyAdminPermission \}\)/);
    assert.match(server, /highlightImage \? '2mb'/);
});

test('back-office: section, nav item, scripts and a preview that renders no demo card', () => {
    const admin = fs.readFileSync('admin.html', 'utf8');
    const ui = fs.readFileSync('admin-highlights.js', 'utf8');
    assert.match(admin, /data-section="sec-highlights"/);
    assert.match(admin, /<section id="sec-highlights" class="admin-section">/);
    assert.match(admin, /editorial-highlights-view\.js[\s\S]*admin-highlights\.js/);
    assert.match(ui, /fetchWithAdminAuth\(`\/v1\/admin\/editorial\/highlights/);
    assert.match(ui, /asLink: false/);
    assert.doesNotMatch(ui, /innerHTML = [^;]*\$\{row\.title\}/, 'titles go through escapeText');
});
