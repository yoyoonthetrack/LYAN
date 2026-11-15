'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../needs-map-category-families.js');
const pins = require('../needs-map-pin-styles.js');

const row = (category) => ({ id: category, category });

test('chaque métier réel a sa couleur et son icône, sans nouvel identifiant', () => {
    const expect = {
        'Entretien Jardin': ['jardinage', 'sprout'],
        Plomberie: ['plomberie', 'droplet'],
        Électricité: ['electricite', 'zap'],
        Bricolage: ['bricolage', 'hammer'],
        Ménage: ['menage', 'brush-cleaning'],
        'Coiffure & Esthétique': ['beaute', 'scissors'],
        Covoiturage: ['transport', 'car-front'],
        'Garde d’enfants': ['famille', 'users'],
        Traiteur: ['evenement', 'utensils'],
        'Dépannage Informatique': ['numerique', 'laptop'],
        'Catégorie inconnue XYZ': ['autres', 'shapes']
    };
    for (const [category, [id, icon]] of Object.entries(expect)) {
        assert.equal(pins.styleIdForRow(row(category), []), id, category);
        const html = pins.faceHtml(id, 1);
        assert.match(html, new RegExp(`data-pin="${id}"`));
        assert.match(html, /needs-map-pin-icon/);
        assert.equal(pins.specFor(id).icon, icon);
        assert.doesNotMatch(html, /emoji|wrench|robinet/i);
    }
    const plumbing = pins.faceHtml('plomberie', 1);
    assert.match(plumbing, /M12 22a7 7 0 0 0 7-7/);
    assert.doesNotMatch(plumbing, /key|wrench/i);
    const transport = pins.faceHtml('transport', 1);
    assert.match(transport, /car-front|rect width="18"/);
    assert.match(transport, /#C45A60/);
});

test('un groupe homogène garde sa couleur, un groupe mixte est vert sans pictogramme', () => {
    assert.equal(pins.styleIdForItems([row('Plomberie'), row('Plomberie')], []), 'plomberie');
    const same = pins.faceHtml('plomberie', 3);
    assert.match(same, /has-count/);
    assert.match(same, />3</);
    assert.doesNotMatch(same, /<svg/);
    assert.equal(pins.styleIdForItems([row('Plomberie'), row('Électricité')], []), 'mixed');
    const mixed = pins.faceHtml('mixed', 7);
    assert.match(mixed, /data-pin="mixed"/);
    assert.match(mixed, /#146B43/);
    assert.doesNotMatch(mixed, /<svg/);
});
