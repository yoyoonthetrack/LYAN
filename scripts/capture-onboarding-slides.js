#!/usr/bin/env node
/*
 * Phase 3.0C. WebKit screenshots of the five premium guest slides (real bundled HTML, Capacitor mocked).
 *   node scripts/capture-onboarding-slides.js [wwwDir]
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { webkit, devices } = require('playwright');

const bundle = path.resolve(process.argv[2] || path.join(__dirname, '..', 'www'));
const outDir = path.join(__dirname, '..', 'artifacts', 'onboarding-premium-v1');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

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

(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await webkit.launch();
    const context = await browser.newContext({
        userAgent: devices['iPhone 15'].userAgent,
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2
    });
    await context.addInitScript(() => {
        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'ios',
            Plugins: { App: { addListener: () => Promise.resolve({ remove() {} }) } }
        };
        try { sessionStorage.setItem('lyann_boot_splash_seen', '1'); } catch (_) {}
    });
    const page = await context.newPage();
    await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('nativeGuestHome') && !document.getElementById('nativeGuestHome').hidden, null, { timeout: 20000 });
    const names = ['decouvrir', 'proposer', 'securiser', 'confiance', 'explorer'];
    for (let i = 0; i < names.length; i += 1) {
        await page.evaluate((index) => {
            const pager = document.getElementById('nativeGuestPager');
            const w = pager?.clientWidth || 1;
            const target = Math.round(index * w);
            pager.scrollTo({ left: target, behavior: 'auto' });
            pager.scrollLeft = target;
        }, i);
        await page.waitForFunction((index) => {
            const pager = document.getElementById('nativeGuestPager');
            const w = pager?.clientWidth || 1;
            return Math.round(pager.scrollLeft / w) === index;
        }, i, { timeout: 5000 });
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(outDir, `slide-${i + 1}-${names[i]}.png`), fullPage: false });
    }
    await browser.close();
    server.close();
    console.log('wrote', outDir);
})().catch((e) => { console.error(e); process.exit(1); });
