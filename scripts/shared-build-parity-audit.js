const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const render = fs.readFileSync(path.join(root, 'api', 'render.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'build_mobile.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'shared-html-build.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`SHARED BUILD PARITY: FAIL — ${message}`);
    process.exit(1);
  }
}

assert(render.includes("require('../shared-html-build')"), 'Web renderer must use shared-html-build.js');
assert(mobile.includes("require('./shared-html-build')"), 'Capacitor builder must use shared-html-build.js');
assert(!/function\s+sanitizeStaticHtml\s*\(/.test(render), 'Web renderer must not own a private sanitizer');
assert(!/function\s+sanitizeStaticHtml\s*\(/.test(mobile), 'Capacitor builder must not own a private sanitizer');
assert(mobile.includes('copyDirectoryExact(sharedDist, iosPublic)'), 'iOS must consume the generated shared artifact');
assert(mobile.includes('assertExactArtifact(sharedDist, iosPublic'), 'iOS artifact parity must be verified');
assert(mobile.includes('copyDirectoryExact(sharedDist, androidPublic)'), 'Android must consume the generated shared artifact');
assert(shared.includes('function buildHtml('), 'Shared HTML builder must expose the canonical HTML build');

console.log('SHARED BUILD PARITY: PASS');
