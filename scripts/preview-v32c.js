#!/usr/bin/env node
/*
 * Phase 3.2C — preview locale de l'interface contre Supabase STAGING (tdktfbtqceldlaeqjtow) uniquement, en LECTURE (visiteur non connecté).
 * Construit un bundle statique depuis l'arbre de travail (mêmes transformations HTML que le build mobile, clé anonyme Staging injectée),
 * puis le sert sur http://127.0.0.1:<port>. Aucun déploiement, aucun accès Production, aucune écriture.
 *
 *   node scripts/preview-v32c.js [--port=8788] [--out=artifacts/phase-3-2c/.bundle]
 *
 * Le fichier .env.staging-v2 (non versionné) fournit URL et clé ANONYME ; la clé de service n'est jamais injectée ni affichée.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
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

function serve(dir, port) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://x');
            let file = path.join(dir, decodeURIComponent(url.pathname));
            if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
            if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(port || 0, '127.0.0.1', () => resolve(server));
    });
}

module.exports = { buildBundle, serve, loadStagingEnv };

if (require.main === module) {
    const arg = (name, def) => { const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`)); return hit ? hit.split('=')[1] : def; };
    const out = path.resolve(arg('out', path.join(root, 'artifacts', 'phase-3-2c', '.bundle')));
    const info = buildBundle(out);
    serve(out, Number(arg('port', 8788))).then((s) => console.log(`Preview LYANN 3.2C (Staging, lecture) : http://127.0.0.1:${s.address().port}/discover.html  (${info.files} fichiers)`));
}
