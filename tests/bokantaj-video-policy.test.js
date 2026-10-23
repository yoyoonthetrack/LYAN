'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../bokantaj-video-policy');
const retention = require('../api/bokantaj-media-retention');

function box(type, payload) {
    const body = Buffer.concat([Buffer.from(type), payload]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(body.length + 4);
    return Buffer.concat([size, body]);
}

function sample({ seconds = 12, width = 1280, height = 720 } = {}) {
    const mvhd = Buffer.alloc(24);
    mvhd.writeUInt32BE(1000, 12);
    mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
    const tkhd = Buffer.alloc(88);
    tkhd.writeUInt32BE(Math.round(width * 65536), 76);
    tkhd.writeUInt32BE(Math.round(height * 65536), 80);
    return Buffer.concat([
        box('ftyp', Buffer.from('isom')),
        box('mvhd', mvhd),
        box('tkhd', tkhd)
    ]);
}

test('a video longer than a minute must be trimmed to a 60 second window', () => {
    assert.equal(policy.clipWindow(95).reason, 'needs_trim');
    const clip = policy.clipWindow(95, 10, 90);
    assert.equal(clip.ok, true);
    assert.equal(clip.seconds, 60);
    assert.equal(policy.clipWindow(95, 10, 10.1).ok, false);
});

test('the bitrate target stays inside a 10 MB file', () => {
    const bits = policy.targetVideoBitsPerSecond(60);
    assert.ok(bits * 60 <= 9 * 1024 * 1024 * 8);
    const frame = policy.fitFrame(1920, 1080);
    assert.ok(Math.max(frame.width, frame.height) <= 1280);
    assert.ok(Math.min(frame.width, frame.height) <= 720);
});

test('playback markup does not fetch the video before the click', () => {
    const html = policy.playbackMarkup('https://example.test/a.mp4', 'https://example.test/a-poster.jpg');
    assert.match(html, /bokantaj-video-poster/);
    assert.match(html, /data-video-src="https:\/\/example\.test\/a\.mp4"/);
    assert.doesNotMatch(html, /<video/);
    assert.equal(policy.posterFor('https://example.test/a.mp4', ['https://example.test/a-poster.jpg']), 'https://example.test/a-poster.jpg');
    assert.equal(policy.isPosterUrl('https://example.test/a-poster.jpg'), true);
});

test('a checked MP4 can pass and an unverifiable file cannot', () => {
    const ok = policy.inspectMp4(sample());
    assert.equal(ok.verified, true);
    assert.equal(policy.inspectMp4(sample({ seconds: 90 })).reason, 'duration');
    assert.equal(policy.inspectMp4(sample({ width: 1920, height: 1080 })).reason, 'frame');
    assert.equal(policy.inspectMp4(Buffer.alloc(48, 1)).reason, 'container');
    assert.equal(policy.inspectMp4(Buffer.alloc(policy.MAX_BYTES + 1)).reason, 'size');
});

test('a map pin expires without deleting the publication or its video', () => {
    const now = Date.parse('2026-10-23T00:00:00Z');
    const old = { public_moderation_status: 'approved', type: 'info', created_at: '2026-10-01T00:00:00Z', media_urls: ['https://example.test/a.mp4'] };
    assert.equal(policy.mapPinVisible(old, now), false);
    assert.equal(policy.mapPinVisible({ ...old, map_featured: true }, now), true);
    assert.equal(policy.mapPinVisible({ ...old, type: 'trafic', created_at: '2026-10-22T12:00:00Z' }, now), true);
    assert.equal(policy.mapPinVisible({ ...old, type: 'trafic', created_at: '2026-10-20T00:00:00Z' }, now), false);
    assert.deepEqual(policy.pinExpiryEffect(), {
        hidePinOnly: true,
        deletePost: false,
        deletePhotos: false,
        deleteVideo: false
    });
    assert.equal(policy.mediaDeletionAllowed('reject'), true);
    assert.equal(policy.mediaDeletionAllowed('hide'), false);
});

test('orphan cleanup keeps referenced files and refuses production', () => {
    const now = Date.parse('2026-10-23T00:00:00Z');
    const objects = [
        { path: 'user/live.mp4', created_at: '2026-10-01T00:00:00Z', size: 100 },
        { path: 'user/abandoned.mp4', created_at: '2026-10-01T00:00:00Z', size: 50 },
        { path: 'user/fresh.mp4', created_at: '2026-10-22T23:00:00Z', size: 20 }
    ];
    const orphans = policy.selectOrphans(objects, new Set(['user/live.mp4']), now);
    assert.deepEqual(orphans.map((item) => item.path), ['user/abandoned.mp4']);
    assert.equal(policy.volumeOf(objects).bytes, 170);
    assert.equal(policy.isProductionTarget('https://gzispjfoywklpqatjyop.supabase.co'), true);
    assert.equal(policy.isProductionTarget('https://tdktfbtqceldlaeqjtow.supabase.co'), false);
});


test('media cleanup never calls Storage outside the explicitly verified Staging project', async () => {
    assert.equal(retention.isVerifiedStagingUrl('https://tdktfbtqceldlaeqjtow.supabase.co'), true);
    assert.equal(retention.isVerifiedStagingUrl('https://gzispjfoywklpqatjyop.supabase.co'), false);
    for (const target of [undefined, '', 'https://gzispjfoywklpqatjyop.supabase.co',
        'https://other-project.supabase.co', 'not-a-url', 'https://tdktfbtqceldlaeqjtow.supabase.co.attacker.example']) {
        assert.equal(retention.isVerifiedStagingUrl(target), false);
        const forbidden = { storage: { from: () => { throw Error('STORAGE ACCESSED OUTSIDE STAGING'); } } };
        const release = await retention.releaseMedia({
            supabaseAdmin: forbidden, supabaseUrl: target,
            urls: ['https://lyann.app/v1/media/bokantaj-media-hold/test/a.mp4']
        });
        assert.equal(release.skipped, 'unverified_environment');
        const sweep = await retention.sweep({ supabaseAdmin: forbidden, supabaseUrl: target, apply: true });
        assert.equal(sweep.skipped, 'unverified_environment');
    }
});
