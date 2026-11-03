'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const staging = JSON.parse(fs.readFileSync('vercel.staging.json', 'utf8'));
const server = fs.readFileSync('api/server.js', 'utf8');
const render = fs.readFileSync('api/render.js', 'utf8');
const router = fs.readFileSync('app-router.js', 'utf8');
const shell = fs.readFileSync('app-shell.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const bienvenue = fs.readFileSync('bienvenue.html', 'utf8');

function rewriteDest(config, source) {
  const row = (config.rewrites || []).find((entry) => entry.source === source);
  return row && row.destination;
}

for (const config of [vercel, staging]) {
  assert.equal(rewriteDest(config, '/'), '/api/render?file=discover.html');
  assert.equal(rewriteDest(config, '/index.html'), '/api/render?file=discover.html');
  assert.equal(rewriteDest(config, '/bienvenue'), '/api/render?file=bienvenue.html');
}

assert.match(server, /'\/': 'discover\.html'/);
assert.match(server, /'\/index\.html': 'discover\.html'/);
assert.match(server, /'\/bienvenue': 'bienvenue\.html'/);
assert.match(render, /'bienvenue\.html'/);
assert.match(render, /discover\.html'/);

assert.match(router, /register\('home', \(\) => hardNavigate\('discover\.html'\)\)/);
assert.match(router, /register\('bienvenue'/);
assert.match(router, /hardNavigate\('discover\.html#login'\)/);
assert.match(router, /discover\.html\?\$\{params\.toString\(\)\}/);

assert.match(shell, /isLegacyEntry/);
assert.match(shell, /replace\('discover\.html'/);
assert.match(shell, /isMarketingLanding[\s\S]*mountNativeGuestHome/);

assert.match(index, /discover\.html/);
assert.match(bienvenue, /Continuer sur le web/);
assert.match(bienvenue, /href="discover\.html" class="btn btn-primary btn-lg lyann-home-web-btn"/);
assert.match(bienvenue, /Bientôt sur App Store/);
assert.doesNotMatch(bienvenue, /href="feed\.html" class="btn btn-primary btn-lg lyann-home-web-btn"/);

console.log('entry routing contract passed');
