'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('vm');

function loadCache() {
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data-cache.js'), 'utf8'), {
        window,
        Map,
        Date,
        Number,
        String,
        Promise,
        Math
    });
    return window.LYANN_DATA_CACHE;
}

test('invalidate drops in-flight loaders so a later fetch is not stale', async () => {
    const cache = loadCache();
    let released;
    const first = cache.dedupe('chat-messages', 'conv-1', () => new Promise((resolve) => {
        released = resolve;
    }), 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof released, 'function');
    cache.invalidate('chat-messages', 'conv-1');
    const second = cache.dedupe('chat-messages', 'conv-1', async () => ['fresh'], 0);
    released(['stale']);
    assert.deepEqual(await second, ['fresh']);
    assert.deepEqual(await first, ['stale']);
});
