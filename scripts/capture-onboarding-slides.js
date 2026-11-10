#!/usr/bin/env node
/*
 * Phase 3.0C / 3.0C-1. WebKit screenshots of premium guest slides (real HTML/CSS, Capacitor mocked).
 *
 *   node scripts/capture-onboarding-slides.js [wwwDir] [--width=393] [--out=subdir]
 *   node scripts/capture-onboarding-slides.js --board   # 393 + 390 + 375 and comparison plate
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { webkit, devices } = require('playwright');

const root = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const bundle = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(root, 'www'));
const widthArg = Number((argv.find((a) => a.startsWith('--width=')) || '--width=393').split('=')[1]);
const outSub = (argv.find((a) => a.startsWith('--out=')) || '').split('=')[1] || '';
const makeBoard = argv.includes('--board');
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

async function captureSet(viewportWidth, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await webkit.launch();
    const height = viewportWidth <= 375 ? 812 : 852;
    const context = await browser.newContext({
        userAgent: devices['iPhone 15'].userAgent,
        viewport: { width: viewportWidth, height },
        deviceScaleFactor: 2
    });
    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)) return route.abort();
        return route.continue();
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
    await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let mounted = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        mounted = await page.evaluate(() => {
            if (typeof window.mountNativeGuestHome === 'function') {
                window.mountNativeGuestHome();
                const home = document.getElementById('nativeGuestHome');
                return !!(home && !home.hidden);
            }
            return false;
        });
        if (mounted) break;
        await page.waitForTimeout(250);
    }
    if (!mounted) throw new Error(`guest landing not mounted (bundle: ${bundle})`);
    await page.waitForTimeout(300);
    const names = ['decouvrir', 'proposer', 'securiser', 'confiance', 'explorer'];
    const paths = [];
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
        await page.waitForTimeout(300);
        const file = path.join(outDir, `slide-${i + 1}-${names[i]}.png`);
        await page.screenshot({ path: file, fullPage: false });
        paths.push(file);
    }
    await browser.close();
    server.close();
    return paths;
}

function buildComparisonPlate(slidePaths, outFile) {
    const { spawnSync, execFileSync } = require('child_process');
    const tryMagick = (bin) => {
        const r = spawnSync(bin, [...slidePaths, '+append', '-quality', '92', outFile], { encoding: 'utf8' });
        return r.status === 0;
    };
    if (tryMagick('magick') || tryMagick('convert')) return true;
    try {
        execFileSync('python3', ['-c', `
import sys
from PIL import Image
paths = sys.argv[1:-1]
out = sys.argv[-1]
imgs = [Image.open(p) for p in paths]
h = min(i.height for i in imgs)
scaled = []
for i in imgs:
    w = int(i.width * (h / i.height))
    scaled.append(i.resize((w, h), Image.Resampling.LANCZOS))
total = sum(s.width for s in scaled)
plate = Image.new('RGB', (total, h), '#F7F2E8')
x = 0
for s in scaled:
    plate.paste(s, (x, 0))
    x += s.width
plate.save(out, optimize=True)
`, ...slidePaths, outFile], { stdio: 'pipe' });
        return true;
    } catch (_) {
        fs.writeFileSync(outFile.replace(/\.png$/, '-MANUAL.txt'), `Assembler manuellement:\n${slidePaths.join('\n')}\n`);
        return false;
    }
}

(async () => {
    const base = path.join(root, 'artifacts', 'onboarding-premium-v1');
    const sets = makeBoard
        ? [{ w: 393, dir: 'width-393' }, { w: 390, dir: 'width-390' }, { w: 375, dir: 'width-375' }]
        : [{ w: widthArg, dir: outSub || (widthArg === 393 ? '' : `width-${widthArg}`) }];

    for (const { w, dir } of sets) {
        const outDir = dir ? path.join(base, dir) : base;
        const paths = await captureSet(w, outDir);
        const plate = path.join(outDir, `planche-5-slides-${w}px.png`);
        buildComparisonPlate(paths, plate);
        console.log('wrote', outDir);
    }
    if (makeBoard) {
        const mainPlate = path.join(base, 'planche-comparative-393px.png');
        fs.copyFileSync(path.join(base, 'width-393', 'planche-5-slides-393px.png'), mainPlate);
    }
})().catch((e) => { console.error(e); process.exit(1); });
