'use strict';
/*
 * P4/P5 — l'exécuteur persistant est PRÉPARÉ et testé ici sur PGlite, jamais exécuté sur Staging. Aucun accès réseau : l'API de gestion est remplacée
 * par un adaptateur qui envoie le SQL à la base locale.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const p45 = require('../scripts/taxonomy-v2/p45-staging');
const p3 = require('../scripts/taxonomy-v2/p3-rehearsal');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'taxonomy-v2', 'p45-staging.js');
const P5_TRIGGERS = ['requests.lyann_requests_derive_node_trg', 'requests.lyann_requests_legacy_projection_trg', 'services.lyann_services_derive_node_trg'];
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

const runBench = async (afterSetup, extra = {}) => {
    const { run } = require('../scripts/taxonomy-v2/validate-sql-pglite');
    const out = {};
    const report = await run({ ...extra, onlyAfterSetup: true, afterSetup: async (ctx) => {
        // Rôles Supabase absents du banc (S100 contrôle service_role et authenticator).
        await ctx.db.exec(`DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOLOGIN NOINHERIT; END IF;
        END $$`);
        await ctx.db.exec('GRANT ALL ON public.services TO service_role');
        // État réel de Staging (audit) : anon et authenticated détiennent TRUNCATE, TRIGGER, REFERENCES sur services — c'est ce que S100 retire.
        await ctx.db.exec('GRANT TRUNCATE, TRIGGER, REFERENCES ON public.services TO anon, authenticated');
        // Idem pour MAINTAIN (PostgreSQL 17) : privilège par défaut des tables créées par postgres sous Supabase — c'est ce que S101 retire.
        await ctx.db.exec('GRANT SELECT, INSERT, UPDATE, DELETE, MAINTAIN ON public.services TO anon, authenticated; GRANT MAINTAIN ON public.services TO service_role');
        await afterSetup(ctx, out);
    } });
    return { report, out };
};

/** Adaptateur « API de gestion » : même contrat que makeApi(), le SQL part vers PGlite. */
const fakeApi = (db, log) => ({
    async get() { return { status: 200, json: { ref: p45.STAGING_REF, name: 'Lyann-staging-v2', status: 'ACTIVE_HEALTHY' } }; },
    async sql(query) {
        if (log) log.push(query.length > 80 ? `${query.slice(0, 60)}… (${query.length})` : query);
        try {
            const res = await db.exec(query);
            const last = res[res.length - 1];
            return { ok: true, rows: last ? last.rows : [] };
        } catch (e) { return { ok: false, status: 400, message: e.message }; }
    },
});

const digestOf = async (rows) => { const r = (await rows(`SELECT md5(string_agg(k || '=' || v, E'\\n' ORDER BY k)) AS digest, count(*)::int AS objects FROM (${p3.CATALOG_SQL}) c`))[0]; return r; };
const tmpDir = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `p45-${label}-`));
const tablesHash = async (rows) => (await rows(`SELECT md5(
    coalesce((SELECT string_agg((to_jsonb(r) - 'taxonomy_node_code' - 'taxonomy_node_source')::text, '|' ORDER BY id) FROM public.requests r), '') ||
    coalesce((SELECT string_agg((to_jsonb(x) - 'taxonomy_node_code' - 'taxonomy_node_source')::text, '|' ORDER BY id) FROM public.services x), '') ||
    coalesce((SELECT string_agg((to_jsonb(t) - 'node_code')::text, '|' ORDER BY id) FROM public.lyann_taxonomy t), '')) AS h`))[0].h;

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Statique : SQL généré, linter, verrous, Production
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test('P4/P5 : les SQL générés passent le linter ; une transaction, COMMIT final unique, aucun effet externe, aucune Production, Staging seulement', () => {
    for (const [name, b] of Object.entries({ P4: p45.buildP4(), P5: p45.buildP5(null), S10: p45.buildS10(), S100: p45.buildS100(), S101: p45.buildS101() })) {
        assert.deepEqual(p45.lint(b.sql, name), [], name);
        assert.doesNotMatch(b.sql, /gzispjfoywklpqatjyop/, name);
    }
    assert.match(p45.buildP4().sql, /^BEGIN;/m);
    assert.match(p45.buildP4().sql.trim(), /COMMIT;$/);
    assert.match(p45.buildP5(null).sql, /set_config\('request\.jwt\.claim\.role', 'service_role', true\)/, 'contexte service explicite (X6)');
    assert.match(p45.buildP4().sql, /LOCK TABLE public\.requests, public\.services, public\.lyann_taxonomy IN ACCESS EXCLUSIVE MODE/);
    assert.match(p45.buildP4().sql, /SET LOCAL lock_timeout = '5s'/);
});

test('P4/P5 : le linter refuse ce qui rendrait l\'application dangereuse', () => {
    const good = p45.buildP4().sql;
    const bad = {
        'second COMMIT': good.replace(/COMMIT;\s*$/, 'COMMIT;\nCOMMIT;'),
        'pas de COMMIT': good.replace(/COMMIT;\s*$/, ''),
        'ROLLBACK explicite': good.replace(/COMMIT;\s*$/, 'ROLLBACK;\nCOMMIT;'),
        'TRUNCATE': good.replace(/COMMIT;\s*$/, 'TRUNCATE public.requests;\nCOMMIT;'),
        'désactivation de déclencheur': good.replace(/COMMIT;\s*$/, 'ALTER TABLE public.requests DISABLE TRIGGER USER;\nCOMMIT;'),
        'session_replication_role': good.replace(/COMMIT;\s*$/, "SET session_replication_role = replica;\nCOMMIT;"),
        'effet externe': good.replace(/COMMIT;\s*$/, "SELECT pg_notify('x', 'y');\nCOMMIT;"),
        'Production': `${good}\n-- gzispjfoywklpqatjyop`,
        'sortie de répétition': good.replace(/COMMIT;\s*$/, "SELECT 'P3R01';\nCOMMIT;"),
        'UPDATE historique dans P4': good.replace(/COMMIT;\s*$/, 'UPDATE public.requests SET title = title;\nCOMMIT;'),
        'GRANT à PUBLIC': good.replace(/COMMIT;\s*$/, 'GRANT ALL ON public.requests TO PUBLIC;\nCOMMIT;'),
        'DROP TABLE': good.replace(/COMMIT;\s*$/, 'DROP TABLE public.requests;\nCOMMIT;'),
        'index concurrent': good.replace(/COMMIT;\s*$/, 'CREATE INDEX CONCURRENTLY i ON public.requests(id);\nCOMMIT;'),
    };
    for (const [name, sql] of Object.entries(bad)) assert.notDeepEqual(p45.lint(sql, 'P4'), [], name);
    const p5 = p45.buildP5(null).sql;
    assert.notDeepEqual(p45.lint(p5.replace(/set_config\('request\.jwt\.claim\.role', 'service_role', true\)/g, "set_config('x', 'y', true)"), 'P5'), [], 'P5 sans contexte service');
});

test('P4/P5 : les fichiers 01-09 exécutés sont ceux que P3 a validés (empreintes SHA-256 identiques au 2e passage P3)', () => {
    const fp = p45.fingerprints();
    const proven = {
        '01_schema_taxonomy_v2.sql': '185c5ee25db52588791bc0181e78336f096d7d32327935c4d7b7c8233506b128',
        '02_additive_columns.sql': '24d8a5d9b02c0a609d2214a4caeba02c02283c819f96c8e19249b22fffce472e',
        '03_search_and_skills_rpc.sql': 'f59de5eebdb68f85d88ae40dd65f75f7bc59a7dad37bd56ca7ef792cf3aad543',
        '04_seed_taxonomy_v2.sql': 'e31b62236997539e8ea4f1ff8f8cea0354e02168b9c3b8347fb92f2099bbd7c5',
        '05_legacy_map_and_backfill.sql': '2a1bb0d7fb3b6098179c128c10d5e3b55e832ebdcbebfef109a24a7df60db81c',
        '06_dual_write_derivation.sql': 'b66134796522e40117fba4ad4b072a5b977a93f23c7ee9659b22fe3e3a98d288',
        '07_verify_taxonomy_v2.sql': '76749eab237ffdad353bab2acac0e551e1786e0f3a7d97574c31f1ec050fe9ef',
        '08_legacy_projection.sql': '2f34aeef7ffe68760a4daa4c3e1d9376540a38d1bdfa91a818352c3e541c2cec',
        '09_rollback_taxonomy_v2.sql': '7e465124bd842c0b83626121c2d0c7973356bdbba3118fa8f66cb3fa57a4a87e',
    };
    for (const [f, h] of Object.entries(proven)) assert.equal(fp[`migration-draft/${f}`], h, `${f} a changé depuis la répétition P3 : rejouer P3`);
});

test('P4/P5 : P4 contient 01→04 dans l\'ordre, P5 contient 05→06→08 dans l\'ordre, aucun des deux ne contient 09 ni 100 ni 10', () => {
    const order = (sql, marks) => { const idx = marks.map((m) => sql.indexOf(m)); assert.ok(idx.every((i) => i >= 0), marks.join(',')); assert.deepEqual([...idx].sort((a, b) => a - b), idx); };
    order(p45.buildP4().sql, ['===== 01 — schéma', '===== 02 — colonnes', '===== 03 — recherche', '===== 04 — amorçage', '===== contrôles V01-V06', '===== assertions finales']);
    order(p45.buildP5(null).sql, ['===== 05 — correspondance', '===== 06 — double écriture', '===== 08 — projection', '===== contrôles V01-V23', '===== assertions finales']);
    for (const sql of [p45.buildP4().sql, p45.buildP5(null).sql]) {
        assert.doesNotMatch(sql, /^\s*DROP (TABLE|FUNCTION) (IF EXISTS )?public\.lyann_/m);
        assert.doesNotMatch(sql, /lyann_resolve_legacy_skill|REVOKE TRUNCATE/);
    }
});

test('P4/P5 : les chemins de l\'API ne peuvent viser que Staging ; Production et tout autre projet sont refusés, y compris par makeApi', async () => {
    assert.doesNotThrow(() => p45.assertStagingPath(`/v1/projects/${p45.STAGING_REF}/database/query`));
    assert.throws(() => p45.assertStagingPath(`/v1/projects/${p45.PRODUCTION_REF}/database/query`), /Production refusée/);
    assert.throws(() => p45.assertStagingPath('/v1/projects/abcdefghijklmnopqrst/database/query'), /Seul le projet Staging/);
    const calls = [];
    const api = p45.makeApi('jeton-factice', async (url, init) => { calls.push({ url, init }); return { status: 200, json: async () => ({ ref: p45.STAGING_REF }), text: async () => '[]' }; });
    await api.get(`/v1/projects/${p45.STAGING_REF}`);
    await api.sql('SELECT 1');
    assert.ok(calls.every((c) => c.url.startsWith('https://api.supabase.com/v1/projects/' + p45.STAGING_REF)));
    await assert.rejects(() => api.get(`/v1/projects/${p45.PRODUCTION_REF}`), /Production refusée/);
    assert.equal(calls.length, 2, 'aucun appel Production n\'est parti');
});

test('P4/P5 : l\'exécution exige l\'autorisation écrite, un fichier de jeton, et refuse le jeton de P3 révoqué — sans aucun appel réseau', () => {
    const env = { ...process.env };
    for (const k of ['LYANN_P45_AUTHORIZED', 'LYANN_P45_TOKEN_FILE', 'LYANN_P45_REVOKED_TOKEN_HASHES']) delete env[k];
    const run = (extra) => spawnSync(process.execPath, [SCRIPT, '--execute'], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20000 });
    let r = run({});
    assert.equal(r.status, 3); assert.match(r.stderr, /autorisation écrite/);
    r = run({ LYANN_P45_AUTHORIZED: 'oui' });
    assert.equal(r.status, 3);
    r = run({ LYANN_P45_AUTHORIZED: p45.AUTHORIZATION_PHRASE });
    assert.equal(r.status, 3); assert.match(r.stderr, /LYANN_P45_TOKEN_FILE manquante/);
    // L'autorisation de P3 n'ouvre pas P4/P5.
    r = run({ LYANN_P45_AUTHORIZED: p3.AUTHORIZATION_PHRASE });
    assert.equal(r.status, 3);
    // Jeton déjà révoqué (même empreinte que dans la liste locale) : refus avant tout appel.
    const dir = tmpDir('token');
    const tokenFile = path.join(dir, 't.env');
    const revoked = path.join(dir, 'revoked.txt');
    fs.writeFileSync(tokenFile, 'SUPABASE_ACCESS_TOKEN=jeton-de-test-non-secret\n');
    fs.writeFileSync(revoked, `${sha('jeton-de-test-non-secret')}\n`);
    r = run({ LYANN_P45_AUTHORIZED: p45.AUTHORIZATION_PHRASE, LYANN_P45_TOKEN_FILE: tokenFile, LYANN_P45_REVOKED_TOKEN_HASHES: revoked });
    assert.equal(r.status, 3); assert.match(r.stderr, /révoqué/);
    assert.equal(p45.isRevokedToken('jeton-de-test-non-secret', revoked), true);
    assert.equal(p45.isRevokedToken('autre-jeton-de-test', revoked), false);
    assert.equal(p45.isRevokedToken('x', path.join(dir, 'absent.txt')), false);
    // Étapes inconnues refusées.
    fs.writeFileSync(revoked, '\n');
    r = run({ LYANN_P45_AUTHORIZED: p45.AUTHORIZATION_PHRASE, LYANN_P45_TOKEN_FILE: tokenFile, LYANN_P45_REVOKED_TOKEN_HASHES: revoked });
    // sans --steps invalide : le script tenterait le réseau ; on ne le laisse pas faire
    const bad = spawnSync(process.execPath, [SCRIPT, '--execute', '--steps', 'P9'], { env: { ...env, LYANN_P45_AUTHORIZED: p45.AUTHORIZATION_PHRASE, LYANN_P45_TOKEN_FILE: tokenFile, LYANN_P45_REVOKED_TOKEN_HASHES: revoked }, encoding: 'utf8', timeout: 20000 });
    assert.equal(bad.status, 3); assert.match(bad.stderr, /Étapes inconnues/);
    void r;
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Évaluateurs purs
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const goodPreflight = () => ({
    database: 'postgres', user: 'postgres', version_num: 170011, v2_tables: 0, v2_columns: 0, v2_functions: 0, sync_fn_present: true,
    counts: { requests: 80, services: 208, lyann_taxonomy: 89, moderation_queue: 15, moderation_jobs: 145 }, prohibited_not_cancelled: 0,
    update_triggers: [...p3.REVIEWED_UPDATE_TRIGGERS], sessions: { idle_in_transaction: 0, prepared: 0, advisory_locks: 0, locks_on_targets: 0 },
    catalog: { digest: p45.PROVEN_CATALOG.digest, objects: p45.PROVEN_CATALOG.objects },
});

test('pré-vol : état conforme = GO ; chaque écart = arrêt explicite', () => {
    assert.deepEqual(p45.evaluatePreflight(goodPreflight()), { go: true, stops: [] });
    const cases = {
        'base inattendue': (p) => { p.database = 'autre'; },
        'PostgreSQL trop ancien': (p) => { p.version_num = 140000; },
        'objets v2 présents': (p) => { p.v2_tables = 3; },
        'colonnes v2 présentes': (p) => { p.v2_columns = 1; },
        'fonctions v2 présentes': (p) => { p.v2_functions = 2; },
        'RPC 83 absente': (p) => { p.sync_fn_present = false; },
        'volumétrie': (p) => { p.counts.requests = 30000; },
        'modération introuvable': (p) => { p.counts.moderation_jobs = null; },
        'demande PROHIBITED': (p) => { p.prohibited_not_cancelled = 1; },
        'déclencheur non examiné': (p) => { p.update_triggers.push('requests.trg_inconnu'); },
        'session idle in transaction': (p) => { p.sessions.idle_in_transaction = 1; },
        'transaction préparée': (p) => { p.sessions.prepared = 1; },
        'verrou consultatif': (p) => { p.sessions.advisory_locks = 2; },
        'verrou sur table cible': (p) => { p.sessions.locks_on_targets = 1; },
        'catalogue différent de P3': (p) => { p.catalog.digest = '0'.repeat(32); },
        'nombre d\'objets différent': (p) => { p.catalog.objects = 2382; },
    };
    for (const [name, mutate] of Object.entries(cases)) {
        const p = goodPreflight();
        mutate(p);
        const v = p45.evaluatePreflight(p);
        assert.equal(v.go, false, name);
        assert.ok(v.stops.length >= 1, name);
    }
    assert.equal(p45.evaluatePreflight(null).go, false);
});

const goodVerify = () => ({
    'V01#0': { rows: 0, sample: [] }, 'V09#8': { rows: 0, sample: [] }, 'V11#10': [{ info: 'V11', total: 80 }],
    security: { new_tables: 8, new_tables_without_rls: [], new_tables_structural_or_write_privileges: [], anon_write_on_new_tables: [], definer_functions_without_search_path: [], anon_executable_v2_functions: ['lyann_taxonomy_search'], historical_privileges_on_services: ['anon:TRUNCATE'] },
    moderation: { queue: 15, jobs: 145 }, counts: { requests: 80, services: 208, lyann_taxonomy: 89 }, sessions: { idle_in_transaction: 0, prepared: 0, advisory_locks: 0, locks_on_targets: 0 },
});

test('vérification : état conforme = GO ; chaque anomalie de sécurité, de modération, de catalogue ou hors schéma public = arrêt', () => {
    const ctx = () => ({ stage: 'P5', preflight: goodPreflight(), catalogDiff: { changed: ['fn:lyann_sync_profile_skills(uuid,text[])'], removed: [], added: ['rel:lyann_taxonomy_node'] }, with100: false });
    assert.equal(p45.evaluateVerify(goodVerify(), ctx()).go, true);
    const cases = {
        'V en anomalie': [(r) => { r['V01#0'].rows = 2; }],
        'table v2 sans RLS': [(r) => { r.security.new_tables_without_rls = ['lyann_taxonomy_node']; }],
        'privilège structurel sur table v2': [(r) => { r.security.new_tables_structural_or_write_privileges = ['lyann_taxonomy_node:anon:TRUNCATE']; }],
        'anon écrit sur table v2': [(r) => { r.security.anon_write_on_new_tables = ['lyann_profile_skill:INSERT']; }],
        'SECURITY DEFINER sans search_path': [(r) => { r.security.definer_functions_without_search_path = ['lyann_derive_request_node']; }],
        'fonction v2 exécutable par anon': [(r) => { r.security.anon_executable_v2_functions = ['lyann_taxonomy_search', 'lyann_resolve_legacy_skill']; }],
        'file de modération modifiée': [(r) => { r.moderation.queue = 93; }],
        'tâches de modération modifiées': [(r) => { r.moderation.jobs = 167; }],
        'session ouverte': [(r) => { r.sessions.idle_in_transaction = 1; }],
        'verrou résiduel': [(r) => { r.sessions.locks_on_targets = 1; }],
        'objet préexistant modifié': [() => {}, (c) => { c.catalogDiff.changed.push('fn:lyann_guard_category_entitlement()'); }],
        'objet préexistant retiré': [() => {}, (c) => { c.catalogDiff.removed.push('pol:requests.requests_select'); }],
        'changement hors schéma public': [() => {}, (c) => { c.fingerprintBefore = { extensions: ['a'] }; c.fingerprintAfter = { extensions: ['a', 'b'] }; }],
    };
    for (const [name, [mutateReport, mutateCtx]] of Object.entries(cases)) {
        const r = goodVerify(); const c = ctx();
        mutateReport(r); if (mutateCtx) mutateCtx(c);
        assert.equal(p45.evaluateVerify(r, c).go, false, name);
    }
    // Après P4 seul : la RPC 83 ne doit PAS avoir changé (elle ne change qu'en P5).
    const afterP4 = ctx(); afterP4.stage = 'P4';
    assert.equal(p45.evaluateVerify(goodVerify(), afterP4).go, false, 'P4 ne doit modifier aucun objet préexistant');
    afterP4.catalogDiff.changed = [];
    assert.equal(p45.evaluateVerify(goodVerify(), afterP4).go, true);
    // S100 appliquée : l'ACL de services peut changer, et les privilèges structurels doivent avoir disparu.
    const withS100 = ctx(); withS100.with100 = true; withS100.catalogDiff.changed.push('acl:services');
    assert.equal(p45.evaluateVerify(goodVerify(), withS100).go, false, 'privilèges structurels encore présents après S100');
    const r100 = goodVerify(); r100.security.historical_privileges_on_services = [];
    assert.equal(p45.evaluateVerify(r100, withS100).go, true);
    // Sans S100, un changement d'ACL de services est une anomalie.
    const noS100 = ctx(); noS100.catalogDiff.changed.push('acl:services');
    assert.equal(p45.evaluateVerify(goodVerify(), noS100).go, false);
});

test('catalogue : diffCatalog sépare modifié, retiré, ajouté', () => {
    const before = [{ k: 'a', v: '1' }, { k: 'b', v: '2' }, { k: 'c', v: '3' }];
    const after = [{ k: 'a', v: '1' }, { k: 'b', v: 'x' }, { k: 'd', v: '4' }];
    assert.deepEqual(p45.diffCatalog(before, after), { changed: ['b'], removed: ['c'], added: ['d'] });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Banc PGlite : déroulé complet, arrêts, restauration
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test('banc : déroulé complet (pré-vol, sauvegarde, P4, vérification, P5, vérification, S10, S100, vérification finale), sans écart', async (t) => {
    const dir = tmpDir('full');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        o.before = { digest: expected, hash: await tablesHash(rows), mod: (await rows('SELECT (SELECT count(*)::int FROM public.content_moderation_queue) q, (SELECT count(*)::int FROM public.moderation_jobs) j'))[0] };
        const messages = [];
        o.result = await p45.orchestrate({ api: fakeApi(db), log: (m) => messages.push(m), backupDir: path.join(dir, 'b'), expectedCatalog: expected });
        o.messages = messages;
        o.after = { hash: await tablesHash(rows), mod: (await rows('SELECT (SELECT count(*)::int FROM public.content_moderation_queue) q, (SELECT count(*)::int FROM public.moderation_jobs) j'))[0],
            v2: (await rows("SELECT count(*)::int n FROM pg_class WHERE relkind = 'r' AND relname LIKE 'lyann\\_taxonomy\\_%'"))[0].n,
            nodes: (await rows('SELECT count(*)::int n FROM public.lyann_taxonomy_node'))[0].n,
            requestsWithNode: (await rows("SELECT count(*)::int n FROM public.requests WHERE taxonomy_node_code IS NOT NULL"))[0].n,
            fnS10: (await rows("SELECT count(*)::int n FROM pg_proc WHERE proname = 'lyann_resolve_legacy_skill'"))[0].n,
            structural: (await rows("SELECT has_table_privilege('anon', 'public.services', 'TRUNCATE') a, has_table_privilege('authenticated', 'public.services', 'REFERENCES') b"))[0],
            maintain: (await rows("SELECT has_table_privilege('anon', 'public.services', 'MAINTAIN') a, has_table_privilege('authenticated', 'public.services', 'MAINTAIN') b, has_table_privilege('service_role', 'public.services', 'MAINTAIN') c, has_table_privilege('anon', 'public.services', 'SELECT') d"))[0] };
        o.rows = rows;
        o.verify = (await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'unused'), expectedCatalog: undefined, onlyPreflight: true })).stopped;
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.equal(out.result.stopped, null, JSON.stringify(out.result.stopped));
    assert.equal(out.result.ok, true);
    assert.deepEqual(out.result.steps.map((s) => s.step), ['pré-vol', 'sauvegarde', 'P4', 'P5', 'S10', 'S100', 'S101']);
    assert.ok(out.result.steps.every((s) => s.ok));
    assert.equal(out.after.hash, out.before.hash, 'colonnes historiques identiques (requests, services, lyann_taxonomy)');
    assert.deepEqual(out.after.mod, out.before.mod, 'aucune ligne ni tâche de modération ajoutée');
    assert.ok(out.after.v2 >= 7, 'objets v2 persistants après P4');
    assert.ok(out.after.nodes > 100);
    assert.ok(out.after.requestsWithNode > 0, 'rétro-remplissage effectué');
    assert.equal(out.after.fnS10, 1);
    assert.deepEqual(out.after.structural, { a: false, b: false }, 'S100 : privilèges structurels retirés');
    assert.deepEqual(out.after.maintain, { a: false, b: false, c: true, d: true }, 'S101 : MAINTAIN retiré à anon et authenticated, conservé par service_role, SELECT intact');
    // Après application, un nouveau pré-vol doit refuser de rejouer (objets v2 présents).
    assert.ok(out.verify && /objets v2 existent déjà/.test(out.verify.reasons.join(' ')));
    // Sauvegarde : permissions strictes, empreintes valides, contenu relisible, falsification détectée.
    const b = path.join(dir, 'b');
    assert.equal((fs.statSync(b).mode & 0o777).toString(8), '700');
    for (const f of fs.readdirSync(b)) assert.equal((fs.statSync(path.join(b, f)).mode & 0o777).toString(8), '600', f);
    const backup = p45.readBackup(b);
    assert.equal(backup.manifest.project, p45.STAGING_REF);
    assert.ok(backup.rows.requests.length > 0 && backup.rows.services.length > 0 && backup.rows.lyann_taxonomy.length > 0);
    assert.ok(backup.rows.requests.every((r) => !('taxonomy_node_code' in r)), 'la sauvegarde est celle d\'AVANT P4');
    assert.deepEqual(Object.keys(backup.manifest.scripts).sort(), ['P4', 'P5', 'S10', 'S100', 'S101']);
    fs.appendFileSync(path.join(b, 'services.ndjson'), '{"id":"x"}\n');
    assert.throws(() => p45.readBackup(b), /sauvegarde altérée : services\.ndjson/);
});

test('banc : P4 seul, puis reprise séparée (P5, S10, S100) avec l\'empreinte relevée : même résultat qu\'un déroulé complet ; reprise refusée si l\'empreinte ou l\'état ne correspondent pas', async (t) => {
    const dir = tmpDir('split');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        o.r4 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b4'), steps: ['P4'], expectedCatalog: expected });
        o.afterP4 = (await rows('SELECT count(*)::int n FROM public.requests WHERE taxonomy_node_code IS NOT NULL'))[0].n;
        const recorded = o.r4.report.P4 && o.r4.report.P4.catalog;
        o.recorded = recorded;
        o.live = await digestOf(rows);
        // Sans reprise explicite, un second lancement est refusé (objets v2 présents).
        o.replay = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'x'), steps: ['P5'], expectedCatalog: expected });
        // Mauvaise empreinte, ou P4 dans une reprise : refus avant toute écriture.
        o.badDigest = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'y'), steps: ['P5'], resume: { digest: '1'.repeat(32), objects: recorded.objects } });
        o.withP4 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'z'), steps: ['P4', 'P5'], resume: recorded });
        o.untouched = (await rows('SELECT count(*)::int n FROM public.requests WHERE taxonomy_node_code IS NOT NULL'))[0].n;
        o.r5 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b5'), steps: ['P5', 'S10', 'S100'], resume: recorded });
        o.afterP5 = (await rows('SELECT count(*)::int n FROM public.requests WHERE taxonomy_node_code IS NOT NULL'))[0].n;
        o.s100 = (await rows("SELECT has_table_privilege('anon', 'public.services', 'TRUNCATE') AS a"))[0].a;
        // S101 dans une exécution SÉPARÉE, après P5 : les trois déclencheurs de P5 sont reconnus sur preuve de leur identité (définition PostgreSQL réelle).
        o.triggersSeen = (await rows("SELECT string_agg(c.relname || '.' || t.tgname, ',') s FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('requests', 'services') AND t.tgname LIKE 'lyann\\_%\\_trg'"))[0].s;
        o.r101 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b101'), steps: ['S101'], resume: await digestOf(rows) });
        o.maintain = (await rows("SELECT has_table_privilege('anon', 'public.services', 'MAINTAIN') a, has_table_privilege('service_role', 'public.services', 'MAINTAIN') b"))[0];
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.equal(out.r4.ok, true, JSON.stringify(out.r4.stopped));
    assert.deepEqual(out.recorded, out.live, 'l\'empreinte relevée par P4 est celle du catalogue réel');
    assert.equal(out.afterP4, 0, 'P4 n\'écrit aucune ligne historique');
    assert.match(out.replay.stopped.reasons.join(' '), /objets v2 existent déjà/);
    assert.match(out.badDigest.stopped.reasons.join(' '), /catalogue public a changé/);
    assert.match(out.withP4.stopped.reasons.join(' '), /ne peut pas contenir P4/);
    assert.equal(out.untouched, 0, 'aucune écriture pendant les refus');
    assert.equal(out.r5.ok, true, JSON.stringify(out.r5.stopped));
    assert.deepEqual(out.r5.steps.map((s) => s.step), ['pré-vol', 'sauvegarde', 'P5', 'S10', 'S100']);
    assert.ok(out.afterP5 > 0);
    assert.equal(out.s100, false);
    assert.deepEqual(out.triggersSeen.split(',').sort(), P5_TRIGGERS);
    assert.equal(out.r101.ok, true, JSON.stringify(out.r101.stopped));
    assert.deepEqual(out.r101.steps.map((x) => x.step), ['pré-vol', 'sauvegarde', 'S101']);
    assert.deepEqual(out.maintain, { a: false, b: true });
});

test('banc : la reprise exige que P4 soit appliquée', async (t) => {
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        o.r = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(tmpDir('res'), 'b'), steps: ['P5'], resume: expected });
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.match(out.r.stopped.reasons.join(' '), /reprise après P4 impossible/);
});

test('banc : arrêts avant écriture — catalogue différent de P3, objets v2 déjà présents, demande PROHIBITED, déclencheur non examiné : rien n\'est appliqué', async (t) => {
    const dir = tmpDir('stops');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        const attempt = async (label, setup, expectedCatalog) => {
            if (setup) await setup();
            const before = await digestOf(rows);
            const res = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, label), expectedCatalog: expectedCatalog || expected });
            const after = await digestOf(rows);
            const v2 = (await rows("SELECT count(*)::int n FROM pg_class WHERE relkind = 'r' AND relname LIKE 'lyann\\_taxonomy\\_%'"))[0].n;
            (o.cases = o.cases || {})[label] = { stopped: res.stopped, same: JSON.stringify(before) === JSON.stringify(after), v2, backup: fs.existsSync(path.join(dir, label)) };
        };
        await attempt('digest', null, { digest: '0'.repeat(32), objects: expected.objects });
        await db.exec("INSERT INTO public.requests(id, title, category) VALUES ('00000000-0000-4000-8000-0000000000f1', 'interdite', 'x')");
        // Colonne safety_status/status absentes du banc : la sonde lit to_jsonb(r) ->> 'safety_status' (NULL) → pas de PROHIBITED à ce stade.
        await db.exec("DELETE FROM public.requests WHERE id = '00000000-0000-4000-8000-0000000000f1'");
        await db.exec('ALTER TABLE public.requests ADD COLUMN safety_status text, ADD COLUMN status text');
        await db.exec("INSERT INTO public.requests(id, title, category, safety_status, status) VALUES ('00000000-0000-4000-8000-0000000000f2', 'interdite', 'x', 'PROHIBITED', 'OPEN')");
        const expected2 = await digestOf(rows);
        await attempt('prohibited', null, expected2);
        await db.exec("DELETE FROM public.requests WHERE id = '00000000-0000-4000-8000-0000000000f2'");
        await db.exec('CREATE FUNCTION public.z_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER trg_inconnu BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.z_noop()');
        await attempt('trigger', null, await digestOf(rows));
        await db.exec('DROP TRIGGER trg_inconnu ON public.requests; DROP FUNCTION public.z_noop()');
        await db.exec('CREATE TABLE public.lyann_taxonomy_intrus (id int)');
        await attempt('v2', null, await digestOf(rows));
    });
    if (report.skipped) { t.skip(report.reason); return; }
    const c = out.cases;
    assert.match(c.digest.stopped.reasons.join(' '), /catalogue public a changé/);
    assert.match(c.prohibited.stopped.reasons.join(' '), /PROHIBITED/);
    assert.match(c.trigger.stopped.reasons.join(' '), /déclencheur\(s\) UPDATE non examiné/);
    assert.match(c.v2.stopped.reasons.join(' '), /objets v2 existent déjà/);
    for (const [name, x] of Object.entries(c)) {
        assert.equal(x.stopped.step, 'pré-vol', name);
        assert.equal(x.same, true, `${name} : catalogue inchangé`);
        assert.equal(x.backup, false, `${name} : aucune sauvegarde ni écriture avant un pré-vol conforme`);
    }
    assert.equal(c.digest.v2, 0);
});

test('banc : P5 sans P4 s\'arrête proprement (annulation, catalogue inchangé) ; un contrôle V en anomalie annule P5 entièrement', async (t) => {
    const dir = tmpDir('abort');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        // 1. P5 seule sur une base sans P4.
        const before = await digestOf(rows);
        const r1 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'a'), steps: ['P5'], expectedCatalog: expected });
        o.noP4 = { stopped: r1.stopped, same: JSON.stringify(await digestOf(rows)) === JSON.stringify(before) };
        // 2. P4 puis anomalie V07 (une feuille historique absente de la correspondance) : P5 doit tout annuler.
        const r4 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b'), steps: ['P4'], expectedCatalog: expected });
        o.p4ok = r4.ok;
        await db.exec("INSERT INTO public.lyann_taxonomy(universe, category, subcategory, synonyms, tags, safety_level) VALUES ('Univers inconnu', 'Catégorie inconnue', 'Feuille inconnue', '{}', '{}', 'AUTORISE')");
        const afterP4 = await digestOf(rows);
        const dataBefore = await tablesHash(rows);
        const now = afterP4;
        const p5 = p45.buildP5(now);
        try { await db.exec(p5.sql); o.p5err = null; } catch (e) { o.p5err = e.message; }
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        o.afterAbort = { same: JSON.stringify(await digestOf(rows)) === JSON.stringify(afterP4), data: (await tablesHash(rows)) === dataBefore,
            withNode: (await rows('SELECT count(*)::int n FROM public.requests WHERE taxonomy_node_code IS NOT NULL'))[0].n,
            p5objects: (await rows("SELECT count(*)::int n FROM pg_proc WHERE proname IN ('lyann_legacy_certain_node', 'lyann_derive_request_node')"))[0].n };
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.equal(out.noP4.stopped.step, 'P5');
    assert.match(out.noP4.stopped.reasons.join(' '), /P4 n'est pas appliquée/);
    assert.equal(out.noP4.same, true);
    assert.equal(out.p4ok, true);
    assert.match(out.p5err, /P45_ABORT/);
    assert.match(out.p5err, /V07/);
    assert.deepEqual(out.afterAbort, { same: true, data: true, withNode: 0, p5objects: 0 }, 'P5 annulée en bloc : ni objet, ni rattachement');
});

test('banc : une colonne historique modifiée pendant le rétro-remplissage annule P5 (assertion de données dans la transaction)', async (t) => {
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(tmpDir('hist'), 'b'), steps: ['P4'], expectedCatalog: expected });
        // Déclencheur portant un nom « examiné » (donc toléré au pré-vol) mais qui altérerait le titre : seule l'assertion de données peut le voir.
        await db.exec(`CREATE FUNCTION public.z_alter_title() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.taxonomy_node_code IS DISTINCT FROM OLD.taxonomy_node_code THEN NEW.title := coalesce(NEW.title, '') || '!'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER trg_block_restricted_requests_upd BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.z_alter_title();`);
        const now = await digestOf(rows);
        const dataBefore = await tablesHash(rows);
        try { await db.exec(p45.buildP5(now).sql); o.err = null; } catch (e) { o.err = e.message; }
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        o.dataSame = (await tablesHash(rows)) === dataBefore;
        o.withNode = (await rows('SELECT count(*)::int n FROM public.requests WHERE taxonomy_node_code IS NOT NULL'))[0].n;
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.match(out.err, /P45_ABORT/);
    assert.match(out.err, /données historiques modifiées dans requests/);
    assert.equal(out.dataSame, true);
    assert.equal(out.withNode, 0);
});

test('banc : restauration — 10 puis 09 rétablissent le catalogue, les lignes modifiées ou supprimées reviennent depuis la sauvegarde, la modération ne bouge pas', async (t) => {
    const dir = tmpDir('restore');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        const aclSet = async () => (await rows("SELECT string_agg(x, ',' ORDER BY x) s FROM (SELECT coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') || ':' || a.privilege_type || ':' || a.is_grantable AS x FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.services'::regclass) q"))[0].s;
        o.aclSet = aclSet;
        o.baseline = { digest: expected, hash: await tablesHash(rows), acl: await aclSet() };
        const res = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b'), expectedCatalog: expected });
        o.applied = res.ok;
        // Sinistre simulé : une demande réécrite, une compétence supprimée, une ligne de taxonomie altérée.
        await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
        await db.exec("UPDATE public.requests SET title = 'CORROMPU' WHERE id = (SELECT id FROM public.requests ORDER BY id LIMIT 1)");
        await db.exec('DELETE FROM public.services WHERE id = (SELECT id FROM public.services ORDER BY id LIMIT 1)');
        await db.exec("UPDATE public.lyann_taxonomy SET subcategory = subcategory || ' x' WHERE id = (SELECT id FROM public.lyann_taxonomy ORDER BY id LIMIT 1)");
        await db.exec(`SELECT set_config('request.jwt.claim.role', '', true)`);
        o.corrupted = (await tablesHash(rows)) !== o.baseline.hash;
        o.mod0 = (await rows('SELECT (SELECT count(*)::int FROM public.content_moderation_queue) q, (SELECT count(*)::int FROM public.moderation_jobs) j'))[0];
        const backup = p45.readBackup(path.join(dir, 'b'));
        const sql = p45.buildRestoreSql(backup, { revert100: true, revert101: true });
        o.restoreHasNoSecret = !/sbp_|Bearer/.test(sql);
        await db.exec(sql);
        o.catalogDiff = p45.diffCatalog(backup.catalog, await rows(p45.CATALOG_EXPORT_SQL));
        o.restored = { acl: await aclSet(), digest: await digestOf(rows), hash: await tablesHash(rows), mod: (await rows('SELECT (SELECT count(*)::int FROM public.content_moderation_queue) q, (SELECT count(*)::int FROM public.moderation_jobs) j'))[0],
            v2: (await rows("SELECT count(*)::int n FROM pg_class WHERE relkind = 'r' AND relname LIKE 'lyann\\_taxonomy\\_%'"))[0].n,
            fn: (await rows("SELECT count(*)::int n FROM pg_proc WHERE proname = 'lyann_resolve_legacy_skill'"))[0].n,
            cols: (await rows("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('taxonomy_node_code', 'taxonomy_node_source', 'node_code')"))[0].n };
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.equal(out.applied, true);
    assert.equal(out.corrupted, true);
    assert.equal(out.restored.hash, out.baseline.hash, 'les trois tables sont identiques à la sauvegarde (colonnes historiques)');
    assert.deepEqual(out.restored.mod, out.mod0, 'la restauration des lignes ne remet rien en modération (contexte service)');
    assert.equal(out.restored.v2, 0);
    assert.equal(out.restored.fn, 0);
    assert.equal(out.restored.cols, 0);
    // Le catalogue entier revient à l'état de départ (09 + rollback 100 inclus dans la même transaction).
    assert.deepEqual(out.catalogDiff.added.concat(out.catalogDiff.removed), [], 'aucun objet ajouté ou retiré après restauration');
    // Seule la représentation texte de l'ACL de services peut différer (ordre des aclitem) : l'ensemble des privilèges est identique.
    assert.ok(out.catalogDiff.changed.every((k) => k === 'acl:services'), JSON.stringify(out.catalogDiff.changed));
    assert.equal(out.restored.acl, out.baseline.acl, 'ensemble des privilèges de services identique à celui d\'avant');
    assert.equal(out.restoreHasNoSecret, true);
});

test('banc : la restauration ne touche pas à un schéma resté intact (data-only) et ne réécrit que les lignes qui diffèrent', async (t) => {
    const dir = tmpDir('restore-data');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const expected = await digestOf(rows);
        await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b'), steps: ['P4'], expectedCatalog: expected });
        const backup = p45.readBackup(path.join(dir, 'b'));
        const sql = p45.buildRestoreSql(backup, { dataOnly: true });
        o.noSchemaChange = !/DROP TRIGGER|09 — retour arrière/.test(sql);
        const hashBefore = await tablesHash(rows);
        const mod = async () => (await rows('SELECT (SELECT count(*)::int FROM public.content_moderation_queue) q, (SELECT count(*)::int FROM public.moderation_jobs) j'))[0];
        const modBefore = await mod();
        await db.exec(sql);
        o.unchanged = (await tablesHash(rows)) === hashBefore;
        if (!o.unchanged) for (const tb of ['requests', 'services', 'lyann_taxonomy']) { const d = backup.rows[tb].length; o['n_' + tb] = [d, (await rows(`SELECT count(*)::int n FROM public.${tb}`))[0].n]; }
        o.modSame = JSON.stringify(await mod()) === JSON.stringify(modBefore);
        o.v2Still = (await rows("SELECT count(*)::int n FROM pg_class WHERE relkind = 'r' AND relname LIKE 'lyann\\_taxonomy\\_%'"))[0].n >= 7;
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.equal(out.noSchemaChange, true);
    assert.equal(out.unchanged, true, 'rejouer la restauration de données sur des données intactes ne change rien');
    assert.equal(out.modSame, true);
    assert.equal(out.v2Still, true, 'data-only ne retire pas le schéma v2');
});

test('documentation : le runbook P4/P5 existe, porte les sections citées par le plan, et le plan renvoie vers lui', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'taxonomy', '14-p4-p5-staging-runbook.md'), 'utf8');
    for (const h of [/^## 1\. /m, /^## 2\. /m, /^## 3\. /m, /^## 4\. /m, /^## 5\. /m, /^## 6\. /m, /^## 7\. /m, /^## 8\. /m, /^## 9\. /m]) assert.match(doc, h);
    assert.match(doc, /NON AUTORISÉ/);
    assert.match(p45.PLAN, /14-p4-p5-staging-runbook\.md/);
    assert.match(p45.PLAN, /NON AUTORISÉ/);
    assert.doesNotMatch(p45.PLAN, /gzispjfoywklpqatjyop/);
    for (const [f, h] of Object.entries(p45.fingerprints())) if (f.startsWith('migration-draft/0')) assert.ok(doc.includes(h.slice(0, 16)), `empreinte de ${f} absente du runbook`);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Déclencheurs UPDATE introduits par P5 : reconnus sur PREUVE d'identité, jamais sur leur seul nom ; un déclencheur réellement inconnu arrête toujours
// ---------------------------------------------------------------------------------------------------------------------------------------------------


test('déclencheurs P5 : le contrat est calculé depuis les brouillons 06 et 08 (définition, fonction, empreinte du corps), pas depuis une liste de noms', () => {
    const c = p45.p5TriggerContracts();
    assert.deepEqual(Object.keys(c).sort(), P5_TRIGGERS);
    assert.deepEqual(P5_TRIGGERS.map((k) => c[k].fn), ['lyann_derive_request_node', 'lyann_fill_request_legacy', 'lyann_derive_service_node']);
    for (const k of P5_TRIGGERS) { assert.match(c[k].srcMd5, /^[0-9a-f]{32}$/); assert.match(c[k].def, /^CREATE TRIGGER \w+ BEFORE INSERT OR UPDATE OF .+ FOR EACH ROW EXECUTE FUNCTION \w+\(\)$/); }
    // Empreintes relevées sur Staging le 12 nov. 2026 (pg_proc.prosrc) : le contrat issu des brouillons est bien ce que PostgreSQL a stocké.
    assert.equal(c['requests.lyann_requests_derive_node_trg'].srcMd5, '545277d7a40253f53694cc1bdf8d3a90');
    assert.equal(c['services.lyann_services_derive_node_trg'].srcMd5, '563aa87ff347968825c817ac1b93ccd1');
    assert.equal(c['requests.lyann_requests_legacy_projection_trg'].srcMd5, 'afe0b74d4c9ce4bc5b63eb8d6cef8c27');
    // Aucun n'est dans la liste des six déclencheurs examinés avant P5 : la reconnaissance passe uniquement par le contrat.
    for (const k of P5_TRIGGERS) assert.ok(!p3.REVIEWED_UPDATE_TRIGGERS.includes(k), k);
});

const resumePreflight = () => {
    const c = p45.p5TriggerContracts();
    const pf = goodPreflight();
    pf.v2_tables = 9; pf.v2_columns = 5; pf.v2_functions = 12;
    pf.update_triggers = [...p3.REVIEWED_UPDATE_TRIGGERS, ...P5_TRIGGERS].sort();
    pf.update_trigger_defs = Object.fromEntries(P5_TRIGGERS.map((k) => [k, { def: c[k].def, enabled: 'O', fn: c[k].fn, fn_schema: 'public', secdef: true, config: ['search_path=public, pg_temp'], owner: 'postgres', src_md5: c[k].srcMd5 }]));
    return pf;
};

test('déclencheurs P5 : en reprise, identité prouvée = GO ; hors reprise, ou sur le seul nom, ou altéré = arrêt explicite ; un déclencheur inconnu arrête toujours', () => {
    assert.deepEqual(p45.evaluatePreflight(resumePreflight(), p45.PROVEN_CATALOG, { resume: true }), { go: true, stops: [] });
    // Hors reprise (P4 pas encore appliquée) : jamais reconnus.
    const notResumed = p45.evaluatePreflight(resumePreflight(), p45.PROVEN_CATALOG, { resume: false });
    assert.equal(notResumed.go, false);
    assert.ok(notResumed.stops.some((x) => /déclencheur\(s\) UPDATE non examiné/.test(x)));
    const altered = {
        'définition différente (colonnes surveillées)': (d, k) => { d[k].def = d[k].def.replace('UPDATE OF', 'UPDATE OF id,'); },
        'désactivé': (d, k) => { d[k].enabled = 'D'; },
        'mode réplica': (d, k) => { d[k].enabled = 'R'; },
        'autre fonction': (d, k) => { d[k].fn = 'z_noop'; },
        'fonction hors schéma public': (d, k) => { d[k].fn_schema = 'extensions'; },
        'corps modifié': (d, k) => { d[k].src_md5 = '0'.repeat(32); },
        'SECURITY INVOKER': (d, k) => { d[k].secdef = false; },
        'search_path non figé': (d, k) => { d[k].config = []; },
        'autre propriétaire': (d, k) => { d[k].owner = 'supabase_admin'; },
        'définition non relevée': (d, k) => { delete d[k]; },
    };
    for (const [name, mutate] of Object.entries(altered)) for (const k of P5_TRIGGERS) {
        const pf = resumePreflight(); mutate(pf.update_trigger_defs, k);
        const v = p45.evaluatePreflight(pf, p45.PROVEN_CATALOG, { resume: true });
        assert.equal(v.go, false, `${name} : ${k}`);
        assert.ok(v.stops.some((x) => x.includes(k) && /non conforme à son contrat/.test(x)), `${name} : ${k} : ${v.stops}`);
    }
    // Un déclencheur réellement inconnu arrête, même en reprise et même avec les trois de P5 conformes ; un nom voisin de ceux de P5 ne suffit pas.
    for (const inconnu of ['requests.trg_inconnu', 'services.lyann_services_derive_node_trg_bis', 'lyann_taxonomy.lyann_requests_derive_node_trg']) {
        const pf = resumePreflight(); pf.update_triggers.push(inconnu);
        const v = p45.evaluatePreflight(pf, p45.PROVEN_CATALOG, { resume: true });
        assert.equal(v.go, false, inconnu);
        assert.match(v.stops.join(' '), new RegExp(`non examiné\\(s\\) : ${inconnu.replace(/\./g, '\\.')}`));
    }
});

test('déclencheurs P5 : sur le banc, l\'identité réelle (PostgreSQL) est reconnue après P5 ; chaque altération arrête la reprise avant toute écriture ; un déclencheur inconnu aussi', async (t) => {
    const dir = tmpDir('triggers');
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const e0 = await digestOf(rows);
        await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b4'), steps: ['P4'], expectedCatalog: e0 });
        const r5 = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, 'b5'), steps: ['P5'], resume: await digestOf(rows) });
        o.p5 = r5.ok;
        const attempt = async (label, setup, revert) => {
            if (setup) await db.exec(setup);
            const res = await p45.orchestrate({ api: fakeApi(db), log: () => {}, backupDir: path.join(dir, label), steps: ['S101'], onlyPreflight: true, resume: await digestOf(rows) });
            (o.cases = o.cases || {})[label] = { ok: res.ok, step: res.stopped && res.stopped.step, reasons: res.stopped ? res.stopped.reasons.join(' ') : '', backup: fs.existsSync(path.join(dir, label)) };
            if (revert) await db.exec(revert);
        };
        await attempt('conforme');
        await attempt('desactive', 'ALTER TABLE public.requests DISABLE TRIGGER lyann_requests_derive_node_trg', 'ALTER TABLE public.requests ENABLE TRIGGER lyann_requests_derive_node_trg');
        await attempt('invoker', 'ALTER FUNCTION public.lyann_fill_request_legacy() SECURITY INVOKER', 'ALTER FUNCTION public.lyann_fill_request_legacy() SECURITY DEFINER');
        await attempt('search_path', 'ALTER FUNCTION public.lyann_derive_service_node() RESET search_path', "ALTER FUNCTION public.lyann_derive_service_node() SET search_path = public, pg_temp");
        await attempt('colonnes', 'DROP TRIGGER lyann_services_derive_node_trg ON public.services; CREATE TRIGGER lyann_services_derive_node_trg BEFORE INSERT OR UPDATE OF title ON public.services FOR EACH ROW EXECUTE FUNCTION public.lyann_derive_service_node()',
            'DROP TRIGGER lyann_services_derive_node_trg ON public.services; CREATE TRIGGER lyann_services_derive_node_trg BEFORE INSERT OR UPDATE OF title, category, taxonomy_node_code ON public.services FOR EACH ROW EXECUTE FUNCTION public.lyann_derive_service_node()');
        await attempt('autre_fonction', 'CREATE FUNCTION public.z_noop() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NEW; END $$; DROP TRIGGER lyann_requests_legacy_projection_trg ON public.requests; CREATE TRIGGER lyann_requests_legacy_projection_trg BEFORE INSERT OR UPDATE OF taxonomy_node_code ON public.requests FOR EACH ROW EXECUTE FUNCTION public.z_noop()',
            'DROP TRIGGER lyann_requests_legacy_projection_trg ON public.requests; CREATE TRIGGER lyann_requests_legacy_projection_trg BEFORE INSERT OR UPDATE OF taxonomy_node_code ON public.requests FOR EACH ROW EXECUTE FUNCTION public.lyann_fill_request_legacy(); DROP FUNCTION public.z_noop()');
        await attempt('inconnu', 'CREATE FUNCTION public.z_noop2() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER trg_inconnu BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.z_noop2()',
            'DROP TRIGGER trg_inconnu ON public.services; DROP FUNCTION public.z_noop2()');
        await attempt('retour_conforme');
        // Dernier cas (non réversible ici) : corps d'une fonction réécrit, nom et définition du déclencheur inchangés.
        await attempt('corps', "CREATE OR REPLACE FUNCTION public.lyann_derive_request_node() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NEW; END $$");
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.equal(out.p5, true);
    const c = out.cases;
    for (const k of ['conforme', 'retour_conforme']) { assert.equal(c[k].ok, true, `${k} : ${c[k].reasons}`); }
    for (const k of ['desactive', 'invoker', 'search_path', 'colonnes', 'autre_fonction', 'corps']) {
        assert.equal(c[k].ok, false, k); assert.equal(c[k].step, 'pré-vol', k);
        assert.match(c[k].reasons, /non conforme à son contrat/, k);
        assert.equal(c[k].backup, false, `${k} : aucune sauvegarde ni écriture`);
    }
    assert.match(c.desactive.reasons, /désactivé/);
    assert.match(c.invoker.reasons, /SECURITY DEFINER/);
    assert.match(c.search_path.reasons, /search_path/);
    assert.match(c.colonnes.reasons, /définition différente/);
    assert.match(c.autre_fonction.reasons, /fonction attendue public\.lyann_fill_request_legacy/);
    assert.match(c.corps.reasons, /corps de la fonction différent/);
    assert.equal(c.inconnu.ok, false);
    assert.match(c.inconnu.reasons, /non examiné\(s\) : services\.trg_inconnu/);
});

test('S101 : le vérificateur exige MAINTAIN absent après S101 et autorise le seul changement d\'ACL de services', () => {
    const ctx = () => ({ stage: 'P5', preflight: goodPreflight(), catalogDiff: { changed: ['fn:lyann_sync_profile_skills(uuid,text[])'], removed: [], added: ['rel:lyann_taxonomy_node'] }, with100: false });
    const withS101 = ctx(); withS101.with101 = true; withS101.catalogDiff.changed.push('acl:services');
    const base = goodVerify(); base.security.maintain_on_services = ['anon', 'authenticated'];
    assert.equal(p45.evaluateVerify(base, withS101).go, false, 'MAINTAIN encore présent après S101');
    const ok = goodVerify(); ok.security.maintain_on_services = [];
    assert.equal(p45.evaluateVerify(ok, withS101).go, true);
    // Sans S101, un changement d'ACL de services reste une anomalie ; MAINTAIN présent est seulement noté.
    const noS101 = ctx(); noS101.catalogDiff.changed.push('acl:services');
    assert.equal(p45.evaluateVerify(ok, noS101).go, false);
    const noted = p45.evaluateVerify(base, ctx());
    assert.ok(noted.notes.some((n) => /MAINTAIN de services inchangé/.test(n)));
});
