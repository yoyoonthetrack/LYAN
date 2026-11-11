'use strict';
/*
 * Politique de version minimale : serveur (api/app-version-policy.js) et client (app-version-policy.js). INERTE par défaut.
 * Aucun réseau externe : le handler est servi par un Express local éphémère.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const policy = require('../api/app-version-policy');
const client = require('../app-version-policy');

const IOS_URL = 'https://apps.apple.com/app/id0000000000';

test('serveur : sans aucune variable, aucune mise à jour n\'est jamais demandée (comportement actuel)', () => {
    for (const query of [{}, { platform: 'ios', build: '1' }, { platform: 'android', build: '1' }, { platform: 'web' }, { platform: 'ios', build: '16' }]) {
        const r = policy.evaluateVersionPolicy({}, query);
        assert.equal(r.success, true);
        assert.equal(r.enforce, false);
        assert.equal(r.update_required, false);
        assert.equal(r.update_recommended, false);
        assert.equal(r.message_code, null);
        assert.equal(r.store_url, null);
    }
});

test('serveur : un plancher posé sans ENFORCE exact ne bloque personne', () => {
    for (const enforce of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true']) {
        const env = { LYANN_MIN_APP_BUILD_IOS: '20', LYANN_APP_STORE_URL_IOS: IOS_URL, ...(enforce === undefined ? {} : { LYANN_APP_VERSION_POLICY_ENFORCE: enforce }) };
        const r = policy.evaluateVersionPolicy(env, { platform: 'ios', build: '15' });
        assert.equal(r.update_required, false, `ENFORCE=${JSON.stringify(enforce)}`);
        assert.equal(r.min_build, null, 'le plancher n\'est pas divulgué tant qu\'il n\'est pas appliqué');
    }
});

test('serveur : ENFORCE=true et plancher — obligatoire seulement sous le plancher, sur la bonne plateforme', () => {
    const env = { LYANN_APP_VERSION_POLICY_ENFORCE: 'true', LYANN_MIN_APP_BUILD_IOS: '17', LYANN_MIN_APP_BUILD_ANDROID: '5', LYANN_APP_STORE_URL_IOS: IOS_URL };
    const under = policy.evaluateVersionPolicy(env, { platform: 'ios', build: '16' });
    assert.equal(under.update_required, true);
    assert.equal(under.message_code, 'UPDATE_REQUIRED');
    assert.equal(under.min_build, 17);
    assert.equal(under.store_url, IOS_URL);
    assert.equal(policy.evaluateVersionPolicy(env, { platform: 'ios', build: '17' }).update_required, false, 'égal au plancher : autorisé');
    assert.equal(policy.evaluateVersionPolicy(env, { platform: 'ios', build: '18' }).update_required, false);
    assert.equal(policy.evaluateVersionPolicy(env, { platform: 'android', build: '4' }).update_required, true);
    assert.equal(policy.evaluateVersionPolicy(env, { platform: 'android', build: '5' }).update_required, false);
    assert.equal(policy.evaluateVersionPolicy({ ...env, LYANN_MIN_APP_BUILD_ANDROID: undefined }, { platform: 'android', build: '1' }).update_required, false, 'pas de plancher Android : rien');
});

test('serveur : fail-open — web, plateforme inconnue, build absent ou illisible, valeurs d\'environnement invalides ne bloquent jamais', () => {
    const env = { LYANN_APP_VERSION_POLICY_ENFORCE: 'true', LYANN_MIN_APP_BUILD_IOS: '50' };
    for (const query of [{ platform: 'web', build: '1' }, { platform: 'windows', build: '1' }, { platform: 'ios' }, { platform: 'ios', build: '' }, { platform: 'ios', build: 'abc' },
        { platform: 'ios', build: '0' }, { platform: 'ios', build: '-3' }, { platform: 'ios', build: '1.5' }, { platform: 'ios', build: '12345678901' }, { platform: 'ios', build: ['1', '2'] }, {}]) {
        assert.equal(policy.evaluateVersionPolicy(env, query).update_required, false, JSON.stringify(query));
    }
    for (const bad of ['abc', '0', '-1', '1.5', '', ' ', '9999999999', '1e3', '0x10', null, undefined, {}, []]) {
        assert.equal(policy.evaluateVersionPolicy({ LYANN_APP_VERSION_POLICY_ENFORCE: 'true', LYANN_MIN_APP_BUILD_IOS: bad }, { platform: 'ios', build: '1' }).update_required, false, `plancher invalide ${JSON.stringify(bad)}`);
    }
});

test('serveur : recommandation — jamais bloquante, même avec ENFORCE=true ; le lien n\'est accepté que pour un magasin officiel en https', () => {
    const env = { LYANN_RECOMMENDED_APP_BUILD_IOS: '20', LYANN_APP_STORE_URL_IOS: IOS_URL };
    const r = policy.evaluateVersionPolicy(env, { platform: 'ios', build: '16' });
    assert.equal(r.update_required, false);
    assert.equal(r.update_recommended, true);
    assert.equal(r.message_code, 'UPDATE_RECOMMENDED');
    assert.equal(policy.evaluateVersionPolicy({ ...env, LYANN_APP_VERSION_POLICY_ENFORCE: 'true' }, { platform: 'ios', build: '16' }).update_required, false);
    assert.equal(policy.evaluateVersionPolicy(env, { platform: 'ios', build: '20' }).update_recommended, false);
    for (const url of ['http://apps.apple.com/app/id1', 'https://evil.example/app', 'https://apps.apple.com.evil.example/x', 'javascript:alert(1)', 'not a url', '']) {
        assert.equal(policy.evaluateVersionPolicy({ ...env, LYANN_APP_STORE_URL_IOS: url }, { platform: 'ios', build: '16' }).store_url, null, url);
    }
    assert.equal(policy.evaluateVersionPolicy({ ...env, LYANN_APP_STORE_URL_IOS: 'https://play.google.com/store/apps/details?id=app.lyann.mobile' }, { platform: 'ios', build: '16' }).store_url, 'https://play.google.com/store/apps/details?id=app.lyann.mobile');
});

test('serveur : route HTTP publique réelle (Express local), sans authentification, sans base, avec en-tête de cache court', async () => {
    const express = require('express');
    const app = express();
    const env = {};
    app.get('/v1/app/version-policy', policy.createVersionPolicyHandler(env));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const a = await fetch(`${base}/v1/app/version-policy?platform=ios&build=1`);
        assert.equal(a.status, 200);
        assert.match(a.headers.get('cache-control'), /max-age=300/);
        assert.equal((await a.json()).update_required, false);
        // L'environnement est relu à chaque requête : l'activation n'exige pas de redémarrage du processus.
        Object.assign(env, { LYANN_APP_VERSION_POLICY_ENFORCE: 'true', LYANN_MIN_APP_BUILD_IOS: '9' });
        const b = await (await fetch(`${base}/v1/app/version-policy?platform=ios&build=1`)).json();
        assert.equal(b.update_required, true);
        const c = await (await fetch(`${base}/v1/app/version-policy`)).json();
        assert.equal(c.update_required, false);
    } finally { server.close(); }
});

test('serveur : la route est montée dans api/server.js, sans autre changement de comportement', () => {
    const server = fs.readFileSync(path.join(ROOT, 'api', 'server.js'), 'utf8');
    assert.match(server, /require\('\.\/app-version-policy'\)/);
    assert.match(server, /app\.get\('\/v1\/app\/version-policy', createVersionPolicyHandler\(process\.env\)\)/);
    const mounts = server.match(/version-policy/g) || [];
    assert.ok(mounts.length >= 2);
});

test('client : désactivé par défaut — aucun appel réseau sans le drapeau exact', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({ success: true, update_required: true }) }; };
    for (const features of [undefined, {}, { appVersionPolicy: 'true' }, { appVersionPolicy: 1 }, { appVersionPolicy: false }]) {
        assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl }), null);
    }
    assert.equal(calls, 0);
});

test('client : fail-open — réseau, délai, statut, JSON ou plateforme invalides ne produisent aucun avis', async () => {
    const features = { appVersionPolicy: true };
    const ok = (body) => async () => ({ ok: true, json: async () => body });
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: async () => { throw new Error('offline'); } }), null);
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: async () => ({ ok: false, status: 500 }) }), null);
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('json'); } }) }), null);
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: ok({ success: false }) }), null);
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: ok(null) }), null);
    assert.equal(await client.fetchPolicy({ features, platform: 'web', build: '16', fetchImpl: ok({ success: true, update_required: true }) }), null);
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: null, fetchImpl: ok({ success: true, update_required: true }) }), null);
    const slow = (_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('abort'))); });
    const t0 = Date.now();
    assert.equal(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: slow, timeoutMs: 30 }), null);
    assert.ok(Date.now() - t0 < 1500, 'le délai coupe l\'attente');
});

test('client : requête minimale (plateforme + build, aucune donnée personnelle), avis obligatoire / recommandé / aucun, lien filtré', async () => {
    const features = { appVersionPolicy: true };
    const seen = [];
    const fetchImpl = (body) => async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => body }; };
    const required = await client.fetchPolicy({ features, platform: 'ios', build: '16', backendOrigin: 'https://api.example/', fetchImpl: fetchImpl({ success: true, update_required: true, store_url: IOS_URL, min_build: 17 }) });
    assert.equal(seen[0].url, 'https://api.example/v1/app/version-policy?platform=ios&build=16');
    assert.equal(seen[0].init.method, 'GET');
    assert.equal(Object.keys(seen[0].init.headers).join(','), 'Accept', 'aucun jeton ni identifiant envoyé');
    const notice = client.describeNotice(required);
    assert.deepEqual({ blocking: notice.blocking, dismissible: notice.dismissible, url: notice.url }, { blocking: true, dismissible: false, url: IOS_URL });
    const rec = client.describeNotice(await client.fetchPolicy({ features, platform: 'android', build: '3', fetchImpl: fetchImpl({ success: true, update_recommended: true, store_url: 'https://evil.example/x' }) }));
    assert.deepEqual({ blocking: rec.blocking, dismissible: rec.dismissible, url: rec.url }, { blocking: false, dismissible: true, url: null });
    assert.equal(client.describeNotice(await client.fetchPolicy({ features, platform: 'ios', build: '16', fetchImpl: fetchImpl({ success: true }) })), null);
    assert.equal(client.describeNotice(null), null);
});

test('client : lecture du binaire natif (plugin App) et repli web', async () => {
    assert.deepEqual(await client.readNativeInfo({}), { platform: 'web', build: null });
    assert.deepEqual(await client.readNativeInfo({ Capacitor: { isNativePlatform: () => false } }), { platform: 'web', build: null });
    const native = (platform, info) => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { App: { getInfo: async () => info } } } });
    assert.deepEqual(await client.readNativeInfo(native('ios', { build: '16', version: '1.0' })), { platform: 'ios', build: 16 });
    assert.deepEqual(await client.readNativeInfo(native('android', { build: '4' })), { platform: 'android', build: 4 });
    assert.deepEqual(await client.readNativeInfo(native('ios', { build: 'x' })), { platform: 'ios', build: null });
    assert.deepEqual(await client.readNativeInfo({ Capacitor: { isNativePlatform: () => { throw new Error('boom'); } } }), { platform: 'web', build: null });
});

test('inertie : le client n\'est inclus par aucune page ni aucun bundle, et aucun fichier ne pose le drapeau', () => {
    const skip = new Set(['node_modules', '.git', 'artifacts', 'www', 'ios', 'android', 'work', 'tests', 'docs', 'test-results']);
    const hits = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (skip.has(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(html|js|json|css)$/.test(e.name) || e.name === 'package-lock.json') continue;
            const text = fs.readFileSync(p, 'utf8');
            if (/app-version-policy/.test(text) || /appVersionPolicy\s*:\s*true/.test(text)) hits.push(path.relative(ROOT, p));
        }
    };
    walk(ROOT);
    // api/server.js monte la ROUTE (serveur). Le client (app-version-policy.js) n'est cité par aucun fichier : ni page, ni bundle, ni drapeau posé.
    assert.deepEqual(hits.sort(), ['api/app-version-policy.js', 'api/server.js']);
});
