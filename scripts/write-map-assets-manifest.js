#!/usr/bin/env node
// Regenerates config/map-assets.sha256.json from the tracked map assets, after checking them against the pinned
// npm packages (Leaflet 1.9.4, MapLibre GL 5.6.1, adapter 0.1.4). Glyphs are verified by scripts/ensure-nunito-map-glyphs.js
// (pinned Google Fonts commit, SHA-256 of each TTF). Run it only when a pinned version changes.
'use strict';
const fs = require('fs');
const path = require('path');
const { sha256, walk } = require('./lib/package-integrity');

const root = path.resolve(__dirname, '..');
const DIRECTORIES = ['vendor/leaflet', 'vendor/maplibre', 'assets/maps/glyphs'];
const PINNED = [
    ['node_modules/leaflet/dist/leaflet.js', 'vendor/leaflet/leaflet.js'],
    ['node_modules/leaflet/dist/leaflet.css', 'vendor/leaflet/leaflet.css'],
    ['node_modules/leaflet/LICENSE', 'vendor/leaflet/LICENSE'],
    ['node_modules/maplibre-gl/dist/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.js'],
    ['node_modules/maplibre-gl/dist/maplibre-gl.css', 'vendor/maplibre/maplibre-gl.css'],
    ['node_modules/maplibre-gl/LICENSE.txt', 'vendor/maplibre/LICENSE-maplibre.txt'],
    ['node_modules/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js', 'vendor/maplibre/leaflet-maplibre-gl.js'],
    ['node_modules/@maplibre/maplibre-gl-leaflet/LICENSE', 'vendor/maplibre/LICENSE-adapter']
];
const read = (file) => fs.readFileSync(path.join(root, file));
for (const [from, to] of PINNED) {
    if (sha256(read(from)) !== sha256(read(to))) throw new Error(`${to} differs from the pinned package file ${from}`);
}
const files = {};
for (const file of walk(root).filter((f) => DIRECTORIES.some((d) => f.startsWith(`${d}/`)))) files[file] = sha256(read(file));
const manifest = {
    schema: 1,
    description: 'SHA-256 of the tracked map assets. Verified by every Staging Preview build (scripts/build-staging-preview.js) and by tests.',
    pinned: { leaflet: '1.9.4', 'maplibre-gl': '5.6.1', '@maplibre/maplibre-gl-leaflet': '0.1.4', glyphSource: '058bd7a2f33d6ad5ef1df985b3db403622016a8c' },
    directories: DIRECTORIES,
    files
};
fs.writeFileSync(path.join(root, 'config', 'map-assets.sha256.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`config/map-assets.sha256.json : ${Object.keys(files).length} fichiers`);
