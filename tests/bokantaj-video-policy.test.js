'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
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

test('gallery MOV and unnamed iPhone files stay accepted video kinds', () => {
    assert.deepEqual(policy.videoKind({ type: 'video/quicktime', name: 'IMG_1234.MOV' }), { mime: 'video/quicktime', ext: 'mov' });
    assert.deepEqual(policy.videoKind({ type: '', name: 'clip.m4v' }), { mime: 'video/mp4', ext: 'mp4' });
    assert.deepEqual(policy.videoKind({ type: 'video/x-quicktime', name: '' }), { mime: 'video/quicktime', ext: 'mov' });
    assert.equal(policy.videoKind({ type: 'image/jpeg', name: 'x.jpg' }), null);
    assert.equal(policy.canAttachWithoutDuration({ type: 'video/quicktime', name: 'IMG_1.MOV', size: 2 * 1024 * 1024 }), true);
    assert.equal(policy.canAttachWithoutDuration({ type: 'video/quicktime', name: 'IMG_1.MOV', size: policy.MAX_BYTES + 1 }), false);
});

test('an unread iPhone duration still attaches a small gallery file', () => {
    const source = fs.readFileSync(path.join(__dirname, '../bokantaj-video.js'), 'utf8');
    assert.match(source, /canAttachWithoutDuration/);
    assert.match(source, /return \{ file: source, poster: unreadPoster, start: 0, end: 0 \}/);
    assert.match(source, /setTimeout\(\(\) => finish\(new Error\('La miniature n’a pas pu être créée\.'\)\), 12000\)/);
    assert.match(source, /function withDeadline/);
    assert.match(source, /PREPARE_DEADLINE_MS/);
    assert.match(source, /const openWatch = window\.setTimeout/);
    assert.match(source, /clearTimeout\(openWatch\)/);
    const client = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    assert.match(client, /if \(Number\.isFinite\(duration\) && \(duration <= 0 \|\| duration > 60\)\)/);
});

test('conversion prefers WebCodecs and never drops the sound', () => {
    const fast = fs.readFileSync(path.join(__dirname, '../bokantaj-video-fast.js'), 'utf8');
    const video = fs.readFileSync(path.join(__dirname, '../bokantaj-video.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../feed.html'), 'utf8');
    assert.match(fast, /window\.LYANN_BOKANTAJ_VIDEO_FAST = \{/);
    assert.match(fast, /function codecsAvailable/);
    // The original audio track is copied, so no AudioEncoder support is needed.
    assert.match(fast, /addAudioChunkRaw/);
    assert.match(fast, /function paintFrame/);
    assert.match(fast, /rotation: 0/);
    assert.match(fast, /throw new Error\('no_audio_description'\)/);
    assert.doesNotMatch(fast, /new window\.AudioEncoder/);
    // The recorder stays reachable for devices without WebCodecs.
    assert.match(video, /fast && fast\.codecsAvailable\(\)/);
    assert.match(video, /recordClip\(source, clip\.start, clip\.end\)/);
    assert.match(html, /bokantaj-video-fast\.js\?v=/);
    for (const vendored of ['../vendor/mp4/mp4box.all.min.js', '../vendor/mp4/mp4-muxer.js']) {
        assert.ok(fs.statSync(path.join(__dirname, vendored)).size > 1000, vendored);
    }
});

test('a video longer than a minute must be trimmed to a 60 second window', () => {
    assert.equal(policy.clipWindow(95).reason, 'needs_trim');
    const clip = policy.clipWindow(95, 10, 90);
    assert.equal(clip.ok, true);
    assert.equal(clip.seconds, 60);
    assert.equal(policy.clipWindow(95, 10, 10.1).ok, false);
});

test('a phone-sized source is accepted and converted down to the stored limit', () => {
    const meta4k = { duration: 55, width: 3840, height: 2160 };
    const clip = { start: 0, end: 55 };
    assert.equal(policy.MAX_SOURCE_BYTES > policy.MAX_BYTES, true);
    assert.equal(policy.needsReencode({ size: 180 * 1024 * 1024 }, meta4k, clip), true);
    assert.equal(policy.needsReencode({ size: 4 * 1024 * 1024 }, meta4k, clip), true, 'a 4K frame must be scaled down');
    assert.equal(policy.needsReencode({ size: 4 * 1024 * 1024 }, { duration: 55, width: 1280, height: 720 }, clip), false);
    assert.equal(policy.needsReencode({ size: 4 * 1024 * 1024 }, { duration: 55, width: 720, height: 1280 }, { start: 5, end: 40 }), true, 'a trimmed window must be re-encoded');
    const video = fs.readFileSync(path.join(__dirname, '../bokantaj-video.js'), 'utf8');
    assert.match(video, /policy\.needsReencode\(source, meta, window\)/);
    assert.match(video, /if \(source\.size > policy\.MAX_BYTES\) throw err/);
});

test('a video is never published without the poster moderation needs', () => {
    const video = fs.readFileSync(path.join(__dirname, '../bokantaj-video.js'), 'utf8');
    const fast = fs.readFileSync(path.join(__dirname, '../bokantaj-video-fast.js'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    const moderation = fs.readFileSync(path.join(__dirname, '../api/content-moderation.js'), 'utf8');

    // The server keeps a video pending until it can review a poster.
    assert.match(moderation, /if \(posters\.length < videos\.length\) return \{ decision: 'pending'/);
    // So the composer must never hand over a clip without one.
    assert.match(video, /if \(!unreadPoster\) throw posterError\(\)/);
    assert.match(video, /if \(!poster\) poster = await posterOf\(source, window\.start\)/);
    assert.match(video, /if \(!poster\) throw posterError\(\)/);
    assert.doesNotMatch(video, /catch \(_\) \{\n\s*poster = null;/);
    assert.match(client, /if \(!posterBlob\) \{/);
    assert.doesNotMatch(client, /if \(!posterBlob\) return \{ video: videoUrl, poster: null \}/);

    // The decoder already holds the frames, so it is the first poster source.
    assert.match(fast, /function firstFrame/);
    assert.match(fast, /firstFrame,/);
    assert.match(fast, /if \(!painted\) posterCanvas/);
    assert.match(fast, /return \{ file: new File\(\[blob\], 'bokantaj\.mp4'/);
    assert.match(video, /fast\.firstFrame && fast\.codecsAvailable\(\)/);
    assert.match(video, /POSTER_DEADLINE_MS/);
    // The recorder path returns the same shape as the fast path.
    assert.match(video, /return \{ file: recorded, poster: null \}/);
    assert.match(video, /return \{ file: source, poster: null \}/);
});

test('the bitrate target stays inside the stored size limit', () => {
    const bits = policy.targetVideoBitsPerSecond(60);
    assert.ok(bits * 60 <= policy.MAX_BYTES * 8);
    assert.ok(bits >= 4000000, 'a minute of 1080p keeps a usable bitrate');
    // A phone recording in 1080p is published at its own definition.
    assert.deepEqual(policy.fitFrame(1920, 1080), { width: 1920, height: 1080 });
    assert.deepEqual(policy.fitFrame(1080, 1920), { width: 1080, height: 1920 });
    const scaled = policy.fitFrame(3840, 2160);
    assert.ok(Math.max(scaled.width, scaled.height) <= 1920);
    assert.ok(Math.min(scaled.width, scaled.height) <= 1080);
});

test('the feed video can be scrubbed and opened full screen', () => {
    const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.match(source, /function openFullPlayer/);
    assert.match(source, /webkitEnterFullscreen/);
    assert.match(source, /bokantaj-video-expand/);
    assert.match(source, /playing\.controls = true/);
    // The old tap handler only toggled play/pause, with no way to seek.
    assert.doesNotMatch(source, /if \(playing\.paused\) playing\.play\(\)/);
    assert.match(css, /\.bokantaj-video-controls \{/);
    assert.match(css, /\.bokantaj-video-expand \{|\.bokantaj-video-expand,/);
});

test('playback markup does not fetch the video before the click', () => {
    const html = policy.playbackMarkup('https://example.test/a.mp4', 'https://example.test/a-poster.jpg');
    assert.match(html, /bokantaj-video-poster/);
    assert.match(html, /data-video-src="https:\/\/example\.test\/a\.mp4"/);
    assert.doesNotMatch(html, /<video/);
    assert.equal(policy.posterFor('https://example.test/a.mp4', ['https://example.test/a-poster.jpg']), 'https://example.test/a-poster.jpg');
    assert.equal(policy.isPosterUrl('https://example.test/a-poster.jpg'), true);
});

test('the card holds the shape of the clip before anything is fetched', () => {
    const sized = 'https://example.test/a-poster-1080x1920.jpg';
    assert.equal(policy.posterName('a', 1080, 1920), 'a-poster-1080x1920.jpg');
    assert.equal(policy.posterName('a', 0, 0), 'a-poster.jpg');
    assert.deepEqual(policy.posterRatio(sized), { width: 1080, height: 1920 });
    assert.equal(policy.posterRatio('https://example.test/a-poster.jpg'), null);
    // Posters uploaded before the size suffix must keep working everywhere.
    assert.equal(policy.isPosterUrl(sized), true);
    assert.equal(policy.posterFor('https://example.test/a.mp4', [sized]), sized);
    assert.equal(policy.posterFor('https://example.test/a.mp4', ['https://example.test/b-poster-1x1.jpg']), '');

    const html = policy.playbackMarkup('https://example.test/a.mp4', sized);
    assert.match(html, /style="--media-ratio:1080 \/ 1920"/);
    assert.match(html, /class="bokantaj-video-poster has-media-ratio"/);
    // A landscape filename is the coded phone frame: the card must not open wide.
    const codedWide = policy.playbackMarkup('https://example.test/a.mp4', 'https://example.test/a-poster-1920x1080.jpg');
    assert.match(codedWide, /data-coded-ratio="1920x1080"/);
    assert.doesNotMatch(codedWide, /--media-ratio/);

    // Shape unknown: a slim bar, and the video only appears once measured, so
    // no wrongly shaped box is ever shown.
    const plain = policy.playbackMarkup('https://example.test/a.mp4', '');
    assert.doesNotMatch(plain, /--media-ratio/);
    assert.doesNotMatch(plain, /has-media-ratio/);
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.match(css, /\.bokantaj-video:not\(\.has-media-ratio\)/);
    const script = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.match(script, /function videoShapeReady/);
    assert.match(script, /if \(!ratio && !codedPortrait\) await videoShapeReady\(video\)/);
    assert.match(script, /function playbackFrame/);
    assert.match(script, /bokantaj-video is-settling/);
    assert.match(css, /\.bokantaj-video-poster-image\.is-oriented/);
    assert.match(script, /video\.classList\.add\('has-media-ratio'\)/);

    const client = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    assert.match(client, /posterName\(id, posterSize\?\.width, posterSize\?\.height\)/);
    assert.match(client, /function readImageSize/);
    // Both server checks accept the size suffix as well.
    assert.match(
        fs.readFileSync(path.join(__dirname, '../api/content-moderation.js'), 'utf8'),
        /-poster\(\?:-\\d\+x\\d\+\)\?\\\.jpe\?g\$/
    );
    assert.match(
        fs.readFileSync(path.join(__dirname, '../api/content-moderation-routes.js'), 'utf8'),
        /-poster\(\?:-\\d\+x\\d\+\)\?\\\.jpe\?g\$/
    );
});

test('a portrait iPhone matrix is read off the video track', () => {
    function track(rotation) {
        const tkhd = Buffer.alloc(88);
        tkhd.writeUInt32BE(Math.round(1920 * 65536), 76);
        tkhd.writeUInt32BE(Math.round(1080 * 65536), 80);
        if (rotation === 90) tkhd.writeInt32BE(65536, 44);
        if (rotation === 270) tkhd.writeInt32BE(-65536, 44);
        if (rotation === 180) tkhd.writeInt32BE(-65536, 40);
        return tkhd;
    }
    const audio = Buffer.alloc(88);
    const file = (rotation) => Buffer.concat([
        box('ftyp', Buffer.from('isom')),
        box('mdat', Buffer.alloc(32)),
        box('moov', Buffer.concat([
            box('trak', box('tkhd', audio)),
            box('trak', box('tkhd', track(rotation)))
        ]))
    ]);
    assert.equal(policy.mp4Rotation(sample()), 0);
    assert.equal(policy.mp4Rotation(file(90)), 90);
    assert.equal(policy.mp4Rotation(file(180)), 180);
    assert.equal(policy.mp4Rotation(file(270)), 270);
    assert.equal(policy.mp4Rotation(new Uint8Array(file(90))), 90);
});

test('a checked MP4 can pass and an unverifiable file cannot', () => {
    const ok = policy.inspectMp4(sample());
    assert.equal(ok.verified, true);
    assert.equal(policy.inspectMp4(sample({ seconds: 90 })).reason, 'duration');
    assert.equal(policy.inspectMp4(sample({ width: 1920, height: 1080 })).verified, true);
    assert.equal(policy.inspectMp4(sample({ width: 3840, height: 2160 })).reason, 'frame');
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
