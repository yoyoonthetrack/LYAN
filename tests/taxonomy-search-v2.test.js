'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../marketplace-taxonomy.js');
const data = require('../docs/taxonomy/data/taxonomy-v2.data.js');

const nodes = [];
const terms = [];
for (const trade of data.TRADES) {
    if (trade.family === 'autres') continue;
    nodes.push({ code: trade.code, kind: 'trade', parent_code: null, family_code: trade.family, group_code: trade.group, label_fr: trade.label, sort_order: 1, selectable: true, active: true });
    for (const term of [trade.label, ...trade.t, ...trade.p, ...trade.l]) terms.push({ node_code: trade.code, term_norm: T.fold(term), term_type: 'syn' });
    for (const spec of trade.specs) {
        const code = spec.code || `${trade.code}_${spec.slug}`;
        nodes.push({ code, kind: 'specialty', parent_code: trade.code, family_code: trade.family, group_code: trade.group, label_fr: spec.label, sort_order: 1, selectable: spec.selectable !== false, active: true });
        for (const term of [spec.label, ...spec.t, ...spec.p, ...spec.l]) terms.push({ node_code: code, term_norm: T.fold(term), term_type: 'syn' });
    }
}
const ambiguous = Object.entries(data.AMBIGUOUS_TERMS).map(([term_norm, value]) => ({ term_norm, question_fr: value.question }));
const index = T.buildIndex(nodes, [], terms, ambiguous);
const ctx = { index, leaves: [] };

function codes(query) {
    return T.matchQuery(index, query);
}

test('a precise trade does not return the whole family', () => {
    for (const query of ['Plomberie', 'Élagage', 'Climatisation', 'Peinture', 'Coiffure']) {
        const match = codes(query);
        assert.equal(match.level, 'node', query);
        const families = new Set(match.codes.map((code) => index.byCode.get(code).family_code));
        assert.equal(families.size, 1, query);
        const familyTrades = index.families[[...families][0]].groups.flatMap((group) => group.trades);
        assert.ok(match.codes.length < familyTrades.length + familyTrades.reduce((n, trade) => n + trade.specialties.length, 0), query);
    }
    const plomb = codes('Plomberie');
    assert.ok(plomb.codes.includes('plomberie'));
    assert.equal(plomb.codes.includes('electricite'), false);
    const elagage = codes('Élagage');
    assert.equal([...new Set(elagage.codes.map((code) => index.byCode.get(code).family_code))].join(), 'jardin');
    assert.equal(elagage.codes.includes('tonte') || elagage.codes.includes('jardinage'), false);
});

test('a specialty synonym stays on that trade', () => {
    const match = codes("Fuite d'eau");
    assert.ok(match.level === 'node' || match.level === 'clarify', match.level);
    assert.ok(match.codes.some((code) => code.startsWith('plomberie')));
    assert.equal(match.codes.some((code) => index.byCode.get(code).family_code === 'numerique'), false);
});

test('an ambiguous word asks for a precision and does not pick one trade', () => {
    const match = codes('fuite');
    assert.equal(match.level, 'clarify');
    assert.match(match.question, /fuite/i);
    assert.ok(match.codes.length >= 2);
});

test('family name filters the family; ménage and jardinage stay specific', () => {
    const family = codes('Jardin & extérieur');
    assert.equal(family.level, 'family');
    assert.equal(family.family, 'jardin');
    const menage = codes('Ménage');
    assert.equal(menage.level, 'node');
    assert.ok(menage.codes.every((code) => index.byCode.get(code).family_code === 'entretien'));
});

test('historical text still matches, and another trade does not', () => {
    const match = codes('Plomberie');
    const historical = { title: 'Fuite sous évier, plomberie', taxonomy_node_code: null };
    const electrician = { title: 'Tableau électrique', taxonomy_node_code: 'electricite' };
    assert.equal(T.rowMatchesQuery([historical], match, ctx), true);
    assert.equal(T.rowMatchesQuery([electrician], match, ctx), false);
    assert.equal(historical.taxonomy_node_code, null);
});

test('adding a skill respects the quota and refuses a duplicate', () => {
    const skills = require('../profile-skills-v2.js');
    assert.equal(skills.planAdd(['plomberie'], 'plomberie', null).duplicate, true);
    assert.equal(skills.planAdd(['plomberie'], 'electricite', { limits: { categories: 1 }, usage: { categories: 1 } }).quota, true);
    assert.deepEqual(skills.planAdd(['plomberie'], 'electricite', { limits: { categories: 3 }, usage: { categories: 1 } }).nodes, ['plomberie', 'electricite']);
    assert.equal(skills.planAdd([], 'Fuite', null).ok, false);
});

test('switching pages keeps an explicit territory and drops the other page taxonomy', () => {
    const next = T.filtersAcrossModes(
        { territory: 'Martinique (972)', commune: 'Le Robert', area: 'Fort-de-France', family: 'maison', job: 'plomberie', query: 'fuite' },
        { family: 'jardin', job: 'elagage', territory: 'Guadeloupe (971)', query: 'tonte', area: '' }
    );
    assert.equal(next.territory, 'Martinique (972)');
    assert.equal(next.commune, 'Le Robert');
    assert.equal(next.family, '');
    assert.equal(next.job, '');
    assert.equal(next.query, '');
    assert.equal(next.area, 'Fort-de-France');
});
