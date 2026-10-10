'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
const start = source.indexOf('function bottomRefreshGesture');
const end = source.indexOf('function scrollThreadToBottom');
const bottomRefreshGesture = new Function(source.slice(start, end) + '\nreturn bottomRefreshGesture;')();

test('a swipe up refreshes only when the thread is already at the bottom', () => {
    assert.deepEqual(bottomRefreshGesture({ nearBottom: false, dy: -80, dx: 0, pulling: true }), {
        pull: false, refresh: false, block: false
    });
    assert.equal(bottomRefreshGesture({ nearBottom: true, dy: -8, dx: 0, pulling: false }).pull, false);
    assert.equal(bottomRefreshGesture({ nearBottom: true, dy: -20, dx: 40, pulling: false }).pull, false);
    const started = bottomRefreshGesture({ nearBottom: true, dy: -20, dx: 2, pulling: false });
    assert.equal(started.pull, true);
    assert.equal(started.block, false);
    const ready = bottomRefreshGesture({ nearBottom: true, dy: -80, dx: 0, pulling: true });
    assert.equal(ready.refresh, true);
    assert.equal(ready.block, true);
});

test('bottom refresh reuses the existing catch-up and keeps the latest messages in view', () => {
    assert.match(source, /await catchUpOpenThread\('manual'\)/);
    assert.match(source, /scrollThreadToBottom\(box, false\)/);
    assert.match(source, /if \(stick\) scrollThreadToBottom\(box, false\)/);
    assert.match(source, /else box\.scrollTop = previousTop/);
    assert.equal(source.includes('location.reload'), false);
});
