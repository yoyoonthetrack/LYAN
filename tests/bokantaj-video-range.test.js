'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceMediaRange, serveModeratedMedia } = require('../api/content-moderation-routes');

test('video gateway understands normal, suffix, open-ended and invalid byte ranges', () => {
  const bytes = Buffer.from('abcdefghij');
  assert.deepEqual(sliceMediaRange(bytes, '').body, bytes);
  const first = sliceMediaRange(bytes, 'bytes=0-3');
  assert.equal(first.status, 206);
  assert.equal(first.body.toString(), 'abcd');
  assert.equal(first.headers['Content-Range'], 'bytes 0-3/10');
  assert.equal(first.headers['Content-Length'], 4);
  const rest = sliceMediaRange(bytes, 'bytes=5-');
  assert.equal(rest.body.toString(), 'fghij');
  const tail = sliceMediaRange(bytes, 'bytes=-3');
  assert.equal(tail.body.toString(), 'hij');
  const capped = sliceMediaRange(bytes, 'bytes=9-9999');
  assert.equal(capped.body.toString(), 'j');
  for (const invalid of ['bytes=10-20', 'bytes=5-2', 'bytes=-0', 'bytes=0-2,4-6', 'garbage', 'bytes=9999999999999999999-']) {
    const response = sliceMediaRange(bytes, invalid);
    assert.equal(response.status, 416, invalid);
    assert.equal(response.body, null, invalid);
    assert.equal(response.headers['Content-Range'], 'bytes */10');
  }
});

test('range download happens only after moderation visibility allows it', async () => {
  let downloadCount = 0;
  let status = 'pending';
  const supabaseAdmin = {
    from(table) {
      assert.equal(table, 'public_media_releases');
      return { select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: { status, kind: 'video' }, error: null }; } };
    },
    storage: { from() { return {
      async download() { downloadCount += 1; return { data: new Blob(['abcdefghij'], { type: 'video/mp4' }), error: null }; }
    }; } }
  };
  const args = { supabaseAdmin, bucket: 'bokantaj-media-hold', path: 'owner-id/movie.mp4', range: 'bytes=2-5' };
  const held = await serveModeratedMedia(args);
  assert.equal(held.status, 404);
  assert.equal(downloadCount, 0);
  status = 'approved';
  const approved = await serveModeratedMedia(args);
  assert.equal(approved.status, 206);
  assert.equal(approved.body.toString(), 'cdef');
  assert.equal(downloadCount, 1);
});
