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
