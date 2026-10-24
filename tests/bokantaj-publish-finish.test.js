'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('photo helper compresses or keeps supported images', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    const start = source.indexOf('window.LYANN_BOKANTAJ_MEDIA');
    const end = source.indexOf('// The annonce title', start);
    assert.ok(start >= 0 && end > start);
    global.window = global;
    eval(source.slice(start, end));
    const tiny = new File([Buffer.from('jpeg')], 'tiny.jpg', { type: 'image/jpeg' });
    const kept = await global.LYANN_BOKANTAJ_MEDIA.preparePhoto(tiny);
    assert.equal(kept, tiny);
    await assert.rejects(
        () => global.LYANN_BOKANTAJ_MEDIA.preparePhoto(new File([Buffer.from('x')], 'x.txt', { type: 'text/plain' })),
        /photo/i
    );
});

test('composer publish paints the author card without a full remount', () => {
    const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.match(source, /function formatOwnCreatedPost/);
    assert.match(source, /currentFlashPosts = \[ownCard,/);
    assert.match(source, /dataset\.publishing === '1'/);
    assert.match(source, /Envoi de la photo/);
    assert.match(source, /loadBokantajFeedFromSupabase\(\{ force: true, background: true \}\)/);
    assert.doesNotMatch(source, /await window\.loadBokantajFeedFromSupabase\(\{ force: true \}\)/);
    assert.match(source, /PENDING_FEED_POLL_MS = 5000/);
    assert.match(source, /PENDING_FEED_POLL_MAX = 24/);
    assert.match(source, /startPendingFeedPoll\(\)/);
    assert.doesNotMatch(source, /PENDING_FEED_POLL_MS = 30000/);
});
