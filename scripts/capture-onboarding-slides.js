#!/usr/bin/env node
/*
 * Phase 3.0C-2. Real WebKit captures of the premium guest slides (real HTML/CSS, Capacitor mocked) + DOM checks.
 *
 *   node scripts/capture-onboarding-slides.js [wwwDir] [--width=390] [--height=844] [--out=subdir]
 *   node scripts/capture-onboarding-slides.js --board    # 390x844 (primary), 375x812, 375x667, 430x932 + plates
 *
 * Notes
 * - Playwright WebKit does not emulate iOS safe areas: the script injects --ngp-safe-top / --ngp-safe-bottom
 *   (47 / 34 px on notch iPhones, 20 / 0 on iPhone SE) on #nativeGuestHome only, to mimic env(safe-area-inset-*).
 * - Outfit (the app font, normally fetched from Google Fonts on device) is served from /tmp/lyann-fonts when present.
 * - Reference mock-ups live in artifacts/onboarding-premium-v1/references/ref-N-*.jpg (comparison plate).
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { webkit, devices } = require('playwright');

const root = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const bundle = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(root, 'www'));
const opt = (name, def) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : def;
};
const makeBoard = argv.includes('--board');
const base = path.join(root, 'artifacts', 'onboarding-premium-v1');
const FONT_FILE = '/tmp/lyann-fonts/outfit-latin.woff2';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const NAMES = ['decouvrir', 'proposer', 'securiser', 'confiance', 'explorer'];

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

async function captureSet({ w, h, safeTop, safeBottom }, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await webkit.launch();
    const context = await browser.newContext({
        userAgent: devices['iPhone 15'].userAgent,
        viewport: { width: w, height: h },
        deviceScaleFactor: 2
    });
    const hasFont = fs.existsSync(FONT_FILE);
    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/fonts\.googleapis\.com/.test(url)) {
            if (!hasFont) return route.abort();
            return route.fulfill({
                status: 200,
                contentType: 'text/css',
                body: "@font-face{font-family:'Outfit';font-style:normal;font-weight:100 900;font-display:block;src:url(https://fonts.gstatic.com/lyann-outfit.woff2) format('woff2');}"
            });
        }
        if (/fonts\.gstatic\.com/.test(url)) {
            if (!hasFont) return route.abort();
            return route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(FONT_FILE) });
        }
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
    await page.addStyleTag({
        content: `#nativeGuestHome.native-guest-premium-v1{--ngp-safe-top:${safeTop}px;--ngp-safe-bottom:${safeBottom}px;}`
    });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(500);

    const paths = [];
    const checks = { viewport: `${w}x${h}`, safeTop, safeBottom, fontOutfit: hasFont, slides: [] };
    for (let i = 0; i < NAMES.length; i += 1) {
        await page.evaluate((index) => {
            const pager = document.getElementById('nativeGuestPager');
            const width = pager?.clientWidth || 1;
            const target = Math.round(index * width);
            pager.scrollTo({ left: target, behavior: 'auto' });
            pager.scrollLeft = target;
        }, i);
        await page.waitForFunction((index) => {
            const pager = document.getElementById('nativeGuestPager');
            const width = pager?.clientWidth || 1;
            return Math.round(pager.scrollLeft / width) === index;
        }, i, { timeout: 5000 });
        await page.waitForTimeout(350);
        // Wait for the slide's images (lazy) to decode so captures are final.
        await page.evaluate((index) => Promise.all(Array.from(document.querySelectorAll(`.native-guest-slide[data-slide="${index}"] img`)).map((img) => (img.complete ? null : new Promise((res) => { img.onload = img.onerror = res; })))), i);
        await page.waitForTimeout(150);

        const dom = await page.evaluate(({ vw, vh }) => {
            const visible = (el) => {
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
            };
            const all = Array.from(document.querySelectorAll('body *'));
            const stepsText = all.filter((el) => /étapes simples/i.test(el.textContent || '') && el.children.length === 0 && visible(el)).length;
            const navbar = document.querySelector('.navbar');
            const logos = all.filter((el) => visible(el) && (
                (el.tagName === 'IMG' && /lyann-symbol|logo-app|logo-icon/i.test(el.getAttribute('src') || '')) ||
                el.classList.contains('logo-icon-svg') || el.classList.contains('logo-title') || el.classList.contains('ngp-brand-wordmark')
            ));
            const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) }; };
            return {
                visibleEtapesSimples: stepsText,
                navbarVisible: !!(navbar && visible(navbar)),
                visibleLogoElements: logos.map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`),
                header: rect('#ngpAppHeader'),
                join: rect('#btnNativeJoin'),
                login: rect('#btnNativeLogin'),
                dots: rect('#nativeGuestDots'),
                activeDots: document.querySelectorAll('#nativeGuestDots .native-guest-dot.is-active').length,
                dotCount: document.querySelectorAll('#nativeGuestDots .native-guest-dot').length,
                joinBg: getComputedStyle(document.getElementById('btnNativeJoin')).backgroundImage
            };
        }, { vw: w, vh: h });
        const slideOverflow = await page.evaluate((index) => {
            const s = document.querySelectorAll('.native-guest-slide')[index];
            const tag = s.querySelector('.ngp-tag').getBoundingClientRect();
            const title = s.querySelector('.ngp-title').getBoundingClientRect();
            const visual = s.querySelector('.ngp-visual').getBoundingClientRect();
            const inner = s.querySelector('.native-guest-slide-inner');
            return {
                scrollable: s.scrollHeight - s.clientHeight,
                tagTop: Math.round(tag.top), titleTop: Math.round(title.top), titleH: Math.round(title.height),
                titleLeft: Math.round(title.left), visualTop: Math.round(visual.top), visualBottom: Math.round(visual.bottom),
                titleFont: getComputedStyle(s.querySelector('.ngp-title')).fontSize,
                innerPad: getComputedStyle(inner).paddingLeft
            };
        }, i);
        checks.slides.push({ slide: i + 1, name: NAMES[i], ...dom, ...slideOverflow });

        const file = path.join(outDir, `slide-${i + 1}-${NAMES[i]}.png`);
        await page.screenshot({ path: file, fullPage: false });
        paths.push(file);
    }
    fs.writeFileSync(path.join(outDir, 'dom-checks.json'), JSON.stringify(checks, null, 2));
    await browser.close();
    server.close();
    return { paths, checks };
}

function plate(inputs, outFile, { labels = [], rows = 1 } = {}) {
    const { execFileSync } = require('child_process');
    const code = `
import sys, json
from PIL import Image, ImageDraw, ImageFont
spec = json.loads(sys.argv[1])
rows = spec['rows']; H = spec['height']; bg = '#F7F2E8'
imgs = [[Image.open(p).convert('RGB') for p in r] for r in rows]
def scale(im):
    w = int(im.width * (H / im.height)); return im.resize((w, H), Image.Resampling.LANCZOS)
sc = [[scale(i) for i in r] for r in imgs]
pad = 16; label_h = 34 if spec['labels'] else 0
width = max(sum(i.width for i in r) + pad * (len(r) + 1) for r in sc)
height = len(sc) * (H + pad + label_h) + pad
out = Image.new('RGB', (width, height), bg)
d = ImageDraw.Draw(out)
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: font = ImageFont.load_default()
y = pad
for ri, r in enumerate(sc):
    x = pad
    if spec['labels']:
        d.text((x, y), spec['labels'][ri], fill='#0F3D2A', font=font); y += label_h
    for im in r:
        out.paste(im, (x, y)); x += im.width + pad
    y += H + pad
out.save(spec['out'], optimize=True)
`;
    execFileSync('python3', ['-c', code, JSON.stringify({ rows: inputs, out: outFile, height: 1100, labels })], { stdio: 'pipe' });
}

(async () => {
    const sets = makeBoard
        ? [
            { w: 390, h: 844, safeTop: 47, safeBottom: 34, dir: 'width-390' },
            { w: 375, h: 812, safeTop: 44, safeBottom: 34, dir: 'width-375' },
            { w: 375, h: 667, safeTop: 20, safeBottom: 0, dir: 'width-375-se' },
            { w: 430, h: 932, safeTop: 59, safeBottom: 34, dir: 'width-430' }
        ]
        : [{
            w: Number(opt('width', 390)), h: Number(opt('height', 844)), safeTop: Number(opt('safe-top', 47)), safeBottom: Number(opt('safe-bottom', 34)),
            dir: opt('out', '')
        }];

    const results = {};
    for (const set of sets) {
        const outDir = set.dir ? path.join(base, set.dir) : base;
        const { paths, checks } = await captureSet(set, outDir);
        results[set.dir || 'main'] = { paths, checks };
        plate([paths], path.join(outDir, `planche-5-slides-${set.w}px.png`));
        console.log('wrote', outDir);
    }
    if (makeBoard) {
        const main = results['width-390'].paths;
        // Primary captures at 390 px sit at the top level of the artifact folder.
        main.forEach((p, i) => fs.copyFileSync(p, path.join(base, `slide-${i + 1}-${NAMES[i]}.png`)));
        fs.copyFileSync(path.join(base, 'width-390', 'planche-5-slides-390px.png'), path.join(base, 'planche-comparative-390px.png'));
        const refs = NAMES.map((n, i) => path.join(base, 'references', `ref-${i + 1}-${n}.jpg`));
        if (refs.every((r) => fs.existsSync(r))) {
            plate([refs, main], path.join(base, 'planche-reference-vs-rendu-390px.png'), { labels: ['Maquettes de référence validées', 'Rendu réel WebKit 390 px'] });
        }
    }
})().catch((e) => { console.error(e); process.exit(1); });
