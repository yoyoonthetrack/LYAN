'use strict';
// Copy reviewed, version-pinned Leaflet into the shared Web/Capacitor assets.
// Source: leaflet@1.9.4 (BSD-2-Clause) installed by npm.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function ensureLeafletAssets() {
    const pkg = require('leaflet/package.json');
    if (pkg.version !== '1.9.4') throw new Error('Leaflet must be pinned to 1.9.4');
    const source = path.join(ROOT, 'node_modules', 'leaflet');
    const dest = path.join(ROOT, 'vendor', 'leaflet');
    fs.mkdirSync(dest, { recursive: true });
    for (const [from, to] of [
        ['dist/leaflet.js', 'leaflet.js'],
        ['dist/leaflet.css', 'leaflet.css'],
        ['LICENSE', 'LICENSE']
    ]) {
        fs.copyFileSync(path.join(source, from), path.join(dest, to));
    }
    return dest;
}
module.exports = ensureLeafletAssets;
if (require.main === module) {
    console.log('Local Leaflet assets ready:', ensureLeafletAssets());
}
