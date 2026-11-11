'use strict';
/*
 * P4 / P5 — APPLICATION PERSISTANTE de la taxonomie v2 sur Staging (tdktfbtqceldlaeqjtow). PRÉPARÉ, JAMAIS EXÉCUTÉ.
 *
 * Ce script ne fait rien sur Staging sans autorisation écrite spécifique (trois verrous : --execute, LYANN_P45_AUTHORIZED=<phrase>, jeton neuf dans
 * LYANN_P45_TOKEN_FILE ; le jeton de P3 est refusé s'il figure dans la liste des jetons révoqués). Il refuse tout chemin contenant l'identifiant Production.
 * Sans --execute il ne se connecte à rien :
 *   node scripts/taxonomy-v2/p45-staging.js --plan                       déroulé, effets attendus, conditions d'arrêt
 *   node scripts/taxonomy-v2/p45-staging.js --print P4|P5|PREFLIGHT|VERIFY|S10|S100   SQL exact de l'étape (aucun accès réseau)
 *   node scripts/taxonomy-v2/p45-staging.js --fingerprints               empreintes SHA-256 des scripts qui seront exécutés
 *
 * Séquence (chaque étape s'arrête au premier écart ; AUCUNE étape suivante n'est lancée après un écart) :
 *   0. identité du projet (API) ; pré-vol en lecture seule (catalogue = celui prouvé par P3, aucun objet v2, aucune session ouverte, sondes de risque) ;
 *   1. sauvegarde logique locale de ce que P4/P5 peuvent toucher (requests, services, lyann_taxonomy, catalogue, fonctions) + manifeste SHA-256 ;
 *   2. P4  = 01 → 04 en UNE transaction, contrôles V01-V06 et V12 dans la transaction, COMMIT seulement si tout est conforme ;
 *   3. vérification P4 depuis une NOUVELLE connexion ;
 *   4. P5  = 05 (rétro-remplissage en contexte « service » explicite, décision X6) → 06 → 08 en UNE transaction, contrôles V01-V23, aucune ligne de
 *      modération ajoutée, aucune colonne historique modifiée, COMMIT seulement si tout est conforme ;
 *   5. vérification P5 depuis une NOUVELLE connexion ;
 *   6. S10 (précision des anciennes compétences par le membre) puis S100 (privilèges de services) : deux transactions séparées, facultatives (--steps) ;
 *   7. vérification finale complète (V01-V23, catalogue, sécurité, modération, empreinte hors schéma public).
 * La restauration (09, puis rétablissement des lignes depuis la sauvegarde si nécessaire) est générée par --restore-plan, jamais lancée automatiquement.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const p3 = require('./p3-rehearsal');
const { stripTransaction, backfillVariants } = require('./moderation-fixture');

const ROOT = path.join(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs', 'taxonomy');
const DRAFT = path.join(DOCS, 'migration-draft');
const POST = path.join(DOCS, 'post-migration-draft');
const SECURITY = path.join(DOCS, 'security-draft');
const STAGING_REF = p3.STAGING_REF;
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const AUTHORIZATION_PHRASE = `I-AUTHORIZE-P4-P5-ON-${STAGING_REF}`;
/** Catalogue public de Staging tel que prouvé par P3 (2e passage) : tout écart depuis = quelqu'un a modifié le schéma, la répétition ne couvre plus l'état réel. */
const PROVEN_CATALOG = { digest: 'fc36d9446b02ef7fad0dc706337b26b4', objects: 2381 };
const STEPS = ['P4', 'P5', 'S10', 'S100'];
const TABLES = ['requests', 'services', 'lyann_taxonomy'];
const NEW_COLUMNS = { requests: ['taxonomy_node_code', 'taxonomy_node_source'], services: ['taxonomy_node_code', 'taxonomy_node_source'], lyann_taxonomy: ['node_code'] };
const P4_CHECKS = ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V12'];
const V2_FUNCTIONS = ['lyann_legacy_certain_node', 'lyann_derive_request_node', 'lyann_derive_service_node', 'lyann_sync_profile_skills_v2', 'lyann_taxonomy_search', 'lyann_resolve_legacy_skill'];

const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const dollar = (tag, text) => { if (text.includes(`$${tag}$`)) throw new Error(`le texte contient déjà le délimiteur $${tag}$`); return `$${tag}$${text}$${tag}$`; };
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const HEADER_SETTINGS = [
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '300s';",
    "SET LOCAL idle_in_transaction_session_timeout = '600s';",
];

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Pré-vol (lecture seule) et empreinte
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const countOfQualified = (qualified) => `CASE WHEN to_regclass('${qualified}') IS NULL THEN NULL ELSE (xpath('/row/c/text()', query_to_xml('select count(*) as c from ${qualified}', false, true, '')))[1]::text::bigint END`;
const countOf = (table) => `CASE WHEN to_regclass('public.${table}') IS NULL THEN NULL ELSE (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.${table}', false, true, '')))[1]::text::bigint END`;

/** Une seule instruction SELECT en lecture seule : état de la base avant toute écriture. */
function buildPreflightSql() {
    return `SELECT jsonb_build_object(
 'database', current_database(), 'user', current_user, 'version_num', current_setting('server_version_num')::int,
 'v2_tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') AND (c.relname LIKE 'lyann\\_taxonomy\\_%' ESCAPE '\\' OR c.relname = 'lyann_profile_skill')),
 'v2_columns', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('taxonomy_node_code', 'taxonomy_node_source', 'node_code')),
 'v2_functions', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (${V2_FUNCTIONS.map(lit).join(', ')})),
 'sync_fn_present', to_regprocedure('public.lyann_sync_profile_skills(uuid,text[])') IS NOT NULL,
 'counts', jsonb_build_object('requests', ${countOf('requests')}, 'services', ${countOf('services')}, 'lyann_taxonomy', ${countOf('lyann_taxonomy')},
     'moderation_queue', ${countOf('content_moderation_queue')}, 'moderation_jobs', ${countOf('moderation_jobs')}),
 'prohibited_not_cancelled', (SELECT count(*) FROM public.requests r WHERE to_jsonb(r) ->> 'safety_status' = 'PROHIBITED' AND to_jsonb(r) ->> 'status' IS DISTINCT FROM 'CANCELLED'),
 'update_triggers', (SELECT coalesce(jsonb_agg(c.relname || '.' || t.tgname ORDER BY c.relname, t.tgname), '[]'::jsonb) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('requests', 'services', 'lyann_taxonomy') AND NOT t.tgisinternal AND (t.tgtype & 16) <> 0),
 'sessions', jsonb_build_object(
     'idle_in_transaction', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'),
     'prepared', (SELECT count(*) FROM pg_prepared_xacts),
     'advisory_locks', (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'),
     'locks_on_targets', (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'relation' AND l.pid <> pg_backend_pid() AND l.relation IN ('public.requests'::regclass, 'public.services'::regclass, 'public.lyann_taxonomy'::regclass) AND l.mode IN ('ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock'))),
 'catalog', (SELECT jsonb_build_object('digest', md5(string_agg(k || '=' || v, E'\\n' ORDER BY k)), 'objects', count(*)) FROM (${p3.CATALOG_SQL}) c)
) AS preflight`;
}

/** Évalue un pré-vol : { go, stops[] }. `expected` : { digest, objects } (défaut : catalogue prouvé par P3). `options.resume` : reprise après P4 (les objets v2 DOIVENT alors exister). */
function evaluatePreflight(pf, expected, options) {
    const resume = Boolean(options && options.resume);
    const stops = [];
    const exp = expected || PROVEN_CATALOG;
    if (!pf) return { go: false, stops: ['pré-vol vide'] };
    if (pf.database !== 'postgres') stops.push(`base inattendue : ${pf.database}`);
    if (Number(pf.version_num) < 150000) stops.push('PostgreSQL 15 ou plus requis');
    if (resume && !(pf.v2_tables > 0 && pf.v2_columns > 0)) stops.push('reprise après P4 impossible : les tables ou colonnes v2 sont absentes (P4 n\'est pas appliquée)');
    if (!resume && (pf.v2_tables > 0 || pf.v2_columns > 0 || pf.v2_functions > 0)) stops.push(`des objets v2 existent déjà (tables ${pf.v2_tables}, colonnes ${pf.v2_columns}, fonctions ${pf.v2_functions}) : P4 n'est pas rejouable, vérifier l'état avant toute action`);
    if (!pf.sync_fn_present) stops.push('lyann_sync_profile_skills (migration 83) absente');
    if (pf.counts && Number(pf.counts.requests) > 20000) stops.push('requests dépasse 20 000 lignes : ce n\'est pas la volumétrie validée par P3');
    if (pf.counts && (pf.counts.moderation_queue === null || pf.counts.moderation_jobs === null)) stops.push('tables de modération introuvables : le contrôle « aucune modération ajoutée » serait impossible');
    if (Number(pf.prohibited_not_cancelled) > 0) stops.push(`${pf.prohibited_not_cancelled} demande(s) PROHIBITED non annulée(s) : un UPDATE de rétro-remplissage forcerait status = CANCELLED`);
    const unknown = (pf.update_triggers || []).filter((x) => !p3.REVIEWED_UPDATE_TRIGGERS.includes(x));
    if (unknown.length) stops.push(`déclencheur(s) UPDATE non examiné(s) : ${unknown.join(', ')}`);
    const s = pf.sessions || {};
    if (s.idle_in_transaction > 0) stops.push(`${s.idle_in_transaction} session(s) « idle in transaction »`);
    if (s.prepared > 0) stops.push('transaction(s) préparée(s) ouverte(s)');
    if (s.advisory_locks > 0) stops.push('verrou(s) consultatif(s) tenu(s)');
    if (s.locks_on_targets > 0) stops.push('verrou(s) tenu(s) par une autre session sur requests/services/lyann_taxonomy');
    if (!pf.catalog || pf.catalog.digest !== exp.digest || Number(pf.catalog.objects) !== Number(exp.objects)) {
        stops.push(`le catalogue public a changé depuis la répétition P3 (attendu ${exp.digest}/${exp.objects}, trouvé ${pf.catalog && pf.catalog.digest}/${pf.catalog && pf.catalog.objects}) : rejouer P3 avant d'appliquer`);
    }
    return { go: stops.length === 0, stops };
}

/** Empreinte de tout ce qui NE DOIT PAS bouger hors du schéma public (et des réglages globaux). Lecture seule. */
function buildFingerprintSql() {
    return `SELECT jsonb_build_object(
 'extensions', (SELECT jsonb_agg(extname || '@' || extversion ORDER BY extname) FROM pg_extension),
 'event_triggers', (SELECT md5(coalesce(string_agg(evtname || ':' || evtenabled::text || ':' || evtfoid::regproc::text, '|' ORDER BY evtname), '')) FROM pg_event_trigger),
 'schemas', (SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'),
 'nspacl', (SELECT md5(coalesce(string_agg(nspname || '=' || coalesce(nspacl::text, ''), '|' ORDER BY nspname), '')) FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'),
 'default_acl', (SELECT md5(coalesce(string_agg(defaclrole::regrole::text || ':' || defaclnamespace::text || ':' || defaclobjtype::text || '=' || defaclacl::text, '|' ORDER BY defaclrole::regrole::text, defaclnamespace::text, defaclobjtype::text), '')) FROM pg_default_acl),
 'non_public_relations', (SELECT md5(coalesce(string_agg(n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || coalesce(c.relacl::text, ''), '|' ORDER BY n.nspname, c.relname), '')) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('public', 'pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'),
 'non_public_functions', (SELECT md5(coalesce(string_agg(n.nspname || '.' || p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, ''), '|' ORDER BY n.nspname, p.oid::regprocedure::text), '')) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('public', 'pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'),
 'non_public_triggers', (SELECT md5(coalesce(string_agg(c.oid::regclass::text || '.' || t.tgname || ':' || t.tgenabled::text, '|' ORDER BY c.oid::regclass::text, t.tgname), '')) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('public', 'pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'),
 'non_public_policies', (SELECT md5(coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\\n' ORDER BY schemaname, tablename, policyname), '')) FROM pg_policies WHERE schemaname <> 'public'),
 'storage', jsonb_build_object('buckets', ${countOfQualified('storage.buckets')}, 'objects', ${countOfQualified('storage.objects')})
) AS fingerprint`;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Constructeurs P4 et P5 (une transaction chacun, COMMIT final conditionné par un bloc d'assertions)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** Aides temporaires communes : état de référence, détecteur de changements de données, comptages de modération. */
function commonPrelude(tag, expectedDigest) {
    const t = (name) => `${tag}_${name}`;
    return [
        'BEGIN;', ...HEADER_SETTINGS,
        '-- Verrou exclusif pris AVANT toute lecture de référence : aucune écriture concurrente ne peut s\'intercaler entre l\'état de référence et la migration.',
        'LOCK TABLE public.requests, public.services, public.lyann_taxonomy IN ACCESS EXCLUSIVE MODE;',
        `CREATE TEMP TABLE ${t('out')} (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;`,
        `CREATE TEMP TABLE ${t('req_base')} ON COMMIT DROP AS SELECT id, to_jsonb(r) AS j FROM public.requests r;`,
        `CREATE TEMP TABLE ${t('svc_base')} ON COMMIT DROP AS SELECT id, to_jsonb(x) AS j FROM public.services x;`,
        `CREATE TEMP TABLE ${t('tax_base')} ON COMMIT DROP AS SELECT id, to_jsonb(x) AS j FROM public.lyann_taxonomy x;`,
        `CREATE TEMP TABLE ${t('catalog_before')} ON COMMIT DROP AS ${p3.CATALOG_SQL};`,
        `CREATE FUNCTION pg_temp.${t('changed')}(p_base regclass, p_table regclass, p_drop text[]) RETURNS jsonb LANGUAGE plpgsql AS ` + dollar('p45f', `
DECLARE r jsonb;
BEGIN
    EXECUTE format('SELECT jsonb_build_object(''changed_columns'', (SELECT coalesce(jsonb_object_agg(k, n), ''{}''::jsonb) FROM (SELECT e.key AS k, count(*) AS n FROM %1$s t JOIN %2$s b ON b.id = t.id, jsonb_each(to_jsonb(t) - $1) e WHERE b.j -> e.key IS DISTINCT FROM e.value GROUP BY e.key) x), ''missing_rows'', (SELECT count(*) FROM %2$s b WHERE NOT EXISTS (SELECT 1 FROM %1$s t WHERE t.id = b.id)), ''new_rows'', (SELECT count(*) FROM %1$s t WHERE NOT EXISTS (SELECT 1 FROM %2$s b WHERE b.id = t.id)))', p_table, p_base)
        INTO r USING p_drop;
    RETURN r;
END;`) + ';',
        `CREATE FUNCTION pg_temp.${t('mod')}() RETURNS jsonb LANGUAGE plpgsql AS ` + dollar('p45f', `
DECLARE v_q bigint; v_j bigint;
BEGIN
    EXECUTE 'SELECT count(*) FROM public.content_moderation_queue' INTO v_q;
    EXECUTE 'SELECT count(*) FROM public.moderation_jobs' INTO v_j;
    RETURN jsonb_build_object('queue', v_q, 'jobs', v_j);
END;`) + ';',
        `INSERT INTO ${t('out')} VALUES ('mod_before', pg_temp.${t('mod')}());`,
        `INSERT INTO ${t('out')} VALUES ('catalog_digest', (SELECT to_jsonb(d) FROM (SELECT md5(string_agg(k || '=' || v, E'\\n' ORDER BY k)) AS digest, count(*) AS objects FROM ${t('catalog_before')}) d));`,
        'DO ' + dollar('p45', `
DECLARE v_digest text; v_objects bigint;
BEGIN
    SELECT md5(string_agg(k || '=' || v, E'\\n' ORDER BY k)), count(*) INTO v_digest, v_objects FROM ${t('catalog_before')};
    ${expectedDigest ? `IF v_digest IS DISTINCT FROM ${lit(expectedDigest.digest)} OR v_objects <> ${Number(expectedDigest.objects)} THEN
        RAISE EXCEPTION 'P45_ABORT: le catalogue public n''est plus celui attendu (%/%)', v_digest, v_objects USING ERRCODE = 'P4A01';
    END IF;` : '-- (empreinte du catalogue attendue : fournie par l\'orchestrateur à l\'exécution)'}
    IF current_setting('server_version_num')::int < 150000 THEN RAISE EXCEPTION 'P45_ABORT: PostgreSQL 15 ou plus requis' USING ERRCODE = 'P4A01'; END IF;
    IF (SELECT count(*) FROM public.requests) > 20000 THEN RAISE EXCEPTION 'P45_ABORT: requests dépasse 20 000 lignes' USING ERRCODE = 'P4A01'; END IF;
    IF to_regprocedure('public.lyann_sync_profile_skills(uuid,text[])') IS NULL THEN RAISE EXCEPTION 'P45_ABORT: lyann_sync_profile_skills (migration 83) absente' USING ERRCODE = 'P4A01'; END IF;
END;`) + ';',
    ];
}

/** Insère les contrôles de 07 (ids retenus) dans la table de résultats. */
function checkInserts(tag, checks, ids) {
    const out = [];
    checks.forEach((c, i) => {
        if (ids && !ids.includes(c.id)) return;
        const key = `${c.id}#${i}`;
        if (c.info) out.push(`INSERT INTO ${tag}_out VALUES ('${key}', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${c.sql}) q));`);
        else out.push(`INSERT INTO ${tag}_out VALUES ('${key}', jsonb_build_object('rows', (SELECT count(*) FROM (${c.sql}) q), 'sample', (SELECT coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) FROM (SELECT * FROM (${c.sql}) y LIMIT 3) z)));`);
    });
    return out;
}

/** Bloc d'assertions final : toute anomalie lève une exception (la transaction est annulée), sinon le COMMIT suit. */
function assertionsBlock(tag, { expectedChanged, checkIds, compareModeration }) {
    const t = (name) => `${tag}_${name}`;
    const cols = (table) => `ARRAY[${NEW_COLUMNS[table].map(lit).join(', ')}]`;
    return [
        `CREATE TEMP TABLE ${t('catalog_after')} ON COMMIT DROP AS ${p3.CATALOG_SQL};`,
        'DO ' + dollar('p45', `
DECLARE
    v_bad text := '';
    v_row record;
    v_state jsonb;
    v_n bigint;
    v_changed text;
BEGIN
    -- 1. contrôles V : aucune ligne en anomalie (les contrôles informatifs sont exclus)
    FOR v_row IN SELECT k, v FROM ${t('out')} WHERE k ~ '^V[0-9]+#' AND jsonb_typeof(v) = 'object' AND (v ->> 'rows')::bigint > 0 ORDER BY k LOOP
        v_bad := v_bad || format(' [%s : %s ligne(s)]', split_part(v_row.k, '#', 1), v_row.v ->> 'rows');
    END LOOP;
    ${checkIds ? `-- (contrôles attendus présents)
    SELECT count(*) INTO v_n FROM ${t('out')} WHERE k ~ '^V[0-9]+#';
    IF v_n < ${checkIds} THEN v_bad := v_bad || format(' [seulement %s contrôles V exécutés sur ${checkIds}]', v_n); END IF;` : ''}
    -- 2. aucun objet PRÉEXISTANT modifié ou retiré, hors changements attendus
    SELECT string_agg(b.k, ', ') INTO v_changed FROM ${t('catalog_before')} b LEFT JOIN ${t('catalog_after')} a ON a.k = b.k
    WHERE (a.k IS NULL OR a.v IS DISTINCT FROM b.v) AND b.k <> ALL (${expectedChanged.length ? `ARRAY[${expectedChanged.map(lit).join(', ')}]` : "ARRAY[]::text[]"});
    IF v_changed IS NOT NULL THEN v_bad := v_bad || format(' [objets préexistants modifiés : %s]', left(v_changed, 300)); END IF;
    -- 3. aucune colonne historique modifiée, aucune ligne perdue ni apparue
    v_state := jsonb_build_object('requests', pg_temp.${t('changed')}('pg_temp.${t('req_base')}'::regclass, 'public.requests'::regclass, ${cols('requests')}),
                                  'services', pg_temp.${t('changed')}('pg_temp.${t('svc_base')}'::regclass, 'public.services'::regclass, ${cols('services')}),
                                  'lyann_taxonomy', pg_temp.${t('changed')}('pg_temp.${t('tax_base')}'::regclass, 'public.lyann_taxonomy'::regclass, ${cols('lyann_taxonomy')}));
    FOR v_row IN SELECT key AS t, value AS j FROM jsonb_each(v_state) LOOP
        IF v_row.j -> 'changed_columns' <> '{}'::jsonb OR (v_row.j ->> 'missing_rows')::bigint > 0 OR (v_row.j ->> 'new_rows')::bigint > 0 THEN
            v_bad := v_bad || format(' [données historiques modifiées dans %s : %s]', v_row.t, v_row.j::text);
        END IF;
    END LOOP;
    INSERT INTO ${t('out')} VALUES ('data_state', v_state);
    ${compareModeration ? `-- 4. modération : aucune ligne ni tâche ajoutée
    IF pg_temp.${t('mod')}() IS DISTINCT FROM (SELECT v FROM ${t('out')} WHERE k = 'mod_before') THEN
        v_bad := v_bad || format(' [modération modifiée : avant %s, après %s]', (SELECT v FROM ${t('out')} WHERE k = 'mod_before'), pg_temp.${t('mod')}());
    END IF;` : ''}
    IF v_bad <> '' THEN
        RAISE EXCEPTION 'P45_ABORT:%', v_bad USING ERRCODE = 'P4A02';
    END IF;
END;`) + ';',
        `DROP FUNCTION pg_temp.${t('changed')}(regclass, regclass, text[]);`,
        `DROP FUNCTION pg_temp.${t('mod')}();`,
    ];
}

function loadDrafts() {
    const files = {};
    for (const f of ['01_schema_taxonomy_v2.sql', '02_additive_columns.sql', '03_search_and_skills_rpc.sql', '04_seed_taxonomy_v2.sql', '05_legacy_map_and_backfill.sql',
        '06_dual_write_derivation.sql', '07_verify_taxonomy_v2.sql', '08_legacy_projection.sql', '09_rollback_taxonomy_v2.sql']) files[f.slice(0, 2)] = read(DRAFT, f);
    return files;
}

function buildP4(expected) {
    const files = loadDrafts();
    const checks = p3.parseVerify(files['07']);
    const s = [
        '-- ============================================================================',
        '-- P4 — taxonomie v2 : schéma, colonnes additives, recherche, amorçage (généré par scripts/taxonomy-v2/p45-staging.js — NE PAS ÉDITER)',
        `-- Cible : Staging ${STAGING_REF} UNIQUEMENT, après autorisation écrite spécifique. JAMAIS Production.`,
        '-- Une transaction ; COMMIT seulement si toutes les assertions finales passent.',
        '-- ============================================================================',
        ...commonPrelude('p4', expected === undefined ? PROVEN_CATALOG : expected),
        'DO ' + dollar('p45', `
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') AND (c.relname LIKE 'lyann\\_taxonomy\\_%' ESCAPE '\\' OR c.relname = 'lyann_profile_skill'))
       OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('taxonomy_node_code', 'taxonomy_node_source', 'node_code')) THEN
        RAISE EXCEPTION 'P45_ABORT: des objets v2 existent déjà : P4 ne se rejoue pas' USING ERRCODE = 'P4A01';
    END IF;
END;`) + ';',
    ];
    const section = (name, sql) => s.push('', `-- ===== ${name} =====`, stripTransaction(sql));
    section('01 — schéma', files['01']);
    section('02 — colonnes additives', files['02']);
    section('03 — recherche et RPC compétences', files['03']);
    section('04 — amorçage du référentiel', files['04']);
    const p4Inserts = checkInserts('p4', checks, P4_CHECKS);
    s.push('', '-- ===== contrôles V01-V06 et V12 =====', ...p4Inserts);
    s.push('', '-- ===== assertions finales =====', ...assertionsBlock('p4', { expectedChanged: [], checkIds: p4Inserts.length, compareModeration: true }));
    s.push('', 'COMMIT;');
    const sql = s.join('\n');
    return { sql, bytes: Buffer.byteLength(sql), sha256: sha256(sql), checks: p4Inserts.length };
}

/** `expected` : { digest, objects } du catalogue juste avant P5 (mesuré après P4 par l'orchestrateur) ; absent = gabarit (impression, empreinte, tests). */
function buildP5(expected) {
    const files = loadDrafts();
    const variants = backfillVariants(files['05']);
    const checks = p3.parseVerify(files['07']);
    const s = [
        '-- ============================================================================',
        '-- P5 — taxonomie v2 : correspondance et rétro-remplissage (contexte « service » explicite, X6), double écriture, projection historique',
        '-- (généré par scripts/taxonomy-v2/p45-staging.js — NE PAS ÉDITER)',
        `-- Cible : Staging ${STAGING_REF} UNIQUEMENT, après autorisation écrite spécifique. JAMAIS Production. COMMIT seulement si toutes les assertions passent.`,
        '-- ============================================================================',
        ...commonPrelude('p5', expected || null),
        'DO ' + dollar('p45', `
DECLARE v_unknown text; v_prohibited bigint;
BEGIN
    IF to_regclass('public.lyann_taxonomy_node') IS NULL OR to_regclass('public.lyann_taxonomy_legacy_map') IS NULL OR to_regclass('public.lyann_profile_skill') IS NULL THEN
        RAISE EXCEPTION 'P45_ABORT: P4 n''est pas appliquée (tables v2 absentes)' USING ERRCODE = 'P5A01';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND (table_name, column_name) IN (${Object.entries(NEW_COLUMNS).flatMap(([t, cs]) => cs.map((c) => `('${t}', '${c}')`)).join(', ')})) <> ${Object.values(NEW_COLUMNS).flat().length} THEN
        RAISE EXCEPTION 'P45_ABORT: colonnes v2 incomplètes' USING ERRCODE = 'P5A01';
    END IF;
    IF to_regprocedure('public.lyann_legacy_certain_node(text,text)') IS NOT NULL OR to_regprocedure('public.lyann_derive_request_node()') IS NOT NULL THEN
        RAISE EXCEPTION 'P45_ABORT: P5 est déjà (en partie) appliquée' USING ERRCODE = 'P5A01';
    END IF;
    IF (SELECT count(*) FROM public.lyann_taxonomy_node) = 0 THEN RAISE EXCEPTION 'P45_ABORT: le référentiel v2 est vide (04 non appliquée)' USING ERRCODE = 'P5A01'; END IF;
    SELECT count(*) INTO v_prohibited FROM public.requests r WHERE to_jsonb(r) ->> 'safety_status' = 'PROHIBITED' AND to_jsonb(r) ->> 'status' IS DISTINCT FROM 'CANCELLED';
    IF v_prohibited > 0 THEN RAISE EXCEPTION 'P45_ABORT: % demande(s) PROHIBITED non annulée(s)', v_prohibited USING ERRCODE = 'P5A01'; END IF;
    SELECT string_agg(c.relname || '.' || t.tgname, ', ') INTO v_unknown FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('requests', 'services', 'lyann_taxonomy') AND NOT t.tgisinternal AND (t.tgtype & 16) <> 0
      AND (c.relname || '.' || t.tgname) <> ALL (ARRAY[${p3.REVIEWED_UPDATE_TRIGGERS.map(lit).join(', ')}]);
    IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'P45_ABORT: déclencheur(s) UPDATE non examiné(s) : %', v_unknown USING ERRCODE = 'P5A01'; END IF;
END;`) + ';',
    ];
    s.push('', '-- ===== 05 — correspondance et rétro-remplissage (contexte « service » explicite, décision X6 ; mesurée par P3) =====', stripTransaction(variants.service));
    s.push('', '-- ===== 06 — double écriture =====', stripTransaction(files['06']));
    s.push('', '-- ===== 08 — projection historique =====', stripTransaction(files['08']));
    s.push('', '-- ===== contrôles V01-V23 =====', ...checkInserts('p5', checks, null));
    s.push('', '-- ===== assertions finales =====', ...assertionsBlock('p5', { expectedChanged: p3.EXPECTED_CHANGED, checkIds: checks.length, compareModeration: true }));
    s.push('', 'COMMIT;');
    const sql = s.join('\n');
    return { sql, bytes: Buffer.byteLength(sql), sha256: sha256(sql), checks: checks.length };
}

const buildS10 = () => { const sql = read(POST, '10_resolve_legacy_skill.sql'); return { sql, bytes: Buffer.byteLength(sql), sha256: sha256(sql) }; };
const buildS100 = () => { const sql = read(SECURITY, '100_services_dangerous_privileges_staging.sql'); return { sql, bytes: Buffer.byteLength(sql), sha256: sha256(sql) }; };

/** Garde-fous statiques du SQL d'écriture. Renvoie la liste des anomalies (vide = conforme). */
function lint(sql, kind) {
    const problems = [];
    const full = sql.replace(/\$p3_05\$[\s\S]*?\$p3_05\$/g, '').replace(/^\s*--.*$/gm, '');
    const code = full.replace(/\$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$/g, (m) => (/COMMIT/i.test(m) ? '' : m));
    if (/gzispjfoywklpqatjyop/.test(sql)) problems.push('identifiant de Production présent');
    const begins = (full.match(/^\s*BEGIN\s*;/gim) || []).length;
    const commits = (full.match(/^\s*COMMIT\s*;/gim) || []).length;
    if (begins !== 1 || commits !== 1) problems.push(`BEGIN/COMMIT de plus haut niveau attendus : 1/1, trouvés ${begins}/${commits}`);
    if (!/COMMIT\s*;\s*$/.test(full.trim())) problems.push('COMMIT n\'est pas la dernière instruction');
    if (/\bROLLBACK\b/i.test(code)) problems.push('ROLLBACK explicite dans le script');
    // S100 retire justement TRUNCATE : le mot y figure (REVOKE et garde de dépendances) ; il est exigé sous la forme exacte ci-dessous.
    const forbidden = kind === 'S100' ? /\b(ALTER\s+SYSTEM|CREATE\s+ROLE|ALTER\s+ROLE|DROP\s+ROLE|pg_terminate_backend|pg_cancel_backend|pg_sleep|session_replication_role)\b/i : /\b(TRUNCATE|ALTER\s+SYSTEM|CREATE\s+ROLE|ALTER\s+ROLE|DROP\s+ROLE|pg_terminate_backend|pg_cancel_backend|pg_sleep|session_replication_role)\b/i;
    if (forbidden.test(full.replace(/pg_temp\./g, ''))) problems.push('instruction interdite');
    if (kind === 'S100' && !/REVOKE\s+TRUNCATE,\s*TRIGGER,\s*REFERENCES\s+ON\s+TABLE\s+public\.services\s+FROM\s+PUBLIC,\s*anon,\s*authenticated\s*;/i.test(full)) problems.push('REVOKE attendu absent');
    if (/\bDISABLE\s+TRIGGER\b|\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b|\bFORCE\s+ROW\b/i.test(full)) problems.push('désactivation de déclencheur ou de sécurité de ligne');
    if (/\b(nextval|setval|pg_notify|NOTIFY|LISTEN|dblink|pg_net|http_post|http_get|COPY\s)\b/i.test(full)) problems.push('effet externe ou non annulable');
    if (/CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY|VACUUM|REINDEX/i.test(full)) problems.push('opération interdite en transaction');
    if (/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b(?!\s+IF\s+EXISTS\s+(public\.)?(lyann_))/i.test(full)) problems.push('suppression de table, schéma ou base');
    if (kind === 'P4' || kind === 'P5') {
        if (/\bUPDATE\s+public\.(requests|services)\b/i.test(full) && kind === 'P4') problems.push('P4 ne doit écrire aucune ligne historique');
        if (/GRANT\s+.*TO\s+PUBLIC/i.test(full)) problems.push('GRANT à PUBLIC');
        if (/\bP3R01\b/.test(sql)) problems.push('sortie de répétition (P3R01) dans un script durable');
    }
    if (kind === 'P5' && !/set_config\('request\.jwt\.claim\.role', 'service_role', true\)/.test(sql)) problems.push('contexte service explicite absent du rétro-remplissage');
    return problems;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Vérification complète (nouvelle connexion, lecture seule)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** `onlyIds` : sous-ensemble de contrôles (P4 ne peut pas évaluer ceux qui lisent les objets de P5). Une seule instruction SELECT : V01-V23 + sécurité des objets v2 + modération + sessions. */
function buildVerifySql(onlyIds) {
    const checks = p3.parseVerify(read(DRAFT, '07_verify_taxonomy_v2.sql')).filter((c) => !onlyIds || onlyIds.includes(c.id));
    const parts = checks.map((c, i) => {
        const key = `${c.id}#${i}`;
        if (c.info) return `${lit(key)}, (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${c.sql}) q)`;
        return `${lit(key)}, jsonb_build_object('rows', (SELECT count(*) FROM (${c.sql}) q), 'sample', (SELECT coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) FROM (SELECT * FROM (${c.sql}) y LIMIT 3) z))`;
    });
    const newTables = "SELECT c.oid, c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND (c.relname LIKE 'lyann\\_taxonomy\\_%' ESCAPE '\\' OR c.relname = 'lyann_profile_skill')";
    return `SELECT jsonb_build_object(
 ${parts.join(',\n ')},
 'security', jsonb_build_object(
   'new_tables', (SELECT count(*) FROM (${newTables}) t),
   'new_tables_without_rls', (SELECT coalesce(jsonb_agg(relname), '[]'::jsonb) FROM (${newTables}) t WHERE NOT relrowsecurity),
   'new_tables_structural_or_write_privileges', (SELECT coalesce(jsonb_agg(t.relname || ':' || r || ':' || p), '[]'::jsonb) FROM (${newTables}) t, unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES']) p WHERE has_table_privilege(r, t.oid, p)),
   'anon_write_on_new_tables', (SELECT coalesce(jsonb_agg(t.relname || ':' || p), '[]'::jsonb) FROM (${newTables}) t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p WHERE has_table_privilege('anon', t.oid, p)),
   'definer_functions_without_search_path', (SELECT coalesce(jsonb_agg(p.proname), '[]'::jsonb) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY (ARRAY[${V2_FUNCTIONS.map(lit).join(', ')}, 'lyann_node_related_to', 'lyann_request_legacy_matches_node', 'lyann_service_legacy_matches_node', 'lyann_legacy_value_is_placeholder']) AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%')),
   'anon_executable_v2_functions', (SELECT coalesce(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY (ARRAY[${V2_FUNCTIONS.map(lit).join(', ')}, 'lyann_node_related_to', 'lyann_request_legacy_matches_node', 'lyann_service_legacy_matches_node', 'lyann_legacy_value_is_placeholder']) AND has_function_privilege('anon', p.oid, 'EXECUTE')),
   'historical_privileges_on_services', (SELECT coalesce(jsonb_agg(r || ':' || p), '[]'::jsonb) FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES']) p WHERE has_table_privilege(r, 'public.services', p))),
 'moderation', jsonb_build_object('queue', ${countOf('content_moderation_queue')}, 'jobs', ${countOf('moderation_jobs')}),
 'counts', jsonb_build_object('requests', ${countOf('requests')}, 'services', ${countOf('services')}, 'lyann_taxonomy', ${countOf('lyann_taxonomy')}),
 'coverage', jsonb_build_object('requests_with_node', (SELECT count(*) FROM public.requests r WHERE to_jsonb(r) ->> 'taxonomy_node_code' IS NOT NULL), 'services_with_node', (SELECT count(*) FROM public.services x WHERE to_jsonb(x) ->> 'taxonomy_node_code' IS NOT NULL)),
 'sessions', jsonb_build_object(
     'idle_in_transaction', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'),
     'prepared', (SELECT count(*) FROM pg_prepared_xacts),
     'advisory_locks', (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'),
     'locks_on_targets', (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'relation' AND l.pid <> pg_backend_pid() AND l.relation IN ('public.requests'::regclass, 'public.services'::regclass, 'public.lyann_taxonomy'::regclass) AND l.mode IN ('ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')))
) AS verify`;
}

/** Différences de catalogue entre l'état de référence (sauvegarde) et l'état courant : { changed[], removed[], added[] }. */
function diffCatalog(before, after) {
    const b = new Map(before.map((r) => [r.k, r.v]));
    const a = new Map(after.map((r) => [r.k, r.v]));
    const changed = []; const removed = []; const added = [];
    for (const [k, v] of b) { if (!a.has(k)) removed.push(k); else if (a.get(k) !== v) changed.push(k); }
    for (const k of a.keys()) if (!b.has(k)) added.push(k);
    return { changed, removed, added };
}

/**
 * Évalue une vérification : { go, stops[], notes[] }.
 *   ctx : { stage: 'P4' | 'P5' | 'FINAL', preflight, catalogDiff, fingerprintBefore, fingerprintAfter, with100 }
 */
function evaluateVerify(report, ctx) {
    const stops = []; const notes = [];
    const c = ctx || {};
    const stage = c.stage || 'FINAL';
    const ids = stage === 'P4' ? P4_CHECKS : null;
    for (const [k, v] of Object.entries(report || {})) {
        if (!/^V\d+#/.test(k)) continue;
        if (ids && !ids.includes(k.split('#')[0])) continue;
        if (v && !Array.isArray(v) && Number(v.rows) > 0) stops.push(`${k.split('#')[0]} : ${v.rows} ligne(s) en anomalie`);
    }
    const sec = (report && report.security) || {};
    if (sec.new_tables !== undefined && stage !== 'P4' && Number(sec.new_tables) !== 8 && Number(sec.new_tables) !== 7) notes.push(`tables v2 trouvées : ${sec.new_tables}`);
    if ((sec.new_tables_without_rls || []).length) stops.push(`table(s) v2 sans RLS : ${sec.new_tables_without_rls.join(', ')}`);
    if ((sec.new_tables_structural_or_write_privileges || []).length) stops.push(`privilège(s) structurel(s) sur des tables v2 : ${sec.new_tables_structural_or_write_privileges.join(', ')}`);
    if ((sec.anon_write_on_new_tables || []).length) stops.push(`anon peut écrire sur : ${sec.anon_write_on_new_tables.join(', ')}`);
    if ((sec.definer_functions_without_search_path || []).length) stops.push(`fonction(s) SECURITY DEFINER sans search_path : ${sec.definer_functions_without_search_path.join(', ')}`);
    const anonFns = (sec.anon_executable_v2_functions || []).filter((f) => f !== 'lyann_taxonomy_search');
    if (anonFns.length) stops.push(`fonction(s) v2 exécutable(s) par anon (hors recherche publique) : ${anonFns.join(', ')}`);
    const s100 = (sec.historical_privileges_on_services || []);
    if (c.with100 && s100.length) stops.push(`privilèges structurels encore présents sur services : ${s100.join(', ')}`);
    if (!c.with100 && s100.length) notes.push(`privilèges structurels de services inchangés (correctif 100 non appliqué) : ${s100.length}`);
    if (c.preflight && report && report.moderation) {
        const pre = c.preflight.counts || {};
        if (Number(report.moderation.queue) !== Number(pre.moderation_queue) || Number(report.moderation.jobs) !== Number(pre.moderation_jobs)) {
            stops.push(`modération modifiée depuis le pré-vol : file ${pre.moderation_queue}→${report.moderation.queue}, tâches ${pre.moderation_jobs}→${report.moderation.jobs} (une activité réelle peut l'expliquer : à vérifier avant de poursuivre)`);
        }
    }
    const sess = (report && report.sessions) || {};
    for (const [k, label] of [['idle_in_transaction', 'session(s) « idle in transaction »'], ['prepared', 'transaction(s) préparée(s)'], ['advisory_locks', 'verrou(s) consultatif(s)'], ['locks_on_targets', 'verrou(s) résiduel(s) sur les tables cibles']]) {
        if (Number(sess[k]) > 0) stops.push(`${sess[k]} ${label}`);
    }
    if (c.catalogDiff) {
        const allowedChanged = new Set(p3.EXPECTED_CHANGED);
        if (c.with100) allowedChanged.add('acl:services');
        if (stage === 'P4') { allowedChanged.delete('fn:lyann_sync_profile_skills(uuid,text[])'); }
        const bad = c.catalogDiff.changed.filter((k) => !allowedChanged.has(k)).concat(c.catalogDiff.removed);
        if (bad.length) stops.push(`objets préexistants modifiés ou retirés : ${bad.slice(0, 8).join(', ')}`);
    }
    if (c.fingerprintBefore && c.fingerprintAfter) {
        for (const k of Object.keys(c.fingerprintBefore)) {
            if (JSON.stringify(c.fingerprintBefore[k]) !== JSON.stringify(c.fingerprintAfter[k])) stops.push(`hors schéma public : « ${k} » a changé`);
        }
    }
    if (report && report.counts && c.preflight && c.preflight.counts) {
        for (const t of TABLES) if (Number(report.counts[t]) !== Number(c.preflight.counts[t])) notes.push(`${t} : ${c.preflight.counts[t]} → ${report.counts[t]} lignes depuis le pré-vol (activité réelle ? à vérifier)`);
    }
    return { go: stops.length === 0, stops, notes };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Sauvegarde logique locale et restauration
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const PAGE = 500;
const BACKUP_FILES = { requests: 'requests.ndjson', services: 'services.ndjson', lyann_taxonomy: 'lyann_taxonomy.ndjson' };

/** Exporte une table en lignes JSON (clé primaire `id`), par pages. `query(sql)` renvoie les lignes. */
async function exportTable(query, table) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
        const page = await query(`SELECT to_jsonb(t) AS j FROM public.${table} t ORDER BY t.id LIMIT ${PAGE} OFFSET ${offset}`);
        for (const r of page) rows.push(typeof r.j === 'string' ? JSON.parse(r.j) : r.j);
        if (page.length < PAGE) break;
    }
    return rows;
}

const CATALOG_EXPORT_SQL = `SELECT k, v FROM (${p3.CATALOG_SQL}) c ORDER BY k`;
const FUNCTIONS_EXPORT_SQL = "SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def, coalesce(p.proacl::text, '') AS acl FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p') ORDER BY 1";

/**
 * Sauvegarde logique de ce que P4/P5 peuvent toucher. Écrit dans `dir` (créé en 0700, fichiers en 0600) :
 * lignes des trois tables, catalogue (clés/valeurs de contrôle), définitions des fonctions publiques, pré-vol, manifeste SHA-256.
 * Contient des données de recette Staging : jamais committée, jamais copiée hors de ce dossier.
 */
async function writeBackup({ query, dir, preflight, scripts, now }) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    const manifest = { created_at: (now || new Date()).toISOString(), project: STAGING_REF, files: {}, rows: {}, scripts: scripts || {}, catalog: preflight && preflight.catalog };
    const put = (name, content) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, content, { mode: 0o600 });
        fs.chmodSync(file, 0o600);
        manifest.files[name] = sha256(content);
    };
    for (const table of TABLES) {
        const rows = await exportTable(query, table);
        manifest.rows[table] = rows.length;
        put(BACKUP_FILES[table], rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    }
    const catalog = await query(CATALOG_EXPORT_SQL);
    put('catalog.json', JSON.stringify(catalog));
    put('functions.json', JSON.stringify(await query(FUNCTIONS_EXPORT_SQL)));
    put('preflight.json', JSON.stringify(preflight || null));
    put('manifest.json', JSON.stringify(manifest, null, 1));
    return { dir, manifest, catalogRows: catalog.length };
}

/** Relit une sauvegarde et en contrôle les empreintes. */
function readBackup(dir) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const bad = [];
    for (const [name, digest] of Object.entries(manifest.files)) {
        if (name === 'manifest.json') continue;
        if (sha256(fs.readFileSync(path.join(dir, name), 'utf8')) !== digest) bad.push(name);
    }
    if (bad.length) throw new Error(`sauvegarde altérée : ${bad.join(', ')}`);
    const rows = {};
    for (const table of TABLES) rows[table] = fs.readFileSync(path.join(dir, BACKUP_FILES[table]), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { manifest, rows, catalog: JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8')), preflight: JSON.parse(fs.readFileSync(path.join(dir, 'preflight.json'), 'utf8')) };
}

/**
 * SQL de restauration (jamais lancé automatiquement). Deux temps dans UNE transaction :
 *   R1  retour arrière du schéma : 10 (si présente) puis 09 — fichiers validés, prouvés à l'identique par P3 ;
 *   R2  rétablissement des LIGNES des trois tables depuis la sauvegarde, uniquement celles qui diffèrent, en contexte « service » (sinon la modération
 *       se redéclencherait), sans jamais toucher aux lignes apparues depuis la sauvegarde.
 * Les colonnes v2 ont disparu après 09 : les lignes de la sauvegarde ne les contiennent pas.
 */
function buildRestoreSql(backup, options) {
    const opts = options || {};
    const files = loadDrafts();
    const s = ['BEGIN;', ...HEADER_SETTINGS, 'LOCK TABLE public.requests, public.services, public.lyann_taxonomy IN ACCESS EXCLUSIVE MODE;'];
    if (!opts.dataOnly) {
        s.push('-- R1.a  retire la fonction de précision si elle existe (le choix des membres est conservé jusqu\'à 09)', "DROP FUNCTION IF EXISTS public.lyann_resolve_legacy_skill(uuid, text);");
        s.push('-- R1.b  09 — retour arrière de la taxonomie v2', stripTransaction(files['09']));
    }
    if (opts.revert100) s.push('-- R1.c  retour arrière du correctif 100 (rend à anon/authenticated les trois privilèges retirés)', stripTransaction(read(SECURITY, '100_services_dangerous_privileges_rollback.sql')));
    s.push("SELECT set_config('request.jwt.claim.role', 'service_role', true);");
    for (const table of TABLES) {
        const rows = backup.rows[table];
        if (!rows.length) continue;
        // Mode « données seules » : le schéma v2 reste en place, ses colonnes (rattachements) ne sont jamais écrasées par une sauvegarde qui ne les contient pas.
        const skip = opts.dataOnly ? (NEW_COLUMNS[table] || []) : [];
        const cols = Object.keys(rows[0]).filter((c) => c !== 'id' && !skip.includes(c));
        const sets = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
        const strip = skip.length ? ` - ARRAY[${skip.map(lit).join(', ')}]` : '';
        const data = `${dollar('p45r', JSON.stringify(rows))}::jsonb`;
        const rs = `jsonb_populate_recordset(NULL::public.${table}, ${data})`;
        s.push(`-- R2  ${table} : ${rows.length} ligne(s) de la sauvegarde ; lignes supprimées réinsérées, lignes qui diffèrent réécrites, les autres jamais touchées`);
        // Pas d'INSERT … ON CONFLICT : les déclencheurs BEFORE INSERT (modération) modifient la ligne « EXCLUDED » avant la comparaison et la restauration réécrirait des statuts.
        s.push(`INSERT INTO public.${table} SELECT e.* FROM ${rs} e WHERE NOT EXISTS (SELECT 1 FROM public.${table} x WHERE x.id = e.id);`);
        s.push(`UPDATE public.${table} x SET ${sets.replace(/EXCLUDED\./g, 'e.')} FROM ${rs} e WHERE x.id = e.id AND (to_jsonb(x.*)${strip}) IS DISTINCT FROM (to_jsonb(e.*)${strip});`);
    }
    s.push("SELECT set_config('request.jwt.claim.role', '', true);", 'COMMIT;');
    return s.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** Jeton révoqué ? `file` : une empreinte SHA-256 par ligne (liste locale non versionnée). */
function isRevokedToken(token, file) {
    if (!file || !fs.existsSync(file)) return false;
    const digest = sha256(token);
    return fs.readFileSync(file, 'utf8').split(/\s+/).some((line) => line.trim().toLowerCase() === digest);
}

/** Les chemins de l'API de gestion ne peuvent viser que Staging. */
function assertStagingPath(pathname) {
    if (pathname.includes(PRODUCTION_REF)) throw new Error('Production refusée.');
    if (!pathname.includes(STAGING_REF)) throw new Error('Seul le projet Staging est autorisé.');
}

function makeApi(token, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    return {
        async get(pathname) {
            assertStagingPath(pathname);
            const res = await doFetch(`https://api.supabase.com${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
            return { status: res.status, json: await res.json().catch(() => null) };
        },
        /** Exécute du SQL. Renvoie { ok, rows } ou { ok: false, status, message, code }. */
        async sql(query) {
            const pathname = `/v1/projects/${STAGING_REF}/database/query`;
            assertStagingPath(pathname);
            const res = await doFetch(`https://api.supabase.com${pathname}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
            const text = await res.text();
            let body = null;
            try { body = JSON.parse(text); } catch (_) { /* corps non JSON */ }
            if (res.status >= 300) return { ok: false, status: res.status, message: String((body && (body.message || body.error)) || text).slice(0, 2000) };
            return { ok: true, rows: Array.isArray(body) ? body : [] };
        },
    };
}

const unwrap = (res, key) => { if (!res.ok) throw new Error(`requête refusée : ${res.message}`); const r = res.rows[0]; return r ? (typeof r[key] === 'string' ? JSON.parse(r[key]) : r[key]) : null; };

/**
 * Déroule la séquence. `api` : { get(path), sql(query) } ; `log(msg)` ; `backupDir` ; `steps` (sous-ensemble ordonné de STEPS).
 * S'arrête au premier écart et renvoie { ok, stopped, steps, report }. Ne lève que sur erreur de programmation ou d'identité.
 */
async function orchestrate({ api, log, backupDir, steps, now, onlyPreflight, expectedCatalog, resume }) {
    // `resume` : { digest, objects } = catalogue relevé à la fin de l'exécution précédente (après P4). Permet de poursuivre par P5/S10/S100 dans une exécution séparée.
    const expected = resume || expectedCatalog || PROVEN_CATALOG;
    const say = log || (() => {});
    const wanted = STEPS.filter((s) => (steps || STEPS).includes(s));
    const result = { ok: false, stopped: null, steps: [], report: {} };
    const stop = (step, reasons) => { result.stopped = { step, reasons }; say(`ARRÊT à ${step} : ${reasons.join(' ; ')}`); return result; };

    // 0. Identité
    const who = await api.get(`/v1/projects/${STAGING_REF}`);
    const ref = who.json && (who.json.ref || who.json.id);
    if (who.status !== 200 || String(ref) !== STAGING_REF || String(ref) === PRODUCTION_REF) return stop('identité', [`le projet retourné n'est pas Staging (${who.status}, ${ref})`]);
    if (who.json.status && who.json.status !== 'ACTIVE_HEALTHY') return stop('identité', [`projet non sain : ${who.json.status}`]);
    result.report.project = { ref, name: who.json.name, status: who.json.status };
    say(`identité confirmée : ${ref} (${who.json.name})`);

    // Pré-vol
    const pf = unwrap(await api.sql(buildPreflightSql()), 'preflight');
    if (resume && wanted.includes('P4')) return stop('reprise', ['une reprise après P4 ne peut pas contenir P4']);
    const pfVerdict = evaluatePreflight(pf, expected, { resume: Boolean(resume) });
    result.report.preflight = pf;
    if (!pfVerdict.go) return stop('pré-vol', pfVerdict.stops);
    const fp0 = unwrap(await api.sql(buildFingerprintSql()), 'fingerprint');
    result.steps.push({ step: 'pré-vol', ok: true });
    if (onlyPreflight) { result.ok = true; return result; }

    // 1. Sauvegarde
    const built = { P4: buildP4(expected), P5: buildP5(null), S10: buildS10(), S100: buildS100() };
    for (const [name, b] of Object.entries(built)) { const problems = lint(b.sql, name); if (problems.length) return stop('lint', [`${name} : ${problems.join(' ; ')}`]); }
    const q = async (sql) => { const r = await api.sql(sql); if (!r.ok) throw new Error(`sauvegarde : ${r.message}`); return r.rows; };
    const backup = await writeBackup({ query: q, dir: backupDir, preflight: pf, now, scripts: Object.fromEntries(Object.entries(built).map(([k, v]) => [k, v.sha256])) });
    const mismatch = TABLES.filter((t) => Number(backup.manifest.rows[t]) !== Number(pf.counts[t]));
    if (mismatch.length) return stop('sauvegarde', [`nombre de lignes sauvegardées différent du pré-vol : ${mismatch.join(', ')} (activité concurrente ?)`]);
    say(`sauvegarde écrite : ${backup.dir} (${TABLES.map((t) => `${t} ${backup.manifest.rows[t]}`).join(', ')})`);
    result.steps.push({ step: 'sauvegarde', ok: true, dir: backup.dir });
    const catalogBefore = JSON.parse(fs.readFileSync(path.join(backupDir, 'catalog.json'), 'utf8'));

    let with100 = false;
    for (const step of wanted) {
        if (step === 'P5') {
            // P5 vérifie en tête de transaction que le catalogue est EXACTEMENT celui qu'on vient de mesurer (rien n'a bougé entre la mesure et l'exécution).
            const now5 = unwrap(await api.sql(buildPreflightSql()), 'preflight');
            const p5 = buildP5({ digest: now5.catalog.digest, objects: now5.catalog.objects });
            const problems5 = lint(p5.sql, 'P5');
            if (problems5.length) return stop('lint', [`P5 : ${problems5.join(' ; ')}`]);
            built.P5 = p5;
        }
        const b = built[step];
        say(`${step} : exécution (${b.bytes} octets, sha256 ${b.sha256.slice(0, 16)}…)`);
        const t0 = Date.now();
        const res = await api.sql(b.sql);
        if (!res.ok) {
            await api.sql('ROLLBACK;').catch(() => null);   // ceinture et bretelles ; sans effet si aucune transaction n'est ouverte
            const after = unwrap(await api.sql(buildPreflightSql()), 'preflight');
            const cleanAbort = after && after.catalog && after.catalog.digest === pf.catalog.digest && after.v2_tables === 0 && after.v2_columns === 0;
            result.steps.push({ step, ok: false, error: res.message });
            return stop(step, [`échec SQL : ${res.message}`, step === 'P4' || step === 'P5' ? (cleanAbort ? 'catalogue identique à l\'état de départ : annulation propre, rien n\'a été appliqué' : 'ÉTAT À EXAMINER : le catalogue diffère de l\'état de départ, ne rien relancer, voir la procédure de restauration') : 'état à examiner avant toute action']);
        }
        if (step === 'S100') with100 = true;
        const verify = unwrap(await api.sql(buildVerifySql(step === 'P4' ? P4_CHECKS : null)), 'verify');
        const fp1 = unwrap(await api.sql(buildFingerprintSql()), 'fingerprint');
        const catalogAfter = await q(CATALOG_EXPORT_SQL);
        const verdict = evaluateVerify(verify, { stage: step === 'P4' ? 'P4' : 'P5', preflight: pf, catalogDiff: diffCatalog(catalogBefore, catalogAfter), fingerprintBefore: fp0, fingerprintAfter: fp1, with100 });
        result.steps.push({ step, ok: verdict.go, ms: Date.now() - t0, notes: verdict.notes, stops: verdict.stops });
        const pfAfter = unwrap(await api.sql(buildPreflightSql()), 'preflight');
        result.report[step] = { verify, notes: verdict.notes, catalog: pfAfter && pfAfter.catalog, ms: Date.now() - t0 };
        say(`${step} : ${verdict.go ? 'conforme' : 'ANOMALIE'} (${Date.now() - t0} ms)`);
        if (!verdict.go) return stop(step, verdict.stops);
    }
    result.ok = true;
    return result;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Plan, empreintes, exécution
// ---------------------------------------------------------------------------------------------------------------------------------------------------

function fingerprints() {
    const out = {};
    for (const f of ['01_schema_taxonomy_v2.sql', '02_additive_columns.sql', '03_search_and_skills_rpc.sql', '04_seed_taxonomy_v2.sql', '05_legacy_map_and_backfill.sql', '06_dual_write_derivation.sql',
        '07_verify_taxonomy_v2.sql', '08_legacy_projection.sql', '09_rollback_taxonomy_v2.sql']) out[`migration-draft/${f}`] = sha256(read(DRAFT, f));
    out['post-migration-draft/10_resolve_legacy_skill.sql'] = sha256(read(POST, '10_resolve_legacy_skill.sql'));
    out['post-migration-draft/10_resolve_legacy_skill_rollback.sql'] = sha256(read(POST, '10_resolve_legacy_skill_rollback.sql'));
    out['security-draft/100_services_dangerous_privileges_staging.sql'] = sha256(read(SECURITY, '100_services_dangerous_privileges_staging.sql'));
    out['security-draft/100_services_dangerous_privileges_rollback.sql'] = sha256(read(SECURITY, '100_services_dangerous_privileges_rollback.sql'));
    const p4 = buildP4(); const p5 = buildP5();
    out['généré : P4 (01→04 + assertions)'] = p4.sha256;
    out['généré : P5 (05 service → 06 → 08 + assertions)'] = p5.sha256;
    return out;
}

const PLAN = `
P4/P5 — déroulé exécutable (NON AUTORISÉ à ce jour)
  Pré-requis : autorisation écrite spécifique ; jeton Supabase NEUF (LYANN_P45_TOKEN_FILE) — celui de P3 doit être révoqué ; projet ${STAGING_REF} ; sauvegarde dans un dossier local 0700.
  0  Identité du projet (API) puis pré-vol en lecture seule : catalogue = celui prouvé par P3 (${PROVEN_CATALOG.digest}, ${PROVEN_CATALOG.objects} objets), aucun objet v2,
     aucune session ouverte, aucun verrou, aucune demande PROHIBITED non annulée, six déclencheurs UPDATE examinés, tables de modération présentes.
  1  Sauvegarde logique locale (requests, services, lyann_taxonomy, catalogue, fonctions) + manifeste SHA-256, contrôle du nombre de lignes.
  2  P4 = 01 → 04, une transaction, verrou exclusif préalable, V01-V06 et V12 + « aucun objet préexistant modifié » + « aucune colonne historique modifiée » + « aucune modération ajoutée » dans la transaction.
  3  Vérification P4 depuis une nouvelle connexion (V, sécurité des objets v2, modération, sessions, catalogue, empreinte hors schéma public).
  4  P5 = 05 (contexte « service » explicite) → 06 → 08, une transaction, V01-V23 et mêmes assertions ; seul objet préexistant modifié : lyann_sync_profile_skills(uuid,text[]).
  5  Vérification P5 (idem).   6  S10 (précision des compétences par le membre) puis S100 (privilèges de services), transactions séparées.   7  Vérification finale.
  Arrêt immédiat au premier écart ; aucune étape suivante ; aucune relance automatique. Restauration : --restore-plan <dossier de sauvegarde> (jamais lancée automatiquement).
  Détail : docs/taxonomy/14-p4-p5-staging-runbook.md
  Commande   : LYANN_P45_AUTHORIZED=${AUTHORIZATION_PHRASE} LYANN_P45_TOKEN_FILE=<fichier> node scripts/taxonomy-v2/p45-staging.js --execute [--steps P4,P5,S10,S100]
`;

function readToken(file) {
    const line = fs.readFileSync(file, 'utf8').split(/\n/).find((row) => row.startsWith('SUPABASE_ACCESS_TOKEN='));
    if (!line) throw new Error('SUPABASE_ACCESS_TOKEN absent du fichier indiqué.');
    return line.slice('SUPABASE_ACCESS_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '');
}

async function execute(args) {
    if (process.env.LYANN_P45_AUTHORIZED !== AUTHORIZATION_PHRASE) {
        console.error(`Refus : l'application sur Staging exige l'autorisation écrite spécifique de l'utilisateur.\nVariable attendue : LYANN_P45_AUTHORIZED=${AUTHORIZATION_PHRASE}`);
        process.exit(3);
    }
    const file = process.env.LYANN_P45_TOKEN_FILE;
    if (!file) { console.error('LYANN_P45_TOKEN_FILE manquante (le jeton de P3 ne doit pas être réutilisé : en créer un neuf).'); process.exit(3); }
    const token = readToken(file);
    const revokedList = process.env.LYANN_P45_REVOKED_TOKEN_HASHES || path.join(ROOT, 'artifacts', 'p3-staging', 'revoked-token-hashes.txt');
    if (isRevokedToken(token, revokedList)) { console.error('Refus : ce jeton est celui de P3 (révoqué). Créer un jeton neuf.'); process.exit(3); }
    const stepsArg = args.includes('--steps') ? args[args.indexOf('--steps') + 1] : STEPS.join(',');
    const steps = stepsArg.split(',').map((x) => x.trim()).filter(Boolean);
    if (steps.some((x) => !STEPS.includes(x))) { console.error(`Étapes inconnues : ${steps.join(',')}`); process.exit(3); }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = process.env.LYANN_P45_BACKUP_DIR || path.join(os.homedir(), 'Developer', 'lyann-releases', 'backups', `staging-p45-${stamp}`);
    let resume;
    if (args.includes('--resume-catalog')) {
        const m = /^([0-9a-f]{32}):(\d+)$/.exec(String(args[args.indexOf('--resume-catalog') + 1] || ''));
        if (!m) { console.error('Usage : --resume-catalog <empreinte md5>:<nombre d\'objets> (relevés dans le rapport de l\'exécution précédente)'); process.exit(3); }
        resume = { digest: m[1], objects: Number(m[2]) };
    }
    const result = await orchestrate({ api: makeApi(token), log: (m) => console.log(m), backupDir, steps, onlyPreflight: args.includes('--preflight-only'), resume });
    const outDir = path.join(ROOT, 'artifacts', 'p45-staging');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `run-${stamp}.json`), JSON.stringify(result, null, 1));
    console.log(JSON.stringify({ ok: result.ok, stopped: result.stopped, steps: result.steps.map((s) => ({ step: s.step, ok: s.ok })) }, null, 1));
    process.exit(result.ok ? 0 : 1);
}

module.exports = {
    buildPreflightSql, buildFingerprintSql, buildP4, buildP5, buildS10, buildS100, buildVerifySql, buildRestoreSql, evaluatePreflight, evaluateVerify, diffCatalog,
    lint, writeBackup, readBackup, exportTable, orchestrate, isRevokedToken, assertStagingPath, makeApi, fingerprints, readToken,
    AUTHORIZATION_PHRASE, PROVEN_CATALOG, STEPS, TABLES, NEW_COLUMNS, P4_CHECKS, PLAN, STAGING_REF, PRODUCTION_REF, CATALOG_EXPORT_SQL,
};

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--execute')) execute(args).catch((e) => { console.error(e.message); process.exit(1); });
    else if (args.includes('--plan')) console.log(PLAN);
    else if (args.includes('--fingerprints')) console.log(JSON.stringify(fingerprints(), null, 2));
    else if (args.includes('--print')) {
        const which = String(args[args.indexOf('--print') + 1] || '').toUpperCase();
        const table = { P4: buildP4, P5: buildP5, S10: buildS10, S100: buildS100, PREFLIGHT: () => ({ sql: buildPreflightSql() }), VERIFY: () => ({ sql: buildVerifySql() }) };
        if (!table[which]) { console.error('Usage : --print P4|P5|S10|S100|PREFLIGHT|VERIFY'); process.exit(2); }
        console.log(table[which]().sql);
    } else if (args.includes('--restore-plan')) {
        const dir = args[args.indexOf('--restore-plan') + 1];
        if (!dir) { console.error('Usage : --restore-plan <dossier de sauvegarde>'); process.exit(2); }
        process.stdout.write(`${buildRestoreSql(readBackup(dir), { dataOnly: args.includes('--data-only'), revert100: args.includes('--revert-100') })}\n`);
    } else console.log(PLAN);
}
