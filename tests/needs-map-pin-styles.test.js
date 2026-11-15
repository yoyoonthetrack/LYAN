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
    assert.match(transport, /#E08B90/);
    const bolt = pins.faceHtml('electricite', 1);
    assert.match(bolt, /#E8C56A/);
    assert.match(bolt, /needs-map-pin-glyph/);
    assert.equal(pins.iconSvg('droplet'), pins.iconSvg(pins.specFor('plomberie').icon));
});

test('une seule catégorie s’applique, et recliquer la retire', () => {
    assert.equal(pins.nextStyle('', 'bricolage'), 'bricolage');
    assert.equal(pins.nextStyle('bricolage', 'plomberie'), 'plomberie');
    assert.equal(pins.nextStyle('plomberie', 'plomberie'), '');
    assert.equal(pins.nextStyle('plomberie', 'all'), '');
    const rows = [row('Plomberie'), row('Bricolage'), row('Covoiturage')];
    assert.deepEqual(pins.filterRows(rows, 'plomberie', []).map((item) => item.category), ['Plomberie']);
    assert.equal(pins.filterRows(rows, '', []).length, 3);
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
    assert.match(mixed, /#4EAA78/);
    assert.doesNotMatch(mixed, /<svg/);
});
