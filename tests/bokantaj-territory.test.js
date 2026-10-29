'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');

const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '../bokantaj-feed-query.js'), 'utf8'), context);
const query = context.window.LYANN_BOKANTAJ_QUERY;

test('a member territory wins over a city name that mentions another island', () => {
    assert.equal(query.territoryKeyFromLabel('Martinique (972)'), 'martinique');
    assert.equal(query.territoryKeyFromLabel('972 - Martinique'), 'martinique');
    assert.equal(query.territoryKeyFromLabel('La Réunion (974)'), 'reunion');
    assert.equal(query.postTerritoryKey({
        territory: 'guadeloupe',
        city: 'Guadeloupe et Martinique'
    }), 'guadeloupe');
    assert.equal(query.postTerritoryKey({
        territory: '',
        author_territory: 'Martinique (972)',
        city: 'Fort-de-France'
    }), 'martinique');
    assert.equal(query.postMatchesTerritory({ author_territory: 'martinique' }, 'martinique'), true);
    assert.equal(query.postMatchesTerritory({ author_territory: 'Guadeloupe (971)' }, 'martinique'), false);
    assert.equal(query.postMatchesTerritory({ territory: 'Martinique (972)' }, 'all'), true);
});
