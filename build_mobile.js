const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
process.env.LYANN_MOBILE_BUILD = '1';
process.env.LYANN_NATIVE_BUILD_AT = new Date().toISOString();
process.env.LYANN_NATIVE_BUILD_ID = process.env.LYANN_NATIVE_BUILD_ID
  || ('ios-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'));
const { buildHtml, injectIsolatedSupabaseConfig, resolveInjectedBackendOrigin, nativeBuildIdentity, assertRecipeNativeBundle } = require('./shared-html-build');
try {
  process.env.LYANN_NATIVE_GIT_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();
} catch (_) {
  process.env.LYANN_NATIVE_GIT_SHA = '';
}
if (!process.env.LYANN_APP_VERSION) {
  try {
    const gradle = fs.readFileSync(path.join(__dirname, 'android', 'app', 'build.gradle'), 'utf8');
    const match = gradle.match(/versionName\s+"([^"]+)"/);
    process.env.LYANN_APP_VERSION = match ? match[1] : '1.0';
  } catch (_) {
    process.env.LYANN_APP_VERSION = '1.0';
  }
}
require('./scripts/ensure-leaflet-assets')();

const srcDir = __dirname;
const sharedDist = path.join(__dirname, 'www');
const iosPublic = path.join(__dirname, 'ios', 'App', 'App', 'public');
const androidPublic = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

const ROOT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.mp4']);
// Never ship tooling, secrets-adjacent configs, harnesses or local tests into www/iOS public.
const EXCLUDED_ROOT_FILES = new Set([
  'shared-html-build.js',
  'build_mobile.js',
  'watch.js',
  'server.js',
  'playwright.config.js',
  'package.json',
  'package-lock.json',
  'capacitor.config.json',
  'vercel.json',
  '.mcp.json',
  'test_audit_parity.js',
  'test_invitation_flow_full.js',
  'test_load.js'
]);
const EXCLUDED_ROOT_PREFIXES = ['test_', 'scratch'];

function resetDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileBuilt(sourcePath, destinationPath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.html') {
    const html = injectIsolatedSupabaseConfig(buildHtml(fs.readFileSync(sourcePath, 'utf8')));
    fs.writeFileSync(destinationPath, html, 'utf8');
  } else {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function copyDirectoryExact(sourceDir, destinationDir) {
  resetDir(destinationDir);
  fs.cpSync(sourceDir, destinationDir, { recursive: true, force: true });
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFilesRecursive(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(full, base) : [path.relative(base, full)];
  }).sort();
}

function assertExactArtifact(sourceDir, destinationDir, label) {
  const sourceFiles = listFilesRecursive(sourceDir);
  const destinationFiles = listFilesRecursive(destinationDir);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(destinationFiles)) {
    throw new Error(`${label} artifact file list differs from shared www artifact`);
  }
  for (const relative of sourceFiles) {
    const sourceHash = hashFile(path.join(sourceDir, relative));
    const destinationHash = hashFile(path.join(destinationDir, relative));
    if (sourceHash !== destinationHash) {
      throw new Error(`${label} artifact differs from shared www artifact: ${relative}`);
    }
  }
}

resetDir(sharedDist);

const rootFiles = fs.readdirSync(srcDir)
  .filter((file) => !EXCLUDED_ROOT_FILES.has(file))
  .filter((file) => !EXCLUDED_ROOT_PREFIXES.some((prefix) => file.startsWith(prefix)))
  .filter((file) => !file.endsWith('.test.js'))
  .filter((file) => ROOT_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .filter((file) => fs.statSync(path.join(srcDir, file)).isFile());

for (const file of rootFiles) {
  copyFileBuilt(path.join(srcDir, file), path.join(sharedDist, file));
}

for (const dir of ['vendor', 'assets']) {
  const source = path.join(srcDir, dir);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(sharedDist, dir), { recursive: true, force: true });
}

function bundleDigest(dir) {
  const hash = crypto.createHash('sha256');
  for (const relative of listFilesRecursive(dir)) {
    if (relative === 'lyann-native-build.json') continue;
    hash.update(relative);
    hash.update('\0');
    hash.update(hashFile(path.join(dir, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const identity = nativeBuildIdentity();
const stamp = {
  ...identity,
  bundle: bundleDigest(sharedDist),
  lock: identity.supabase
};
fs.writeFileSync(path.join(sharedDist, 'lyann-native-build.json'), JSON.stringify(stamp) + '\n');
assertRecipeNativeBundle(stamp, fs.readFileSync(path.join(sharedDist, 'feed.html'), 'utf8'));
console.log('LYANN native build stamp', stamp.id, (stamp.sha || '').slice(0, 12), (stamp.bundle || '').slice(0, 12), 'backend=' + (stamp.backend || '(empty)'));

// Capacitor consumes the exact shared artifact. No iOS/Android-specific HTML or JS mutation is allowed here.
if (fs.existsSync(path.dirname(iosPublic))) {
  copyDirectoryExact(sharedDist, iosPublic);
  assertExactArtifact(sharedDist, iosPublic, 'iOS');
}

if (fs.existsSync(path.dirname(androidPublic))) {
  copyDirectoryExact(sharedDist, androidPublic);
  assertExactArtifact(sharedDist, androidPublic, 'Android');
}

console.log(`Shared frontend artifact built: ${rootFiles.length} root assets -> www/`);
console.log('Capacitor bundles are byte-identical to the shared www artifact.');
