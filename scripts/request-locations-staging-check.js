'use strict';

/**
 * Phase 2.8B-2 — request_locations on Staging, end to end with real sessions.
 *   node scripts/request-locations-staging-check.js
 * Staging only: scripts/force-staging-v2-env.js refuses anything else. The server runs in this process on an
 * ephemeral local port (nothing is deployed). Fixtures are four isolated QA announcements (title prefix below) owned
 * by the QA accounts; they are removed at the end. Existing announcements are never written: their fingerprint is
 * compared before and after. The service role is used for fixtures, assertions and cleanup only.
 */

require('./force-staging-v2-env');

const crypto = require('node:crypto');
const http = require('node:http');
const { createClient } = require('@supabase/supabase-js');
const { assertStagingIsolation } = require('./staging-v2-guard');
const approxZone = require('../approx-zone.js');

const PREFIX = 'QA-LOC-2.8B-2';
const env = process.env;
assertStagingIsolation(env);
const url = env.SUPABASE_URL;
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
const anonClient = () => createClient(url, env.SUPABASE_ANON_KEY, clientOptions);

const GOSIER = approxZone.zonesForCommune('971', 'Le Gosier')[0].id;
const BAILLIF = approxZone.zonesForCommune('971', 'Baillif')[0].id;
const results = [];
const check = (id, label, pass, observed) => { results.push({ id, label, pass: Boolean(pass), observed }); };

async function signIn(email, password) {
    const c = anonClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`sign-in failed (${String(email).replace(/^(.).*@/, '$1***@')})`);
    return { client: c, id: data.user.id, token: data.session.access_token };
}
const fingerprint = async () => {
    const { data, error } = await admin.from('requests').select('*').not('title', 'like', `${PREFIX}%`).order('id');
    if (error) throw error;
    return { n: data.length, md5: crypto.createHash('md5').update(data.map((r) => JSON.stringify(r)).join('|')).digest('hex') };
};

(async () => {
    const created = [];
    let server;
    let beforePrint = null;
    let publicBeforeIds = [];
    try {
        const app = require('../api/server.js');
        server = await new Promise((resolve) => { const s = http.createServer(app); s.listen(0, '127.0.0.1', () => resolve(s)); });
        const base = `http://127.0.0.1:${server.address().port}`;
        const call = async (method, path, { token, body, raw } = {}) => {
            const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
            let json = null; try { json = await res.json(); } catch (_) { /* not json */ }
            return { status: res.status, json };
        };
        const put = (token, id, body) => call('PUT', `/v1/requests/${id}/location`, { token, body });

        const A = await signIn(env.LYANN_E2E_QA_A_EMAIL, env.LYANN_E2E_QA_A_PASSWORD);
        const B = await signIn(env.LYANN_E2E_QA_B_EMAIL, env.LYANN_E2E_QA_B_PASSWORD);
        const C = await signIn(env.LYANN_E2E_QA_C_EMAIL, env.LYANN_E2E_QA_C_PASSWORD);

        beforePrint = await fingerprint();
        const publicBefore = await call('GET', '/v1/explorer/requests');
        publicBeforeIds = (publicBefore.json?.requests || []).map((r) => r.id).sort();

        // Fixtures. Inserted CLOSED then moved to their state: the INSERT trigger that matches skills and notifies
        // members returns early for closed announcements, so nobody is notified by a QA fixture.
        const make = async (tag, patch) => {
            const { data, error } = await admin.from('requests').insert({ requester_id: A.id, title: `${PREFIX} ${tag}`, description: 'QA fixture, removed at the end of the check.', location: 'Le Gosier (971 - Guadeloupe)', status: 'CLOSED', visibility: 'PUBLIC', public_moderation_status: 'approved', ...patch.insert }).select('id').single();
            if (error) throw new Error(`fixture ${tag}: ${error.message}`);
            created.push(data.id);
            // The moderation trigger forces 'pending' on insert; a service-role update may then set the final moderation state.
            const upd = await admin.from('requests').update({ public_moderation_status: patch.insert.public_moderation_status || 'approved', ...patch.final }).eq('id', data.id);
            if (upd.error) throw new Error(`fixture ${tag} state: ${upd.error.message}`);
            return data.id;
        };
        const F = {
            pub: await make('public open', { insert: {}, final: { status: 'OPEN' } }),
            direct: await make('direct to B', { insert: { visibility: 'DIRECT', target_user_id: B.id }, final: { status: 'OPEN' } }),
            pending: await make('pending moderation', { insert: { public_moderation_status: 'pending' }, final: { status: 'OPEN' } }),
            closed: await make('closed', { insert: {}, final: { status: 'CLOSED' } }),
            remoteOnly: await make('place unknown', { insert: { location: 'Guadeloupe' }, final: { status: 'OPEN' } })
        };
        const seed = await admin.from('request_locations').insert([F.direct, F.pending, F.closed].map((id) => ({ request_id: id, service_mode: 'ON_SITE', location_visibility: 'DISCREET', commune_code: '97113' })));
        if (seed.error) throw new Error(`seed locations: ${seed.error.message}`);
        const stored = async (id) => (await admin.from('request_locations').select('*').eq('request_id', id).maybeSingle()).data;

        // 3. author saves and edits through the route
        let r = await put(A.token, F.pub, { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true, zone_id: GOSIER, territory: 'Guadeloupe', commune: 'Le Gosier' });
        let row = await stored(F.pub);
        check('3a', 'author saves a STANDARD location through the route', r.status === 200 && row?.zone_id === GOSIER && row?.commune_code === '97113' && row?.zone_version === 2, { status: r.status, zone_id: row?.zone_id, commune: row?.commune_code, version: row?.zone_version });
        check('5', 'STANDARD stores sector, commune and version', row?.location_visibility === 'STANDARD' && row?.service_mode === 'ON_SITE', { visibility: row?.location_visibility });
        r = await put(A.token, F.pub, { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true });
        row = await stored(F.pub);
        check('6+11a', 'STANDARD -> DISCREET: commune only, no residual zone', r.status === 200 && row.location_visibility === 'DISCREET' && row.commune_code === '97113' && row.zone_id === null && row.zone_version === null, row);
        r = await put(A.token, F.pub, { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true, zone_id: GOSIER });
        row = await stored(F.pub);
        check('11b', 'DISCREET -> STANDARD with a confirmed sector', r.status === 200 && row.zone_id === GOSIER, row);
        r = await put(A.token, F.pub, { service_mode: 'REMOTE' });
        row = await stored(F.pub);
        check('7+11c', 'ON_SITE -> REMOTE: no commune, no zone', r.status === 200 && row.service_mode === 'REMOTE' && row.commune_code === null && row.zone_id === null && row.location_visibility === null, row);
        r = await put(A.token, F.pub, { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true });
        row = await stored(F.pub);
        check('11d', 'REMOTE -> ON_SITE requires a new sector, stored row untouched', r.status === 422 && r.json?.code === 'ZONE_REQUIRED' && row.service_mode === 'REMOTE', { status: r.status, code: r.json?.code });
        const createdAt = row.created_at;
        r = await put(A.token, F.pub, { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true });
        row = await stored(F.pub);
        check('3b', 'author edits again: same row, created_at kept, updated_at moves', r.status === 200 && row.created_at === createdAt && new Date(row.updated_at) >= new Date(createdAt), { created_at: row.created_at, updated_at: row.updated_at });

        // 4. other members cannot change it; unauthenticated callers neither
        const snapshot = JSON.stringify(await stored(F.pub));
        const body = { service_mode: 'REMOTE' };
        const rb = await put(B.token, F.pub, body); const rc = await put(C.token, F.pub, body);
        const rn = await put(undefined, F.pub, body); const rf = await put('forged.jwt.token', F.pub, body);
        const spoof = await put(C.token, F.pub, { service_mode: 'REMOTE', requester_id: A.id });
        check('4', 'another member (B, C), no token and a forged token cannot modify the location', rb.status === 404 && rc.status === 404 && rn.status === 401 && rf.status === 401 && spoof.status === 404 && JSON.stringify(await stored(F.pub)) === snapshot, { B: rb.status, C: rc.status, none: rn.status, forged: rf.status, spoofed_requester: spoof.status });
        const spoofByAuthor = await put(A.token, F.pub, { service_mode: 'REMOTE', requester_id: C.id });
        check('4b', 'requester_id in the body is refused, never used', spoofByAuthor.status === 400 && spoofByAuthor.json?.code === 'UNEXPECTED_FIELD', { status: spoofByAuthor.status, code: spoofByAuthor.json?.code });

        // 8, 9: forged zones, incompatible communes
        const mustRefuse = async (id, label, payload, status, code) => {
            const s0 = JSON.stringify(await stored(F.pub));
            const x = await put(A.token, F.pub, payload);
            check(id, label, x.status === status && x.json?.code === code && JSON.stringify(await stored(F.pub)) === s0, { status: x.status, code: x.json?.code });
        };
        const on = { service_mode: 'ON_SITE', location_visibility: 'STANDARD', location_confirmed: true };
        await mustRefuse('8a', 'unknown zone refused', { ...on, zone_id: '971-v2-a-9999.9999' }, 422, 'UNKNOWN_ZONE');
        await mustRefuse('8b', 'malformed / injected zone refused', { ...on, zone_id: "971-v2-a-1.1'; drop table request_locations;--" }, 422, 'MALFORMED');
        await mustRefuse('8c', 'zone of another territory refused', { ...on, zone_id: '972-v2-a-15.16' }, 422, 'TERRITORY_MISMATCH');
        await mustRefuse('8d', 'legacy V1 sector not selectable', { ...on, zone_id: `971-v1-a-${Object.keys(require('../approx-zone-referential.v1.js').territories['971'].levels.a.cells)[0]}` }, 422, 'VERSION_NOT_SELECTABLE');
        await mustRefuse('9a', 'sector that does not contain the announcement commune refused', { ...on, zone_id: BAILLIF }, 422, 'COMMUNE_NOT_IN_ZONE');
        await mustRefuse('9b', 'commune sent by the browser that differs from the announcement refused', { ...on, zone_id: GOSIER, commune: 'Baillif' }, 422, 'REQUEST_COMMUNE_MISMATCH');
        await mustRefuse('9c', 'territory sent by the browser that differs from the announcement refused', { ...on, zone_id: GOSIER, territory: 'Martinique' }, 422, 'REQUEST_TERRITORY_MISMATCH');
        await mustRefuse('12a', 'GPS fields refused', { ...on, zone_id: GOSIER, latitude: 16.2, longitude: -61.5 }, 400, 'FORBIDDEN_FIELD');
        await mustRefuse('12b', 'address fields refused', { ...on, zone_id: GOSIER, address: '12 rue des Lilas' }, 400, 'FORBIDDEN_FIELD');
        await mustRefuse('12c', 'nested coordinates refused', { ...on, zone_id: GOSIER, commune: { lat: 16.2, lng: -61.5 } }, 400, 'INVALID_SELECTION');
        const unknownPlace = await put(A.token, F.remoteOnly, { service_mode: 'ON_SITE', location_visibility: 'DISCREET', location_confirmed: true });
        check('9d', 'announcement whose commune cannot be established: no structured place invented', unknownPlace.status === 422 && unknownPlace.json?.code === 'REQUEST_PLACE_UNKNOWN' && (await stored(F.remoteOnly)) === null, { status: unknownPlace.status });
        const closedTry = await put(A.token, F.closed, { service_mode: 'REMOTE' });
        check('3c', 'a closed announcement cannot be modified', closedTry.status === 409 && closedTry.json?.code === 'REQUEST_NOT_EDITABLE', { status: closedTry.status });

        // 1, 2: reads with real JWTs through PostgREST
        await admin.from('request_locations').upsert({ request_id: F.pub, service_mode: 'ON_SITE', location_visibility: 'STANDARD', commune_code: '97113', zone_id: GOSIER, zone_version: 2 }, { onConflict: 'request_id' });
        const ids = Object.values(F);
        const readAs = async (who) => { const { data, error } = await who.client.from('request_locations').select('request_id').in('request_id', ids); return { ids: (data || []).map((x) => x.request_id).sort(), error }; };
        const sortIds = (...keys) => keys.map((k) => F[k]).sort();
        const anon = anonClient();
        const anonRead = await anon.from('request_locations').select('request_id').in('request_id', ids);
        check('1', 'anon cannot read request_locations', Boolean(anonRead.error) && !(anonRead.data || []).length, { code: anonRead.error?.code, rows: (anonRead.data || []).length });
        const a = await readAs(A); const b = await readAs(B); const c = await readAs(C);
        check('2a', 'author reads the locations of its own announcements', JSON.stringify(a.ids) === JSON.stringify(sortIds('pub', 'direct', 'pending', 'closed')), { n: a.ids.length });
        check('2b', 'third member (C) reads only the public open announcement location', JSON.stringify(c.ids) === JSON.stringify(sortIds('pub')), { n: c.ids.length });
        check('2c', 'target member (B) reads public and direct, not pending nor closed', JSON.stringify(b.ids) === JSON.stringify(sortIds('pub', 'direct')), { n: b.ids.length });

        // 10: direct Supabase writes are refused for every client role and change nothing
        const rowsBefore = JSON.stringify((await admin.from('request_locations').select('*').in('request_id', ids).order('request_id')).data);
        const attempts = [];
        for (const [name, who] of [['anon', { client: anon }], ['A', A], ['B', B], ['C', C]]) {
            const ins = await who.client.from('request_locations').insert({ request_id: F.closed, service_mode: 'REMOTE' });
            const insNew = await who.client.from('request_locations').insert({ request_id: F.remoteOnly, service_mode: 'REMOTE' });
            const upd = await who.client.from('request_locations').update({ service_mode: 'REMOTE', location_visibility: null, commune_code: null, zone_id: null, zone_version: null }).eq('request_id', F.pub).select();
            const del = await who.client.from('request_locations').delete().eq('request_id', F.pub).select();
            attempts.push({ who: name, insert: ins.error?.code || 'ALLOWED', insertNew: insNew.error?.code || 'ALLOWED', update: upd.error?.code || (upd.data?.length ? 'ALLOWED' : 'no row'), delete: del.error?.code || (del.data?.length ? 'ALLOWED' : 'no row') });
        }
        const rowsAfter = JSON.stringify((await admin.from('request_locations').select('*').in('request_id', ids).order('request_id')).data);
        check('10', 'direct Supabase writes (insert, update, delete) refused for anon, author and other members; rows unchanged',
            attempts.every((x) => [x.insert, x.insertNew, x.update, x.delete].every((v) => v === '42501')) && rowsAfter === rowsBefore, attempts);

        // 12: what is stored holds no precise position
        const all = (await admin.from('request_locations').select('*').in('request_id', ids)).data || [];
        const allowedColumns = ['commune_code', 'created_at', 'location_visibility', 'request_id', 'service_mode', 'updated_at', 'zone_id', 'zone_version'];
        check('12d', 'stored rows contain only the contract columns and no coordinate-like value',
            all.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify(allowedColumns) && !/-?\d{1,3}\.\d{4,}/.test(JSON.stringify([x.commune_code, x.zone_id, x.location_visibility, x.service_mode]))), { rows: all.length });

        // 14: the public API
        const during = await call('GET', '/v1/explorer/requests');
        const items = during.json?.requests || [];
        const forbiddenKeys = ['requester_id', 'internal_tags', 'target_user_id', 'visibility', 'status', 'service_mode', 'location_visibility', 'commune_code', 'zone_id', 'zone_version', 'request_locations', 'location_zone_id'];
        check('14a', 'public API serves only eligible announcements with no private or location field', during.status === 200 && items.every((i) => forbiddenKeys.every((k) => !(k in i))) && items.some((i) => i.id === F.pub) && ![F.direct, F.pending, F.closed].some((id) => items.some((i) => i.id === id)) && !JSON.stringify(items).includes(GOSIER),
            { status: during.status, count: items.length, keys: Object.keys(items[0] || {}).sort() });
        const publicLocationFields = items.map((i) => i.location).filter(Boolean);
        check('14b', 'public API location field stays at territory level', publicLocationFields.every((l) => /^[A-Za-zéÉ ]+ \(97\d\)$/.test(l)), { sample: publicLocationFields.slice(0, 2) });
        const routeAnon = await call('GET', `/v1/requests/${F.pub}/location`);
        check('14c', 'there is no anonymous read route for locations', routeAnon.status === 404, { status: routeAnon.status });

        results.push({ id: 'ctx', label: 'context', pass: true, observed: { publicBefore: publicBeforeIds.length, qaFixtures: created.length } });
    } catch (error) {
        check('ERROR', 'unexpected error', false, String(error && error.message || error));
    } finally {
        try {
            if (created.length) {
                await admin.from('request_locations').delete().in('request_id', created);
                const del = await admin.from('requests').delete().in('id', created);
                check('CLEAN', 'QA fixtures removed', !del.error, del.error?.message || `${created.length} announcements`);
            }
            const left = await admin.from('requests').select('id', { count: 'exact', head: true }).like('title', `${PREFIX}%`);
            const leftLoc = await admin.from('request_locations').select('request_id', { count: 'exact', head: true }).in('request_id', created.length ? created : ['00000000-0000-0000-0000-000000000000']);
            check('CLEAN2', 'no QA announcement or location left', left.count === 0 && leftLoc.count === 0, { requests: left.count, locations: leftLoc.count });
            const after = await fingerprint();
            const bp = beforePrint;
            check('13', 'existing announcements untouched (same count and fingerprint)', bp && after.n === bp.n && after.md5 === bp.md5, { before: bp, after });
            const publicAfter = server ? await (await fetch(`http://127.0.0.1:${server.address().port}/v1/explorer/requests`)).json() : null;
            const idsAfter = (publicAfter?.requests || []).map((r) => r.id).sort();
            check('14d', 'public API returns the same announcements as before the check', JSON.stringify(idsAfter) === JSON.stringify(publicBeforeIds), { before: publicBeforeIds.length, after: idsAfter.length });
        } catch (error) {
            check('CLEAN-ERROR', 'cleanup or final checks failed', false, String(error && error.message || error));
        }
        if (server) await new Promise((resolve) => server.close(resolve));
        const failed = results.filter((x) => !x.pass);
        console.log(JSON.stringify({ project: 'tdktfbtqceldlaeqjtow', total: results.length, failed: failed.length, results }, null, 1));
        process.exit(failed.length ? 1 : 0);
    }
})();
