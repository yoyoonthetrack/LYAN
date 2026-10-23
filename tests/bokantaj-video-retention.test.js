'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseMedia, isVerifiedStagingUrl } = require('../api/bokantaj-media-retention');

const staging = 'https://tdktfbtqceldlaeqjtow.supabase.co';
const base = 'https://lyann.app/v1/media/bokantaj-media-hold/';

function mock(rows) {
  const removals = [];
  return {
    removals,
    db: {
      from(table) {
        assert.equal(table, 'bokantaj_posts');
        return {
          async select() {
            return { data: rows, error: null };
          }
        };
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, 'bokantaj-media-hold');
          return {
            async remove(paths) {
              removals.push(...paths);
              return { data: paths, error: null };
            }
          };
        }
      }
    }
  };
}

test('media from one deleted post is not removed while another post references it', async () => {
  const video = base + 'user1/clip.mp4';
  const poster = base + 'user1/clip-poster.jpg';
  const m = mock([{ id: 'kept', media_urls: [video, poster], human_decision: null }]);
  const response = await releaseMedia({
    supabaseAdmin: m.db, supabaseUrl: staging, urls: [video, poster]
  });
  assert.equal(response.still_referenced, 2);
  assert.deepEqual(response.removed, []);
  assert.deepEqual(m.removals, []);
});

test('media is deleted after the last referencing post has been removed', async () => {
  const video = base + 'user1/clip.mp4';
  const poster = base + 'user1/clip-poster.jpg';
  const m = mock([]);
  const response = await releaseMedia({
    supabaseAdmin: m.db, supabaseUrl: staging, urls: [video, poster]
  });
  assert.equal(response.still_referenced, 0);
  assert.deepEqual(m.removals, ['user1/clip.mp4', 'user1/clip-poster.jpg']);
});

test('missing/production project URLs never touch the database or storage', async () => {
  for (const url of ['', 'https://lyann.app', 'https://gzispjfoywklpqatjyop.supabase.co']) {
    assert.equal(isVerifiedStagingUrl(url), false);
    const answer = await releaseMedia({
      supabaseUrl: url, urls: [base + 'user1/clip.mp4'],
      supabaseAdmin: { from() { throw Error('DB access forbidden'); } }
    });
    assert.equal(answer.skipped, 'unverified_environment');
  }
});
