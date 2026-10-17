'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('page changes fade briefly and honor reduced motion', () => {
    const css = fs.readFileSync('style.css', 'utf8');
    const script = fs.readFileSync('script.js', 'utf8');
    assert.match(css, /@view-transition\s*\{\s*navigation:\s*auto/);
    assert.match(css, /animation:\s*lyann-page-out 180ms/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /navigation:\s*none/);
    assert.match(script, /lyann-page-leave/);
    assert.match(script, /prefers-reduced-motion/);
    assert.match(script, /setTimeout\(\(\) => \{ window\.location\.href = url\.href; \}, 160\)/);
    assert.match(script, /onpageswap/);
    assert.match(script, /nav-search-icon-link/);
    assert.doesNotMatch(script, /CSS\.supports\('view-transition-name'/);
});
