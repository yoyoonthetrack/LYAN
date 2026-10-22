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
    const vectorDest = path.join(ROOT, 'vendor', 'maplibre');
    fs.mkdirSync(vectorDest, { recursive: true });
    for (const [pkgName, version, files] of [
        ['maplibre-gl', '5.6.1', [['dist/maplibre-gl.js', 'maplibre-gl.js'], ['dist/maplibre-gl.css', 'maplibre-gl.css'], ['LICENSE.txt', 'LICENSE-maplibre.txt']]],
        ['@maplibre/maplibre-gl-leaflet', '0.1.4', [['leaflet-maplibre-gl.js', 'leaflet-maplibre-gl.js'], ['LICENSE', 'LICENSE-adapter']]]
    ]) {
        const pkgRoot = path.join(ROOT, 'node_modules', pkgName);
        if (JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'))).version !== version) throw new Error(pkgName + ' must be pinned to ' + version);
        for (const [from, to] of files) fs.copyFileSync(path.join(pkgRoot, from), path.join(vectorDest, to));
    }
    return dest;
}
module.exports = ensureLeafletAssets;
if (require.main === module) {
    console.log('Local Leaflet assets ready:', ensureLeafletAssets());
}
