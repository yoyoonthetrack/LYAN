'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const style = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/maps/lyann-liberty.json'), 'utf8'));

test('pastel chic basemap stays on real vector geometry', () => {
    assert.deepEqual(Object.values(style.sources).map((source) => source.type), ['vector']);
    assert.equal(style.layers.some((layer) => layer.type === 'raster'), false);
    assert.equal(style.layers.find((layer) => layer.id === 'background').paint['background-color'], '#C9DFAE');
    assert.equal(style.layers.find((layer) => layer.id === 'water').paint['fill-color'], '#A5D8F6');
    assert.equal(style.layers.find((layer) => layer.id === 'water_shore').type, 'line');
    assert.equal(style.layers.find((layer) => layer.id === 'landcover_wetland').paint['fill-pattern'], undefined);
    assert.equal(style.layers.find((layer) => layer.id === 'park').paint['fill-color'], '#7FB56C');
    assert.equal(style.layers.find((layer) => layer.id === 'landcover_wood').paint['fill-color'], '#6EA562');
    assert.equal(style.layers.find((layer) => layer.id === 'landcover_wood').minzoom, 11);
    assert.equal(style.layers.find((layer) => layer.id === 'landuse_residential').paint['fill-color'], '#F0D2A4');
    assert.equal(style.layers.find((layer) => layer.id === 'landuse_residential').minzoom, 10);
    const building = style.layers.find((layer) => layer.id === 'building');
    assert.equal(building.paint['fill-color'], '#F6E6CC');
    assert.equal(building.paint['fill-outline-color'], '#E6D0B4');
    assert.equal(building.minzoom, 15);
    assert.equal(building.maxzoom, undefined);
    assert.equal(style.layers.find((layer) => layer.id === 'building-3d').layout.visibility, 'none');
    const road = style.layers.find((layer) => layer.id === 'road_minor');
    assert.equal(road.paint['line-color'], '#E4C9A0');
    assert.equal(road.minzoom, 14);
    assert.equal(road.layout['line-cap'], 'round');
    assert.equal(style.layers.find((layer) => layer.id === 'road_trunk_primary').paint['line-color'], '#D4A85C');
    assert.equal(style.layers.find((layer) => layer.id === 'road_trunk_primary').minzoom, 10);
    assert.equal(style.layers.find((layer) => layer.id === 'label_town').minzoom, 10);
    assert.equal(style.layers.find((layer) => layer.id === 'label_village').minzoom, 12);
    const city = style.layers.find((layer) => layer.id === 'label_city');
    assert.deepEqual(city.layout['text-font'], ['Nunito Sans Bold']);
    assert.equal(city.paint['text-halo-color'], '#C9DFAE');
    assert.equal(city.layout['text-letter-spacing'], 0.02);
    const fonts = new Set(style.layers.filter((layer) => layer.type === 'symbol').flatMap((layer) => layer.layout?.['text-font'] || []));
    assert.deepEqual([...fonts].sort(), ['Nunito Sans Bold', 'Nunito Sans Italic', 'Nunito Sans Regular']);
});
