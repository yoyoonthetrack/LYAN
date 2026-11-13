'use strict';

// Phase 3.2C-6: the Staging Preview is built from a COMMIT, not from the working tree.
// These tests export HEAD with git archive (a clean copy), build the package and run the Preview build on it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const integrity = require('../scripts/lib/package-integrity');
const { buildPackage, loadRules } = require('../scripts/lib/staging-package');

const repo = path.join(__dirname, '..');
const STAGING = integrity.STAGING_REF;
const jwt = (claims) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${'x'.repeat(24)}`;
const ANON = jwt({ iss: 'supabase', ref: STAGING, role: 'anon' });
const SERVICE = jwt({ iss: 'supabase', ref: STAGING, role: 'service_role' });

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lyann-package-test-'));
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
const built = buildPackage({ repo, commit, outDir: path.join(work, 'one') });
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

function previewEnv(extra = {}) {
    return {
        PATH: process.env.PATH,
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'lyann-staging-preview-abc123-yoyo-d85d.vercel.app',
        VERCEL_PROJECT_NAME: 'lyann-staging-preview',
        VERCEL_PROJECT_ID: integrity.STAGING_PROJECT_ID,
        LYANN_VERCEL_CLI_DEPLOY: '1',
        LYANN_RUNTIME: 'staging',
        LYANN_SUPABASE_URL: `https://${STAGING}.supabase.co`,
        SUPABASE_URL: `https://${STAGING}.supabase.co`,
        LYANN_SUPABASE_ANON_KEY: ANON,
        SUPABASE_ANON_KEY: ANON,
        LYANN_SUPABASE_LOCK: STAGING,
        LYANN_E2E_WRITE_PROJECT_REF: STAGING,
        LYANN_STAGING_PUBLIC_ORIGIN: 'https://staging.lyann.app',
        LYANN_RELEASE_SHA: commit,
        ...extra
    };
}

function runBuild(env, mutate) {
    const dir = fs.mkdtempSync(path.join(work, 'build-'));
    fs.cpSync(built.packageDir, dir, { recursive: true });
    if (mutate) mutate(dir);
    const run = spawnSync(process.execPath, ['scripts/build-staging-preview.js'], { cwd: dir, env, encoding: 'utf8' });
    return { dir, run, output: `${run.stdout}${run.stderr}` };
}

test('the package is exported from the commit and its contents are consistent', () => {
    assert.equal(built.commit, commit);
    assert.match(built.manifestSha256, /^[0-9a-f]{64}$/);
    assert.ok(built.fileCount > 300 && built.fileCount < 520, `unexpected size ${built.fileCount}`);
    assert.equal(integrity.verifyPackage(built.packageDir, commit).commit, commit);
});

test('the package is deterministic: same commit, same manifest', () => {
    const again = buildPackage({ repo, commit, outDir: path.join(work, 'two') });
    assert.equal(again.manifestSha256, built.manifestSha256);
    assert.deepEqual(again.selected, built.selected);
});

test('required resources are present, forbidden and internal files are absent', () => {
    const rules = loadRules(repo);
    const files = new Set(built.selected);
    for (const file of rules.requiredResources) assert.ok(files.has(file), `missing ${file}`);
    const forbidden = rules.forbiddenPatterns.map((p) => new RegExp(p));
    for (const file of files) assert.ok(!forbidden.some((re) => re.test(file)), `forbidden ${file}`);
    for (const file of [...files, integrity.PACKAGE_INFO]) {
        assert.doesNotMatch(file, /^(\.codex|\.momentic-mcp|work|docs|tests|artifacts|ios|android|supabase|migrations)\//, file);
    }
    for (const file of ['vercel.json', 'vercel.staging.json', 'server.js', 'config/vercel-staging-allowlist.json', 'api/server_python.py', 'scratch']) {
        assert.ok(!files.has(file), `${file} must not be uploaded`);
    }
    assert.deepEqual([...files].filter((f) => f.startsWith('scripts/')).sort(), ['scripts/build-staging-preview.js', 'scripts/lib/package-integrity.js', 'scripts/staging-v2-guard.js']);
});

test('map libraries and glyphs are tracked by Git and match their pinned hashes', () => {
    assert.equal(integrity.verifyMapAssets(built.packageDir), 28);
    const tracked = spawnSync('git', ['ls-files', 'vendor/leaflet', 'vendor/maplibre', 'assets/maps/glyphs'], { cwd: repo, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    assert.equal(tracked.filter((f) => f.endsWith('.pbf')).length, 18);
    for (const file of ['vendor/leaflet/leaflet.js', 'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/leaflet-maplibre-gl.js', 'assets/maps/glyphs/.nunito-glyphs-manifest.json']) assert.ok(tracked.includes(file), file);
    const ignored = spawnSync('git', ['check-ignore', 'vendor/leaflet/leaflet.js', 'assets/maps/glyphs/Nunito Sans Bold/0-255.pbf', 'package-lock.json'], { cwd: repo, encoding: 'utf8' });
    assert.equal(ignored.status, 1, 'map assets and the lockfile must not be git-ignored');
});

test('map assets still equal the files generated from the pinned npm packages', { skip: !fs.existsSync(path.join(repo, 'node_modules', 'leaflet')) && 'node_modules not installed' }, () => {
    const pairs = [
        ['leaflet/dist/leaflet.js', 'vendor/leaflet/leaflet.js'],
        ['leaflet/dist/leaflet.css', 'vendor/leaflet/leaflet.css'],
        ['maplibre-gl/dist/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.js'],
        ['maplibre-gl/dist/maplibre-gl.css', 'vendor/maplibre/maplibre-gl.css'],
        ['@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js', 'vendor/maplibre/leaflet-maplibre-gl.js']
    ];
    for (const [from, to] of pairs) {
        assert.equal(integrity.sha256(fs.readFileSync(path.join(repo, 'node_modules', from))), integrity.sha256(fs.readFileSync(path.join(built.packageDir, to))), to);
    }
});

test('the lockfile is tracked and in sync with package.json', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(built.packageDir, 'package-lock.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(built.packageDir, 'package.json'), 'utf8'));
    assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
    assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
    for (const [name, range] of Object.entries({ leaflet: '1.9.4', 'maplibre-gl': '5.6.1', '@maplibre/maplibre-gl-leaflet': '0.1.4' })) {
        assert.equal(pkg.dependencies[name], range);
        assert.equal(lock.packages[`node_modules/${name}`].version, range);
    }
});

test('no secret, private key or privileged token is inside the package', () => {
    const bad = /(sk_live_[A-Za-z0-9]{12,}|sk_test_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sbp_[a-f0-9]{20,})/;
    for (const file of built.selected) {
        if (/\.(png|jpe?g|webp|gif|mp4|ico|woff2?|pbf)$/.test(file)) continue;
        const text = fs.readFileSync(path.join(built.packageDir, file), 'utf8');
        assert.doesNotMatch(text, bad, file);
        for (const token of text.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []) {
            const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
            assert.equal(claims.role, 'anon', `${file} embeds a ${claims.role} token`);
        }
    }
});

test('vercel.staging-preview.json only differs from vercel.staging.json by its build steps', () => {
    const stable = JSON.parse(fs.readFileSync(path.join(repo, 'vercel.staging.json'), 'utf8'));
    const preview = JSON.parse(fs.readFileSync(path.join(repo, 'vercel.staging-preview.json'), 'utf8'));
    const differing = [...new Set([...Object.keys(stable), ...Object.keys(preview)])].filter((k) => JSON.stringify(stable[k]) !== JSON.stringify(preview[k])).sort();
    assert.deepEqual(differing, ['buildCommand', 'ignoreCommand', 'installCommand']);
    assert.equal(stable.buildCommand, 'node scripts/build-web.js', 'the stable Staging deploy must keep its build');
    assert.equal(preview.buildCommand, 'node scripts/build-staging-preview.js');
    assert.equal(preview.installCommand, 'npm ci --omit=dev --ignore-scripts');
    assert.equal(spawnSync('sh', ['-c', preview.ignoreCommand], { env: { PATH: process.env.PATH } }).status, 0, 'without LYANN_VERCEL_CLI_DEPLOY a build must be skipped');
    assert.equal(spawnSync('sh', ['-c', preview.ignoreCommand], { env: { PATH: process.env.PATH, LYANN_VERCEL_CLI_DEPLOY: '1' } }).status, 1, 'a scripted deploy must build');
    const production = JSON.parse(fs.readFileSync(path.join(repo, 'vercel.json'), 'utf8'));
    assert.equal(production.buildCommand, 'node scripts/build-web.js', 'Production build is untouched');
});

test('Preview build succeeds on a clean package and locks every page on Supabase Staging', () => {
    const { run, output, dir } = runBuild(previewEnv());
    assert.equal(run.status, 0, output);
    assert.match(output, /paquet [0-9a-f]{40}/);
    assert.match(output, /28 ressources de carte vérifiées/);
    const locked = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && fs.readFileSync(path.join(dir, f), 'utf8').includes('api-client.js'));
    assert.ok(locked.length >= 5 && locked.includes('discover.html'), locked.join(','));
    for (const page of locked) {
        const html = fs.readFileSync(path.join(dir, page), 'utf8');
        assert.ok(html.includes(`window.LYANN_SUPABASE_LOCK="${STAGING}"`), page);
        assert.ok(html.includes('window.LYANN_BACKEND_ORIGIN="https://lyann-staging-preview-abc123-yoyo-d85d.vercel.app"'), page);
        assert.ok(!html.includes(integrity.PRODUCTION_REF), page);
        assert.doesNotMatch(html, new RegExp(SERVICE.split('.')[1]));
    }
    assert.equal(integrity.builtHtmlProblems(dir).problems.length, 0);
    assert.doesNotMatch(output, new RegExp(ANON.split('.')[1]));
});

for (const [name, extra, expected] of [
    ['missing Staging URL', { LYANN_SUPABASE_URL: '', SUPABASE_URL: '' }, /URL Supabase absent/],
    ['missing anon key', { LYANN_SUPABASE_ANON_KEY: '', SUPABASE_ANON_KEY: '' }, /clé anonyme Supabase absente/],
    ['Production URL', { LYANN_SUPABASE_URL: `https://${integrity.PRODUCTION_REF}.supabase.co` }, /URL Supabase incohérent|référence la Production/],
    ['service_role key in the browser variable', { LYANN_SUPABASE_ANON_KEY: SERVICE }, /n'est pas une clé anon/],
    ['anon key of another project', { LYANN_SUPABASE_ANON_KEY: jwt({ ref: integrity.PRODUCTION_REF, role: 'anon' }), SUPABASE_ANON_KEY: jwt({ ref: integrity.PRODUCTION_REF, role: 'anon' }) }, /autre projet/],
    ['missing lock', { LYANN_E2E_WRITE_PROJECT_REF: '' }, /verrou Supabase \(LYANN_E2E_WRITE_PROJECT_REF\) absent/],
    ['inconsistent lock', { LYANN_SUPABASE_LOCK: integrity.PRODUCTION_REF }, /verrou Supabase \(LYANN_SUPABASE_LOCK\) incohérent/],
    ['not a Preview environment', { VERCEL_ENV: 'production' }, /VERCEL_ENV doit être preview/],
    ['not the staging runtime', { LYANN_RUNTIME: '' }, /LYANN_RUNTIME doit être staging/],
    ['foreign Vercel project', { VERCEL_PROJECT_ID: 'prj_other' }, /identifiant de projet Vercel inattendu/],
    ['live Stripe key', { STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(24)}` }, /Stripe Live/],
    ['announced SHA is not the built SHA', { LYANN_RELEASE_SHA: 'a'.repeat(40) }, /différent du SHA annoncé/],
    ['no release SHA', { LYANN_RELEASE_SHA: '' }, /LYANN_RELEASE_SHA absent/]
]) {
    test(`Preview build refuses: ${name}`, () => {
        const { run, output } = runBuild(previewEnv(extra));
        assert.equal(run.status, 1, output);
        assert.match(output, /REFUS/);
        assert.match(output, expected);
        assert.doesNotMatch(output, new RegExp(`${SERVICE.split('.')[1]}|sk_live_a{10}`), 'no secret may be printed');
    });
}

test('Preview build refuses a package that was altered after export', () => {
    const extra = runBuild(previewEnv(), (dir) => fs.writeFileSync(path.join(dir, 'unexpected-file.js'), '// not in the manifest\n'));
    assert.equal(extra.run.status, 1, extra.output);
    assert.match(extra.output, /Contenu du paquet modifié/);
    const edited = runBuild(previewEnv(), (dir) => fs.appendFileSync(path.join(dir, 'discover.html'), '\n<!-- edited -->\n'));
    assert.equal(edited.run.status, 1, edited.output);
    assert.match(edited.output, /Contenu du paquet modifié/);
});

test('Preview build refuses a corrupted or missing map asset', () => {
    // The package hash is rewritten so that only the map manifest can catch the problem.
    const tamper = (mutate) => runBuild(previewEnv(), (dir) => {
        mutate(dir);
        const info = JSON.parse(fs.readFileSync(path.join(dir, integrity.PACKAGE_INFO), 'utf8'));
        const files = integrity.packageFiles(dir);
        info.fileCount = files.length;
        info.manifestSha256 = integrity.manifestSha256(integrity.manifestLines(dir, files));
        fs.writeFileSync(path.join(dir, integrity.PACKAGE_INFO), JSON.stringify(info));
    });
    const missing = tamper((dir) => fs.rmSync(path.join(dir, 'assets/maps/glyphs/Nunito Sans Bold/0-255.pbf')));
    assert.equal(missing.run.status, 1, missing.output);
    assert.match(missing.output, /Ressources de la carte invalides[\s\S]*absent : assets\/maps\/glyphs\/Nunito Sans Bold\/0-255\.pbf/);
    const corrupted = tamper((dir) => fs.appendFileSync(path.join(dir, 'vendor/maplibre/maplibre-gl.js'), '\n/* tampered */\n'));
    assert.equal(corrupted.run.status, 1, corrupted.output);
    assert.match(corrupted.output, /empreinte différente : vendor\/maplibre\/maplibre-gl\.js/);
});

test('the deploy script builds its package from a commit and stays isolated', () => {
    const text = fs.readFileSync(path.join(repo, 'scripts', 'deploy-staging-preview.sh'), 'utf8').replace(/^\s*#.*$/gm, '');
    assert.match(text, /scripts\/build-staging-package\.js --commit/);
    assert.match(text, /--local-config vercel\.staging-preview\.json/);
    assert.match(text, /--meta lyannReleaseSha=/);
    assert.match(text, /cd "\$PACKAGE_DIR"/);
    assert.doesNotMatch(text, /--prod\b|--environment\s+production|\bvercel\s+(alias|promote|rollback|domains|env\s+(add|rm|remove))\b/);
    assert.doesNotMatch(text, /gzispjfoywklpqatjyop|\blyan\b(?!n)/);
});

test('Preview env check accepts only a consistent Staging configuration', () => {
    assert.deepEqual(integrity.stagingPreviewEnvProblems(previewEnv()), []);
    assert.ok(integrity.stagingPreviewEnvProblems({}).length >= 8);
});

test('a vercel.json written by the platform is ignored when it repeats the Preview build', () => {
    const dir = fs.mkdtempSync(path.join(work, 'vercel-json-'));
    fs.cpSync(built.packageDir, dir, { recursive: true });
    fs.copyFileSync(path.join(dir, 'vercel.staging-preview.json'), path.join(dir, 'vercel.json'));
    assert.equal(integrity.verifyPackage(dir, commit).commit, commit);
    const platform = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.staging-preview.json'), 'utf8'));
    for (const key of ['buildCommand', 'installCommand', 'ignoreCommand', 'outputDirectory', 'crons']) delete platform[key];
    fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify(platform));
    assert.equal(integrity.verifyPackage(dir, commit).commit, commit);
    const generated = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8'));
    generated.buildCommand = 'node scripts/build-web.js';
    fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify(generated));
    assert.throws(() => integrity.verifyPackage(dir, commit), /vercel\.json généré refusé/);
    generated.buildCommand = 'node scripts/build-staging-preview.js';
    generated.routes = [{ dest: 'https://gzispjfoywklpqatjyop.supabase.co' }];
    fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify(generated));
    assert.throws(() => integrity.verifyPackage(dir, commit), /marqueur Production/);
});
