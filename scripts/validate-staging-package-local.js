#!/usr/bin/env node
/*
 * Phase 3.2C-6 — validation locale du paquet Preview, depuis une copie propre d'un commit (aucun déploiement).
 *
 *   node scripts/build-staging-package.js --commit <sha> --out /tmp/lyann-clean
 *   (cd /tmp/lyann-clean/package && npm ci --omit=dev --ignore-scripts)
 *   node scripts/validate-staging-package-local.js --package /tmp/lyann-clean/package --out artifacts/phase-3-2c/package62
 *
 * 1. copie le paquet, exécute le VRAI build Vercel (scripts/build-staging-preview.js) avec la configuration Staging (clé anonyme uniquement) ;
 * 2. sert le résultat comme Vercel : fichier statique d'abord, cleanUrls, puis réécritures de vercel.staging-preview.json ;
 *    les pages passent par le VRAI api/render.js ; /v1/explorer/requests par le VRAI gestionnaire public (Staging, lecture seule) ;
 * 3. ouvre le site sous l'hôte Preview simulé (même origine pour la page et l'API, comme sur Vercel) et parcourt les écrans en visiteur.
 * Aucune écriture : GET uniquement (vérifié), aucun compte, aucune donnée créée. La clé de service reste dans ce processus et n'est jamais affichée.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadStagingEnv } = require('./preview-v32c');
const integrity = require('./lib/package-integrity');

const arg = (name, def) => { const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`) || a === `--${name}`); if (!hit) return def; return hit.includes('=') ? hit.split('=').slice(1).join('=') : process.argv[process.argv.indexOf(hit) + 1]; };
const packageDir = path.resolve(arg('package', ''));
const out = path.resolve(arg('out', 'artifacts/phase-3-2c/package62'));
// POST by construction (PostgREST RPC) but STABLE / read-only: public badges of public profiles (85_lyann_public_badges_staging.sql).
const READ_ONLY_RPC = /\/rest\/v1\/rpc\/lyann_public_badges(\?|$)/;
const FAKE_HOST = 'lyann-staging-preview-localcheck-yoyo-d85d.vercel.app';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4', '.pbf': 'application/x-protobuf', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const SENSITIVE = ['.env', '.env.staging-v2', '.git/config', '.codex/config.toml', '.momentic-mcp/config.json', '.claude/skills/x', '.agents/skills/x', '.cursor/rules', '.github/workflows/x.yml', 'work/x', 'docs/PHASE_3_2C_5_3_REPORT.md', 'tests/staging-package.test.js', 'artifacts/phase-3-2c/apply96/probe_post96.sql', 'migrations/96.sql', 'supabase/config.toml', 'scripts/deploy-staging.sh', 'scripts/vercel-target-gate.js', 'config/vercel-staging-allowlist.json', 'server.js', 'vercel.json', 'vercel.staging.json', 'CLAUDE.md', 'AGENTS.md', 'ios/App/App.xcodeproj/project.pbxproj', 'android/build.gradle', 'config/App.staging.entitlements', 'api/server_python.py', 'netlify.toml', 'momentic.config.yaml', 'node_modules/.package-lock.json'];

if (!packageDir || !fs.existsSync(path.join(packageDir, integrity.PACKAGE_INFO))) { console.error('--package doit désigner un paquet exporté (lyann-package.json absent).'); process.exit(2); }

const staging = loadStagingEnv();
const supabaseUrl = staging.LYANN_SUPABASE_URL || staging.SUPABASE_URL;
const anon = staging.LYANN_SUPABASE_ANON_KEY || staging.SUPABASE_ANON_KEY;
const info = integrity.readPackageInfo(packageDir);
const buildEnv = {
    PATH: process.env.PATH,
    VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: FAKE_HOST, VERCEL_PROJECT_NAME: 'lyann-staging-preview', VERCEL_PROJECT_ID: integrity.STAGING_PROJECT_ID,
    LYANN_VERCEL_CLI_DEPLOY: '1', LYANN_RUNTIME: 'staging',
    LYANN_SUPABASE_URL: supabaseUrl, SUPABASE_URL: supabaseUrl, LYANN_SUPABASE_ANON_KEY: anon, SUPABASE_ANON_KEY: anon,
    LYANN_SUPABASE_LOCK: integrity.STAGING_REF, LYANN_E2E_WRITE_PROJECT_REF: integrity.STAGING_REF,
    LYANN_RELEASE_SHA: info.commit
};

function prepareSite() {
    const site = path.join(out, '.site');
    fs.rmSync(site, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    // node_modules is installed by Vercel and is not part of the uploaded package.
    fs.cpSync(packageDir, site, { recursive: true, filter: (src) => path.relative(packageDir, src) !== 'node_modules' });
    const built = spawnSync(process.execPath, ['scripts/build-staging-preview.js'], { cwd: site, env: buildEnv, encoding: 'utf8' });
    const log = `${built.stdout}${built.stderr}`;
    if (built.status !== 0) { console.error(log); throw new Error('le build Preview a échoué sur la copie propre'); }
    return { site, log: log.trim().split('\n') };
}

function listen(site, config, backend) {
    const server = http.createServer();
    const handler = createServerHandler(site, config, backend);
    server.on('request', handler.onRequest);
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, served: handler.served })));
}
function createServerHandler(site, config, backend) {
    // Vercel-like routing: static file first, cleanUrls, then the rewrites of vercel.staging-preview.json.
    const served = [];
    process.chdir(site);
    Object.assign(process.env, buildEnv);
    const renderHandler = require(path.join(site, 'api', 'render.js'));
    const rules = config.rewrites.map((r) => ({ re: new RegExp(`^${r.source.replace(/\.(?!\*)/g, '\\.')}$`), destination: r.destination }));
    const sendFile = (res, file) => { res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res); };
    const onRequest = (req, res) => {
        const url = new URL(req.url, 'http://x');
        const pathname = decodeURIComponent(url.pathname);
        served.push(`${req.method} ${pathname}`);
        const file = path.join(site, pathname);
        if (!file.startsWith(site)) { res.writeHead(403); return res.end(); }
        if (pathname !== '/' && fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(res, file);
        if (pathname !== '/' && fs.existsSync(`${file}.html`)) return sendFile(res, `${file}.html`);
        for (const rule of rules) {
            if (!rule.re.test(pathname)) continue;
            const dest = new URL(rule.destination, 'http://x');
            if (dest.pathname === '/api/render') return renderHandler({ query: Object.fromEntries(dest.searchParams) }, res);
            if (dest.pathname === '/api') {
                if (pathname === '/v1/explorer/requests' && req.method === 'GET') {
                    const result = { code: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } };
                    const shim = { set: (k, v) => { result.headers[k] = v; return shim; }, status: (c) => { result.code = c; return shim; }, json: (body) => { res.writeHead(result.code, result.headers); res.end(JSON.stringify(body)); return shim; } };
                    return Promise.resolve(backend({ query: Object.fromEntries(url.searchParams) }, shim)).catch(() => { res.writeHead(503); res.end(); });
                }
                res.writeHead(503, { 'Content-Type': 'application/json' });
                return res.end('{"error":"route non servie par la validation locale"}');
            }
            const target = path.join(site, dest.pathname);
            return fs.existsSync(target) ? sendFile(res, target) : (res.writeHead(404), res.end('not found'));
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
    };
    return { onRequest, served };
}

(async () => {
    const { site, log } = prepareSite();
    const config = JSON.parse(fs.readFileSync(path.join(site, 'vercel.staging-preview.json'), 'utf8'));
    const key = staging.SUPABASE_SERVICE_ROLE_KEY || staging.LYANN_SUPABASE_SERVICE_ROLE_KEY;
    let backend = null;
    if (key) {
        const { createClient } = require(path.join(packageDir, 'node_modules', '@supabase', 'supabase-js'));
        const { createPublicRequestsHandler } = require(path.join(site, 'api', 'public-explorer-requests.js'));
        backend = createPublicRequestsHandler(createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }), true);
    }
    const { server, served } = await listen(site, config, backend);
    const local = `http://127.0.0.1:${server.address().port}`;
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const report = { package: { commit: info.commit, fileCount: info.fileCount, manifestSha256: info.manifestSha256 }, buildLog: log, backendReal: Boolean(backend), probes: {}, viewports: [], nonGet: [], readOnlyRpc: [], stagingHostRequests: [] };

    // Exposure probe: sensitive paths must be absent from the package and answer 404 (static first, then rewrites).
    const status = async (p) => new Promise((resolve) => http.get(`${local}/${p}`, (r) => { r.resume(); resolve(r.statusCode); }));
    report.probes.sensitive = {};
    for (const p of SENSITIVE) report.probes.sensitive[p] = { inPackage: fs.existsSync(path.join(site, p)), http: await status(p) };
    report.probes.allAbsent = Object.values(report.probes.sensitive).every((v) => !v.inPackage && v.http === 404);

    const SCREENS = [
        ['discover', '/', () => document.querySelector('#discoverNeeds')?.getAttribute('aria-busy') !== 'true'],
        ['lyanneurs', '/results?mode=lyanneurs', () => document.querySelector('#explorerResults')?.getAttribute('aria-busy') !== 'true'],
        ['annonces', '/results?mode=annonces', () => document.querySelector('#explorerResults')?.getAttribute('aria-busy') !== 'true']
    ];
    fs.mkdirSync(path.join(out, 'screens'), { recursive: true });
    for (const vp of [{ name: 'desktop-1440', width: 1440, height: 900, mobile: false }, { name: 'mobile-390', width: 390, height: 844, mobile: true }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.mobile, isMobile: vp.mobile });
        await ctx.addInitScript(() => { try { sessionStorage.setItem('lyann_boot_splash_seen', '1'); } catch (_) {} });
        await ctx.route(`https://${FAKE_HOST}/**`, async (route) => {
            const u = new URL(route.request().url());
            const response = await route.fetch({ url: `${local}${u.pathname}${u.search}` });
            return route.fulfill({ response });
        });
        const res = { viewport: vp.name, screens: {}, hosts: {}, failures: [], pageErrors: [], consoleErrors: [], checks: {} };
        const trackPage = (page) => {
            page.on('pageerror', (e) => res.pageErrors.push(String(e.message).slice(0, 200)));
            page.on('console', (m) => { if (m.type() === 'error') res.consoleErrors.push(m.text().slice(0, 200)); });
            page.on('request', (r) => { const h = new URL(r.url()).host; res.hosts[h] = (res.hosts[h] || 0) + 1; if (h === 'staging.lyann.app') report.stagingHostRequests.push(`${r.method()} ${r.url().split('?')[0]}`);
                if (r.method() !== 'GET' && r.method() !== 'OPTIONS' && r.method() !== 'HEAD' && /supabase\.co|vercel\.app/.test(r.url())) (READ_ONLY_RPC.test(r.url()) ? report.readOnlyRpc : report.nonGet).push(`${r.method()} ${r.url().split('?')[0]}`); });
            page.on('requestfailed', (r) => res.failures.push(`FAILED ${r.url().split('?')[0]} ${r.failure()?.errorText}`));
            page.on('response', (r) => { if (r.status() >= 400 && /vercel\.app/.test(r.url())) res.failures.push(`${r.status()} ${r.url().split('?')[0]}`); });
        };
        const open = async (name, urlPath, ready) => {
            const page = await ctx.newPage();
            trackPage(page);
            await page.goto(`https://${FAKE_HOST}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            if (ready) await page.waitForFunction(ready, null, { timeout: 30000 }).catch(() => res.failures.push(`${name}: écran non prêt`));
            await page.waitForTimeout(1500);
            return page;
        };
        for (const [name, urlPath, ready] of SCREENS) {
            const page = await open(name, urlPath, ready);
            const m = await page.evaluate(() => {
                const d = document.documentElement;
                const cfg = window.LyannRuntimeConfig;
                const binding = cfg && cfg.resolveLyannRuntimeConfig ? cfg.resolveLyannRuntimeConfig({ injectedUrl: window.LYANN_SUPABASE_URL, injectedAnon: window.LYANN_SUPABASE_ANON_KEY, lock: window.LYANN_SUPABASE_LOCK, hostname: location.hostname, isNative: false, backendOrigin: window.LYANN_BACKEND_ORIGIN }) : null;
                const blocked = cfg && cfg.resolveLyannRuntimeConfig ? cfg.resolveLyannRuntimeConfig({ injectedUrl: 'https://gzispjfoywklpqatjyop.supabase.co', injectedAnon: 'x', lock: window.LYANN_SUPABASE_LOCK, hostname: location.hostname, isNative: false }) : null;
                const missing = cfg && cfg.resolveLyannRuntimeConfig ? cfg.resolveLyannRuntimeConfig({ injectedUrl: '', injectedAnon: '', lock: window.LYANN_SUPABASE_LOCK, hostname: location.hostname, isNative: false }) : null;
                return {
                    title: document.title, h1: (document.querySelector('h1')?.innerText || '').slice(0, 80), overflowX: d.scrollWidth - d.clientWidth,
                    lock: window.LYANN_SUPABASE_LOCK, url: window.LYANN_SUPABASE_URL, backend: window.LYANN_BACKEND_ORIGIN, anonInjected: Boolean(window.LYANN_SUPABASE_ANON_KEY),
                    runtimeConfig: binding && { ok: binding.ok, code: binding.code, url: binding.url, backendOrigin: binding.backendOrigin },
                    productionRefused: blocked && blocked.code, missingRefused: missing && missing.code,
                    apiClient: typeof window.LYANN_API_CLIENT?.login,
                    cards: document.querySelectorAll('#explorerResults .explorer-card').length,
                    emptyState: (document.querySelector('#explorerResults .explorer-empty, #explorerResults .empty-state')?.innerText || '').slice(0, 80)
                };
            });
            res.screens[name] = m;
            await page.screenshot({ path: path.join(out, 'screens', `${vp.name}-${name}.png`) });
            if (name === 'lyanneurs') {
                // Search, families, Affiner sheet, visitor gate.
                await page.fill('#explorerSearchInput', 'a');
                await page.keyboard.press('Enter');
                await page.waitForFunction(() => document.querySelector('#explorerResults')?.getAttribute('aria-busy') !== 'true', null, { timeout: 20000 }).catch(() => {});
                res.checks.searchCards = await page.locator('#explorerResults .explorer-card').count();
                await page.fill('#explorerSearchInput', '');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(800);
                const families = page.locator('#explorerCategoryPills .lyann-family, #explorerCategoryPills [data-family]');
                res.checks.familyCount = await families.count();
                if (res.checks.familyCount) {
                    await families.first().click();
                    await page.waitForTimeout(1200);
                    res.checks.taxoBarVisible = await page.locator('#explorerTaxoBar').isVisible().catch(() => false);
                    const refine = page.locator('#explorerRefineBtn');
                    if (await refine.isVisible().catch(() => false)) {
                        await refine.click();
                        await page.waitForTimeout(600);
                        res.checks.refineOpen = await page.locator('#explorerRefine').isVisible();
                        if (vp.mobile) await page.screenshot({ path: path.join(out, 'screens', `${vp.name}-lyanneurs-affiner.png`) });
                        await page.locator('#explorerRefineDone').click().catch(() => {});
                        await page.waitForTimeout(400);
                        res.checks.refineClosed = !(await page.locator('#explorerRefine').isVisible());
                    }
                }
                const card = page.locator('#explorerResults .explorer-card').first();
                if (await card.count()) {
                    await card.click({ position: { x: 20, y: 20 } }).catch(() => {});
                    await page.waitForTimeout(1200);
                    res.checks.visitorGate = await page.locator('.lyann-vgate').first().isVisible().catch(() => false);
                    if (res.checks.visitorGate) await page.screenshot({ path: path.join(out, 'screens', `${vp.name}-lyanneurs-visitor-gate.png`) });
                }
            }
            await page.close();
        }
        // Map: libraries and glyphs must be fetched from the package itself, with the canvas created.
        const mapPage = await open('carte', '/results?mode=annonces&view=map', null);
        await mapPage.waitForSelector('#explorerMap .maplibregl-canvas', { timeout: 30000 }).then(() => { res.checks.mapCanvas = true; }).catch(() => { res.checks.mapCanvas = false; });
        await mapPage.waitForTimeout(4000);
        res.checks.mapLibs = await mapPage.evaluate(() => ({ leaflet: typeof window.L?.map, maplibregl: typeof window.maplibregl?.Map, bridge: typeof window.L?.maplibreGL }));
        res.checks.mapGlyphRequests = [...new Set(served.filter((s) => s.includes('/assets/maps/glyphs/')))].length;
        await mapPage.screenshot({ path: path.join(out, 'screens', `${vp.name}-carte.png`) });
        await mapPage.close();
        // Authentication: the login screen loads with the Staging binding; nothing is submitted.
        const auth = await open('bienvenue', '/bienvenue', null);
        res.checks.authScreen = await auth.evaluate(() => ({ clientReady: typeof window.LYANN_API_CLIENT?.login, lock: window.LYANN_SUPABASE_LOCK, fields: document.querySelectorAll('input[type=password]').length }));
        await auth.close();
        res.productionRequests = Object.keys(res.hosts).filter((h) => h.includes('gzispjfoywklpqatjyop') || ['lyann.app', 'www.lyann.app', 'admin.lyann.app'].includes(h));
        res.supabaseHosts = Object.keys(res.hosts).filter((h) => h.endsWith('.supabase.co'));
        report.viewports.push(res);
        await ctx.close();
    }
    await browser.close();
    server.close();
    report.mapRequestsServed = [...new Set(served.filter((s) => /\/(vendor|assets\/maps)\//.test(s)))].length;
    report.servedSample = [...new Set(served)].filter((s) => /vendor|glyphs|lyann-liberty/.test(s)).slice(0, 40);
    fs.rmSync(path.join(out, '.site'), { recursive: true, force: true });
    fs.writeFileSync(path.join(out, 'local-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
    for (const v of report.viewports) {
        console.log(`${v.viewport}: pageErrors=${v.pageErrors.length} consoleErrors=${v.consoleErrors.length} failures=${v.failures.length} supabase=${v.supabaseHosts.join(',')} production=${v.productionRequests.length}`);
        for (const [name, s] of Object.entries(v.screens)) console.log(`  ${name}: lock=${s.lock} cfg=${s.runtimeConfig && s.runtimeConfig.code} refuseProd=${s.productionRefused} refuseMissing=${s.missingRefused} overflowX=${s.overflowX} cards=${s.cards}`);
        console.log(`  checks=${JSON.stringify(v.checks)}`);
    }
    console.log(`exposition: toutes absentes=${report.probes.allAbsent}; requêtes d'écriture=${report.nonGet.length}; RPC lecture seule=${report.readOnlyRpc.length}; requêtes vers staging.lyann.app=${[...new Set(report.stagingHostRequests)].join(' | ')}`);
})().catch((error) => { console.error(error); process.exit(1); });
