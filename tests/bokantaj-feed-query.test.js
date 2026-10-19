const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = global;
eval(fs.readFileSync(path.join(__dirname, '../bokantaj-feed-query.js'), 'utf8'));
const query = global.LYANN_BOKANTAJ_QUERY;

const posts = [
  { id: 'a', type: 'info', created_at: '2026-10-17T10:00:00Z', _distanceKm: 12 },
  { id: 'b', type: 'alerte', created_at: '2026-10-17T12:00:00Z', _distanceKm: 0.5 },
  { id: 'c', type: 'dispo', created_at: '2026-10-16T12:00:00Z', _distanceKm: 2 },
  { id: 'd', type: 'conseil', created_at: '2026-10-01T12:00:00Z' },
  { id: 'e', type: 'reco', created_at: '2026-10-17T08:00:00Z', location: 'Les Abymes · Grande-Terre', _distanceKm: 5 }
];

assert.deepStrictEqual(query.sortPosts(posts, 'recent').map((post) => post.id), ['b', 'a', 'e', 'c', 'd']);
assert.deepStrictEqual(query.sortPosts(posts, 'nearby').map((post) => post.id), ['b', 'c', 'e', 'a']);
assert.strictEqual(query.postMatchesTypes(posts[2], ['bon_plan']), true);
assert.strictEqual(query.postMatchesTypes(posts[3], ['astuce']), true);
assert.strictEqual(query.postMatchesTypes(posts[4], ['avis']), true);
assert.strictEqual(query.postMatchesTypes(posts[0], []), true);
assert.strictEqual(query.postWithinPeriod(posts[0], 'today', new Date('2026-10-17T18:00:00Z')), true);
assert.strictEqual(query.postWithinPeriod(posts[3], '7', new Date('2026-10-17T18:00:00Z')), false);
assert.strictEqual(query.communeMatches(posts[4], 'Les Abymes · Grande-Terre · Guadeloupe'), true);
assert.strictEqual(query.communeMatches(posts[0], 'Les Abymes'), false);
assert.strictEqual(query.formatDistanceKm(0.5, true), '500 m');
assert.strictEqual(query.formatDistanceKm(0, true), 'moins de 100 m');
assert.strictEqual(query.formatDistanceKm(0.2, false), 'moins d’1 km');
assert.strictEqual(query.formatDistanceKm(2), '2 km');
assert.strictEqual(query.formatDistanceKm(12.2), '12 km');
assert.strictEqual(query.formatDistanceKm(Number.NaN), null);

const feed = fs.readFileSync(path.join(__dirname, '../feed.html'), 'utf8');
assert.strictEqual(feed.includes('Voir les annonces'), false);
assert.ok(feed.includes('Publications récentes'));
assert.ok(feed.includes('Autour de moi'));
assert.ok(feed.includes('Filtrer Bokantaj'));
assert.ok(feed.includes('Partager une idée, une info, un bon plan…'));
assert.ok(!feed.includes('getCurrentPosition'));

console.log('bokantaj feed query ok');
