#!/usr/bin/env node
/*
 * Phase 3.1A. Real WebKit captures of the member screens (Découvrir, Lyanneurs, Annonces liste/carte), signed in with
 * the Staging QA account from .env.staging-v2 (never printed). Capacitor is mocked (native shell, five tabs).
 *
 *   node scripts/capture-member-screens.js [wwwDir] [--width=390] [--height=844] [--out=dir] [--android]
 *       [--only=discover,lyanneurs,annonces,carte] [--full]
 *
 * Output: <out>/<name>.png and <out>/checks.json (DOM measurements: order of sections, first result in viewport,
 * forbidden sections, nav position, scroll state). Staging only: scripts/force-staging-v2-env.js refuses any other project.
 */
require('./force-staging-v2-env');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { webkit, chromium, devices } = require('playwright');

const root = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.split('=')[1] : def; };
const bundle = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(root, 'www'));
const W = Number(opt('width', 390));
const H = Number(opt('height', 844));
const android = argv.includes('--android');
const full = argv.includes('--full');
const only = (opt('only', 'discover,lyanneurs,annonces,carte')).split(',');
const outDir = path.resolve(opt('out', path.join(root, 'artifacts', 'phase-3-1a', `${android ? 'android' : 'ios'}-${W}`)));
const FONT_FILE = '/tmp/lyann-fonts/outfit-latin.woff2';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const QA = { email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD };


// WCAG 2.1 AA audit run in the page: text (4.5:1, 3:1 for large text), placeholders, icons and glyphs (3:1).
// Text over a photograph or a map is reported separately (image-backed) and measured by pixel sampling instead.
function contrastAudit() {
    const parse = (value) => { const m = /rgba?\(([^)]+)\)/.exec(value || ''); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const over = (top, bottom) => { const a = top.a + bottom.a * (1 - top.a); return a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a }; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 2 && r.height > 2 && !(r.width <= 1 || r.height <= 1); };
    const backdrop = (el) => {
        const layers = []; let node = el; let imageBacked = false;
        while (node && node.nodeType === 1) {
            const cs = getComputedStyle(node);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') { imageBacked = true; }
            const bg = parse(cs.backgroundColor);
            if (bg && bg.a > 0) layers.push(bg);
            if (bg && bg.a === 1) break;
            node = node.parentElement;
        }
        let acc = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
        return { color: acc, imageBacked };
    };
    const effectiveColor = (el, raw) => { let c = parse(raw); if (!c) return null; let node = el; let op = 1; while (node && node.nodeType === 1) { op *= Number(getComputedStyle(node).opacity); node = node.parentElement; } return { ...c, a: c.a * op }; };
    const label = (el) => { const cls = (el.className && el.className.baseVal === undefined ? String(el.className) : '').trim().split(/\s+/).slice(0, 2).join('.'); return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`; };
    const fails = []; const imageBacked = []; let checked = 0;
    const test = (el, fg, kind, text, large) => {
        const back = backdrop(el); const fgc = effectiveColor(el, fg); if (!fgc || fgc.a === 0) return;
        const blended = over(fgc, back.color); const need = kind === 'text' && !large ? 4.5 : 3; const got = ratio(blended, back.color);
        checked += 1;
        const row = { el: label(el), text: String(text || '').slice(0, 40), ratio: Math.round(got * 100) / 100, need, fg: fg, bg: `rgb(${Math.round(back.color.r)},${Math.round(back.color.g)},${Math.round(back.color.b)})` };
        if (back.imageBacked) { imageBacked.push(row); return; }
        if (got < need) fails.push(row);
    };
    const root = document.querySelector('main') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue.replace(/\s+/g, ' ').trim(); const el = n.parentElement;
        if (!text || !el || seen.has(el) || !visible(el) || el.closest('[hidden], script, style, .sr-only, .leaflet-container, dialog:not([open])')) continue;
        seen.add(el);
        const cs = getComputedStyle(el); const px = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
        test(el, cs.color, 'text', text, px >= 24 || (bold && px >= 18.66));
    }
    document.querySelectorAll('main input, main textarea').forEach((el) => { if (!visible(el) || !el.placeholder || el.closest('[hidden]')) return; test(el, getComputedStyle(el, '::placeholder').color, 'text', el.placeholder, false); });
    document.querySelectorAll('main i.ph, main i.ph-fill, main i.ph-bold').forEach((el) => { if (!visible(el) || el.closest('[hidden], .leaflet-container')) return; test(el, getComputedStyle(el).color, 'icon', el.className, false); });
    document.querySelectorAll('main svg').forEach((el) => { if (!visible(el) || el.closest('[hidden], .leaflet-container')) return; const cs = getComputedStyle(el); const paint = cs.stroke && cs.stroke !== 'none' ? cs.stroke : cs.fill; if (paint && paint !== 'none') test(el, paint, 'icon', 'svg', false); });
    return { checked, failCount: fails.length, fails: fails.slice(0, 40), imageBackedCount: imageBacked.length, imageBacked: imageBacked.slice(0, 12) };
}

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://x');
            let file = path.join(bundle, decodeURIComponent(url.pathname));
            if (!file.startsWith(bundle)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

const SCREENS = {
    discover: { url: 'discover.html', ready: () => !document.querySelector('#discoverTalents[aria-busy="true"]') },
    lyanneurs: { url: 'results.html?mode=lyanneurs', ready: () => document.querySelector('#explorerResults') && document.querySelector('#explorerResults').getAttribute('aria-busy') !== 'true' },
    annonces: { url: 'results.html?mode=annonces', ready: () => document.querySelector('#explorerResults') && document.querySelector('#explorerResults').getAttribute('aria-busy') !== 'true' },
    carte: { url: 'results.html?mode=annonces&view=map', ready: () => !!document.querySelector('#explorerMap') && !document.querySelector('#explorerMap').hidden }
};

(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    if (!QA.email || !QA.password) throw new Error('QA credentials missing in .env.staging-v2');
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await (android ? chromium : webkit).launch();
    const context = await browser.newContext(android
        ? { ...devices['Pixel 7'], viewport: { width: W, height: H }, deviceScaleFactor: 2 }
        : { userAgent: devices['iPhone 15'].userAgent, viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const hasFont = fs.existsSync(FONT_FILE);
    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/fonts\.googleapis\.com/.test(url)) {
            if (!hasFont) return route.abort();
            return route.fulfill({ status: 200, contentType: 'text/css', body: "@font-face{font-family:'Outfit';font-style:normal;font-weight:100 900;font-display:block;src:url(https://fonts.gstatic.com/lyann-outfit.woff2) format('woff2');}" });
        }
        if (/fonts\.gstatic\.com/.test(url)) return hasFont ? route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(FONT_FILE) }) : route.abort();
        return route.continue();
    });
    await context.addInitScript((platform) => {
        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => platform,
            Plugins: { App: { addListener: () => Promise.resolve({ remove() {} }) } }
        };
        try { sessionStorage.setItem('lyann_boot_splash_seen', '1'); } catch (_) {}
    }, android ? 'android' : 'ios');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

    await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.login, null, { timeout: 30000 });
    await page.evaluate(async (c) => {
        const p = window.LYANN_API_CLIENT.login(c.email, c.password);
        await Promise.race([p, new Promise((r) => setTimeout(r, 5000))]);
    }, QA).catch(() => {});
    await page.waitForTimeout(3500);

    const checks = { viewport: `${W}x${H}`, engine: android ? 'chromium-android' : 'webkit-ios', screens: {} };
    for (const name of only) {
        const s = SCREENS[name];
        if (!s) continue;
        await page.goto(`${origin}/${s.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(s.ready, null, { timeout: 25000 }).catch(() => {});
        await page.waitForTimeout(2500);
        await page.evaluate(() => Promise.all(Array.from(document.images).slice(0, 40).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); }))))).catch(() => {});
        checks.screens[name] = await page.evaluate(() => {
            const vh = window.innerHeight;
            const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
            const nav = document.querySelector('.mobile-bottom-nav');
            const headings = Array.from(document.querySelectorAll('main h1, main h2, main h3')).filter(vis).map((h) => h.textContent.trim().replace(/\s+/g, ' ')).slice(0, 14);
            const firstCard = document.querySelector('#explorerResults > *, #explorerResults .explorer-card, #explorerResults article');
            return {
                url: location.pathname.split('/').pop() + location.search,
                headings,
                navVisible: vis(nav), navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null, navTabs: nav ? [...nav.querySelectorAll('.nav-tab')].map((t) => t.id) : [],
                firstResult: r(firstCard), firstResultInViewport: !!firstCard && vis(firstCard) && firstCard.getBoundingClientRect().top < (nav ? nav.getBoundingClientRect().top : vh),
                mapRect: r(document.querySelector('#explorerMap')),
                mapMarkers: Array.from(document.querySelectorAll('#explorerMap .leaflet-marker-icon')).map((m) => { const b = m.getBoundingClientRect(); return { label: (m.getAttribute('aria-label') || m.getAttribute('title') || '').slice(0, 80), x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; }),
                mapSummary: (document.querySelector('.needs-map-summary, #explorerMapSummary') || {}).textContent || null,
                docScroll: document.documentElement.scrollHeight - vh,
                bodyOverflow: getComputedStyle(document.body).overflow,
                forbiddenOnResults: ['Talents près de chez vous', 'Annonces du moment', 'Explorer les services', 'Voir plus'].filter((t) => /results\.html/.test(location.pathname) && (document.querySelector('main')?.innerText || '').includes(t))
            };
        });
        checks.screens[name].contrast = await page.evaluate(contrastAudit);
        if (name === 'lyanneurs' || name === 'annonces') {
            // White title/subtitle over the header photograph: hide the glyphs, sample the pixels behind them and compare the
            // brightest 5 % of those pixels (worst case) with white.
            const boxes = await page.evaluate(() => { document.head.insertAdjacentHTML('beforeend', '<style id="__ink">.results-v3-overlay h1,.results-v3-overlay p{color:transparent!important;text-shadow:none!important}</style>'); return ['.results-v3-overlay h1', '.results-v3-overlay p'].map((q) => { const el = document.querySelector(q); const r = el.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect(); return { q, x: Math.max(0, t.left), y: Math.max(0, t.top), width: Math.max(1, t.width), height: Math.max(1, t.height) }; }); });
            const samples = [];
            for (const box of boxes) {
                const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
                const worst = await page.evaluate(async (b64) => {
                    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
                    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
                    const d = g.getImageData(0, 0, c.width, c.height).data; const L = [];
                    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]));
                    L.sort((a, b) => a - b); const p95 = L[Math.floor(L.length * 0.95)];
                    return { p95, ratioWithWhite: Math.round((1.05 / (p95 + 0.05)) * 100) / 100 };
                }, shot.toString('base64'));
                samples.push({ element: box.q, ...worst });
            }
            await page.evaluate(() => document.getElementById('__ink')?.remove());
            checks.screens[name].headerTextOverPhoto = samples;
        }
        const file = path.join(outDir, `${name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        if (full) await page.screenshot({ path: path.join(outDir, `${name}-full.png`), fullPage: true });
        console.log('captured', name);
    }
    checks.pageErrors = errors;
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 2));
    await browser.close();
    server.close();
    console.log('wrote', outDir);
})().catch((e) => { console.error(e); process.exit(1); });
