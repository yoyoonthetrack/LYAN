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

// Phase 3.2A — sélection des familles : un clic ne touche que la famille cliquée.
const ids = families.ALL_FAMILY_IDS;
assert.deepEqual(families.toggleFamilySelection([], 'plomberie'), ['plomberie'], 'depuis « Toutes », choisir une famille ne sélectionne QUE celle-ci');
assert.deepEqual(families.toggleFamilySelection(['plomberie'], 'menage'), ['plomberie', 'menage']);
assert.deepEqual(families.toggleFamilySelection(['plomberie', 'menage'], 'plomberie'), ['menage']);
assert.deepEqual(families.toggleFamilySelection(['menage'], 'menage'), [], 'retirer la dernière famille revient à « Toutes »');
assert.deepEqual(families.toggleFamilySelection(['menage'], 'inconnue'), ['menage'], 'identifiant inconnu ignoré');
assert.deepEqual(families.toggleFamilySelection(['beaute', 'plomberie'], 'menage'), ['plomberie', 'menage', 'beaute'], 'ordre canonique stable');
const before = ['plomberie'];
families.toggleFamilySelection(before, 'menage');
assert.deepEqual(before, ['plomberie'], 'aucune mutation de la sélection reçue');
assert.deepEqual(families.toggleFamilySelection(ids.slice(0, 7), ids[7]), ids, 'huit familles = liste complète');
assert.deepEqual(families.toggleFamilySelection(ids, 'jardinage').length, 7, 'depuis la liste complète, retirer une famille ne retire que celle-ci');
assert.equal(families.effectiveFamilyFilter([]), null);
assert.equal(families.effectiveFamilyFilter(ids), null);
assert.deepEqual(families.effectiveFamilyFilter(['menage', 'plomberie']), ['plomberie', 'menage']);
// Séquence rapide déterministe : 20 clics alternés, résultat identique à un calcul indépendant.
let sel = [];
const expected = new Set();
for (let i = 0; i < 20; i += 1) {
    const id = ids[(i * 3) % ids.length];
    sel = families.toggleFamilySelection(sel, id);
    if (expected.has(id)) expected.delete(id); else expected.add(id);
    assert.deepEqual(sel, ids.filter((x) => expected.has(x)), `clic ${i}`);
}

console.log('needs-map-category-families.test.js: ok');
