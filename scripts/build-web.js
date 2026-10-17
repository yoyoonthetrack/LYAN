#!/usr/bin/env node
// Vercel build step: static HTML is served before rewrites, so pages must ship
// already built. Rewrites the root pages in place inside the build container.
const fs = require('fs');
const path = require('path');
const { buildHtmlFile } = require('../shared-html-build');

const root = path.resolve(__dirname, '..');
if (!process.env.VERCEL && !process.argv.includes('--force')) {
  console.error('build-web rewrites HTML in place; run it on Vercel or pass --force in a scratch copy.');
  process.exit(1);
}

if (String(process.env.LYANN_RUNTIME || '').toLowerCase() === 'staging') {
  const source = path.join(root, 'config', 'apple-app-site-association.staging.json');
  const target = path.join(root, '.well-known', 'apple-app-site-association');
  fs.copyFileSync(source, target);
  console.log('build-web: AASA Staging');
}

const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
for (const page of pages) {
  buildHtmlFile(path.join(root, page));
}
console.log(`build-web: ${pages.length} pages built`);
