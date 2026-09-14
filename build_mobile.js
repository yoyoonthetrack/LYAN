const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildHtml } = require('./shared-html-build');

const srcDir = __dirname;
const sharedDist = path.join(__dirname, 'www');
const iosPublic = path.join(__dirname, 'ios', 'App', 'App', 'public');
const androidPublic = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

const ROOT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp']);
const EXCLUDED_ROOT_FILES = new Set(['shared-html-build.js']);

function resetDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileBuilt(sourcePath, destinationPath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.html') {
    const html = buildHtml(fs.readFileSync(sourcePath, 'utf8'));
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
  .filter((file) => ROOT_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .filter((file) => fs.statSync(path.join(srcDir, file)).isFile());

for (const file of rootFiles) {
  copyFileBuilt(path.join(srcDir, file), path.join(sharedDist, file));
}

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
