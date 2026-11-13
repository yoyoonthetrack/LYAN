#!/usr/bin/env node
// Vercel build step of the isolated Staging Preview ONLY (vercel.staging-preview.json -> lyann-staging-preview; the config of the stable Staging deploy is untouched).
// Production keeps scripts/build-web.js. This build never downloads anything and never calls fontnik:
// map assets are tracked in Git and verified against config/map-assets.sha256.json.
//
// Order matters: verify the package BEFORE the HTML is rewritten in place.
//   1. environment is a Staging Preview and consistent (fails loudly, prints no value)
//   2. the directory is exactly the package exported from the announced commit (LYANN_RELEASE_SHA)
//   3. map assets match their pinned hashes
//   4. HTML build, then every page is re-checked (Staging lock present, no Production reference, no service_role)
const fs = require('fs');
const path = require('path');
const integrity = require('./lib/package-integrity');

const root = path.resolve(__dirname, '..');
const fail = (message) => { console.error(`build-staging-preview: REFUS : ${message}`); process.exit(1); };

if (!process.env.VERCEL) fail('ce build ne tourne que sur Vercel (VERCEL=1).');

const envProblems = integrity.stagingPreviewEnvProblems(process.env);
if (envProblems.length) fail(`configuration Staging incohérente :\n  - ${envProblems.join('\n  - ')}`);

let info;
try {
    info = integrity.verifyPackage(root, process.env.LYANN_RELEASE_SHA);
} catch (error) {
    fail(error.message);
}
console.log(`build-staging-preview: paquet ${info.commit} (${info.fileCount} fichiers, empreinte ${info.manifestSha256.slice(0, 12)}…)`);

try {
    console.log(`build-staging-preview: ${integrity.verifyMapAssets(root)} ressources de carte vérifiées`);
} catch (error) {
    fail(error.message);
}

const { buildHtmlFile } = require('../shared-html-build');
const source = path.join(root, 'config', 'apple-app-site-association.staging.json');
fs.mkdirSync(path.join(root, '.well-known'), { recursive: true });
fs.copyFileSync(source, path.join(root, '.well-known', 'apple-app-site-association'));

const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
for (const page of pages) buildHtmlFile(path.join(root, page));

const built = integrity.builtHtmlProblems(root);
if (built.problems.length) fail(`pages construites invalides :\n  - ${built.problems.join('\n  - ')}`);
console.log(`build-staging-preview: ${pages.length} pages construites, ${built.checked} verrouillées sur Supabase ${integrity.STAGING_REF}`);
