#!/usr/bin/env node
/*
 * Phase 3.2C — preview locale de l'interface contre Supabase STAGING (tdktfbtqceldlaeqjtow) uniquement, en LECTURE (visiteur non connecté).
 * Construit un bundle statique depuis l'arbre de travail (mêmes transformations HTML que le build mobile, clé anonyme Staging injectée),
 * puis le sert sur http://127.0.0.1:<port>. Aucun déploiement, aucun accès Production, aucune écriture.
 *
 *   node scripts/preview-v32c.js [--port=8788] [--lan] [--out=artifacts/phase-3-2c/.bundle]
 *
 *   --lan : écoute aussi sur le réseau local (iPhone sur le même Wi-Fi). Sans cette option, seul 127.0.0.1 est exposé.
 *   /__preview.json : SHA servi, branche, environnement et projet Supabase (aucun secret).
 *   ?shell=native : simule la coque de l'application (barre de 5 onglets) dans Safari ; ?shell=web revient au site web.
 *
 * Le fichier .env.staging-v2 (non versionné) fournit URL et clé ANONYME ; la clé de service n'est jamais injectée ni affichée.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { assertStagingIsolation, STAGING_REF } = require('./staging-v2-guard');

const root = path.join(__dirname, '..');
const EXCLUDED = new Set(['shared-html-build.js', 'build_mobile.js', 'watch.js', 'server.js', 'playwright.config.js', 'package.json', 'package-lock.json', 'capacitor.config.json', 'vercel.json', '.mcp.json']);
const EXT = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.mp4']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

function loadStagingEnv() {
    const file = path.join(root, '.env.staging-v2');
    const env = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#') || !t.includes('=')) continue;
        const i = t.indexOf('=');
        env[t.slice(0, i)] = t.slice(i + 1).replace(/^['"]|['"]$/g, '');
    }
    assertStagingIsolation(env);
    return env;
}

function buildBundle(outDir) {
    const env = loadStagingEnv();
    // Seules l'URL et la clé anonyme Staging sont exposées au bundle (la clé de service reste dans .env.staging-v2).
    process.env.LYANN_RUNTIME = 'staging';
    process.env.LYANN_SUPABASE_URL = env.LYANN_SUPABASE_URL || env.SUPABASE_URL;
    process.env.LYANN_SUPABASE_ANON_KEY = env.LYANN_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
    process.env.LYANN_E2E_WRITE_PROJECT_REF = STAGING_REF;
    process.env.LYANN_E2E_ALLOW_WRITES = '1';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY;
    const { buildHtml, injectIsolatedSupabaseConfig } = require('../shared-html-build');
    require('./ensure-leaflet-assets')();
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(root)) {
        if (EXCLUDED.has(f) || f.startsWith('test_') || f.startsWith('scratch') || f.endsWith('.test.js')) continue;
        const src = path.join(root, f);
        if (!fs.statSync(src).isFile() || !EXT.has(path.extname(f).toLowerCase())) continue;
        if (path.extname(f) === '.html') fs.writeFileSync(path.join(outDir, f), injectIsolatedSupabaseConfig(buildHtml(fs.readFileSync(src, 'utf8'))), 'utf8');
        else fs.copyFileSync(src, path.join(outDir, f));
        n++;
    }
    for (const dir of ['vendor', 'assets']) if (fs.existsSync(path.join(root, dir))) fs.cpSync(path.join(root, dir), path.join(outDir, dir), { recursive: true });
    return { dir: outDir, files: n };
}

const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch (_) { return ''; } };

/** Identité de ce qui est servi : SHA, branche, fichiers locaux modifiés parmi ceux servis (hors fichiers sans lien avec l'interface). */
function previewInfo(dir) {
    const served = fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set();
    const dirty = git('status', '--porcelain').split('\n').map((l) => l.slice(3).trim()).filter((f) => f && served.has(f));
    return {
        sha: git('rev-parse', 'HEAD'),
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        environment: 'staging',
        supabaseProjectRef: STAGING_REF,
        production: false,
        writes: 'visiteur / comptes de test Staging uniquement',
        servedFilesModifiedSinceCommit: dirty,
        builtAt: new Date().toISOString()
    };
}

// Coque native simulée (même simulation que scripts/capture-v32c.js) : permet de voir la barre de 5 onglets dans Safari.
const NATIVE_SHELL = "<script>try{window.Capacitor={isNativePlatform:function(){return true},getPlatform:function(){return 'ios'},Plugins:{App:{addListener:function(){return Promise.resolve({remove:function(){}})}}}}}catch(e){}</script>";

function serve(dir, port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://x');
            if (url.pathname === '/__preview.json') {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                return res.end(JSON.stringify(previewInfo(dir), null, 2));
            }
            const shell = url.searchParams.get('shell');
            const cookieShell = /(?:^|;\s*)lyann_shell=(native|web)/.exec(req.headers.cookie || '');
            const wantNative = (shell || (cookieShell && cookieShell[1])) === 'native';
            let file = path.join(dir, decodeURIComponent(url.pathname));
            if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
            if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
            const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
            if (shell === 'native' || shell === 'web') headers['Set-Cookie'] = `lyann_shell=${shell}; Path=/; SameSite=Lax`;
            if (path.extname(file) === '.html' && wantNative) {
                res.writeHead(200, headers);
                return res.end(fs.readFileSync(file, 'utf8').replace(/<head[^>]*>/i, (m) => m + NATIVE_SHELL));
            }
            res.writeHead(200, headers);
            fs.createReadStream(file).pipe(res);
        });
        server.listen(port || 0, host, () => resolve(server));
    });
}

module.exports = { buildBundle, serve, loadStagingEnv, previewInfo };

if (require.main === module) {
    const arg = (name, def) => { const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`)); return hit ? hit.split('=')[1] : def; };
    const out = path.resolve(arg('out', path.join(root, 'artifacts', 'phase-3-2c', '.bundle')));
    const built = buildBundle(out);
    const lan = process.argv.includes('--lan');
    const lanIps = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    serve(out, Number(arg('port', 8788)), lan ? '0.0.0.0' : '127.0.0.1').then((s) => {
        const port = s.address().port;
        const info = previewInfo(out);
        console.log(`Preview LYANN 3.2C (Staging ${STAGING_REF}, lecture) — ${info.branch} @ ${info.sha.slice(0, 12)} — ${built.files} fichiers`);
        console.log(`  Mac    : http://127.0.0.1:${port}/discover.html`);
        if (lan) lanIps.forEach((ip) => console.log(`  iPhone : http://${ip}:${port}/discover.html?shell=native`));
        console.log(`  Identité servie : http://127.0.0.1:${port}/__preview.json`);
    });
}
