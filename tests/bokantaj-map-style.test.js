'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const style = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/maps/lyann-liberty.json'), 'utf8'));

test('drawn Bokantaj palette stays on real vector geometry', () => {
    assert.deepEqual(Object.values(style.sources).map((source) => source.type), ['vector']);
    assert.equal(style.layers.some((layer) => layer.type === 'raster'), false);
    assert.equal(style.layers.find((layer) => layer.id === 'background').paint['background-color'], '#f6efe4');
    assert.equal(style.layers.find((layer) => layer.id === 'water').paint['fill-color'], '#b7ddd4');
    assert.equal(style.layers.find((layer) => layer.id === 'park').paint['fill-color'], '#c8e4b6');
    assert.equal(style.layers.find((layer) => layer.id === 'building').paint['fill-color'], '#eadfce');
    const road = style.layers.find((layer) => layer.id === 'road_minor');
    assert.equal(road.paint['line-color'], '#fffaf3');
    assert.equal(road.layout['line-cap'], 'round');
    assert.equal(road.layout['line-join'], 'round');
    const city = style.layers.find((layer) => layer.id === 'label_city');
    assert.deepEqual(city.layout['text-font'], ['Nunito Sans Regular']);
    assert.equal(city.paint['text-halo-color'], '#fffaf2');
});
