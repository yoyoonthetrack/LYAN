'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

global.window = global;
eval(fs.readFileSync(path.join(__dirname, '../bokantaj-repository.js'), 'utf8'));
const repo = global.LYANN_BOKANTAJ_REPOSITORY;

test('public Bokantaj feed drops pending and rejected posts', () => {
    const cleaned = repo.sanitizeFeed([
        { id: 'ok', item_type: 'POST', moderation_status: 'approved' },
        { id: 'wait', item_type: 'POST', public_moderation_status: 'pending' },
        { id: 'hidden', item_type: 'POST', moderation_status: 'rejected' },
        { id: 'request', item_type: 'POST', request_id: 'req-1', moderation_status: 'approved' },
        { id: 'empty', item_type: 'POST' }
    ]);
    assert.deepEqual(cleaned.map((row) => row.id), ['ok']);
});

test('only approved Bokantaj items are treated as public', () => {
    assert.equal(repo.isPubliclyVisible({ moderation_status: 'approved' }), true);
    assert.equal(repo.isPubliclyVisible({ public_moderation_status: 'pending' }), false);
    assert.equal(repo.isPubliclyVisible({ public_moderation_status: 'rejected' }), false);
    assert.equal(repo.isPubliclyVisible({}), false);
});

test('api-client public queries keep the approved-only filter', () => {
    const source = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    assert.match(source, /from\('bokantaj_posts'\)[\s\S]{0,220}\.eq\('public_moderation_status', 'approved'\)/);
    assert.match(source, /from\('bokantaj_comments'\)[\s\S]{0,280}\.eq\('public_moderation_status', 'approved'\)/);
    assert.match(source, /comments_count: \(postCommentsCountMap\[p\.id\] !== undefined\) \? postCommentsCountMap\[p\.id\] : 0/);
});


test('quiet moderation refresh removes hidden comments from an already-open drawer', () => {
    const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.match(source, /data-comment-id="\$\{comment\.id\}"/);
    const start = source.indexOf('function refreshPublicBokantajQuietly()');
    const end = source.indexOf("document.addEventListener('visibilitychange'", start);
    assert.ok(start >= 0 && end > start, 'quiet feed refresh must exist');
    const refresh = source.slice(start, end);
    assert.match(refresh, /public_moderation_status === 'approved'/);
    assert.match(refresh, /approvedIds\.some/);
    assert.match(refresh, /list\.innerHTML\s*=\s*approved\.length/);
    assert.match(refresh, /window\.renderBokantajCommentRow\(row, targetId\)/);
});
