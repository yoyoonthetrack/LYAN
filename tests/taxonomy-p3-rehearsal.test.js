'use strict';
/*
 * P3 — répétition à blanc de la migration taxonomie v2 : le SCRIPT est testé ici, jamais exécuté sur Staging.
 * Banc : PGlite local (dépendance optionnelle, test ignoré si absente). Aucun accès réseau.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const p3 = require('../scripts/taxonomy-v2/p3-rehearsal');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'taxonomy-v2', 'p3-rehearsal.js');

const runBench = async (afterSetup) => {
    const { run } = require('../scripts/taxonomy-v2/validate-sql-pglite');
    const out = {};
    const report = await run({ onlyAfterSetup: true, afterSetup: async (ctx) => { await afterSetup(ctx, out); } });
    return { report, out };
};

test('P3 : le SQL généré passe le linter (une seule transaction, aucun COMMIT, aucun effet externe, aucune Production)', () => {
    const built = p3.buildRehearsal();
    assert.deepEqual(p3.lint(built.sql), []);
    assert.ok(built.checks >= 22, `contrôles 07 repris : ${built.checks}`);
    assert.doesNotMatch(built.sql, /gzispjfoywklpqatjyop/);
    assert.match(built.sql, /tdktfbtqceldlaeqjtow/);
    assert.match(built.sql, /ERRCODE = 'P3R01'/);
});

test('P3 : le linter refuse ce qui rendrait l\'essai durable ou externe', () => {
    const good = p3.buildRehearsal().sql;
    const bad = {
        'COMMIT': `${good}\nCOMMIT;`,
        'TRUNCATE': `${good}\nTRUNCATE public.requests;`,
        'nextval': `${good}\nSELECT nextval('x');`,
        'NOTIFY': `${good}\nNOTIFY pgrst;`,
        'Production': `${good}\n-- gzispjfoywklpqatjyop`,
        'index concurrent': `${good}\nCREATE INDEX CONCURRENTLY i ON public.requests(id);`,
        'deuxième BEGIN': `BEGIN;\n${good}`,
    };
    for (const [name, sql] of Object.entries(bad)) assert.notDeepEqual(p3.lint(sql), [], name);
});

test('P3 : l\'exécution sur Staging exige une autorisation écrite (variable d\'environnement) et ne fait aucun appel sans elle', () => {
    const env = { ...process.env };
    delete env.LYANN_P3_AUTHORIZED;
    env.LYANN_SUPABASE_ACCESS_TOKEN_FILE = '/nonexistent';
    const r = spawnSync(process.execPath, [SCRIPT, '--execute'], { env, encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /autorisation écrite/);
    const wrong = spawnSync(process.execPath, [SCRIPT, '--execute'], { env: { ...env, LYANN_P3_AUTHORIZED: 'oui' }, encoding: 'utf8', timeout: 20000 });
    assert.equal(wrong.status, 3);
});

test('P3 : le plan imprimé reste cohérent avec la documentation (§7 du document 13, Staging seulement)', () => {
    assert.match(p3.PLAN, /NON AUTORISÉ/);
    assert.match(p3.PLAN, /13-lock-before-staging-migration\.md §7/);
    assert.match(p3.PLAN, new RegExp(p3.STAGING_REF));
    assert.doesNotMatch(p3.PLAN, /gzispjfoywklpqatjyop/);
});

test('P3 : extraction du rapport depuis la réponse de l\'API (corps JSON, accolades dans les chaînes, contexte après le rapport)', () => {
    const rep = { results: { a: 'x}"y{', b: [1, { c: 2 }] } };
    const msg = `ERROR: P3_REPORT ${JSON.stringify(rep)}\nCONTEXT: PL/pgSQL function inline_code_block {ligne 3}`;
    assert.deepEqual(p3.extractReport(JSON.stringify({ message: msg })), rep);
    assert.deepEqual(p3.extractReport(msg), rep);
    assert.equal(p3.extractReport('{"message":"autre erreur"}'), null);
    assert.equal(p3.extractReport('P3_REPORT {"tronqué":'), null);
});

test('P3 : conditions d\'arrêt — chaque anomalie produit un NO-GO explicite', () => {
    const ok = {
        results: {
            'V01#0': { rows: 0, sample: [] }, preexisting_changes: [{ k: 'fn:lyann_sync_profile_skills(uuid,text[])', change: 'changed' }], rollback_differences: [],
            state_after_apply: { requests: { changed_columns: {} }, services: { changed_columns: {} }, lyann_taxonomy: { changed_columns: {} } },
            state_after_rollback: { requests: { changed_columns: {} }, services: { changed_columns: {} }, lyann_taxonomy: { changed_columns: {} }, moderation_queue_rows: 5, moderation_jobs_rows: 2 },
            moderation_service: { requests: { changed_columns: {} }, services: { changed_columns: {} }, lyann_taxonomy: { changed_columns: {} }, moderation_queue_rows: 5, moderation_jobs_rows: 2 },
            moderation_plain: { requests: { changed_columns: {} }, moderation_queue_rows: 9, moderation_jobs_rows: 6 },
        },
    };
    const clone = () => JSON.parse(JSON.stringify(ok));
    assert.equal(p3.evaluateReport(ok).go, true);
    const cases = {
        'contrôle 07 en anomalie': (r) => { r.results['V01#0'].rows = 2; },
        'objet préexistant modifié': (r) => { r.results.preexisting_changes.push({ k: 'fn:lyann_guard_category_entitlement()', change: 'changed' }); },
        'demande PROHIBITED non annulée (le trigger de sécurité changerait son statut)': (r) => { r.results.risk_probes = { prohibited_not_cancelled: 2, update_triggers: [] }; },
        'déclencheur UPDATE non examiné': (r) => { r.results.risk_probes = { prohibited_not_cancelled: 0, update_triggers: ['requests.trg_inconnu'] }; },
        'rollback incomplet': (r) => { r.results.rollback_differences.push({ k: 'col:requests.taxonomy_node_code', change: 'added' }); },
        'colonne historique modifiée': (r) => { r.results.state_after_apply.requests.changed_columns = { category: 3 }; },
        'données différentes après rollback': (r) => { r.results.state_after_rollback.services.changed_columns = { title: 1 }; },
        'file de modération alimentée (contexte service)': (r) => { r.results.moderation_service.moderation_queue_rows = 85; },
        'tâche de modération ajoutée (contexte service)': (r) => { r.results.moderation_service.moderation_jobs_rows = 7; },
    };
    for (const [name, mutate] of Object.entries(cases)) {
        const r = clone();
        mutate(r);
        const v = p3.evaluateReport(r);
        assert.equal(v.go, false, name);
        assert.ok(v.stops.length >= 1, name);
    }
    assert.match(p3.evaluateReport(ok).notes.join(' '), /\+4 file de modération, \+4 tâches/);
});

test('P3 banc local : le script s\'exécute de bout en bout, finit par P3R01, et la base (catalogue et lignes) est strictement identique', async (t) => {
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        const digest = async () => (await rows(p3.DIGEST_SQL))[0];
        const counts = async () => JSON.stringify(await rows("SELECT (SELECT count(*) FROM public.requests) r, (SELECT count(*) FROM public.services) s, (SELECT count(*) FROM public.lyann_taxonomy) t, (SELECT count(*) FROM public.content_moderation_queue) q, (SELECT count(*) FROM public.moderation_jobs) j"));
        const rowsHash = async () => (await rows("SELECT md5((SELECT string_agg(to_jsonb(r)::text, '|' ORDER BY id) FROM public.requests r) || (SELECT string_agg(to_jsonb(x)::text, '|' ORDER BY id) FROM public.services x) || (SELECT string_agg(to_jsonb(y)::text, '|' ORDER BY id) FROM public.lyann_taxonomy y)) AS h"))[0].h;
        o.before = { digest: await digest(), counts: await counts(), hash: await rowsHash() };
        try { await db.exec(p3.buildRehearsal().sql); o.error = null; } catch (e) { o.error = e; }
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        o.after = { digest: await digest(), counts: await counts(), hash: await rowsHash() };
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.ok(out.error, 'le script ne doit JAMAIS se terminer par un succès');
    assert.equal(out.error.code, 'P3R01');
    const rep = p3.extractReport(out.error.message);
    assert.ok(rep, 'rapport absent');
    assert.ok(JSON.stringify(rep).length < 20000, 'rapport compact');
    const verdict = p3.evaluateReport(rep);
    assert.deepEqual(verdict.stops, []);
    assert.equal(verdict.go, true);
    assert.equal(rep.results.risk_probes.prohibited_not_cancelled, 0);
    assert.ok(Array.isArray(rep.results.risk_probes.update_triggers));
    assert.deepEqual(out.after, out.before, 'état avant/après identique');
    assert.deepEqual(rep.results.rollback_differences, []);
    assert.deepEqual(rep.results.preexisting_changes.map((c) => c.k), p3.EXPECTED_CHANGED);
    assert.equal(rep.results.moderation_service.moderation_queue_rows, rep.results.state_after_rollback.moderation_queue_rows, 'contexte service : aucune file de modération ajoutée');
    assert.ok(rep.results.moderation_plain.moderation_queue_rows > rep.results.state_after_rollback.moderation_queue_rows, 'variante « telle quelle » : l\'aléa de modération est bien mesuré');
});

test('P3 banc local : un objet v2 déjà présent arrête le script AVANT toute écriture', async (t) => {
    const { report, out } = await runBench(async ({ db, rows }, o) => {
        await db.exec('CREATE TABLE public.lyann_taxonomy_intrus (id int)');
        o.before = (await rows(p3.DIGEST_SQL))[0];
        try { await db.exec(p3.buildRehearsal().sql); o.error = null; } catch (e) { o.error = e; }
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        o.after = (await rows(p3.DIGEST_SQL))[0];
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.match(out.error.message, /P3 prérequis/);
    assert.deepEqual(out.after, out.before);
});

test('documentation : le document 13 porte les sections citées par le plan P3 et par le brouillon 100, et les index le référencent', () => {
    const fs = require('node:fs');
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'taxonomy', '13-lock-before-staging-migration.md'), 'utf8');
    assert.match(doc, /^## 3\. X3 /m, 'le brouillon 100 renvoie au §3');
    assert.match(doc, /^## 7\. P3 /m, 'le plan P3 renvoie au §7');
    assert.match(doc, /^### 7\.3 Conditions d'arrêt/m);
    assert.match(doc, /^### 7\.4 Plan de récupération/m);
    assert.match(doc, /NON AUTORISÉE/);
    for (const f of ['README.md', '11-staging-integration-plan.md', '12-staging-validation-and-legacy-compat.md']) {
        assert.match(fs.readFileSync(path.join(__dirname, '..', 'docs', 'taxonomy', f), 'utf8'), /13-lock-before-staging-migration\.md/, f);
    }
    // Chaque condition d'arrêt de l'évaluateur est décrite : 10 lignes numérotées en §7.3.
    const section = doc.slice(doc.indexOf('### 7.3'), doc.indexOf('### 7.4'));
    assert.equal((section.match(/^\d+\. /gm) || []).length, 10);
});
