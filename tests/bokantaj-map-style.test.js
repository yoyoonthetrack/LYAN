'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const style = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/maps/lyann-liberty.json'), 'utf8'));

test('pastel chic basemap stays on real vector geometry', () => {
    assert.deepEqual(Object.values(style.sources).map((source) => source.type), ['vector']);
    assert.equal(style.layers.some((layer) => layer.type === 'raster'), false);
    assert.equal(style.layers.find((layer) => layer.id === 'background').paint['background-color'], '#F3E0C4');
    assert.equal(style.layers.find((layer) => layer.id === 'water').paint['fill-color'], '#8FCBF0');
    assert.equal(style.layers.find((layer) => layer.id === 'water_shore').type, 'line');
    assert.equal(style.layers.find((layer) => layer.id === 'landcover_wetland').paint['fill-pattern'], undefined);
    assert.equal(style.layers.find((layer) => layer.id === 'park').paint['fill-color'], '#78A86A');
    assert.equal(style.layers.find((layer) => layer.id === 'landcover_wood').paint['fill-color'], '#78A86A');
    assert.equal(style.layers.find((layer) => layer.id === 'landuse_residential').paint['fill-color'], '#E7CFA6');
    const building = style.layers.find((layer) => layer.id === 'building');
    assert.equal(building.paint['fill-color'], '#F7E7CF');
    assert.equal(building.paint['fill-outline-color'], '#E4CDB0');
    assert.equal(building.maxzoom, undefined);
    assert.equal(style.layers.find((layer) => layer.id === 'building-3d').layout.visibility, 'none');
    const road = style.layers.find((layer) => layer.id === 'road_minor');
    assert.equal(road.paint['line-color'], '#E2C07A');
    assert.equal(road.layout['line-cap'], 'round');
    assert.equal(style.layers.find((layer) => layer.id === 'road_trunk_primary').paint['line-color'], '#D09A48');
    const city = style.layers.find((layer) => layer.id === 'label_city');
    assert.deepEqual(city.layout['text-font'], ['Nunito Sans Bold']);
    assert.equal(city.paint['text-halo-color'], '#F3E0C4');
    assert.equal(city.layout['text-letter-spacing'], 0.02);
    const fonts = new Set(style.layers.filter((layer) => layer.type === 'symbol').flatMap((layer) => layer.layout?.['text-font'] || []));
    assert.deepEqual([...fonts].sort(), ['Nunito Sans Bold', 'Nunito Sans Italic', 'Nunito Sans Regular']);
});
