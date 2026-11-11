'use strict';
/*
 * P3 — RÉPÉTITION À BLANC de la migration taxonomie v2 sur Staging (tdktfbtqceldlaeqjtow).
 *
 * CE SCRIPT NE S'EXÉCUTE PAS SUR STAGING SANS AUTORISATION ÉCRITE SPÉCIFIQUE (deux verrous : --execute ET la variable LYANN_P3_AUTHORIZED).
 * Il peut être appelé librement pour :
 *   node scripts/taxonomy-v2/p3-rehearsal.js --print [--out fichier.sql]   construit le SQL complet (aucun accès réseau, aucune connexion)
 *   node scripts/taxonomy-v2/p3-rehearsal.js --plan                        affiche le déroulé, les effets attendus et les conditions d'arrêt
 * Le banc local (tests/taxonomy-p3-rehearsal.test.js) rejoue exactement le SQL construit ici sur PGlite.
 *
 * Principe : UNE transaction, qui ne peut JAMAIS être validée — le script ne contient ni COMMIT ni point de sortie réussi : il se termine
 * par une exception volontaire (SQLSTATE P3R01) dont le message porte le rapport JSON. Toute autre issue (erreur, coupure, délai) annule aussi.
 *   0. garde-fous de session (délais), état de référence (catalogue, lignes), contrôle des prérequis ;
 *   1. 01 → 04 (schéma, colonnes, recherche, amorçage) ;
 *   2. mesure du rétro-remplissage 05 dans deux sous-transactions annulées : « tel quel » puis en contexte « service » (effets sur la modération) ;
 *   3. 05 (contexte service) → 06 → 08 ; 07 (V01-V23) ; mesure des changements sur les objets préexistants ;
 *   4. 09 (retour arrière) jouée dans la même transaction : le catalogue et les données doivent redevenir IDENTIQUES à l'état de référence ;
 *   5. rapport, puis annulation de la transaction.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stripTransaction, backfillVariants } = require('./moderation-fixture');

const ROOT = path.join(__dirname, '..', '..');
const DRAFT = path.join(ROOT, 'docs', 'taxonomy', 'migration-draft');
const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const AUTHORIZATION_PHRASE = `I-AUTHORIZE-P3-REHEARSAL-ON-${STAGING_REF}`;
const read = (f) => fs.readFileSync(path.join(DRAFT, f), 'utf8');

/** Requête de catalogue : un objet = une clé, une valeur de contrôle. Tout ce qui, hors nouveautés attendues, ne doit pas bouger. */
const CATALOG_SQL = `
SELECT 'rel:' || c.relname AS k, c.relkind::text || ':' || c.relrowsecurity::text AS v FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S')
UNION ALL SELECT 'col:' || table_name || '.' || column_name, data_type || '|' || is_nullable || '|' || coalesce(column_default, '') FROM information_schema.columns WHERE table_schema = 'public'
UNION ALL SELECT 'fn:' || p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
UNION ALL SELECT 'trg:' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL SELECT 'pol:' || tablename || '.' || policyname, md5(cmd || roles::text || coalesce(qual, '') || coalesce(with_check, '')) FROM pg_policies WHERE schemaname = 'public'
UNION ALL SELECT 'acl:' || c.relname, coalesce(c.relacl::text, '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
UNION ALL SELECT 'con:' || conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid) || ':' || convalidated::text FROM pg_constraint WHERE connamespace = 'public'::regnamespace
UNION ALL SELECT 'idx:' || tablename || '.' || indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;

/** Empreinte unique du catalogue public (pour comparer avant / après depuis l'extérieur de la transaction). */
const DIGEST_SQL = `SELECT md5(string_agg(k || '=' || v, E'\\n' ORDER BY k)) AS catalog_digest, count(*) AS objects FROM (${CATALOG_SQL}) c`;

/** Clés dont un changement est ATTENDU sur un objet préexistant (le reste ne doit pas bouger). */
const EXPECTED_CHANGED = ['fn:lyann_sync_profile_skills(uuid,text[])'];
/** Déclencheurs UPDATE relevés sur Staging (lecture seule) et examinés un par un (document 13 §5). Tout autre déclencheur = arrêt : non examiné. */
const REVIEWED_UPDATE_TRIGGERS = [
    'requests.trg_block_restricted_requests_upd', 'requests.trg_enforce_request_moderation', 'requests.trg_enforce_simplified_request_safety',
    'requests.trg_lyann_block_request_close_when_paid', 'requests.trg_touch_request_moderation_job', 'services.lyann_category_entitlement',
];
const EXPECTED_ADDED_COLUMNS = ['col:requests.taxonomy_node_code', 'col:requests.taxonomy_node_source', 'col:services.taxonomy_node_code', 'col:services.taxonomy_node_source', 'col:lyann_taxonomy.node_code'];

/** Découpe 07 en contrôles : { id, sql, info }. */
function parseVerify(sql07) {
    const out = [];
    const blocks = sql07.split(/^-- V\d+/m).slice(1);
    for (const block of blocks) {
        const text = block.split('\n').slice(1).filter((l) => !l.trim().startsWith('--')).join('\n').trim();
        const statements = text.split(/;[ \t]*$/m).map((x) => x.trim()).filter(Boolean);
        for (const stmt of statements) {
            const id = (/'(V\d+)[^']*'/.exec(stmt) || [])[1];
            if (id) out.push({ id, sql: stmt, info: /AS info/.test(stmt) });
        }
    }
    return out;
}

const dollar = (tag, text) => {
    if (text.includes(`$${tag}$`)) throw new Error(`le texte contient déjà le délimiteur $${tag}$`);
    return `$${tag}$${text}$${tag}$`;
};

function buildRehearsal() {
    const files = {
        f01: read('01_schema_taxonomy_v2.sql'), f02: read('02_additive_columns.sql'), f03: read('03_search_and_skills_rpc.sql'), f04: read('04_seed_taxonomy_v2.sql'),
        f05: read('05_legacy_map_and_backfill.sql'), f06: read('06_dual_write_derivation.sql'), f07: read('07_verify_taxonomy_v2.sql'), f08: read('08_legacy_projection.sql'), f09: read('09_rollback_taxonomy_v2.sql'),
    };
    const variants = backfillVariants(files.f05);
    const checks = parseVerify(files.f07);
    const s = [];
    const stage = (name) => s.push(`INSERT INTO pg_temp.p3_t(step) VALUES (${JSON.stringify(name).replace(/"/g, "'")});`);
    const sectionFile = (name, sql) => { s.push('', `-- ===== ${name} =====`, stripTransaction(sql)); };

    s.push(
        '-- ============================================================================',
        '-- P3 — RÉPÉTITION À BLANC (généré par scripts/taxonomy-v2/p3-rehearsal.js — NE PAS ÉDITER)',
        `-- Cible autorisée : Staging ${STAGING_REF} UNIQUEMENT, après autorisation écrite spécifique. JAMAIS Production.`,
        '-- Une seule transaction ; AUCUN COMMIT ; se termine par une exception volontaire (P3R01) qui porte le rapport JSON : tout est annulé.',
        '-- ============================================================================',
        'BEGIN;',
        "SET LOCAL lock_timeout = '5s';",
        "SET LOCAL statement_timeout = '300s';",
        "SET LOCAL idle_in_transaction_session_timeout = '600s';",
        '',
        '-- Journal et état de référence (objets temporaires de la session : disparaissent avec la transaction)',
        'CREATE TEMP TABLE p3_t (seq serial PRIMARY KEY, step text NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());',
        'CREATE TEMP TABLE p3_out (k text PRIMARY KEY, v jsonb);',
        'INSERT INTO pg_temp.p3_t(step) VALUES (\'start\');',
        'CREATE TEMP TABLE p3_req_base AS SELECT id, to_jsonb(r) AS j FROM public.requests r;',
        'CREATE TEMP TABLE p3_svc_base AS SELECT id, to_jsonb(x) AS j FROM public.services x;',
        'CREATE TEMP TABLE p3_tax_base AS SELECT id, to_jsonb(x) AS j FROM public.lyann_taxonomy x;',
        `CREATE TEMP TABLE p3_catalog_before AS ${CATALOG_SQL};`,
        '',
        'CREATE FUNCTION pg_temp.p3_changed(p_base regclass, p_table regclass, p_drop text[]) RETURNS jsonb LANGUAGE plpgsql AS ' + dollar('p3f', `
DECLARE r jsonb;
BEGIN
    EXECUTE format('SELECT jsonb_build_object(''changed_columns'', (SELECT coalesce(jsonb_object_agg(k, n), ''{}''::jsonb) FROM (SELECT e.key AS k, count(*) AS n FROM %1$s t JOIN %2$s b ON b.id = t.id, jsonb_each(to_jsonb(t) - $1) e WHERE b.j -> e.key IS DISTINCT FROM e.value GROUP BY e.key) x), ''missing_rows'', (SELECT count(*) FROM %2$s b WHERE NOT EXISTS (SELECT 1 FROM %1$s t WHERE t.id = b.id)), ''new_rows'', (SELECT count(*) FROM %1$s t WHERE NOT EXISTS (SELECT 1 FROM %2$s b WHERE b.id = t.id)))', p_table, p_base)
        INTO r USING p_drop;
    RETURN r;
END;`) + ';',
        'CREATE FUNCTION pg_temp.p3_state() RETURNS jsonb LANGUAGE plpgsql AS ' + dollar('p3f', `
DECLARE v_q bigint; v_j bigint;
BEGIN
    IF to_regclass('public.content_moderation_queue') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.content_moderation_queue' INTO v_q; END IF;
    IF to_regclass('public.moderation_jobs') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.moderation_jobs' INTO v_j; END IF;
    RETURN jsonb_build_object(
        'moderation_queue_rows', v_q, 'moderation_jobs_rows', v_j,
        'requests', pg_temp.p3_changed('pg_temp.p3_req_base'::regclass, 'public.requests'::regclass, ARRAY['taxonomy_node_code', 'taxonomy_node_source']),
        'services', pg_temp.p3_changed('pg_temp.p3_svc_base'::regclass, 'public.services'::regclass, ARRAY['taxonomy_node_code', 'taxonomy_node_source']),
        'lyann_taxonomy', pg_temp.p3_changed('pg_temp.p3_tax_base'::regclass, 'public.lyann_taxonomy'::regclass, ARRAY['node_code']),
        'requests_with_node', (SELECT count(*) FROM public.requests r WHERE to_jsonb(r) ->> 'taxonomy_node_code' IS NOT NULL),
        'services_with_node', (SELECT count(*) FROM public.services x WHERE to_jsonb(x) ->> 'taxonomy_node_code' IS NOT NULL));
END;`) + ';',
        'CREATE FUNCTION pg_temp.p3_try_variant(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS ' + dollar('p3f', `
DECLARE r jsonb;
BEGIN
    BEGIN
        EXECUTE p_sql;
        r := pg_temp.p3_state();
        RAISE EXCEPTION 'p3_undo' USING ERRCODE = 'P3U01';   -- annule ce qui précède dans ce sous-bloc ; r est conservé
    EXCEPTION WHEN SQLSTATE 'P3U01' THEN NULL;
    END;
    RETURN r;
END;`) + ';',
        '',
        '-- 0. Prérequis : rien de la taxonomie v2 n\'existe encore, la base est celle du pré-vol',
        'DO ' + dollar('p3', `
DECLARE v_found text;
BEGIN
    SELECT string_agg(relname, ',') INTO v_found FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') AND c.relname LIKE 'lyann_taxonomy\\_%' ESCAPE '\\';
    IF v_found IS NOT NULL THEN RAISE EXCEPTION 'P3 prérequis : des objets v2 existent déjà (%)', v_found; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('taxonomy_node_code', 'taxonomy_node_source', 'node_code')) THEN
        RAISE EXCEPTION 'P3 prérequis : des colonnes v2 existent déjà';
    END IF;
    IF to_regprocedure('public.lyann_sync_profile_skills(uuid,text[])') IS NULL THEN RAISE EXCEPTION 'P3 prérequis : lyann_sync_profile_skills (migration 83) absente'; END IF;
    IF to_regclass('public.requests') IS NULL OR to_regclass('public.services') IS NULL OR to_regclass('public.lyann_taxonomy') IS NULL THEN RAISE EXCEPTION 'P3 prérequis : tables de base absentes'; END IF;
    IF current_setting('server_version_num')::int < 150000 THEN RAISE EXCEPTION 'P3 prérequis : PostgreSQL 15 ou plus requis'; END IF;
    IF (SELECT count(*) FROM public.requests) > 20000 THEN RAISE EXCEPTION 'P3 prérequis : requests dépasse 20 000 lignes, ce n''est pas la volumétrie de Staging attendue'; END IF;
END;`) + ';',
    );
    stage('prerequis');
    s.push("INSERT INTO pg_temp.p3_out VALUES ('risk_probes', jsonb_build_object("
        + "'update_triggers', (SELECT coalesce(jsonb_agg(c.relname || '.' || t.tgname ORDER BY c.relname, t.tgname), '[]'::jsonb) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('requests', 'services', 'lyann_taxonomy') AND NOT t.tgisinternal AND (t.tgtype & 16) <> 0),"
        // trg_enforce_simplified_request_safety (migration 17) force status = CANCELLED sur toute demande PROHIBITED lors d'un UPDATE par un non-admin : le rétro-remplissage ne doit en rencontrer aucune.
        + "'prohibited_not_cancelled', (SELECT count(*) FROM public.requests r WHERE to_jsonb(r) ->> 'safety_status' = 'PROHIBITED' AND to_jsonb(r) ->> 'status' IS DISTINCT FROM 'CANCELLED')));");

    sectionFile('01 — schéma', files.f01); stage('01');
    sectionFile('02 — colonnes additives', files.f02); stage('02');
    sectionFile('03 — recherche et RPC compétences', files.f03); stage('03');
    sectionFile('04 — amorçage du référentiel', files.f04); stage('04');

    s.push('', '-- ===== Mesure du rétro-remplissage 05 (deux sous-transactions ANNULÉES) =====',
        "INSERT INTO pg_temp.p3_out VALUES ('moderation_plain', pg_temp.p3_try_variant(" + dollar('p3_05', stripTransaction(variants.plain)) + '));',
        "INSERT INTO pg_temp.p3_out VALUES ('moderation_service', pg_temp.p3_try_variant(" + dollar('p3_05', stripTransaction(variants.service)) + '));');
    stage('mesure_05');

    s.push('', '-- ===== 05 — correspondance et rétro-remplissage (contexte « service » : décision X6 ouverte, mesurée ci-dessus) =====', stripTransaction(variants.service)); stage('05');
    sectionFile('06 — double écriture', files.f06); stage('06');
    sectionFile('08 — projection historique', files.f08); stage('08');

    s.push('', "INSERT INTO pg_temp.p3_out VALUES ('state_after_apply', pg_temp.p3_state());",
        "INSERT INTO pg_temp.p3_out VALUES ('locks_held', (SELECT coalesce(jsonb_agg(DISTINCT l.relation::regclass::text || ':' || l.mode), '[]'::jsonb) FROM pg_locks l WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation' AND l.mode IN ('AccessExclusiveLock', 'ShareRowExclusiveLock') AND l.relation::regclass::text IN ('requests', 'services', 'lyann_taxonomy')));",
        `CREATE TEMP TABLE p3_catalog_after AS ${CATALOG_SQL};`);

    s.push('', '-- ===== 07 — contrôles V01-V23 =====');
    checks.forEach((c, i) => {
        const key = `${c.id}#${i}`;
        if (c.info) s.push(`INSERT INTO pg_temp.p3_out VALUES ('${key}', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${c.sql}) q));`);
        else s.push(`INSERT INTO pg_temp.p3_out VALUES ('${key}', jsonb_build_object('rows', (SELECT count(*) FROM (${c.sql}) q), 'sample', (SELECT coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) FROM (SELECT * FROM (${c.sql}) y LIMIT 3) z)));`);
    });
    stage('07');

    s.push('', '-- ===== Changements sur les objets PRÉEXISTANTS (hors nouveautés) =====',
        "INSERT INTO pg_temp.p3_out VALUES ('preexisting_changes', (SELECT coalesce(jsonb_agg(jsonb_build_object('k', b.k, 'change', CASE WHEN a.k IS NULL THEN 'removed' ELSE 'changed' END)), '[]'::jsonb)",
        '    FROM pg_temp.p3_catalog_before b LEFT JOIN pg_temp.p3_catalog_after a ON a.k = b.k WHERE a.k IS NULL OR a.v IS DISTINCT FROM b.v));',
        "INSERT INTO pg_temp.p3_out VALUES ('added_objects', (SELECT jsonb_object_agg(kind, n) FROM (SELECT split_part(a.k, ':', 1) AS kind, count(*) AS n FROM pg_temp.p3_catalog_after a WHERE NOT EXISTS (SELECT 1 FROM pg_temp.p3_catalog_before b WHERE b.k = a.k) GROUP BY 1) x));");

    sectionFile('09 — RETOUR ARRIÈRE dans la même transaction', files.f09); stage('09');
    s.push('', "INSERT INTO pg_temp.p3_out VALUES ('state_after_rollback', pg_temp.p3_state());",
        `CREATE TEMP TABLE p3_catalog_rollback AS ${CATALOG_SQL};`,
        "INSERT INTO pg_temp.p3_out VALUES ('rollback_differences', (SELECT coalesce(jsonb_agg(jsonb_build_object('k', coalesce(b.k, a.k), 'change', CASE WHEN a.k IS NULL THEN 'missing_after_rollback' WHEN b.k IS NULL THEN 'left_by_rollback' ELSE 'different' END)), '[]'::jsonb)",
        '    FROM pg_temp.p3_catalog_before b FULL JOIN pg_temp.p3_catalog_rollback a ON a.k = b.k WHERE a.k IS NULL OR b.k IS NULL OR a.v IS DISTINCT FROM b.v));');
    stage('fin');

    s.push('', '-- ===== Rapport, puis annulation (jamais de COMMIT) =====',
        'DO ' + dollar('p3', `
DECLARE v_report jsonb;
BEGIN
    SELECT jsonb_build_object(
        'durations_ms', (SELECT jsonb_object_agg(step, ms) FROM (SELECT step, round(extract(epoch FROM at - lag(at) OVER (ORDER BY seq)) * 1000) AS ms FROM pg_temp.p3_t) d WHERE ms IS NOT NULL),
        'results', (SELECT jsonb_object_agg(k, v) FROM pg_temp.p3_out)) INTO v_report;
    RAISE EXCEPTION 'P3_REPORT %', v_report::text USING ERRCODE = 'P3R01';
END;`) + ';');
    const sql = s.join('\n');
    return { sql, bytes: Buffer.byteLength(sql), checks: checks.length, md5: crypto.createHash('md5').update(sql).digest('hex'), expectedChanged: EXPECTED_CHANGED, expectedAddedColumns: EXPECTED_ADDED_COLUMNS };
}

/** Garde-fous statiques du SQL construit. Renvoie la liste des anomalies (vide = conforme). */
function lint(sql) {
    const problems = [];
    const code = sql.replace(/\$p3_05\$[\s\S]*?\$p3_05\$/g, '').replace(/^\s*--.*$/gm, '');
    const full = sql.replace(/^\s*--.*$/gm, '');
    if (/^\s*COMMIT\s*;/im.test(full)) problems.push('COMMIT de plus haut niveau');
    if (/\bCOMMIT\b/i.test(code.replace(/'[^']*'/g, ''))) problems.push('mot COMMIT hors commentaire');
    if ((full.match(/^\s*BEGIN\s*;/gim) || []).length !== 1) problems.push('plusieurs BEGIN de plus haut niveau');
    if (!/RAISE EXCEPTION 'P3_REPORT %'/.test(sql)) problems.push('pas de sortie par exception');
    if (/gzispjfoywklpqatjyop/.test(sql)) problems.push('identifiant de Production présent');
    if (/\b(TRUNCATE|DROP\s+TABLE\s+(?!IF EXISTS)|ALTER\s+SYSTEM|CREATE\s+ROLE|ALTER\s+ROLE|pg_terminate_backend|pg_cancel_backend|pg_sleep)\b/i.test(full.replace(/pg_temp\./g, ''))) problems.push('instruction interdite');
    if (/\b(nextval|setval|pg_notify|NOTIFY|LISTEN|dblink|pg_net|http_post|http_get|COPY\s)\b/i.test(full)) problems.push('effet externe ou non annulable');
    if (/CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY|VACUUM|REINDEX\s+.*CONCURRENTLY/i.test(full)) problems.push('opération interdite en transaction');
    return problems;
}

const PLAN = `
P3 — déroulé exécutable (NON AUTORISÉ à ce jour)
  Pré-requis        : autorisation écrite spécifique de l'utilisateur ; jeton Supabase (fichier indiqué par LYANN_SUPABASE_ACCESS_TOKEN_FILE) ; projet ${STAGING_REF}.
  Étape A (lecture) : préflight lecture seule (docs/taxonomy/sql/staging-preflight-readonly.sql) + empreinte du catalogue public (DIGEST).
  Étape B (écriture annulée) : un seul appel POST /v1/projects/${STAGING_REF}/database/query avec le SQL de --print.
                      Résultat attendu : une ERREUR de code P3R01 dont le message porte « P3_REPORT {json} » (jamais un succès).
  Étape C (lecture) : préflight + empreinte du catalogue : elles doivent être IDENTIQUES à l'étape A.
  Effets attendus   : aucun effet durable. Pendant l'appel (quelques secondes à quelques dizaines de secondes) : verrous exclusifs sur requests, services
                      et lyann_taxonomy (délai d'attente 5 s) ; pas de COMMIT ; séquences non consommées ; aucun appel réseau.
  Conditions d'arrêt (tout NO-GO pour la suite) : voir docs/taxonomy/13-lock-before-staging-migration.md §7.
  Commande          : LYANN_P3_AUTHORIZED=${AUTHORIZATION_PHRASE} node scripts/taxonomy-v2/p3-rehearsal.js --execute
`;

/** Évalue un rapport P3 : { go, stops[], notes[] }. Utilisé par l'exécuteur et par le banc local. */
function evaluateReport(report) {
    const stops = [];
    const notes = [];
    const res = report.results || {};
    for (const [k, v] of Object.entries(res)) {
        if (/^V\d+#/.test(k) && v && !Array.isArray(v) && v.rows > 0) stops.push(`${k.split('#')[0]} : ${v.rows} ligne(s) en anomalie`);
    }
    if (res.risk_probes && Number(res.risk_probes.prohibited_not_cancelled) > 0) stops.push(`${res.risk_probes.prohibited_not_cancelled} demande(s) PROHIBITED non annulée(s) : un UPDATE de rétro-remplissage forcerait status = CANCELLED (trigger migration 17)`);
    if (res.risk_probes) {
        const unknown = (res.risk_probes.update_triggers || []).filter((x) => !REVIEWED_UPDATE_TRIGGERS.includes(x));
        if (unknown.length) stops.push(`déclencheur(s) UPDATE non examiné(s) sur requests/services : ${unknown.join(', ')}`);
    }
    const changes = (res.preexisting_changes || []).filter((c) => !EXPECTED_CHANGED.includes(c.k));
    if (changes.length) stops.push(`objets préexistants modifiés ou retirés : ${changes.map((c) => `${c.k} (${c.change})`).join(', ')}`);
    const rb = res.rollback_differences || [];
    if (rb.length) stops.push(`le retour arrière 09 ne restitue pas l'état de référence : ${rb.slice(0, 5).map((c) => `${c.k} (${c.change})`).join(', ')}`);
    const dataChanged = (st) => ['requests', 'services', 'lyann_taxonomy'].filter((t) => st && st[t] && (Object.keys(st[t].changed_columns || {}).length || st[t].missing_rows || st[t].new_rows));
    const afterApply = res.state_after_apply || {};
    const dc = dataChanged(afterApply);
    if (dc.length) stops.push(`colonnes historiques modifiées après application : ${dc.map((t) => `${t} ${JSON.stringify(afterApply[t])}`).join('; ')}`);
    const afterRb = res.state_after_rollback || {};
    const dr = dataChanged(afterRb);
    if (dr.length) stops.push(`données différentes après retour arrière : ${dr.join(', ')}`);
    const base = res.moderation_service || {};
    const modDelta = (m) => ({ queue: (m.moderation_queue_rows || 0) - (afterRb.moderation_queue_rows || 0), jobs: (m.moderation_jobs_rows || 0) - (afterRb.moderation_jobs_rows || 0) });
    if (res.moderation_service) {
        const d = modDelta(base);
        if (d.queue || d.jobs) stops.push(`rétro-remplissage en contexte service : ${d.queue} ligne(s) de file de modération et ${d.jobs} tâche(s) ajoutée(s)`);
        const touched = dataChanged(base);
        if (touched.length) stops.push(`rétro-remplissage en contexte service : colonnes historiques modifiées (${touched.join(', ')})`);
    }
    if (res.moderation_plain) {
        const d = modDelta(res.moderation_plain);
        notes.push(`exécution « telle quelle » : +${d.queue} file de modération, +${d.jobs} tâches${dataChanged(res.moderation_plain).length ? `, colonnes modifiées ${dataChanged(res.moderation_plain).join(',')}` : ''}`);
    }
    return { go: stops.length === 0, stops, notes };
}

/* -------------------------------------------------------------------------------------------------------------------------------------------------- */

/** Extrait le rapport JSON d'un message d'erreur (corps brut de l'API de gestion, ou message déjà décodé). Lecture par équilibrage d'accolades. */
function extractReport(text) {
    let message = String(text);
    try { const j = JSON.parse(message); message = typeof j === 'string' ? j : (j.message || j.error || message); } catch (_) { /* corps non JSON */ }
    const at = message.indexOf('P3_REPORT {');
    if (at < 0) return null;
    const start = at + 'P3_REPORT '.length;
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < message.length; i += 1) {
        const ch = message[i];
        if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
        if (ch === '"') inString = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) { try { return JSON.parse(message.slice(start, i + 1)); } catch (_) { return null; } } }
    }
    return null;
}

async function execute() {
    if (process.env.LYANN_P3_AUTHORIZED !== AUTHORIZATION_PHRASE) {
        console.error(`Refus : l'exécution sur Staging exige l'autorisation écrite spécifique de l'utilisateur.\nVariable attendue : LYANN_P3_AUTHORIZED=${AUTHORIZATION_PHRASE}`);
        process.exit(3);
    }
    const file = process.env.LYANN_SUPABASE_ACCESS_TOKEN_FILE;
    if (!file) { console.error('LYANN_SUPABASE_ACCESS_TOKEN_FILE manquante.'); process.exit(3); }
    const line = fs.readFileSync(file, 'utf8').split(/\n/).find((row) => row.startsWith('SUPABASE_ACCESS_TOKEN='));
    if (!line) { console.error('SUPABASE_ACCESS_TOKEN absent du fichier indiqué.'); process.exit(3); }
    const token = line.slice('SUPABASE_ACCESS_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '');
    const call = async (pathname, body) => {
        if (pathname.includes(PRODUCTION_REF)) throw new Error('Production refusée.');
        const res = await fetch(`https://api.supabase.com${pathname}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const text = await res.text();
        return { status: res.status, text };
    };
    const projectRes = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}`, { headers: { Authorization: `Bearer ${token}` } });
    const project = await projectRes.json();
    if (String(project.id || project.ref) !== STAGING_REF || String(project.id) === PRODUCTION_REF) throw new Error('Le projet retourné n\'est pas Staging : arrêt.');
    const built = buildRehearsal();
    const problems = lint(built.sql);
    if (problems.length) throw new Error(`SQL non conforme : ${problems.join(' ; ')}`);
    const digest = async () => JSON.parse((await call(`/v1/projects/${STAGING_REF}/database/query`, { query: DIGEST_SQL })).text);
    const d1 = await digest();
    console.log('Empreinte avant :', JSON.stringify(d1));
    const r = await call(`/v1/projects/${STAGING_REF}/database/query`, { query: built.sql });
    // Ceinture et bretelles : si la connexion de l'API est réutilisée après l'erreur volontaire, on referme explicitement toute transaction restée ouverte.
    try { await call(`/v1/projects/${STAGING_REF}/database/query`, { query: 'ROLLBACK;' }); } catch (_) { /* aucune transaction ouverte : sans objet */ }
    const report0 = extractReport(r.text);
    const d2 = await digest();
    console.log('Empreinte après :', JSON.stringify(d2));
    const identical = JSON.stringify(d1) === JSON.stringify(d2);
    if (!report0) { console.error('Pas de rapport P3 dans la réponse :', r.status, r.text.slice(0, 600)); process.exit(1); }
    const report = report0;
    const verdict = evaluateReport(report);
    console.log(JSON.stringify({ identicalAfter: identical, verdict, report }, null, 2));
    process.exit(identical && verdict.go ? 0 : 1);
}

module.exports = { buildRehearsal, lint, parseVerify, evaluateReport, extractReport, CATALOG_SQL, DIGEST_SQL, EXPECTED_CHANGED, REVIEWED_UPDATE_TRIGGERS, AUTHORIZATION_PHRASE, STAGING_REF, PLAN };

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--execute')) execute().catch((e) => { console.error(e.message); process.exit(1); });
    else if (args.includes('--plan')) console.log(PLAN);
    else {
        const built = buildRehearsal();
        const problems = lint(built.sql);
        if (problems.length) { console.error(`SQL non conforme : ${problems.join(' ; ')}`); process.exit(1); }
        const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
        if (out) { fs.writeFileSync(out, built.sql); console.log(`SQL écrit : ${out} (${built.bytes} octets, md5 ${built.md5}, ${built.checks} contrôles)`); } else console.log(`Construit : ${built.bytes} octets, md5 ${built.md5}, ${built.checks} contrôles (utiliser --out pour l'écrire)`);
    }
}
