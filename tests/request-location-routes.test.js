'use strict';

// Phase 2.8B-2: PUT /v1/requests/:id/location. Offline: the database is an in-memory fake, the engine and the
// referentials are the committed ones. The real-database proof is tests/rls/request-locations-*.
//   node tests/request-location-routes.test.js

const assert = require('node:assert/strict');
const { createRequestLocationHandler, resolveSelection } = require('../api/request-location-routes.js');
const engine = require('../approx-zone.js');

const AUTHOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const RID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GOSIER = engine.zonesForCommune('971', 'Le Gosier')[0].id;      // 971-v2-a-15.16
const BAILLIF = engine.zonesForCommune('971', 'Baillif')[0].id;
const v1 = require('../approx-zone-referential.v1.js');
const V1_ZONE = `971-v1-a-${Object.keys(v1.territories['971'].levels.a.cells)[0]}`; // a real, legacy, no longer selectable sector

function fakeDb(rows) {
    const store = { requests: rows, request_locations: new Map(), writes: [] };
    const builder = (table) => {
        const state = { table, filters: {} };
        const api = {
            select() { return api; },
            eq(column, value) { state.filters[column] = value; return api; },
            async maybeSingle() { return { data: store.requests.find((r) => r.id === state.filters.id) || null, error: null }; },
            upsert(row) {
                store.writes.push(row);
                // The CHECK constraint is the database's job; here only the replace semantics matter.
                store.request_locations.set(row.request_id, { ...row, created_at: 't0', updated_at: 't1' });
                state.saved = store.request_locations.get(row.request_id);
                return api;
            },
            async single() { return { data: state.saved, error: null }; }
        };
        return api;
    };
    return { from: builder, store };
}
function fakeRes() {
    return { statusCode: 200, body: null, headers: {}, set(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
const request = (over = {}) => ({ id: RID, requester_id: AUTHOR, status: 'OPEN', public_moderation_status: 'approved',
    location: 'Le Gosier (971 - Guadeloupe)', territory: null, city: null, ...over });

async function call({ body, user = { id: AUTHOR }, row = request(), id = RID } = {}) {
    const db = fakeDb(row ? [row] : []);
    const handler = createRequestLocationHandler({ db, requireUser: async () => user });
    const res = fakeRes();
    await handler({ params: { id }, body, headers: {} }, res);
    return { res, db };
}
const ok = (r) => { assert.equal(r.res.statusCode, 200, JSON.stringify(r.res.body)); return r.res.body.location; };
const refused = (r, status, code) => { assert.equal(r.res.statusCode, status, JSON.stringify(r.res.body)); assert.equal(r.res.body.code, code); assert.equal(r.db.store.writes.length, 0, 'nothing written'); };

(async () => {
    // Authentication and authorship
    refused(await call({ body: {}, user: null }), 401, 'AUTH_REQUIRED');
    refused(await call({ body: { service_mode: 'REMOTE' }, user: { id: OTHER } }), 404, 'REQUEST_NOT_FOUND');
    refused(await call({ body: { service_mode: 'REMOTE' }, row: null }), 404, 'REQUEST_NOT_FOUND');
    refused(await call({ body: { service_mode: 'REMOTE' }, id: 'not-a-uuid' }), 404, 'REQUEST_NOT_FOUND');
    refused(await call({ body: { service_mode: 'REMOTE' }, row: request({ requester_id: null }) }), 404, 'REQUEST_NOT_FOUND');
    // The author id in the body is not a field: it is refused, never used.
    const spoof = await call({ body: { service_mode: 'REMOTE', requester_id: OTHER }, user: { id: OTHER } });
    refused(spoof, 404, 'REQUEST_NOT_FOUND');
    refused(await call({ body: { service_mode: 'REMOTE', requester_id: AUTHOR } }), 400, 'UNEXPECTED_FIELD');

    // Editability
    for (const status of ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED']) {
        refused(await call({ body: { service_mode: 'REMOTE' }, row: request({ status }) }), 409, 'REQUEST_NOT_EDITABLE');
    }
    refused(await call({ body: { service_mode: 'REMOTE' }, row: request({ public_moderation_status: 'rejected' }) }), 409, 'REQUEST_NOT_EDITABLE');
    ok(await call({ body: { service_mode: 'REMOTE' }, row: request({ status: 'PAUSED' }) }));
    ok(await call({ body: { service_mode: 'REMOTE' }, row: request({ public_moderation_status: 'pending' }) }));

    // Precise positions and addresses are refused, by name and by shape
    for (const field of ['lat', 'lng', 'latitude', 'longitude', 'coords', 'gps', 'geo', 'point', 'position', 'address', 'addr', 'street', 'rue', 'location', 'place_id']) {
        refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: GOSIER, [field]: field === 'coords' ? { lat: 16.2, lng: -61.5 } : 16.2 } }), 400, 'FORBIDDEN_FIELD');
    }
    refused(await call({ body: { service_mode: 'ON_SITE', note: 'au 12 rue des Lilas' } }), 400, 'UNEXPECTED_FIELD');
    refused(await call({ body: { service_mode: 'ON_SITE', commune: { lat: 1 } , location_confirmed: true, zone_id: GOSIER } }), 400, 'INVALID_SELECTION');
    refused(await call({ body: [] }), 400, 'INVALID_SELECTION');
    refused(await call({ body: 'x' }), 400, 'INVALID_SELECTION');
    refused(await call({ body: undefined }), 400, 'INVALID_SELECTION');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: 'yes', zone_id: GOSIER } }), 400, 'INVALID_CONFIRMATION');
    refused(await call({ body: { service_mode: 'ANYWHERE' } }), 400, 'INVALID_MODE');

    // STANDARD: sector from the V2 referential, commune from the announcement, confirmation required
    const standard = await call({ body: { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true, zone_id: GOSIER } });
    assert.deepEqual(
        (({ service_mode, location_visibility, commune_code, zone_id, zone_version }) => ({ service_mode, location_visibility, commune_code, zone_id, zone_version }))(ok(standard)),
        { service_mode: 'ON_SITE', location_visibility: 'STANDARD', commune_code: '97113', zone_id: GOSIER, zone_version: 2 });
    assert.equal(standard.db.store.writes.length, 1);
    assert.deepEqual(Object.keys(standard.db.store.writes[0]).sort(), ['commune_code', 'location_visibility', 'request_id', 'service_mode', 'zone_id', 'zone_version']);
    // visibility omitted means STANDARD
    ok(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: GOSIER, territory: 'Guadeloupe', commune: 'Le Gosier' } }));
    refused(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'STANDARD', zone_id: GOSIER } }), 422, 'CONFIRMATION_REQUIRED');
    refused(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true } }), 422, 'ZONE_REQUIRED');

    // Forged, unknown, legacy, malformed zones
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: '971-v2-a-9999.9999' } }), 422, 'UNKNOWN_ZONE');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: '971-v2-a-015.16' } }), 422, 'MALFORMED');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: "971-v2-a-15.16'; drop table requests;--" } }), 422, 'MALFORMED');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: '971-v9-a-15.16' } }), 422, 'UNSUPPORTED_VERSION');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: V1_ZONE } }), 422, 'VERSION_NOT_SELECTABLE');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: '972-v2-a-15.16' } }), 422, 'TERRITORY_MISMATCH');
    // A real V2 sector of another commune of the same territory
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: BAILLIF } }), 422, 'COMMUNE_NOT_IN_ZONE');

    // Territory and commune sent by the browser must agree with the announcement
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: GOSIER, commune: 'Baillif' } }), 422, 'REQUEST_COMMUNE_MISMATCH');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: GOSIER, commune: 'Nulle part' } }), 422, 'COMMUNE_UNKNOWN');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: GOSIER, territory: 'Martinique' } }), 422, 'REQUEST_TERRITORY_MISMATCH');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: GOSIER, territory: 'Atlantide' } }), 422, 'REQUEST_TERRITORY_MISMATCH');

    // Announcement whose place cannot be established: no structured location is invented
    for (const location of ['Guadeloupe', ' (971 - Guadeloupe)', '', null, 'Quelque part']) {
        refused(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true }, row: request({ location }) }), 422, 'REQUEST_PLACE_UNKNOWN');
    }
    // ... but a remote mission never needs a place
    ok(await call({ body: { service_mode: 'REMOTE' }, row: request({ location: 'Guadeloupe' }) }));
    // Plain commune name existing in two territories is ambiguous (Saint-Louis: 971 and 974)
    refused(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true }, row: request({ location: 'Saint-Louis' }) }), 422, 'REQUEST_PLACE_UNKNOWN');
    ok(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true }, row: request({ location: 'Saint-Louis (974 - La Réunion)' }) }));

    // DISCREET: commune only
    const discreet = ok(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true } }));
    assert.deepEqual([discreet.location_visibility, discreet.commune_code, discreet.zone_id, discreet.zone_version], ['DISCREET', '97113', null, null]);
    refused(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true, zone_id: GOSIER } }), 422, 'ZONE_NOT_ALLOWED_FOR_DISCREET');
    refused(await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET' } }), 422, 'CONFIRMATION_REQUIRED');

    // REMOTE: nothing local, whatever the browser also sent
    const remote = ok(await call({ body: { service_mode: 'REMOTE', territory: 'Guadeloupe', commune: 'Le Gosier' } }));
    assert.deepEqual([remote.location_visibility, remote.commune_code, remote.zone_id, remote.zone_version], [null, null, null, null]);
    refused(await call({ body: { service_mode: 'REMOTE', zone_id: GOSIER } }), 422, 'ZONE_NOT_ALLOWED_FOR_REMOTE');
    refused(await call({ body: { service_mode: 'REMOTE', location_visibility: 'STANDARD' } }), 422, 'VISIBILITY_NOT_ALLOWED_FOR_REMOTE');

    // Territory without selectable referential: the mode is kept, no place is invented, a sector is refused
    const guyane = request({ location: 'Cayenne (973 - Guyane)' });
    const fallback = await call({ body: { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true }, row: guyane });
    const fallbackLocation = ok(fallback);
    assert.deepEqual([fallbackLocation.service_mode, fallbackLocation.location_visibility, fallbackLocation.commune_code, fallbackLocation.zone_id], ['ON_SITE', null, null, null]);
    assert.equal(fallback.res.body.fallback, 'TERRITORY_UNSUPPORTED');
    refused(await call({ body: { service_mode: 'ON_SITE', location_confirmed: true, zone_id: '973-v2-a-1.1' }, row: guyane }), 422, 'UNSUPPORTED_TERRITORY');

    // Mode changes always replace the whole row: no residual zone or commune
    const db = fakeDb([request()]);
    const handler = createRequestLocationHandler({ db, requireUser: async () => ({ id: AUTHOR }) });
    const send = async (body) => { const res = fakeRes(); await handler({ params: { id: RID }, body, headers: {} }, res); assert.equal(res.statusCode, 200, JSON.stringify(res.body)); return db.store.request_locations.get(RID); };
    let row = await send({ service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true, zone_id: GOSIER });
    assert.equal(row.zone_id, GOSIER);
    row = await send({ service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true });            // STANDARD -> DISCREET
    assert.deepEqual([row.zone_id, row.zone_version, row.commune_code], [null, null, '97113']);
    row = await send({ service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true, zone_id: GOSIER }); // DISCREET -> STANDARD
    assert.equal(row.zone_id, GOSIER);
    row = await send({ service_mode: 'REMOTE' });                                                                         // ON_SITE -> REMOTE
    assert.deepEqual([row.location_visibility, row.commune_code, row.zone_id, row.zone_version], [null, null, null, null]);
    const back = fakeRes();
    await handler({ params: { id: RID }, body: { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true }, headers: {} }, back);
    assert.equal(back.body.code, 'ZONE_REQUIRED', 'REMOTE -> ON_SITE needs a new sector');
    assert.equal(db.store.request_locations.get(RID).service_mode, 'REMOTE', 'a refused change leaves the stored row untouched');

    // The pure resolver does no I/O and never returns a coordinate
    const pure = resolveSelection({ service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true, zone_id: GOSIER }, request());
    assert.equal(pure.ok, true);
    assert.deepEqual(Object.keys(pure.record).sort(), ['location_commune_code', 'location_visibility', 'location_zone_id', 'location_zone_version', 'service_mode']);
    // Constructor refuses to run without its dependencies
    assert.throws(() => createRequestLocationHandler({}), /required/);
    // Errors never leak a stack, a SQL text or the request row
    const failing = createRequestLocationHandler({ db: { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: { message: 'relation "requests" secret' } }; } }) }, requireUser: async () => ({ id: AUTHOR }) });
    const res = fakeRes();
    await failing({ params: { id: RID }, body: { service_mode: 'REMOTE' }, headers: {} }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
    assert.equal(res.headers['Cache-Control'], 'no-store');

    console.log('request location routes test passed');
})().catch((error) => { console.error(error); process.exit(1); });
