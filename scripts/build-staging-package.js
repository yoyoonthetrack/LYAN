#!/usr/bin/env node
// Exports the Staging Preview package from a Git commit (never from the working tree).
//   node scripts/build-staging-package.js [--commit <sha|HEAD>] [--out <dir>]
// Prints a JSON summary. Deploys nothing, touches no Vercel project.
'use strict';
const path = require('path');
const os = require('os');
const { buildPackage } = require('./lib/staging-package');

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const repo = path.resolve(__dirname, '..');
const outDir = path.resolve(option('--out', path.join(os.tmpdir(), 'lyann-staging-preview-package')));
try {
    const result = buildPackage({ repo, commit: option('--commit', 'HEAD'), outDir });
    console.log(JSON.stringify({
        commit: result.commit,
        fileCount: result.fileCount,
        manifestSha256: result.manifestSha256,
        packageDir: result.packageDir,
        evidenceDir: result.evidenceDir,
        excludedFromCommit: result.exclusions
    }, null, 2));
} catch (error) {
    console.error(`build-staging-package: REFUS : ${error.message}`);
    process.exit(1);
}
