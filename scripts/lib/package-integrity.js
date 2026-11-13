'use strict';
// Build-time and test-time checks for the Staging Preview package (Phase 3.2C-6).
// No network, no git, no native module: it runs inside the Vercel build container.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const PREVIEW_HOST = /^lyann-staging-preview-[a-z0-9-]+-yoyo-d85d\.vercel\.app$/;
const STAGING_PROJECT_ID = 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q';
const PACKAGE_INFO = 'lyann-package.json';
const SKIP_TOP = new Set(['node_modules', '.vercel', '.git']);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function walk(root, rel = '', out = []) {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        if (!rel && SKIP_TOP.has(entry.name)) continue;
        if (entry.isDirectory()) walk(root, next, out);
        else if (entry.isFile()) out.push(next);
    }
    return out.sort();
}

/** sha256sum-style lines, sorted by path: the deterministic manifest of a package directory. */
function manifestLines(root, files) {
    return files.map((file) => `${sha256(fs.readFileSync(path.join(root, file)))}  ${file}`);
}

function manifestSha256(lines) {
    return sha256(Buffer.from(`${lines.join('\n')}\n`));
}

// Vercel writes this file from --local-config before the build. It is not part of the exported package.
const GENERATED_VERCEL_CONFIG = 'vercel.json';

/** Files of the package as it was exported (before any build step rewrites HTML). */
function packageFiles(root) {
    return walk(root).filter((file) => file !== PACKAGE_INFO && file !== GENERATED_VERCEL_CONFIG);
}

/** The generated vercel.json may only repeat the shipped Preview build, never a Production target. */
function generatedVercelConfigProblems(root) {
    const file = path.join(root, GENERATED_VERCEL_CONFIG);
    if (!fs.existsSync(file)) return [];
    let generated;
    try { generated = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return ['vercel.json illisible']; }
    const shipped = JSON.parse(fs.readFileSync(path.join(root, 'vercel.staging-preview.json'), 'utf8'));
    const problems = [];
    // Vercel keeps the routing in this file and drops build, install, ignore and output: those stay project settings.
    if (generated.buildCommand && generated.buildCommand !== shipped.buildCommand) problems.push('buildCommand différent du paquet');
    if (generated.installCommand && generated.installCommand !== shipped.installCommand) problems.push('installCommand différent du paquet');
    if (generated.outputDirectory && generated.outputDirectory !== '.') problems.push('outputDirectory inattendu');
    for (const key of ['version', 'cleanUrls', 'trailingSlash', 'rewrites', 'headers', 'functions']) {
        if (generated[key] !== undefined && JSON.stringify(generated[key]) !== JSON.stringify(shipped[key])) problems.push(`${key} différent du paquet`);
    }
    const extraKeys = Object.keys(generated).filter((key) => !Object.prototype.hasOwnProperty.call(shipped, key));
    if (extraKeys.length) problems.push(`clés inattendues : ${extraKeys.join(', ')}`);
    const blob = JSON.stringify(generated);
    if (blob.includes(PRODUCTION_REF) || blob.includes('prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM') || /lyann\.app/.test(blob) || /--prod\b/.test(blob)) {
        problems.push('marqueur Production');
    }
    return problems;
}

function readPackageInfo(root) {
    const file = path.join(root, PACKAGE_INFO);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Throws unless the directory is exactly the package that was exported from `expectedCommit`. */
function verifyPackage(root, expectedCommit) {
    const info = readPackageInfo(root);
    if (!info) throw new Error(`${PACKAGE_INFO} absent : ce dossier n'est pas un paquet exporté depuis un commit.`);
    if (!/^[0-9a-f]{40}$/.test(String(info.commit || ''))) throw new Error('SHA du paquet invalide.');
    if (expectedCommit && info.commit !== expectedCommit) {
        throw new Error(`SHA construit ${info.commit} différent du SHA annoncé ${expectedCommit}.`);
    }
    const files = packageFiles(root);
    const actual = manifestSha256(manifestLines(root, files));
    if (actual !== info.manifestSha256 || files.length !== info.fileCount) {
        throw new Error(`Contenu du paquet modifié : ${files.length} fichiers, empreinte ${actual.slice(0, 12)}…, attendu ${info.fileCount} fichiers, ${String(info.manifestSha256).slice(0, 12)}…`);
    }
    const configProblems = generatedVercelConfigProblems(root);
    if (configProblems.length) throw new Error(`vercel.json généré refusé : ${configProblems.join(', ')}`);
    return info;
}

/** Map assets (Leaflet, MapLibre, Nunito glyphs) must match config/map-assets.sha256.json exactly. */
function verifyMapAssets(root) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config', 'map-assets.sha256.json'), 'utf8'));
    const problems = [];
    for (const [file, expected] of Object.entries(manifest.files)) {
        const full = path.join(root, file);
        if (!fs.existsSync(full)) { problems.push(`absent : ${file}`); continue; }
        if (sha256(fs.readFileSync(full)) !== expected) problems.push(`empreinte différente : ${file}`);
    }
    for (const dir of manifest.directories) {
        const present = walk(root).filter((file) => file.startsWith(`${dir}/`));
        for (const file of present) if (!(file in manifest.files)) problems.push(`fichier non déclaré : ${file}`);
    }
    if (problems.length) throw new Error(`Ressources de la carte invalides :\n${problems.join('\n')}`);
    return Object.keys(manifest.files).length;
}

function jwtClaims(token) {
    try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch (_) { return {}; }
}

/** Problems that make a Staging Preview build unsafe. Empty list = consistent configuration. Never prints a value. */
function stagingPreviewEnvProblems(env) {
    const problems = [];
    const get = (...names) => names.map((n) => String(env[n] || '').trim()).filter(Boolean);
    const only = (label, values, expected) => {
        if (!values.length) { problems.push(`${label} absent`); return; }
        for (const value of values) if (value !== expected) problems.push(`${label} incohérent`);
    };
    if (env.VERCEL_ENV !== 'preview') problems.push('VERCEL_ENV doit être preview');
    if (String(env.LYANN_RUNTIME || '').toLowerCase() !== 'staging') problems.push('LYANN_RUNTIME doit être staging');
    if (env.VERCEL_PROJECT_NAME && env.VERCEL_PROJECT_NAME !== 'lyann-staging-preview') problems.push('projet Vercel inattendu');
    if (env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== STAGING_PROJECT_ID) problems.push('identifiant de projet Vercel inattendu');
    if (env.LYANN_VERCEL_CLI_DEPLOY !== '1') problems.push('LYANN_VERCEL_CLI_DEPLOY doit valoir 1 (publication par le script uniquement)');
    const host = String(env.VERCEL_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    if (!PREVIEW_HOST.test(host)) problems.push('VERCEL_URL n\'est pas une URL de la Preview isolée');

    const urls = get('LYANN_SUPABASE_URL', 'SUPABASE_URL').map((u) => u.replace(/\/$/, ''));
    only('URL Supabase', urls, `https://${STAGING_REF}.supabase.co`);
    only('verrou Supabase (LYANN_E2E_WRITE_PROJECT_REF)', get('LYANN_E2E_WRITE_PROJECT_REF'), STAGING_REF);
    const lock = get('LYANN_SUPABASE_LOCK');
    if (lock.length) only('verrou Supabase (LYANN_SUPABASE_LOCK)', lock, STAGING_REF);
    const anons = get('LYANN_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
    if (!anons.length) problems.push('clé anonyme Supabase absente');
    for (const anon of anons) {
        const claims = jwtClaims(anon);
        if (claims.role !== 'anon') problems.push('la clé injectée au navigateur n\'est pas une clé anon');
        if (claims.ref !== STAGING_REF) problems.push('clé anonyme d\'un autre projet que Staging');
    }
    for (const name of ['LYANN_SUPABASE_URL', 'SUPABASE_URL', 'LYANN_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'LYANN_STAGING_PUBLIC_ORIGIN']) {
        if (String(env[name] || '').includes(PRODUCTION_REF)) problems.push(`${name} référence la Production`);
    }
    if (/^https?:\/\/(www\.|admin\.)?lyann\.app/i.test(String(env.LYANN_STAGING_PUBLIC_ORIGIN || ''))) problems.push('origine publique de Production');
    if (/^sk_live_/.test(String(env.STRIPE_SECRET_KEY || ''))) problems.push('clé Stripe Live refusée');
    const release = String(env.LYANN_RELEASE_SHA || '');
    if (!/^[0-9a-f]{40}$/.test(release)) problems.push('LYANN_RELEASE_SHA absent ou invalide');
    return problems;
}

/** After the HTML build: every page loading api-client.js must carry the Staging lock and nothing else. */
function builtHtmlProblems(root) {
    const problems = [];
    let checked = 0;
    for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort()) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        if (html.includes(PRODUCTION_REF)) problems.push(`${file} : référence Production`);
        if (/SERVICE_ROLE_KEY/i.test(html)) problems.push(`${file} : nom de clé service_role dans une page`);
        for (const token of html.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []) {
            const claims = jwtClaims(token);
            if (claims.role && claims.role !== 'anon') problems.push(`${file} : jeton ${claims.role} dans une page`);
            if (claims.ref && claims.ref !== STAGING_REF) problems.push(`${file} : jeton d'un autre projet`);
        }
        if (!html.includes('api-client.js')) continue;
        checked += 1;
        if (!html.includes(`window.LYANN_SUPABASE_LOCK="${STAGING_REF}"`)) problems.push(`${file} : verrou Staging absent`);
        if (!html.includes(`window.LYANN_SUPABASE_URL="https://${STAGING_REF}.supabase.co"`)) problems.push(`${file} : URL Supabase Staging absente`);
        const backend = /window\.LYANN_BACKEND_ORIGIN="([^"]*)"/.exec(html);
        if (!backend || !PREVIEW_HOST.test(backend[1].replace(/^https:\/\//, ''))) problems.push(`${file} : origine API différente de la Preview`);
    }
    if (!checked) problems.push('aucune page ne charge api-client.js');
    return { problems, checked };
}

module.exports = {
    STAGING_REF,
    STAGING_PROJECT_ID,
    PRODUCTION_REF,
    PACKAGE_INFO,
    sha256,
    walk,
    manifestLines,
    manifestSha256,
    packageFiles,
    readPackageInfo,
    verifyPackage,
    generatedVercelConfigProblems,
    verifyMapAssets,
    stagingPreviewEnvProblems,
    builtHtmlProblems
};
