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
assert.doesNotMatch(draft.proposedText, /Source\s*:/i);
assert.doesNotMatch(draft.proposedText, /https:\/\/example.com\/route/);
assert.strictEqual(draft.sourceName, 'Routes de Guadeloupe');
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
const { classifyFeed, acceptRewrittenText, reviewEditorialText, assertHumanApproval, editorialPassSlot } = require('../api/editorial-engine');
assert.strictEqual(EDITORIAL_BOTS.reduce((sum, bot) => sum + bot.maxPerDay, 0), 15);
assert.strictEqual(editorialPassSlot(new Date('2026-10-17T11:00:00Z')), '2026-10-17T07');
assert.strictEqual(editorialPassSlot(new Date('2026-10-17T16:00:00Z')), '2026-10-17T12');
assert.strictEqual(editorialPassSlot(new Date('2026-10-17T21:00:00Z')), '2026-10-17T17');
assert.strictEqual(editorialPassSlot(new Date('2026-10-17T22:00:00Z')), '2026-10-17T17');
assert.strictEqual(classifyFeed('<rss><channel><item/></channel></rss>', 'rss'), 'flux vide');
assert.strictEqual(classifyFeed('<html></html>', 'rss'), 'flux invalide');
assert.strictEqual(acceptRewrittenText('Pointe-à-Pitre', { subject: 'Pointe-à-Pitre', sourceUrl: 'https://rci.fm/a' }), '');
const longEnough = 'La commune retrouve un budget en excédent après des années de redressement. Le texte reste factuel et ne reprend pas le lien du média dans le corps. '.repeat(3);
assert.ok(acceptRewrittenText(longEnough, { subject: 'Autre titre', sourceUrl: 'https://rci.fm/a' }));
assert.strictEqual(acceptRewrittenText(longEnough + ' https://rci.fm/a', { subject: 'Autre', sourceUrl: 'https://rci.fm/a' }), '');
const actuFacts = 'Déficit cumulé supérieur à 77 millions d’euros fin 2018. Excédent de 7,28 millions d’euros à la clôture de 2025.';
assert.strictEqual(reviewEditorialText({
    text: 'La commune retrouve un équilibre après un déficit important et présente un excédent.',
    facts: actuFacts
}).ok, false);
assert.strictEqual(reviewEditorialText({
    text: 'Fin 2018, le déficit cumulé dépassait 77 millions d’euros. En 2025, l’excédent atteint 7,28 millions d’euros.',
    facts: actuFacts
}).ok, true);
assert.strictEqual(reviewEditorialText({
    text: 'Ces plantes soulagent les douleurs grâce à leurs propriétés bénéfiques.',
    facts: 'Le bois d’Inde et la consoude sont cités, avec des précautions, sans dosage.',
    healthReview: true
}).ok, false);
assert.strictEqual(assertHumanApproval(null).ok, false);
assert.strictEqual(assertHumanApproval({ userId: 'admin', actor: 'script-de-test' }).ok, false);
assert.strictEqual(assertHumanApproval({ userId: 'admin', actor: 'admin' }).ok, true);

const { providerConfig } = require('../api/editorial-run');
function fakeJwt(payload) {
    return `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.e30`;
}
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;
assert.strictEqual(providerConfig({
    VERCEL_OIDC_TOKEN: fakeJwt({ project_id: 'prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM', exp: future }),
    LYANN_EDITORIAL_AI_ENABLED: '1'
}).error, 'oidc-production-refused');
assert.strictEqual(providerConfig({
    VERCEL_OIDC_TOKEN: fakeJwt({ project_id: 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q', exp: past }),
    LYANN_EDITORIAL_AI_ENABLED: '1'
}).error, 'oidc-expired');
assert.strictEqual(providerConfig({
    VERCEL_OIDC_TOKEN: fakeJwt({ project_id: 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q', exp: future })
}).error, 'spend-not-authorized');
assert.strictEqual(providerConfig({
    VERCEL_OIDC_TOKEN: fakeJwt({ project_id: 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q', exp: future }),
    LYANN_EDITORIAL_AI_ENABLED: '1'
}).mode, 'oidc');

console.log('editorial-engine: sources, doublon logique, santé et suspension');
