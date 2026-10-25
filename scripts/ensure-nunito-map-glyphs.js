'use strict';
// LYANN's MapLibre typography is self-hosted in the Web and Capacitor
// bundles. Font source TTFs are fetched at build time, SHA256-verified,
// transformed in memory to PBF SDF glyphs, then discarded.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const fontnik = require('fontnik');
const OUTPUT = path.resolve(__dirname, '../assets/maps/glyphs');
const COMMIT = '058bd7a2f33d6ad5ef1df985b3db403622016a8c';
const FONTS = Object.freeze({
    'Nunito Sans Regular': {
        ttf: 'NunitoSans-Regular.ttf',
        sha256: 'cfc5795f8333c94332ec2d2634056a9a7637484f89fa0f6f7d1a4efcfdfb0efa'
    },
    'Nunito Sans Bold': {
        ttf: 'NunitoSans-Bold.ttf',
        sha256: '9e031fc8f55dbc6ba253dae593f434dc52e1c0a838b4b66cd226cc6ca3463ebc'
    },
    'Nunito Sans Italic': {
        ttf: 'NunitoSans-Italic.ttf',
        sha256: '286224b8f8680a086515df5c963f57d673a984cf1ffe6233254e2756370754c5'
    }
});
const RANGES = Array.from({ length: 6 }, (_, i) => [i * 256, i * 256 + 255]);
const VERSION = JSON.stringify({ source: COMMIT, generator: 'fontnik@0.7.7', ranges: RANGES, faces: FONTS });
const MANIFEST = path.join(OUTPUT, '.nunito-glyphs-manifest.json');
const fileName = (start, end) => start + '-' + end + '.pbf';

function download(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 25000, headers: { 'User-Agent': 'LYANN-map-glyph-build/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume(); reject(new Error('Nunito font download failed: HTTP ' + res.statusCode)); return;
            }
            const chunks = [];
            let size = 0;
            res.on('data', (chunk) => {
                size += chunk.length;
                if (size > 1024 * 1024) {
                    req.destroy(new Error('Unexpectedly large Nunito font'));
                } else chunks.push(chunk);
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error('Nunito font download timeout')));
        req.on('error', reject);
    });
}
function renderRange(font, start, end) {
    return new Promise((resolve, reject) =>
        fontnik.range({ font, start, end }, (err, data) => err ? reject(err) : resolve(data)));
}
function complete() {
    if (!fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, 'utf8') !== VERSION) return false;
    return Object.keys(FONTS).every((face) =>
        RANGES.every(([a, b]) => {
            const name = path.join(OUTPUT, face, fileName(a, b));
            return fs.existsSync(name) && fs.statSync(name).size > 100;
        }));
}
async function main() {
    fs.mkdirSync(OUTPUT, { recursive: true });
    if (!fs.existsSync(path.join(OUTPUT, 'OFL-NunitoSans.txt'))) {
        throw new Error('Nunito Sans OFL license missing; refusing to package glyphs');
    }
    if (complete()) { console.log('LYANN Nunito map glyphs cached.'); return; }
    for (const [face, info] of Object.entries(FONTS)) {
        const url = 'https://raw.githubusercontent.com/googlefonts/NunitoSans/' +
            COMMIT + '/fonts/ttf/' + info.ttf;
        const source = await download(url);
        const checksum = crypto.createHash('sha256').update(source).digest('hex');
        if (checksum !== info.sha256) {
            throw new Error('Nunito Sans font checksum mismatch for ' + face);
        }
        const dir = path.join(OUTPUT, face);
        fs.mkdirSync(dir, { recursive: true });
        for (const [a, b] of RANGES) {
            const buf = await renderRange(source, a, b);
            if (!Buffer.isBuffer(buf) || buf.byteLength < 100) {
                throw new Error('Invalid MapLibre glyph range: ' + face + ' ' + a + '-' + b);
            }
            fs.writeFileSync(path.join(dir, fileName(a, b)), buf);
        }
    }
    // The manifest is written LAST so interrupted builds will retry generation.
    fs.writeFileSync(MANIFEST, VERSION);
    console.log('LYANN: generated ' + Object.keys(FONTS).length * RANGES.length +
        ' validated SDF PBF glyph ranges for Web + iOS + Android.');
}
if (require.main === module) main().catch((err) => {
    console.error(err.message); process.exitCode = 1;
});
module.exports = { main };
