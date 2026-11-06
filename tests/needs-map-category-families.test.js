const assert = require('node:assert/strict');
const families = require('../needs-map-category-families.js');

const row = (patch = {}) => ({
    id: 'r1',
    category: 'Plomberie',
    taxonomy_id: null,
    ...patch
});

assert.equal(families.familyForCategory('Plomberie'), 'plomberie');
assert.equal(families.familyForCategory('Électricité'), 'electricite');
assert.equal(families.familyForCategory('Entretien Jardin'), 'jardinage');
assert.equal(families.familyForCategory('Ménage'), 'menage');
assert.equal(families.familyForCategory('Coiffure & Esthétique'), 'beaute');
assert.equal(families.familyForCategory('Dépannage Informatique'), 'numerique');
assert.equal(families.familyForCategory('Covoiturage'), 'quotidien');
assert.equal(families.familyForCategory(''), 'quotidien');
assert.equal(families.familyForCategory('Catégorie inconnue XYZ'), 'quotidien');

const leaves = [
    { id: 't-plomb', category: 'Plomberie', subcategory: 'Fuite' },
    { id: 't-menage', category: 'Ménage', subcategory: 'Nettoyage' }
];
assert.equal(families.familyForRow(row({ taxonomy_id: 't-plomb', category: 'Autre' }), leaves), 'plomberie');
assert.equal(families.familyForRow(row({ category: 'Ménage' }), leaves), 'menage');

const rows = [
    row({ id: 'a', category: 'Plomberie' }),
    row({ id: 'b', category: 'Ménage' }),
    row({ id: 'c', category: 'Covoiturage' })
];
const onlyPlomb = families.filterRowsByFamilies(rows, ['plomberie'], leaves);
assert.deepEqual(onlyPlomb.map((r) => r.id), ['a']);
assert.equal(families.filterRowsByFamilies(rows, families.ALL_FAMILY_IDS, leaves).length, 3);
assert.equal(families.filterRowsByFamilies(rows, [], leaves).length, 3);

assert.equal(families.FAMILIES.length, 8);
assert.ok(families.familyMeta('jardinage').tone === 'yellow');

console.log('needs-map-category-families.test.js: ok');
