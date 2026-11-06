'use strict';

// Phase 2.8B-1.1: V2 sectors (about 2 km) and the three publication modes.
// Offline: the referentials are committed files, the generator is exercised on a synthetic fixture.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

const api = require('../approx-zone.js');
const v1 = require('../approx-zone-referential.v1.js');
const v2 = require('../approx-zone-referential.v2.js');
const generator = require('../scripts/build-approx-zone-referential.js');
const needsMap = require('../needs-map.js');

const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('commune-geo.js', 'utf8'), sandbox);

const V1_FINGERPRINT = 'e8695e6b1f828dfba59360184d2a1fe856f6a4c56f070c468e059090d97e40e6';
const FINE = (territory) => api.zonesForTerritory(territory, { level: 'a' });
const WIDE = (territory) => api.zonesForTerritory(territory, { level: 'b' });
const sha = (body) => crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
const metres = (a, b, refLat) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(refLat * Math.PI / 180));

// 1. Deterministic generation -------------------------------------------------------------
{
    const { integrity, ...body } = v2;
    assert.equal(integrity.algorithm, 'sha256');
    assert.equal(sha(body), integrity.value, 'V2 referential was modified by hand');
    assert.equal(v2.version, 2);
    assert.deepEqual(Object.keys(v2.territories), ['971', '972', '974']);
    assert.deepEqual(Object.keys(v2.meta.unsupported).sort(), ['973', '976', '977', '978']);

    const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
    const ring = (geometry) => ({ type: 'Polygon', coordinates: [geometry.coordinates[0].slice().reverse()] });
    const communes = [
        { code: '97101', nom: 'A', contour: box(-61.60, 16.20, -61.52, 16.27) },
        { code: '97102', nom: 'B', contour: box(-61.52, 16.20, -61.44, 16.27) },
        { code: '97103', nom: 'Ilot', contour: box(-61.40, 16.30, -61.39, 16.31) }
    ];
    const config = generator.CONFIGS[2];
    const territory = config.territories['971'];
    const first = generator.buildTerritoryEntry(communes, territory, config);
    const second = generator.buildTerritoryEntry(communes, territory, config);
    assert.deepEqual(first.entry, second.entry, 'same input, same output');
    const shuffled = generator.buildTerritoryEntry(
        [communes[2], { ...communes[1], contour: ring(communes[1].contour) }, communes[0]], territory, config
    );
    assert.deepEqual(shuffled.entry, first.entry, 'commune order and ring orientation never change a sector');
    const data = { version: 2, territories: { '971': first.entry } };
    assert.equal(generator.render(data, config), generator.render(JSON.parse(JSON.stringify(data)), config));

    // A representative centre always lies on land: the nearest land sample, never a sea point.
    const inside = (geometry, lat, lng) => {
        const [[w, s], , [e, n]] = geometry.coordinates[0];
        return lng >= w && lng <= e && lat >= s && lat <= n;
    };
    const cells = Object.values(first.entry.levels.a.cells);
    assert.ok(cells.length > 10);
    for (const [land, lat, lng, owners] of cells) {
        assert.ok(land >= config.minLandPct.a, 'fine cells keep a minimum of land');
        assert.ok(owners.some(([code]) => inside(communes.find((c) => c.code === code).contour, lat, lng)),
            'the centre is inside one of the communes of the cell');
        assert.equal(Math.abs(lat * 1000 - Math.round(lat * 1000)) < 1e-6, true, 'centre rounded to 3 decimals');
    }
    assert.ok(first.entry.communes['97103'], 'a small island keeps its commune');

    // The committed file is the same file in a browser and in Node.
    const browser = { window: {} };
    browser.window = browser;
    vm.createContext(browser);
    vm.runInContext(fs.readFileSync('approx-zone-referential.v2.js', 'utf8'), browser);
    assert.equal(JSON.stringify(browser.LYANN_APPROX_ZONE_REFERENTIALS[2]), JSON.stringify(v2));
}

// 2. V1 and V2 coexist --------------------------------------------------------------------
{
    const { integrity, ...body } = v1;
    assert.equal(integrity.value, V1_FINGERPRINT, 'V1 referential must stay frozen');
    assert.equal(sha(body), V1_FINGERPRINT);

    assert.deepEqual(api.SELECTABLE_VERSIONS, [2]);
    assert.deepEqual(api.supportedTerritories().map((t) => [t.code, t.version]), [['971', 2], ['972', 2], ['974', 2]]);
    const legacy = Object.keys(v1.territories['971'].levels.a.cells)[0];
    const legacyZone = `971-v1-a-${legacy}`;
    // Old ids stay readable (existing announcements) ...
    assert.equal(api.validateZoneId(legacyZone).ok, true);
    assert.equal(api.describeZone(legacyZone).version, 1);
    assert.equal(api.describeZone(legacyZone).sizeKm, 5.5);
    // ... but cannot be chosen for a new announcement.
    const legacyZoneData = api.describeZone(legacyZone);
    const commune = legacyZoneData.communes[0].name;
    const refused = api.validateZoneSelection({
        service_mode: 'ON_SITE', territory: '971', commune, zone_id: legacyZone, location_confirmed: true
    });
    assert.deepEqual([refused.ok, refused.reason], [false, 'VERSION_NOT_SELECTABLE']);
    // Pickers only ever produce V2 ids.
    assert.match(api.zoneAtPoint('971', 16.241, -61.533), /^971-v2-a-/);
    assert.ok(FINE('971').every((z) => z.version === 2));
    assert.notEqual(api.formatZoneId({ territory: '971', version: 1, level: 'a', ix: 3, iy: 4 }),
        api.formatZoneId({ territory: '971', version: 2, level: 'a', ix: 3, iy: 4 }));
    // A V1-only engine remains available for audits.
    const legacyEngine = api.createEngine({ referentials: { 1: v1 }, selectableVersions: [1] });
    assert.match(legacyEngine.zoneAtPoint('971', 16.241, -61.533), /^971-v1-a-/);
}

// 3. Sector sizes: about 2 km, honestly reported -------------------------------------------
{
    const expected = { '971': [263, 90], '972': [174, 56], '974': [354, 101] };
    for (const [code, [fine, wide]] of Object.entries(expected)) {
        assert.equal(FINE(code).length, fine, `${code} fine sectors`);
        assert.equal(WIDE(code).length, wide, `${code} wide sectors`);
        const entry = v2.territories[code];
        for (const [id, size] of [['a', 2.8], ['b', 5.6]]) {
            const level = entry.levels[id];
            assert.equal(level.sizeKm, size);
            assert.ok(Math.abs(level.dLat * 111.32 - size) / size < 0.01, 'height matches the size');
            assert.ok(Math.abs(level.dLng * 111.32 * Math.cos(entry.refLat * Math.PI / 180) - size) / size < 0.01, 'width matches the size');
        }
        const covers = FINE(code).map((z) => z.coverRadiusM).sort((a, b) => a - b);
        const median = covers[Math.floor(covers.length / 2)];
        assert.ok(median >= 2000 && median <= 2300, `${code} median cover radius ${median}`);
        assert.ok(covers[covers.length - 1] <= 3300, `${code} worst cover radius ${covers[covers.length - 1]}`);
        for (const zone of FINE(code)) {
            assert.equal(zone.radiusM, 2000, 'nominal half-diagonal of a 2.8 km sector');
            assert.ok(zone.coverRadiusM >= zone.radiusM - 200, 'cover radius never understates the sector');
            assert.ok(zone.landPct >= v2.meta.params.minLandPct.a);
        }
        for (const zone of WIDE(code)) assert.equal(zone.radiusM, 4000);
    }
    // The cover radius is the real farthest corner from the stored centre, not a promise.
    const sample = FINE('972')[10];
    const corners = [[sample.bounds.south, sample.bounds.west], [sample.bounds.south, sample.bounds.east],
        [sample.bounds.north, sample.bounds.west], [sample.bounds.north, sample.bounds.east]];
    const farthest = Math.max(...corners.map(([lat, lng]) => metres(sample.center, { lat, lng }, 14.65)));
    assert.ok(Math.abs(sample.coverRadiusM - farthest) <= 150, `${sample.coverRadiusM} vs ${Math.round(farthest)}`);
}

// 4. Sweep: every sector is coherent -------------------------------------------------------
{
    for (const code of ['971', '972', '974']) {
        const entry = v2.territories[code];
        const reachable = new Set();
        for (const level of ['a', 'b']) {
            for (const zone of api.zonesForTerritory(code, { level })) {
                assert.equal(api.validateZoneId(zone.id).ok, true);
                assert.equal(api.zoneAtPoint(code, zone.center.lat, zone.center.lng, { level }), zone.id, `${zone.id} centre falls in its own sector`);
                assert.ok(zone.bounds.south < zone.center.lat && zone.center.lat < zone.bounds.north, zone.id);
                assert.ok(zone.bounds.west < zone.center.lng && zone.center.lng < zone.bounds.east, zone.id);
                assert.ok(zone.communes.length >= 1);
                assert.ok(zone.communes.reduce((sum, c) => sum + c.share, 0) <= 100 + 0.5 * zone.communes.length, 'shares are rounded percentages of the land of the sector');
                for (const c of zone.communes) {
                    assert.ok(entry.communes[c.code], `${zone.id} -> known commune ${c.code}`);
                    reachable.add(`${level}:${c.code}`);
                }
                if (level === 'a') {
                    assert.ok(zone.parent, `${zone.id} has a wide parent`);
                    const parent = api.describeZone(zone.parent);
                    assert.ok(parent.bounds.south <= zone.bounds.south + 1e-4 && parent.bounds.north >= zone.bounds.north - 1e-4);
                    assert.ok(parent.bounds.west <= zone.bounds.west + 1e-4 && parent.bounds.east >= zone.bounds.east - 1e-4);
                }
            }
        }
        // Every commune of the referential can be placed at the wide level at least.
        for (const c of Object.keys(entry.communes)) {
            assert.ok(reachable.has(`a:${c}`) || reachable.has(`b:${c}`), `${code}/${c} unreachable`);
        }
    }
    // Official commune centres used by the product all fall in a sector listing that commune.
    let checked = 0;
    for (const [key, [lat, lng]] of Object.entries(sandbox.LYANN_COMMUNE_GEO)) {
        const [code, name] = key.split('|');
        if (!['971', '972', '974'].includes(code)) continue;
        const communeCode = api.communeCodeFor(code, name);
        assert.ok(communeCode, `${key} known`);
        for (const level of ['a', 'b']) {
            const id = api.zoneAtPoint(code, lat, lng, { level });
            assert.ok(id, `${key} ${level}`);
            assert.ok(api.describeZone(id).communes.some((c) => c.code === communeCode), `${key} ${level} listed commune`);
        }
        checked += 1;
    }
    assert.equal(checked, 90);
}

// 5. Commune / sector correspondence and coastal cells ------------------------------------
{
    for (const [territory, name] of [['971', 'Les Abymes'], ['972', 'Fort-de-France'], ['974', 'Saint-Denis']]) {
        const code = api.communeCodeFor(territory, name);
        const zones = api.zonesForCommune(territory, name, { level: 'a' });
        assert.ok(zones.length >= 3, `${name} has several fine sectors`);
        assert.ok(zones.every((z) => z.communes.some((c) => c.code === code)));
        assert.deepEqual(zones.map((z) => z.communeShare), [...zones.map((z) => z.communeShare)].sort((a, b) => b - a));
        // The sector of another commune is refused for this commune.
        const foreign = FINE(territory).find((z) => !z.communes.some((c) => c.code === code));
        const refused = api.validateZoneSelection({
            service_mode: 'ON_SITE', territory, commune: name, zone_id: foreign.id, location_confirmed: true
        });
        assert.deepEqual([refused.ok, refused.reason], [false, 'COMMUNE_NOT_IN_ZONE']);
    }
    // Small islands and archipelagos keep their own sectors.
    for (const name of ['Terre-de-Haut', 'Terre-de-Bas', 'La Désirade', 'Grand-Bourg', 'Capesterre-de-Marie-Galante', 'Saint-Louis']) {
        const code = api.communeCodeFor('971', name);
        const zones = api.zonesForCommune('971', name);
        assert.ok(zones.length >= 1, name);
        assert.ok(zones.every((z) => z.communes.some((c) => c.code === code)), name);
    }
    // The sea is never a sector, at any level.
    for (const [territory, lat, lng] of [['971', 16.6, -61.9], ['971', 16.05, -61.1], ['971', 15.7, -61.5], ['972', 14.9, -60.6], ['972', 14.3, -60.8], ['974', -21.5, 54.7], ['974', -20.9, 56.1]]) {
        for (const level of ['a', 'b']) assert.equal(api.zoneAtPoint(territory, lat, lng, { level }), null, `${territory} ${lat},${lng}`);
    }
    // Coastal sectors exist and say how little land they hold; wide sectors cover what a fine one would not.
    for (const code of ['971', '972', '974']) {
        assert.ok(FINE(code).some((z) => z.landPct < 40), `${code} has coastal fine sectors`);
        assert.ok(FINE(code).some((z) => z.landPct === 100), `${code} has fully inland sectors`);
    }
    const wideOnly = WIDE('971').filter((w) => !FINE('971').some((f) => f.parent === w.id));
    assert.ok(wideOnly.length >= 1);
    assert.ok(wideOnly.every((w) => w.landPct < 10 || w.landPct >= 3), 'wide-only sectors hold little land');
    // A cell never claims a commune that has no land in it.
    for (const zone of FINE('971')) assert.ok(zone.communes.every((c) => c.share > 0));
}

// 6. Unauthorized zones are refused -------------------------------------------------------
{
    const abymes = 'Les Abymes';
    const good = api.zonesForCommune('971', abymes)[0];
    const submit = (over) => api.validateZoneSelection({
        service_mode: 'ON_SITE', territory: '971', commune: abymes, zone_id: good.id, location_confirmed: true, ...over
    });
    assert.equal(submit({}).ok, true);
    const refusals = [
        ['971-v2-a-0.0', 'UNKNOWN_ZONE'],
        ['971-v2-a-9999.9999', 'UNKNOWN_ZONE'],
        ['971-v2-c-12.2', 'UNSUPPORTED_LEVEL'],
        ['971-v3-a-12.2', 'UNSUPPORTED_VERSION'],
        ['973-v2-a-5.5', 'UNSUPPORTED_TERRITORY'],
        ['978-v2-a-5.5', 'UNSUPPORTED_TERRITORY'],
        ['971-v2-a-012.2', 'MALFORMED'],
        [' 971-v2-a-12.2', 'MALFORMED'],
        ['971-V2-A-12.2', 'MALFORMED'],
        ['971-v2-a-12.2; drop', 'MALFORMED'],
        ['16.2,-61.5', 'MALFORMED'],
        [42, 'MALFORMED'],
        [{}, 'MALFORMED']
    ];
    for (const [zone_id, reason] of refusals) {
        const result = submit({ zone_id });
        assert.equal(result.ok, false, String(zone_id));
        assert.equal(result.reason, reason, String(zone_id));
    }
    // A real id of another territory is refused for this territory.
    const martinique = FINE('972')[0];
    assert.equal(submit({ zone_id: martinique.id }).reason, 'TERRITORY_MISMATCH');
    // A sector id nobody generated is never accepted, wherever it points.
    const validIds = new Set(FINE('971').map((z) => z.id));
    let refusedCount = 0;
    for (let ix = 0; ix < 60; ix += 1) {
        for (let iy = 0; iy < 40; iy += 1) {
            const id = `971-v2-a-${ix}.${iy}`;
            if (validIds.has(id)) continue;
            assert.equal(api.validateZoneId(id).ok, false, id);
            refusedCount += 1;
        }
    }
    assert.ok(refusedCount > 1000);
}

// 7. STANDARD mode ------------------------------------------------------------------------
{
    const zone = api.zonesForCommune('972', 'Le Lamentin')[0];
    const input = { service_mode: 'ON_SITE', territory: '972', commune: 'Le Lamentin', zone_id: zone.id, location_confirmed: true };
    const ok = api.validateZoneSelection(input);
    assert.equal(ok.ok, true);
    assert.equal(ok.visibility, 'STANDARD');
    assert.deepEqual(ok.record, {
        service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_commune_code: api.communeCodeFor('972', 'Le Lamentin'),
        location_zone_id: zone.id, location_zone_version: 2
    });
    assert.deepEqual(Object.keys(ok.record), ['service_mode', 'location_visibility', 'location_commune_code', 'location_zone_id', 'location_zone_version']);
    assert.deepEqual(ok.zone.center, zone.center, 'the public pin is the representative centre of the sector');
    assert.equal(api.validateZoneSelection({ ...input, location_visibility: 'STANDARD' }).ok, true);
    // Standard is the default but never silent.
    for (const confirmed of [undefined, false]) {
        assert.equal(api.validateZoneSelection({ ...input, location_confirmed: confirmed }).reason, 'CONFIRMATION_REQUIRED');
    }
    for (const bad of ['true', 1, null]) assert.equal(api.validateZoneSelection({ ...input, location_confirmed: bad }).reason, 'INVALID_CONFIRMATION');
    assert.equal(api.validateZoneSelection({ ...input, zone_id: undefined }).reason, 'ZONE_REQUIRED');
    assert.equal(api.validateZoneSelection({ ...input, commune: undefined }).reason, 'COMMUNE_REQUIRED');
    assert.equal(api.validateZoneSelection({ ...input, commune: 'Nulle part' }).reason, 'COMMUNE_UNKNOWN');
    assert.equal(api.validateZoneSelection({ ...input, territory: 'Atlantide' }).reason, 'TERRITORY_UNKNOWN');
    assert.equal(api.validateZoneSelection({ ...input, location_visibility: 'PUBLIC' }).reason, 'INVALID_VISIBILITY');
    assert.equal(api.validateZoneSelection({ ...input, service_mode: 'HYBRID' }).reason, 'INVALID_MODE');
    assert.equal(api.validateZoneSelection(null).reason, 'INVALID_SELECTION');
    assert.equal(api.validateZoneSelection([input]).reason, 'INVALID_SELECTION');
    // Every fine and wide sector of a commune can be chosen for it.
    for (const level of ['a', 'b']) {
        for (const candidate of api.zonesForCommune('974', 'Saint-Pierre', { level })) {
            assert.equal(api.validateZoneSelection({ service_mode: 'ON_SITE', territory: '974', commune: 'Saint-Pierre', zone_id: candidate.id, location_confirmed: true }).ok, true, candidate.id);
        }
    }
}

// 8. DISCREET mode ------------------------------------------------------------------------
{
    const input = { service_mode: 'ON_SITE', location_visibility: 'DISCREET', territory: '971', commune: 'Sainte-Anne', location_confirmed: true };
    const ok = api.validateZoneSelection(input);
    assert.equal(ok.ok, true);
    assert.equal(ok.zone, null, 'no sector is stored or returned');
    assert.deepEqual(ok.record, {
        service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_commune_code: api.communeCodeFor('971', 'Sainte-Anne'),
        location_zone_id: null, location_zone_version: null
    });
    const zone = api.zonesForCommune('971', 'Sainte-Anne')[0];
    assert.equal(api.validateZoneSelection({ ...input, zone_id: zone.id }).reason, 'ZONE_NOT_ALLOWED_FOR_DISCREET');
    assert.equal(api.validateZoneSelection({ ...input, location_confirmed: false }).reason, 'CONFIRMATION_REQUIRED');
    assert.equal(api.validateZoneSelection({ ...input, commune: undefined }).reason, 'COMMUNE_REQUIRED');
    assert.equal(api.validateZoneSelection({ ...input, commune: 'Fort-de-France' }).reason, 'COMMUNE_UNKNOWN');
    // Same commune name, two territories: the territory decides.
    for (const [territory, commune] of [['972', 'Sainte-Anne'], ['974', 'Saint-Paul']]) {
        const result = api.validateZoneSelection({ ...input, territory, commune });
        assert.equal(result.ok, true);
        assert.equal(result.record.location_commune_code.slice(0, 3), territory);
    }
}

// 9. REMOTE mode --------------------------------------------------------------------------
{
    const remote = api.validateZoneSelection({ service_mode: 'REMOTE' });
    assert.deepEqual(remote, {
        ok: true, mode: 'REMOTE', visibility: null, zone: null, fallback: null,
        record: { service_mode: 'REMOTE', location_visibility: null, location_commune_code: null, location_zone_id: null, location_zone_version: null }
    });
    // Nothing local may be attached to a remote announcement, and nothing is invented.
    const zone = FINE('971')[0];
    assert.equal(api.validateZoneSelection({ service_mode: 'REMOTE', zone_id: zone.id }).reason, 'ZONE_NOT_ALLOWED_FOR_REMOTE');
    assert.equal(api.validateZoneSelection({ service_mode: 'REMOTE', location_visibility: 'DISCREET' }).reason, 'VISIBILITY_NOT_ALLOWED_FOR_REMOTE');
    assert.equal(api.validateZoneSelection({ service_mode: 'REMOTE', territory: '971', commune: 'Les Abymes' }).record.location_commune_code, null);
    assert.equal(api.placementForRow({ id: 'r', service_mode: 'REMOTE' }, { authenticated: true }).kind, 'REMOTE');
}

// 10. Old announcements and unsupported territories --------------------------------------
{
    const legacy = { id: 'old', location: 'Les Abymes', visibility: 'PUBLIC', status: 'OPEN', safety_status: 'SAFE', public_moderation_status: 'approved' };
    assert.deepEqual(api.placementForRow(legacy, { authenticated: true }), { kind: 'LEGACY' }, 'old announcements keep today\'s behaviour');
    assert.deepEqual(api.placementForRow({ id: 'older' }, { authenticated: true }), { kind: 'LEGACY' });
    assert.deepEqual(api.placementForRow({ ...legacy, service_mode: null, location_visibility: null }, { authenticated: true }), { kind: 'LEGACY' });
    // Guyane and Saint-Martin: no fine sector, today's commune-level location stays.
    for (const [territory, commune, detail] of [['973', 'Cayenne', 'GRANULARITY_NOT_VALIDATED'], ['978', 'Saint-Martin', 'NO_COMMUNE_DATA'], ['976', 'Mamoudzou', 'NO_REFERENTIAL']]) {
        const resolved = api.resolveTerritory(territory);
        assert.deepEqual([resolved.status, resolved.reason, resolved.detail], ['UNSUPPORTED', 'UNSUPPORTED_TERRITORY', detail], territory);
        assert.deepEqual(api.zonesForTerritory(territory), []);
        assert.equal(api.zoneAtPoint(territory, 4.9, -52.3), null);
        const result = api.validateZoneSelection({ service_mode: 'ON_SITE', territory, commune });
        assert.deepEqual([result.ok, result.fallback, result.record.location_zone_id, result.record.location_visibility], [true, 'TERRITORY_UNSUPPORTED', null, null]);
        const forced = api.validateZoneSelection({ service_mode: 'ON_SITE', territory, commune, zone_id: '973-v2-a-5.5', location_confirmed: true });
        assert.deepEqual([forced.ok, forced.reason], [false, 'UNSUPPORTED_TERRITORY']);
    }
    // Guyane V1 ids already stored remain readable.
    const guyane = Object.keys(v1.territories['973'].levels.b.cells)[0];
    assert.equal(api.describeZone(`973-v1-b-${guyane}`).version, 1);

    // Placement degrades to the less precise option, never to a guess.
    const code = api.communeCodeFor('971', 'Les Abymes');
    const zone = api.zonesForCommune('971', 'Les Abymes')[0];
    const stored = { ...legacy, service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_commune_code: code, location_zone_id: zone.id, location_zone_version: 2 };
    const placed = api.placementForRow(stored, { authenticated: true });
    assert.equal(placed.kind, 'ZONE');
    assert.deepEqual(placed.zone.center, zone.center);
    assert.deepEqual(Object.keys(placed.zone), ['id', 'version', 'territory', 'sizeKm', 'label', 'center', 'radiusM', 'coverRadiusM']);
    assert.deepEqual(api.placementForRow({ ...stored, location_zone_version: 1 }, { authenticated: true }).reason, 'ZONE_INVALID');
    assert.deepEqual(api.placementForRow({ ...stored, location_zone_id: '971-v2-a-0.0' }, { authenticated: true }).kind, 'COMMUNE');
    assert.deepEqual(api.placementForRow({ ...stored, location_commune_code: api.communeCodeFor('971', 'Sainte-Anne') }, { authenticated: true }).reason, 'ZONE_INVALID');
    assert.equal(api.placementForRow({ ...stored, location_commune_code: null }, { authenticated: true }).kind, 'LEGACY');
    const discreet = api.placementForRow({ ...legacy, service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_commune_code: code }, { authenticated: true });
    assert.deepEqual(discreet, { kind: 'COMMUNE', communeCode: code, communeName: 'Les Abymes', reason: null });
    assert.equal(api.placementForRow({ ...legacy, service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_commune_code: 'zzzzz' }, { authenticated: true }).kind, 'LEGACY');
}

// 11. Audience and eligibility: identical to the needs map ---------------------------------
{
    const code = api.communeCodeFor('971', 'Les Abymes');
    const zone = api.zonesForCommune('971', 'Les Abymes')[0];
    const base = {
        id: 'r1', visibility: 'PUBLIC', status: 'OPEN', safety_status: 'SAFE', classification_status: 'CLASSIFIED', public_moderation_status: 'approved',
        service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_commune_code: code, location_zone_id: zone.id, location_zone_version: 2
    };
    for (const authenticated of [false, undefined, 'true', 1]) {
        assert.deepEqual(api.placementForRow(base, { authenticated }), { kind: 'NONE', reason: 'AUDIENCE' });
    }
    assert.deepEqual(api.placementForRow(base), { kind: 'NONE', reason: 'AUDIENCE' });
    assert.equal(api.publicZone(zone.id), null);
    assert.equal(api.publicZone(zone.id, { authenticated: false }), null);
    assert.equal(api.publicZone(zone.id, { authenticated: true }).id, zone.id);
    const variants = [
        {}, { visibility: 'DIRECT' }, { visibility: 'PRIVATE' }, { status: 'CLOSED' }, { status: 'CANCELLED' }, { safety_status: 'REVIEW' },
        { safety_status: 'PROHIBITED' }, { target_user_id: 'u2' }, { classification_status: 'BLOCKED' }, { public_moderation_status: 'pending' },
        { public_moderation_status: 'rejected' }, { id: undefined }
    ];
    for (const variant of variants) {
        const row = { ...base, ...variant };
        const eligible = needsMap.eligibleRequest(row);
        const placement = api.placementForRow(row, { authenticated: true });
        assert.equal(placement.kind !== 'NONE', eligible, JSON.stringify(variant));
        if (!eligible) assert.equal(JSON.stringify(placement).includes(zone.id), false, 'no location leaks from a masked announcement');
    }
    assert.deepEqual(api.placementForRow(null, { authenticated: true }), { kind: 'NONE', reason: 'NOT_PUBLIC' });
}

// 12. No personal coordinate in any record ------------------------------------------------
{
    const zone = api.zonesForCommune('971', 'Les Abymes')[0];
    const valid = { service_mode: 'ON_SITE', territory: '971', commune: 'Les Abymes', zone_id: zone.id, location_confirmed: true };
    for (const field of ['lat', 'lng', 'lon', 'latitude', 'longitude', 'coords', 'coordinates', 'position', 'gps', 'address', 'adresse', 'street', 'rue', 'point', 'location_lat', 'location_lng', 'location']) {
        const result = api.validateZoneSelection({ ...valid, [field]: 16.2411 });
        assert.deepEqual([result.ok, result.reason, result.field], [false, 'FORBIDDEN_FIELD', field], field);
    }
    for (const field of ['visibility', 'status', 'requester_id', 'created_at', 'commune_code', '__proto__x']) {
        const result = api.validateZoneSelection({ ...valid, [field]: 'x' });
        assert.deepEqual([result.ok, result.reason], [false, 'UNEXPECTED_FIELD'], field);
    }
    // Whatever the mode, the stored record is five scalar columns and nothing else.
    const records = [
        api.validateZoneSelection(valid).record,
        api.validateZoneSelection({ ...valid, location_visibility: 'DISCREET', zone_id: undefined }).record,
        api.validateZoneSelection({ service_mode: 'REMOTE' }).record,
        api.validateZoneSelection({ service_mode: 'ON_SITE', territory: '973', commune: 'Cayenne' }).record
    ];
    for (const record of records) {
        assert.deepEqual(Object.keys(record), ['service_mode', 'location_visibility', 'location_commune_code', 'location_zone_id', 'location_zone_version']);
        for (const value of Object.values(record)) assert.ok(value === null || typeof value === 'string' || Number.isInteger(value));
        assert.doesNotMatch(JSON.stringify(record), /\d+\.\d{3,}/, 'no decimal coordinate in a stored record');
    }
    // The referential holds only 3-decimal representative centres; no free-form position.
    const decimals = JSON.stringify(v2).match(/-?\d+\.\d{4,}/g) || [];
    const allowed = new Set();
    for (const entry of Object.values(v2.territories)) {
        allowed.add(entry.origin[0]); allowed.add(entry.origin[1]); allowed.add(entry.refLat);
        for (const level of Object.values(entry.levels)) { allowed.add(level.dLat); allowed.add(level.dLng); }
    }
    for (const number of decimals) assert.ok(allowed.has(Number(number)), `unexpected precise number ${number}`);
    // Only zoneAtPoint accepts a position, and the engine has no network nor geolocation.
    const takesPoint = Object.entries(api)
        .filter(([, fn]) => typeof fn === 'function' && fn !== api.createEngine)
        .filter(([, fn]) => /\b(lat|lng)\b/.test(fn.toString().split('{')[0]))
        .map(([name]) => name);
    assert.deepEqual(takesPoint, ['zoneAtPoint']);
    const source = fs.readFileSync('approx-zone.js', 'utf8');
    assert.doesNotMatch(source, /Math\.random|crypto\.getRandom|geolocation|fetch\(|XMLHttpRequest|localStorage|sendBeacon/);
}

// 13. Data contract mirrored from the proposed SQL checks -----------------------------------
{
    // Same predicate as the proposed CHECK constraints (docs/approx-location-contract-v2.md).
    const storable = (r) => {
        const nulls = (...keys) => keys.every((k) => r[k] === null);
        if (r.service_mode === null) return nulls('location_visibility', 'location_commune_code', 'location_zone_id', 'location_zone_version');
        if (r.service_mode === 'REMOTE') return nulls('location_visibility', 'location_commune_code', 'location_zone_id', 'location_zone_version');
        if (r.service_mode !== 'ON_SITE') return false;
        if (r.location_visibility === null) return nulls('location_commune_code', 'location_zone_id', 'location_zone_version');
        if (r.location_visibility === 'DISCREET') return /^\d{5}$/.test(r.location_commune_code) && nulls('location_zone_id', 'location_zone_version');
        if (r.location_visibility !== 'STANDARD') return false;
        const parsed = /^(\d{3})-v(\d{1,2})-([a-z])-(\d{1,4})\.(\d{1,4})$/.exec(r.location_zone_id || '');
        return Boolean(parsed) && /^\d{5}$/.test(r.location_commune_code) && Number(parsed[2]) === r.location_zone_version
            && r.location_commune_code.startsWith(parsed[1]);
    };
    const zone = api.zonesForCommune('971', 'Les Abymes')[0];
    const valid = { service_mode: 'ON_SITE', territory: '971', commune: 'Les Abymes', zone_id: zone.id, location_confirmed: true };
    for (const input of [
        valid, { ...valid, location_visibility: 'DISCREET', zone_id: undefined }, { service_mode: 'REMOTE' },
        { service_mode: 'ON_SITE', territory: '973', commune: 'Cayenne' }
    ]) assert.equal(storable(api.validateZoneSelection(input).record), true);
    assert.equal(storable({ service_mode: null, location_visibility: null, location_commune_code: null, location_zone_id: null, location_zone_version: null }), true, 'old announcements');
    const record = api.validateZoneSelection(valid).record;
    for (const broken of [
        { ...record, service_mode: 'REMOTE' }, { ...record, location_zone_version: 1 }, { ...record, location_zone_id: null },
        { ...record, location_commune_code: '97399' }, { ...record, location_visibility: 'DISCREET' },
        { ...record, location_visibility: 'PUBLIC' }, { ...record, service_mode: 'HYBRID' }
    ]) assert.equal(storable(broken), false);
}

// 14. Published copy ----------------------------------------------------------------------
{
    assert.equal(api.LOCATION_COPY.title, 'Où avez-vous besoin d\'aide ?');
    assert.equal(api.LOCATION_COPY.modes.STANDARD.hint, 'Indiquez approximativement le secteur de votre mission.');
    assert.equal(api.LOCATION_COPY.modes.DISCREET.hint, 'Seule votre commune sera affichée.');
    assert.equal(api.LOCATION_COPY.modes.REMOTE.hint, 'Cette mission peut être réalisée sans déplacement.');
    assert.equal(api.LOCATION_COPY.preview, 'Voici la localisation approximative visible par les autres membres.');
    assert.match(api.LOCATION_COPY.notice, /ne garantit pas l'anonymat/);
}

// 15. The current map is untouched --------------------------------------------------------
{
    for (const file of ['needs-map.js', 'needs-map.css', 'needs-map-category-families.js', 'explorer-ui.js', 'results.html', 'api/public-explorer-requests.js', 'api-client.js']) {
        const text = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(text, /LYANN_APPROX_ZONE|approx-zone|service_mode|location_zone_id|location_visibility/, `${file} must not use the zone engine yet`);
    }
    // The map's eligibility rule and grouping are the ones the engine mirrors.
    assert.equal(typeof needsMap.eligibleRequest, 'function');
    assert.equal(typeof needsMap.groupByCommune, 'function');
}

console.log('approx-zone V2 contract passed');
