'use strict';
/*
 * Taxonomie v2 × quotas de compétences (décision X2), spécialités héritées (X5), durcissement de services (X3, brouillon NON appliqué).
 * Banc : PGlite local avec le VRAI code de la migration 82 (garde de quota) et de la migration 83 (RPC d'origine), extrait des fichiers.
 * Aucun accès réseau, aucune base distante.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DRAFT = path.join(ROOT, 'docs', 'taxonomy', 'migration-draft');
const SECURITY = path.join(ROOT, 'docs', 'taxonomy', 'security-draft');
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('quotas : la garde de la migration 82 est inchangée et conserve les plafonds 1 / 3 / 5', async (t) => {
    const { run } = require('../scripts/taxonomy-v2/validate-quotas-pglite');
    const report = await run();
    if (report.skipped) { t.skip(report.reason); return; }
    assert.deepEqual(report.failures, []);
    assert.ok(report.steps.length >= 60, `contrôles : ${report.steps.length}`);
});

test('quotas : les brouillons n\'écrivent jamais les colonnes qui déclenchent la garde de quota, hors RPC et rétro-remplissage encadrés', () => {
    // Le déclencheur de quota écoute category_id, category, owner_id, active, is_active. Les brouillons 02, 05, 06, 08 ne doivent écrire que les colonnes v2 de services.
    for (const f of ['02_additive_columns.sql', '06_dual_write_derivation.sql', '08_legacy_projection.sql']) {
        const sql = read(DRAFT, f).replace(/^\s*--.*$/gm, '');
        assert.doesNotMatch(sql, /UPDATE\s+public\.services\s+SET[^;]*\b(category_id|category|owner_id|active|is_active)\s*=/i, f);
        assert.doesNotMatch(sql, /DISABLE\s+TRIGGER|ALTER\s+TABLE\s+public\.services\s+DISABLE/i, f);
    }
    const backfill = read(DRAFT, '05_legacy_map_and_backfill.sql').replace(/^\s*--.*$/gm, '');
    for (const m of backfill.matchAll(/UPDATE\s+public\.services[\s\S]*?;/gi)) {
        const setClause = /SET([\s\S]*?)(FROM|WHERE)/i.exec(m[0])[1];
        assert.doesNotMatch(setClause, /\b(category_id|category|owner_id|active|is_active)\b\s*=/i, 'le rétro-remplissage de services ne touche que taxonomy_node_*');
    }
    assert.doesNotMatch(backfill, /DISABLE\s+TRIGGER|session_replication_role/i);
});

test('quotas : la RPC v2 écrit title = description = category (politique C) et ne touche jamais à lyann_guard_category_entitlement ni aux forfaits', () => {
    const rpc = read(DRAFT, '03_search_and_skills_rpc.sql');
    assert.match(rpc, /SELECT CASE WHEN n\.kind = 'specialty' THEN p\.label_fr \|\| ' · ' \|\| n\.label_fr ELSE n\.label_fr END INTO v_title/);
    assert.match(rpc, /VALUES \(p_user, v_title, v_title, v_title,/, 'title = description = category');
    for (const f of fs.readdirSync(DRAFT).filter((x) => x.endsWith('.sql') && !x.startsWith('09_'))) {
        const sql = read(DRAFT, f).replace(/^\s*--.*$/gm, '');
        assert.doesNotMatch(sql, /lyann_guard_category_entitlement|lyann_plan_|lyann_category_entitlement/, `${f} ne modifie ni la garde ni les forfaits`);
    }
});

test('X5 : lyann_legacy_certain_node est SECURITY DEFINER STABLE, search_path fixé, sans écriture, non appelable par les clients', () => {
    const sql = read(DRAFT, '05_legacy_map_and_backfill.sql');
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_legacy_certain_node');
    assert.ok(start > 0);
    const body = sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start)) + 3);
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /\bSTABLE\b/);
    assert.match(body, /SET search_path/);
    assert.doesNotMatch(body.replace(/^\s*--.*$/gm, ''), /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/i);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.lyann_legacy_certain_node\(text, text\) FROM PUBLIC, anon, authenticated;/);
    assert.match(read(DRAFT, '09_rollback_taxonomy_v2.sql'), /DROP FUNCTION IF EXISTS public\.lyann_legacy_certain_node\(text, text\);/);
});

test('modération : les deux UPDATE de requests du rétro-remplissage sont bornés par les marqueurs et protégés (approuvées, sans modification en attente)', () => {
    const sql = read(DRAFT, '05_legacy_map_and_backfill.sql');
    const blocks = [...sql.matchAll(/-- @requests-backfill:begin([\s\S]*?)-- @requests-backfill:end/g)].map((m) => m[1]);
    assert.equal(blocks.length, 2);
    for (const block of blocks) {
        const code = block.replace(/^\s*--.*$/gm, '');
        assert.equal((code.match(/UPDATE\s+public\.requests/gi) || []).length, 1);
        assert.match(code, /public_moderation_status = 'approved' AND r\.title_pending IS NULL AND r\.description_pending IS NULL/, 'garde de modération');
        const setClause = /\bSET([\s\S]*?)\bFROM\b/i.exec(code)[1];
        const written = [...setClause.matchAll(/\b(\w+)\s*=(?!=)/g)].map((m) => m[1]);
        assert.deepEqual([...new Set(written)].sort(), ['taxonomy_node_code', 'taxonomy_node_source'], 'seules les colonnes v2 sont écrites');
    }
    // Aucun autre UPDATE de requests dans 05 en dehors des marqueurs.
    const outside = sql.replace(/-- @requests-backfill:begin[\s\S]*?-- @requests-backfill:end/g, '').replace(/^\s*--.*$/gm, '');
    assert.doesNotMatch(outside, /UPDATE\s+public\.requests/i);
});

test('X3 : brouillons 100 — libellés NON APPLIQUÉ, services seulement, aucune Production, aucune politique RLS touchée', () => {
    for (const f of ['100_services_dangerous_privileges_staging.sql', '100_services_dangerous_privileges_rollback.sql']) {
        const sql = read(SECURITY, f);
        assert.match(sql.split('\n')[0], /NON APPLIQUÉ/, f);
        assert.doesNotMatch(sql, /gzispjfoywklpqatjyop/, f);
        const code = sql.replace(/^\s*--.*$/gm, '');
        assert.doesNotMatch(code, /\b(requests|messages|profiles|payments|missions)\b\s*(FROM|TO)/i, f);
        assert.doesNotMatch(code, /DISABLE ROW LEVEL SECURITY|DROP POLICY|CREATE POLICY|ALTER POLICY/i, f);
    }
    const apply = read(SECURITY, '100_services_dangerous_privileges_staging.sql').replace(/^\s*--.*$/gm, '');
    assert.match(apply, /REVOKE\s+TRUNCATE,\s*TRIGGER,\s*REFERENCES\s+ON\s+(TABLE\s+)?public\.services\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
    assert.doesNotMatch(apply, /REVOKE\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i, 'SELECT/INSERT/UPDATE/DELETE restent intacts');
    const rollback = read(SECURITY, '100_services_dangerous_privileges_rollback.sql').replace(/^\s*--.*$/gm, '');
    assert.match(rollback, /GRANT\s+TRUNCATE,\s*TRIGGER,\s*REFERENCES\s+ON\s+(TABLE\s+)?public\.services\s+TO\s+anon,\s*authenticated/i);
});

test('X3 : les brouillons 100 ne sont référencés par aucun script exécutable ni par le P3', () => {
    const p3 = fs.readFileSync(path.join(ROOT, 'scripts', 'taxonomy-v2', 'p3-rehearsal.js'), 'utf8');
    assert.doesNotMatch(p3, /security-draft|100_services/);
});
