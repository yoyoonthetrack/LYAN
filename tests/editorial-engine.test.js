'use strict';

const assert = require('assert');
const {
    EDITORIAL_BOTS,
    editorialEmail,
    parseRssItems,
    draftFromSource,
    canCollect,
    limitWords
} = require('../api/editorial-engine');

assert.strictEqual(EDITORIAL_BOTS.length, 5);
assert.ok(EDITORIAL_BOTS.every((bot) => bot.bio.startsWith('Compte éditorial automatisé de LYANN')));
assert.strictEqual(editorialEmail('lyann-actu'), 'lyann-actu@lyann.app');

const items = parseRssItems(`
  <rss><channel>
    <item><title>Route fermée à Petit-Bourg</title><link>https://example.com/route</link><description>La RN1 est fermée.</description><pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate></item>
  </channel></rss>
`);
assert.strictEqual(items.length, 1);
assert.strictEqual(items[0].title, 'Route fermée à Petit-Bourg');

const draft = draftFromSource({
    title: items[0].title,
    url: items[0].url,
    summary: items[0].summary,
    publishedAt: items[0].publishedAt,
    sourceName: 'Routes de Guadeloupe',
    territory: 'guadeloupe'
}, EDITORIAL_BOTS.find((bot) => bot.slug === 'lyann-trafik'));
assert.match(draft.proposedText, /Source : Routes de Guadeloupe/);
assert.match(draft.proposedText, /https:\/\/example.com\/route/);
assert.strictEqual(draftFromSource({ title: 'Sans lien', url: '', summary: 'Rien' }, EDITORIAL_BOTS[0]), null);

const second = draftFromSource({
    title: 'Même information',
    url: 'https://example.com/route',
    summary: 'Déjà vue',
    sourceName: 'Autre',
    territory: 'guadeloupe'
}, EDITORIAL_BOTS[0]);
assert.strictEqual(second.sourceUrl, draft.sourceUrl);

const rimed = draftFromSource({
    title: 'Atoumo',
    url: 'https://www.tramil.net/fr/plante',
    summary: 'Feuilles documentées par TRAMIL.',
    sourceName: 'TRAMIL',
    territory: 'caraibe'
}, EDITORIAL_BOTS.find((bot) => bot.slug === 'lyann-rimed'));
assert.strictEqual(rimed.validationStatus, 'HUMAN_REQUIRED');

assert.strictEqual(canCollect({ status: 'SUSPENDED', maxPerDay: 4 }, 0), false);
assert.strictEqual(canCollect({ status: 'ACTIVE', maxPerDay: 1 }, 1), false);
assert.ok(limitWords('un deux trois', 2).startsWith('un deux'));
const { classifyFeed, acceptRewrittenText } = require('../api/editorial-engine');
assert.strictEqual(classifyFeed('<rss><channel><item/></channel></rss>', 'rss'), 'flux vide');
assert.strictEqual(classifyFeed('<html></html>', 'rss'), 'flux invalide');
assert.strictEqual(acceptRewrittenText('Pointe-à-Pitre', { subject: 'Pointe-à-Pitre', sourceUrl: 'https://rci.fm/a' }), '');

console.log('editorial-engine: sources, doublon logique, santé et suspension');
