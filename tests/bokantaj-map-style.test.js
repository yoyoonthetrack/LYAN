'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const style = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/maps/lyann-liberty.json'), 'utf8'));

test('pastel chic basemap stays on real vector geometry', () => {
    assert.deepEqual(Object.values(style.sources).map((source) => source.type), ['vector']);
    assert.equal(style.layers.some((layer) => layer.type === 'raster'), false);
    assert.equal(style.layers.find((layer) => layer.id === 'background').paint['background-color'], '#f7f1e6');
    assert.equal(style.layers.find((layer) => layer.id === 'water').paint['fill-color'], '#a9d6d1');
    assert.equal(style.layers.find((layer) => layer.id === 'water_shore').type, 'line');
    assert.equal(style.layers.find((layer) => layer.id === 'landcover_wetland').paint['fill-pattern'], undefined);
    assert.equal(style.layers.find((layer) => layer.id === 'park').paint['fill-color'], '#d5e4c9');
    const building = style.layers.find((layer) => layer.id === 'building');
    assert.equal(building.paint['fill-color'], '#f3e1d6');
    assert.equal(building.paint['fill-outline-color'], '#e4cfc3');
    assert.equal(building.maxzoom, undefined);
    assert.equal(style.layers.find((layer) => layer.id === 'building-3d').layout.visibility, 'none');
    const road = style.layers.find((layer) => layer.id === 'road_minor');
    assert.equal(road.paint['line-color'], '#fbf6ef');
    assert.equal(road.layout['line-cap'], 'round');
    assert.equal(style.layers.find((layer) => layer.id === 'road_trunk_primary').paint['line-color'], '#e2b56b');
    const city = style.layers.find((layer) => layer.id === 'label_city');
    assert.deepEqual(city.layout['text-font'], ['Nunito Sans Bold']);
    assert.equal(city.paint['text-halo-color'], '#f7f1e6');
    assert.equal(city.layout['text-letter-spacing'], 0.02);
    const fonts = new Set(style.layers.filter((layer) => layer.type === 'symbol').flatMap((layer) => layer.layout?.['text-font'] || []));
    assert.deepEqual([...fonts].sort(), ['Nunito Sans Bold', 'Nunito Sans Italic', 'Nunito Sans Regular']);
});
