'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

// V1 is legacy and frozen. It stays readable, so it is tested on its own engine.
const api = require('../approx-zone.js');
const referential = require('../approx-zone-referential.v1.js');
const zones = api.createEngine({ referentials: { 1: referential }, selectableVersions: [1] });

// Commune dataset used by the product today, loaded the way the browser loads it.
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('commune-geo.js', 'utf8'), sandbox);

const SUPPORTED = ['971', '972', '973', '974'];
const idOf = (zone) => zone.id;
const allZones = (territory, level) => zones.zonesForTerritory(territory, { level });

// 0. The referential is the authority: a hand edit changes its fingerprint.
{
    const { integrity, ...body } = referential;
    assert.equal(integrity.algorithm, 'sha256');
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'), integrity.value, 'referential was modified by hand');
    assert.equal(referential.version, 1);
    assert.deepEqual(Object.keys(referential.territories), SUPPORTED);
}

// 1. Territories: four are certified by official contours, the others are refused.
{
    const supported = zones.supportedTerritories();
    assert.deepEqual(supported.map((t) => t.code), SUPPORTED);
    const byCode = Object.fromEntries(supported.map((t) => [t.code, t]));
    assert.deepEqual(byCode['971'].levels.map((l) => [l.id, l.sizeKm]), [['a', 5.5], ['b', 11]]);
    assert.deepEqual(byCode['972'].levels.map((l) => l.id), ['a', 'b']);
    assert.deepEqual(byCode['974'].levels.map((l) => l.id), ['a', 'b']);
    // Guyane: 5.5 km would be a false precision over a vast, almost empty territory.
    assert.deepEqual(byCode['973'].levels.map((l) => [l.id, l.sizeKm]), [['b', 11]]);
    assert.equal(byCode['973'].defaultLevel, 'b');

    for (const [input, code] of [['guadeloupe', '971'], ['971', '971'], ['971 - Guadeloupe', '971'], ['Guadeloupe (971)', '971'],
        ['Martinique', '972'], ['972 - Martinique', '972'], ['guyane', '973'], ['La Réunion', '974'], ['reunion', '974'], ['974 - La Réunion', '974']]) {
        assert.deepEqual([zones.resolveTerritory(input).status, zones.resolveTerritory(input).code], ['SUPPORTED', code], input);
    }
    for (const input of ['saint-martin', '978 - St-Martin', 'Saint-Martin (978)', 'mayotte', 'saint-barthelemy']) {
        const result = zones.resolveTerritory(input);
        assert.equal(result.status, 'UNSUPPORTED', input);
        assert.equal(result.reason, 'UNSUPPORTED_TERRITORY');
    }
    for (const input of ['', null, undefined, 'France', 'Paris', 'Atlantis']) assert.equal(zones.resolveTerritory(input).status, 'UNKNOWN', String(input));
}

// 2. Deterministic ids, encoding and decoding.
{
    assert.equal(zones.formatZoneId({ territory: '971', version: 1, level: 'a', ix: 12, iy: 34 }), '971-v1-a-12.34');
    assert.deepEqual(zones.parseZoneId('971-v1-a-12.34'), { ok: true, territory: '971', version: 1, level: 'a', ix: 12, iy: 34 });
    for (const territory of SUPPORTED) {
        for (const zone of allZones(territory)) {
            const parsed = zones.parseZoneId(zone.id);
            assert.equal(zones.formatZoneId(parsed), zone.id, 'round trip');
        }
    }
    const first = JSON.stringify(allZones('971')); 
    assert.equal(JSON.stringify(allZones('971')), first, 'listing is stable');
    const point = [16.2415, -61.5331];
    assert.equal(zones.zoneAtPoint('971', ...point), zones.zoneAtPoint('guadeloupe', ...point));
    assert.equal(zones.zoneAtPoint('971', ...point), zones.zoneAtPoint('971', ...point));
    // Nothing random in the engine or in the generator.
    for (const file of ['approx-zone.js', 'scripts/build-approx-zone-referential.js']) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Math\.random|crypto\.random|getRandomValues|Date\.now|new Date\(/, file);
    }
    assert.equal(zones.formatZoneId({ territory: '971', version: 1, level: 'a', ix: -1, iy: 0 }), null);
    assert.equal(zones.formatZoneId({ territory: '97', version: 1, level: 'a', ix: 1, iy: 1 }), null);
}

// 3. Malformed identifiers are refused before any lookup.
{
    const sample = allZones('971')[0].id;
    assert.equal(zones.validateZoneId(sample).ok, true);
    const malformed = ['', ' ', null, undefined, 42, {}, [], sample + ' ', ' ' + sample, sample.toUpperCase(), sample.replace('-v1-', '-V1-'),
        '971-v1-a-12', '971-v1-a-12.', '971-v1-a-.34', '971-v1-a-12.34.5', '971-v1-a--1.2', '971-v1-12.34', '971-1-a-12.34',
        '97-v1-a-12.34', '9711-v1-a-12.34', '971-v1-aa-12.34', '971-v1-1-12.34', '971-v1-a-12,34', '971_v1_a_12.34',
        '971-v01-a-12.34', '971-v1-a-012.34', '971-v1-a-12.034', "971-v1-a-1.1'; DROP TABLE requests;--", '971-v1-a-12.34\n', '971-v1-a-12345.1',
        '16.2415,-61.5331', 'Les Abymes'];
    for (const id of malformed) {
        const result = zones.validateZoneId(id);
        assert.equal(result.ok, false, JSON.stringify(id));
        assert.equal(result.reason, 'MALFORMED', JSON.stringify(id));
        assert.equal(zones.describeZone(id), null);
        assert.equal(zones.publicZone(id, { authenticated: true }), null);
    }
}

// 4. A well-formed id is not enough: it must belong to the authorised referential.
{
    const cases = [
        ['971-v1-a-0.0', 'UNKNOWN_ZONE'],          // inside the grid, nothing on land
        ['971-v1-a-9999.9999', 'UNKNOWN_ZONE'],
        ['971-v2-a-12.34', 'UNSUPPORTED_VERSION'], // a future version is not trusted by this engine
        ['971-v99-a-12.34', 'UNSUPPORTED_VERSION'],
        ['971-v1-z-12.34', 'UNSUPPORTED_LEVEL'],
        ['973-v1-a-10.10', 'UNSUPPORTED_LEVEL'],   // Guyane has no 5.5 km sectors
        ['978-v1-a-1.1', 'UNSUPPORTED_TERRITORY'], // Saint-Martin: no referential
        ['976-v1-a-1.1', 'UNSUPPORTED_TERRITORY'],
        ['977-v1-b-1.1', 'UNSUPPORTED_TERRITORY'],
        ['000-v1-a-1.1', 'UNSUPPORTED_TERRITORY'],
        ['999-v1-a-1.1', 'UNSUPPORTED_TERRITORY']
    ];
    for (const [id, reason] of cases) {
        const result = zones.validateZoneId(id);
        assert.deepEqual([id, result.ok, result.reason], [id, false, reason]);
    }
    // A real cell of one territory is not valid under another territory's code.
    const martinique = allZones('972')[0];
    const forged = martinique.id.replace('972-', '971-');
    assert.notEqual(zones.validateZoneId(forged).ok && zones.describeZone(forged).label, martinique.label);
}

// 5. Every authorised sector is coherent, reachable and consistent with its grid.
{
    let checked = 0;
    for (const territory of SUPPORTED) {
        const entry = referential.territories[territory];
        for (const levelId of Object.keys(entry.levels)) {
            const list = allZones(territory, levelId);
            assert.equal(list.length, Object.keys(entry.levels[levelId].cells).length);
            const seen = new Set();
            for (const zone of list) {
                checked += 1;
                assert.equal(seen.has(zone.id), false);
                seen.add(zone.id);
                assert.equal(zone.territory, territory);
                assert.equal(zone.level, levelId);
                assert.equal(zone.version, 1);
                // The representative centre sits in its own sector and has no more than 3 decimals.
                assert.equal(zones.zoneAtPoint(territory, zone.center.lat, zone.center.lng, { level: levelId }), zone.id, zone.id);
                assert.equal(zone.center.lat, +zone.center.lat.toFixed(3));
                assert.equal(zone.center.lng, +zone.center.lng.toFixed(3));
                const { south, north, west, east } = zone.bounds;
                assert.ok(south <= zone.center.lat && zone.center.lat <= north && west <= zone.center.lng && zone.center.lng <= east, zone.id);
                // About 5.5 / 11 km, measured on the sector itself.
                const heightKm = (north - south) * 111.32;
                assert.ok(Math.abs(heightKm - zone.sizeKm) < zone.sizeKm * 0.01, `${zone.id} height ${heightKm}`);
                assert.ok(zone.landPct >= 1 && zone.landPct <= 100);
                assert.ok(zone.communes.length >= 1);
                for (const commune of zone.communes) {
                    assert.ok(commune.name, `${zone.id} commune ${commune.code}`);
                    assert.ok(commune.code.startsWith(territory.slice(0, 2)), commune.code);
                    assert.ok(commune.share >= 1 && commune.share <= 100);
                }
                assert.match(zone.label, /^Secteur (du|des|de) /);
                assert.doesNotMatch(zone.label, /de Les |de Le |des Les /);
                if (levelId === 'a') assert.ok(zone.radiusM >= 3500 && zone.radiusM <= 4200, `${zone.id} radius ${zone.radiusM}`);
                if (levelId === 'b') assert.ok(zone.radiusM >= 7000 && zone.radiusM <= 8400, `${zone.id} radius ${zone.radiusM}`);
                if (zone.parent) {
                    const parent = zones.describeZone(zone.parent);
                    assert.ok(parent, `${zone.id} parent ${zone.parent}`);
                    assert.ok(parent.bounds.south <= south + 1e-4 && parent.bounds.north >= north - 1e-4
                        && parent.bounds.west <= west + 1e-4 && parent.bounds.east >= east - 1e-4, `${zone.id} inside ${zone.parent}`);
                }
            }
            // Every commune can be placed: no resident is left without a sector.
            const covered = new Set(list.flatMap((zone) => zone.communes.map((c) => c.code)));
            for (const code of Object.keys(entry.communes)) assert.ok(covered.has(code), `${territory}/${levelId}: ${entry.communes[code]} has no sector`);
        }
        // Where both levels exist, every fine sector rolls up to a published coarse one.
        if (entry.levels.a && entry.levels.b) for (const zone of allZones(territory, 'a')) assert.ok(zone.parent, zone.id);
        if (!entry.levels.a) for (const zone of allZones(territory)) assert.equal(zone.parent, null);
    }
    assert.ok(checked > 1000, `swept ${checked} sectors`);
}

// 6. Coastline and sea: only sectors with land exist; open water is never guessed.
{
    for (const [territory, lat, lng] of [['971', 16.62, -61.40], ['971', 16.05, -62.20], ['971', 15.60, -61.30], ['972', 14.60, -60.40],
        ['972', 14.20, -61.60], ['973', 5.60, -51.20], ['973', 4.90, -52.00], ['974', -21.40, 55.00], ['974', -20.60, 55.60]]) {
        assert.equal(zones.zoneAtPoint(territory, lat, lng), null, `${territory} sea point ${lat},${lng}`);
        assert.equal(zones.zoneAtPoint(territory, lat, lng, { level: 'b' }), null);
    }
    // Land points resolve, and the sector really contains the commune.
    const pointe = zones.zoneAtPoint('971', 16.2415, -61.5331);
    assert.ok(pointe);
    assert.ok(zones.describeZone(pointe).communes.some((c) => c.name === 'Pointe-à-Pitre'));
    const cayenne = zones.zoneAtPoint('973', 4.9372, -52.3260);
    assert.ok(cayenne && cayenne.startsWith('973-v1-b-'));
    assert.ok(zones.describeZone(cayenne).communes.some((c) => c.name === 'Cayenne'));
    assert.equal(zones.zoneAtPoint('973', 4.9372, -52.3260, { level: 'a' }), null, 'no 5.5 km sector in Guyane');
    const saintDenis = zones.zoneAtPoint('974', -20.8789, 55.4481);
    assert.ok(saintDenis && zones.describeZone(saintDenis).communes.some((c) => c.name === 'Saint-Denis'));
    const fdf = zones.zoneAtPoint('972', 14.6161, -61.0588);
    assert.ok(fdf && zones.describeZone(fdf).communes.some((c) => c.name === 'Fort-de-France'));
    // Small islands are real land: Les Saintes, Marie-Galante and La Désirade have sectors.
    for (const [lat, lng, commune] of [[15.8667, -61.5833, 'Terre-de-Haut'], [15.9167, -61.3167, 'Grand-Bourg'], [16.3, -61.0667, 'La Désirade']]) {
        const id = zones.zoneAtPoint('971', lat, lng);
        assert.ok(id, `${commune} has a sector`);
        assert.ok(zones.describeZone(id).communes.some((c) => c.name === commune), commune);
    }
    // Coastal slivers exist, stay valid, and are described honestly by their land share.
    const slivers = allZones('971', 'a').filter((zone) => zone.landPct < 10);
    assert.ok(slivers.length > 0);
    for (const zone of slivers) assert.equal(zones.validateZoneId(zone.id).ok, true);
    // Outside the grid, off-world or non-numeric points never produce a sector.
    for (const [lat, lng] of [[0, 0], [-90, -180], [91, 0], [16.2, 181], [NaN, 1], [Infinity, 1]]) assert.equal(zones.zoneAtPoint('971', lat, lng), null);
    assert.equal(zones.zoneAtPoint('971', '16.24', '-61.53'), null, 'strings are not coordinates');
    assert.equal(zones.zoneAtPoint('978', 18.07, -63.05), null, 'Saint-Martin has no sector');
    assert.equal(typeof zones.zoneAtPoint('971', 16.2415, -61.5331), 'string', 'only an id comes back');
}

// 7. Communes: resolved from the referential, ambiguity never guessed.
{
    for (const [territory, name, code] of [['971', 'Les Abymes', '97101'], ['971', 'Abymes', '97101'], ['971', "Morne-à-l'Eau", '97116'],
        ['971', 'Les Abymes (971 - Guadeloupe)', '97101'], ['971', '97101', '97101'], ['972', 'Fort-de-France', '97209'], ['972', 'Le Lamentin', '97213']]) {
        assert.equal(zones.communeCodeFor(territory, name), code, `${territory} ${name}`);
    }
    for (const [territory, name] of [['971', 'Narnia'], ['971', ''], ['971', null], ['971', '99999'], ['978', 'Marigot'], ['971', 'Fort-de-France'], ['XX', 'Les Abymes']]) {
        assert.equal(zones.communeCodeFor(territory, name), null, `${territory} ${name}`);
    }
    // Compatibility with the commune list the product already ships.
    const geo = sandbox.LYANN_COMMUNE_GEO;
    const entries = Object.keys(geo).filter((key) => SUPPORTED.includes(key.split('|')[0]));
    assert.ok(entries.length >= 100);
    for (const key of entries) {
        const [code, name] = key.split('|');
        const resolved = zones.communeCodeFor(code, name);
        assert.ok(resolved, `commune-geo ${key} is unknown to the referential`);
        assert.ok(zones.zonesForCommune(code, name).length > 0, `${key} has no sector`);
        assert.ok(zones.zonesForCommune(code, name, { level: 'b' }).length > 0, `${key} has no coarse sector`);
    }
    const abymes = zones.zonesForCommune('971', 'Les Abymes');
    assert.ok(abymes.length >= 1);
    assert.deepEqual(abymes.map((z) => z.communeShare), [...abymes.map((z) => z.communeShare)].sort((a, b) => b - a));
    assert.equal(zones.zonesForCommune('978', 'Marigot').length, 0);
    assert.equal(zones.zonesForCommune('971', 'Fort-de-France').length, 0);
}

// 8. Insufficient geographic data: nothing is authorised.
{
    const empty = api.createEngine({ referentials: {} });
    const sample = allZones('971')[0].id;
    assert.deepEqual(empty.validateZoneId(sample), { ok: false, reason: 'REFERENTIAL_UNAVAILABLE' });
    assert.equal(empty.zoneAtPoint('971', 16.2415, -61.5331), null);
    assert.deepEqual(empty.supportedTerritories(), []);
    assert.equal(empty.resolveTerritory('guadeloupe').status, 'UNSUPPORTED');
    assert.equal(empty.communeCodeFor('971', 'Les Abymes'), null);
    assert.equal(empty.publicZone(sample, { authenticated: true }), null);
    assert.equal(api.createEngine().validateZoneId(sample).reason, 'REFERENTIAL_UNAVAILABLE');

    // Corrupted or incomplete referentials are ignored, never partly trusted.
    const clone = () => JSON.parse(JSON.stringify(referential));
    const noOrigin = clone(); delete noOrigin.territories['971'].origin;
    const noCells = clone(); noCells.territories['971'].levels.a.cells = null;
    const badStep = clone(); badStep.territories['971'].levels.a.dLat = 0;
    const wrongKey = clone();
    for (const [name, data, key] of [['no origin', noOrigin, '1'], ['no cells', noCells, '1'], ['bad step', badStep, '1'], ['wrong key', wrongKey, '7'], ['null', null, '1']]) {
        const engine = api.createEngine({ referentials: { [key]: data } });
        assert.equal(engine.validateZoneId(sample).ok, false, name);
        assert.equal(engine.validateZoneId(sample).reason, 'REFERENTIAL_UNAVAILABLE', name);
    }
    // A partial referential only authorises what it contains.
    const only971 = clone(); delete only971.territories['972']; delete only971.territories['973']; delete only971.territories['974'];
    const partial = api.createEngine({ referentials: { 1: only971 } });
    assert.deepEqual(partial.supportedTerritories().map((t) => t.code), ['971']);
    assert.equal(partial.validateZoneId(sample).ok, true);
    assert.equal(partial.validateZoneId(allZones('972')[0].id).reason, 'UNSUPPORTED_TERRITORY');
    assert.equal(partial.resolveTerritory('martinique').status, 'UNSUPPORTED');
    // The referential can be a lazy source: a file loaded after the engine is picked up.
    let loadedLater = {};
    const lazy = api.createEngine({ referentials: () => loadedLater });
    assert.equal(lazy.validateZoneId(sample).reason, 'REFERENTIAL_UNAVAILABLE');
    loadedLater = { 1: referential };
    assert.equal(lazy.validateZoneId(sample).ok, true);
    // Versions coexist: a v2 referential would not change what v1 ids mean.
    const v2 = clone(); v2.version = 2; v2.territories['971'].levels.a.cells = {};
    const both = api.createEngine({ referentials: { 1: referential, 2: v2 } });
    assert.equal(both.validateZoneId(sample).ok, true);
    assert.equal(both.validateZoneId(sample.replace('-v1-', '-v2-')).reason, 'UNKNOWN_ZONE');
}

// 11. The contract carries no precise position, anywhere.
{
    const everything = JSON.stringify(referential);
    // Sector centres are land centroids of a whole cell, rounded to 3 decimals; communes are INSEE codes.
    const numbers = [...everything.matchAll(/-?\d+\.\d{4,}/g)].map((m) => m[0]);
    const allowed = new Set(JSON.stringify({ o: Object.values(referential.territories).flatMap((t) => [t.origin, t.refLat]) }).match(/-?\d+\.\d+/g) || []);
    for (const level of Object.values(referential.territories).flatMap((t) => Object.values(t.levels))) {
        allowed.add(String(level.dLat)); allowed.add(String(level.dLng));
    }
    allowed.add(String(referential.meta.params.kmPerDegreeLat));
    for (const number of numbers) assert.ok(allowed.has(number), `unexpected precise number in referential: ${number}`);
    // Only one function takes a point, and it returns an identifier or null.
    const takesPoint = Object.entries(zones).filter(([, fn]) => typeof fn === 'function' && /lat/i.test(fn.toString().split('{')[0]));
    assert.deepEqual(takesPoint.map(([name]) => name), ['zoneAtPoint']);
    // No timestamp, no member, no request data in the referential.
    assert.doesNotMatch(everything, /requester|author|user_id|created_at|address/i);
}

// 12. Version and shape of the public module.
{
    for (const name of ['supportedTerritories', 'resolveTerritory', 'formatZoneId', 'parseZoneId', 'validateZoneId', 'describeZone', 'parentZoneId', 'publicZone',
        'communeCodeFor', 'zoneAtPoint', 'zonesForTerritory', 'zonesForCommune', 'validateZoneSelection', 'placementForRow']) {
        assert.equal(typeof zones[name], 'function', name);
    }
    assert.equal(Object.isFrozen(zones), true);
    assert.equal(zones.describeZone(allZones('971')[0].id).parent !== undefined, true);
    assert.deepEqual(allZones('971', 'zz'), []);
    assert.deepEqual(allZones('978'), []);
    assert.ok(allZones('971', 'a').map(idOf).every((id) => /^971-v1-a-\d+\.\d+$/.test(id)));
}

console.log('approx-zone V1 (legacy) contract passed');
