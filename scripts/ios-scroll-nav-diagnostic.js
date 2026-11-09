#!/usr/bin/env node
/*
 * Diagnostic of the native shell in WebKit: scroll and bottom navigation.
 * Serves a native bundle directory (default: ios/App/App/public, the files the iPhone really ships)
 * over http, mocks the Capacitor platform flag, signs in a Staging QA account and measures, for each page:
 * html/body overflow and position, whether the document can scroll, whether the bottom nav exists, is
 * visible, sits in the viewport and is the top element at its own centre.
 *
 *   node scripts/ios-scroll-nav-diagnostic.js [bundleDir] [--state=member|guest|refresh-fail|refresh-slow|guest-then-login]
 *
 * member        signed-in QA account (the normal case)
 * guest         no session
 * refresh-fail  stored session expired and the token endpoint unreachable: auth ends in status "error"
 * refresh-slow  stored session expired and the token endpoint answers after 20 s: auth stays "resolving"
 * guest-then-login  starts without session, the session arrives after the first pass (no reload)
 *
 * In the member state the full-screen Carte of Annonces is also exercised (lock, release, tab change).
 */
require('./force-staging-v2-env');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { webkit, devices } = require('playwright');

const STATE = (process.argv.find((a) => a.startsWith('--state=')) || '--state=member').split('=')[1];
const bundle = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', 'ios', 'App', 'App', 'public'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.gif': 'image/gif', '.mp4': 'video/mp4' };

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

const MEASURE = () => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };
    const cs = (el, props) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; props.forEach((p) => { o[p] = s[p]; }); return o; };
    const nav = document.querySelector('.mobile-bottom-nav');
    let top = null;
    if (nav) {
        const r = nav.getBoundingClientRect();
        const el = document.elementFromPoint(Math.min(innerWidth - 2, r.left + r.width / 2), Math.min(innerHeight - 2, Math.max(0, r.top + r.height / 2)));
        top = el ? (el.closest('.mobile-bottom-nav') ? 'nav' : (el.id || el.className || el.tagName)).toString().slice(0, 80) : null;
    }
    const props = ['overflow', 'overflowY', 'position', 'height', 'touchAction'];
    return {
        url: location.pathname + location.search,
        viewport: { w: innerWidth, h: innerHeight },
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        html: cs(document.documentElement, props),
        body: cs(document.body, props),
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        scrollY: Math.round(scrollY),
        navInDom: !!nav,
        nav: nav ? { rect: rect(nav), style: cs(nav, ['display', 'visibility', 'opacity', 'position', 'zIndex', 'transform', 'bottom', 'pointerEvents']), topAtCentre: top, tabs: [...nav.querySelectorAll('.nav-tab')].map((t) => t.getAttribute('aria-label')) } : null,
        veil: (() => { const v = document.getElementById('lyann-page-veil'); return v ? { cls: v.className, op: getComputedStyle(v).opacity, pe: getComputedStyle(v).pointerEvents, disp: getComputedStyle(v).display } : null; })()
    };
};

(async () => {
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await webkit.launch();
    // Mobile WebKit has no wheel events, so the iPhone is emulated by user agent and viewport only: a wheel on an
    // overflow:hidden document does not scroll, exactly like a finger on a locked page.
    const context = await browser.newContext({ userAgent: devices['iPhone 15'].userAgent, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
    await context.addInitScript(() => {
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

    const qa = { email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD };
    await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.login, null, { timeout: 20000 });
    if (STATE !== 'guest' && STATE !== 'guest-then-login') {
        // Phase 3.0A: signing in on the welcome page makes the mobile gate navigate at once, so the evaluation may be cut.
        const login = await page.evaluate(async (c) => { const r = await Promise.race([window.LYANN_API_CLIENT.login(c.email, c.password), new Promise((ok) => setTimeout(() => ok({ data: { user: { id: 'pending' } } }), 4000))]); return { id: r.data?.user?.id || null, error: r.error?.message || null }; }, qa)
            .catch((e) => (/destroyed|navigation|Load failed/i.test(String(e.message)) ? { id: 'navigated', error: null } : { id: null, error: String(e.message) }));
        if (!login.id) { console.log(JSON.stringify({ loginError: login.error })); process.exit(2); }
    }
    if (STATE === 'refresh-fail' || STATE === 'refresh-slow') {
        await page.evaluate(() => {
            Object.keys(localStorage).filter((k) => /auth-token/.test(k)).forEach((k) => {
                const v = JSON.parse(localStorage.getItem(k));
                v.expires_at = 1; v.expires_in = 0;
                localStorage.setItem(k, JSON.stringify(v));
            });
        });
        await context.route('**/auth/v1/token**', (route) => (STATE === 'refresh-fail' ? route.abort() : setTimeout(() => route.abort(), 20000)));
    }

    const report = [];
    const pages = [
        ['discover', '/discover.html'], ['lyanneurs', '/results.html?mode=lyanneurs'],
        ['annonces-liste', '/results.html?mode=annonces&view=list'], ['annonces-defaut', '/results.html?mode=annonces']
    ];
    for (const [name, url] of pages) {
        await page.goto(origin + url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3500);
        const before = await page.evaluate(MEASURE);
        await page.mouse.move(200, 400);
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => ({ scrollY: Math.round(scrollY) }));
        report.push({ name, scrolledBy: after.scrollY - before.scrollY, ...before });
    }
    const extra = {};
    const wheel = async (dy) => { const y0 = await page.evaluate(() => Math.round(scrollY)); await page.mouse.move(200, 400); await page.mouse.wheel(0, dy); await page.waitForTimeout(400); return (await page.evaluate(() => Math.round(scrollY))) - y0; };
    const snap = () => page.evaluate(() => {
        const nav = document.querySelector('.mobile-bottom-nav');
        const map = document.querySelector('.needs-map-canvas');
        return {
            bodyClass: document.body.className, bodyOverflow: getComputedStyle(document.body).overflowY,
            navVisible: !!nav && getComputedStyle(nav).display !== 'none',
            navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
            mapBottom: map && map.offsetParent ? Math.round(map.getBoundingClientRect().bottom) : null,
            mapHeight: map && map.offsetParent ? Math.round(map.getBoundingClientRect().height) : null
        };
    });
    if (STATE === 'guest-then-login') {
        await page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        extra.beforeLogin = { ...(await snap()), scrolledBy: await wheel(600) };
        await page.evaluate(async (c) => { await window.LYANN_API_CLIENT.login(c.email, c.password); }, qa);
        await page.waitForTimeout(2500);
        extra.afterLogin = { ...(await snap()), scrolledBy: await wheel(600) };
    }
    if (STATE === 'member') {
        await page.goto(`${origin}/results.html?mode=annonces`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        await page.click('#explorerViewToggle button[data-view="map"]');
        await page.waitForTimeout(3000);
        extra.carte = { ...(await snap()), scrolledBy: await wheel(700) };
        await page.click('#explorerViewToggle button[data-view="list"]');
        await page.waitForTimeout(1500);
        extra.carteToListe = { ...(await snap()), scrolledBy: await wheel(700) };
        await page.click('#explorerViewToggle button[data-view="map"]');
        await page.waitForTimeout(2000);
        extra.carteAgain = { ...(await snap()), scrolledBy: await wheel(300) };
        await page.click('#tab-lyanneurs');
        await page.waitForURL(/mode=lyanneurs/, { timeout: 10000 });
        await page.waitForTimeout(3500);
        extra.carteToLyanneurs = { ...(await snap()), scrolledBy: await wheel(700) };
        await page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        extra.discoverAfterCarte = { ...(await snap()), scrolledBy: await wheel(700) };
    }
    console.log(JSON.stringify({ state: STATE, extra, bundle, origin, errors: [...new Set(errors)].slice(0, 12), report }, null, 1));
    await browser.close();
    server.close();
})().catch((e) => { console.error(e); process.exit(1); });
