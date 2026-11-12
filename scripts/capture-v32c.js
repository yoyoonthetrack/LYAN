#!/usr/bin/env node
/*
 * Phase 3.2C — captures Découvrir / Lyanneurs / Annonces / carte (visiteur, Staging en lecture) + mesures de débordement.
 *   node scripts/capture-v32c.js --out=artifacts/phase-3-2c/after [--engine=webkit|chromium] [--widths=375,390,430,768,1280]
 * Écrit <out>/<largeur>/<écran>.png et <out>/checks.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium, webkit, devices } = require('playwright');
const { buildBundle, serve, loadStagingEnv, createPreviewBackend } = require('./preview-v32c');

const root = path.join(__dirname, '..');
const arg = (name, def) => { const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`)); return hit ? hit.split('=')[1] : def; };
const out = path.resolve(arg('out', path.join(root, 'artifacts', 'phase-3-2c', 'after')));
const engine = arg('engine', 'webkit');
const widths = arg('widths', '375,390,430,768,1280').split(',').map(Number);
const withLogin = process.argv.includes('--login');
const SCREENS = [
    ['discover', 'discover.html', () => document.querySelector('#discoverNeeds')?.getAttribute('aria-busy') !== 'true'],
    ['lyanneurs', 'results.html?mode=lyanneurs', () => document.querySelector('#explorerResults')?.getAttribute('aria-busy') !== 'true'],
    ['annonces', 'results.html?mode=annonces', () => document.querySelector('#explorerResults')?.getAttribute('aria-busy') !== 'true'],
    ['carte', 'results.html?mode=annonces&view=map', null],
    ['messages', 'discover.html', null]
];

(async () => {
    const info = buildBundle(path.join(root, 'artifacts', 'phase-3-2c', '.bundle'));
    const server = await serve(info.dir, 0, '127.0.0.1', createPreviewBackend());
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await (engine === 'chromium' ? chromium : webkit).launch();
    const checks = [];
    for (const w of widths) {
        const mobile = w < 700;
        const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, deviceScaleFactor: 2, hasTouch: mobile, ...(mobile && engine === 'webkit' ? { userAgent: devices['iPhone 15'].userAgent } : {}) });
        // Mobile : coque native simulée (Capacitor) pour voir la barre de 5 onglets ; bureau : web.
        await ctx.addInitScript((native) => {
            try { sessionStorage.setItem('lyann_boot_splash_seen', '1'); } catch (_) {}
            if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { App: { addListener: () => Promise.resolve({ remove() {} }) } } };
        }, mobile);
        const dir = path.join(out, String(w));
        fs.mkdirSync(dir, { recursive: true });
        if (withLogin) {
            const env = loadStagingEnv();
            const lp = await ctx.newPage();
            await lp.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await lp.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.login, null, { timeout: 30000 });
            await lp.evaluate(async (c) => { await Promise.race([window.LYANN_API_CLIENT.login(c.email, c.password), new Promise((r) => setTimeout(r, 6000))]); }, { email: env.LYANN_E2E_QA_A_EMAIL, password: env.LYANN_E2E_QA_A_PASSWORD }).catch(() => {});
            await lp.waitForTimeout(3500);
            await lp.close();
        }
        for (const [name, url, ready] of SCREENS) {
            const page = await ctx.newPage();
            const errors = [];
            page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
            await page.goto(`${origin}/${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => errors.push('goto ' + e.message));
            if (ready) await page.waitForFunction(ready, null, { timeout: 25000 }).catch(() => {});
            await page.waitForTimeout(2500);
            if (name === 'messages') {
                // Mobile : onglet Messages de la barre native ; bureau : bouton Messages de l'en-tête.
                const opener = (await page.locator('#tab-messages').count()) ? page.locator('#tab-messages') : page.locator('.nav-msg-btn.open-chat-trigger').first();
                if (!(await opener.count())) { errors.push('pas de bouton Messages (écran ignoré)'); await page.close(); continue; }
                await opener.click().catch(() => {});
                await page.waitForTimeout(2500);
            }
            const m = await page.evaluate(() => {
                const d = document.documentElement;
                return { overflowX: d.scrollWidth - d.clientWidth, scrollHeight: d.scrollHeight, h1: (document.querySelector('h1')?.innerText || '').slice(0, 60) };
            });
            const tall = name !== 'carte' && name !== 'messages';
            if (tall) { await page.setViewportSize({ width: w, height: Math.min(Math.max(m.scrollHeight, mobile ? 844 : 900), 2100) }); await page.waitForTimeout(500); }
            await page.screenshot({ path: path.join(dir, `${name}.png`) });
            checks.push({ width: w, screen: name, ...m, errors });
            await page.close();
        }
        await ctx.close();
    }
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2));
    for (const c of checks) console.log(`${c.width}\t${c.screen}\toverflowX=${c.overflowX}\th=${c.scrollHeight}\terrors=${c.errors.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
