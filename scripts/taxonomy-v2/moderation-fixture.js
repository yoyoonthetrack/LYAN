'use strict';
/*
 * Banc local : les déclencheurs RÉELS de modération des demandes (migrations 70 et 71), extraits des fichiers du dépôt.
 *
 * Pourquoi : le pré-vol Staging (P06) montre que `trg_enforce_request_moderation` (BEFORE INSERT OR UPDATE, toutes colonnes) et
 * `trg_touch_request_moderation_job` (AFTER INSERT OR UPDATE) s'exécutent sur TOUT UPDATE de `requests`, donc aussi sur le rétro-remplissage
 * de la taxonomie (05). Sans précaution, réécrire une colonne re-modère le texte, peut ajouter une ligne à `content_moderation_queue`
 * et une tâche à `moderation_jobs` (traitées ensuite par le worker de modération), voire publier ou effacer une modification en attente.
 *
 * Le code testé n'est pas recopié : les fonctions sont lues dans 70_public_content_moderation.sql et 71_private_media_hold.sql.
 * Limite assumée : Staging peut porter une version plus récente de `lyann_moderate_public_text` (migration 73) ; c'est pourquoi P3 mesure ces
 * effets sur la base réelle avant toute application.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function fn(file, name) {
    const m = read(file).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
    if (!m) throw new Error(`${file}: fonction ${name} introuvable`);
    return m[0];
}

/** Colonnes de modération de `requests` (migration 70) à ajouter à la table de test. */
const REQUEST_MODERATION_COLUMNS = "public_moderation_status text NOT NULL DEFAULT 'approved', title_pending text, description_pending text, description text";

/** Installe tables, fonctions et déclencheurs réels. `requests` et `auth` doivent déjà exister. */
async function install(db) {
    await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
        CREATE TABLE public.moderation_control (singleton int PRIMARY KEY, intake_open boolean NOT NULL DEFAULT true);
        INSERT INTO public.moderation_control VALUES (1, true);
        CREATE TABLE public.content_moderation_queue (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_type text NOT NULL, subject_id uuid NOT NULL, payload jsonb NOT NULL,
            status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE public.moderation_jobs (subject_type text NOT NULL, subject_id uuid NOT NULL, status text NOT NULL, attempts int NOT NULL DEFAULT 0,
            available_at timestamptz, reason_code text, claimed_at timestamptz, finished_at timestamptz, UNIQUE (subject_type, subject_id));
    `);
    await db.exec(fn('70_public_content_moderation.sql', 'lyann_is_service_role'));
    await db.exec(fn('70_public_content_moderation.sql', 'lyann_public_intake_open'));
    await db.exec(fn('70_public_content_moderation.sql', 'lyann_moderate_public_text'));
    await db.exec(fn('70_public_content_moderation.sql', 'enforce_request_moderation'));
    await db.exec(fn('71_private_media_hold.sql', 'lyann_enqueue_moderation_job'));
    await db.exec(fn('71_private_media_hold.sql', 'lyann_touch_request_moderation_job'));
    await db.exec(`
        CREATE TRIGGER trg_enforce_request_moderation BEFORE INSERT OR UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.enforce_request_moderation();
        CREATE TRIGGER trg_touch_request_moderation_job AFTER INSERT OR UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.lyann_touch_request_moderation_job();
    `);
}

/** État de modération observable : tout ce qu'un rétro-remplissage ne doit jamais modifier. */
async function moderationState(db) {
    const r = (await db.query(`SELECT
        (SELECT count(*) FROM public.content_moderation_queue)::int AS queue,
        (SELECT count(*) FROM public.moderation_jobs)::int AS jobs,
        (SELECT md5(coalesce(string_agg(id::text || '|' || public_moderation_status || '|' || coalesce(title, '') || '|' || coalesce(description, '') || '|' || coalesce(title_pending, '') || '|' || coalesce(description_pending, ''), ';' ORDER BY id), '')) FROM public.requests) AS requests_hash`)).rows[0];
    return { queue: r.queue, jobs: r.jobs, requestsHash: r.requests_hash };
}

const MARK_BEGIN = '-- @requests-backfill:begin';
const MARK_END = '-- @requests-backfill:end';
const SERVICE_ON = "SELECT set_config('request.jwt.claim.role', 'service_role', true);   -- contexte « service » (variante B)";
const SERVICE_OFF = "SELECT set_config('request.jwt.claim.role', '', true);";

/**
 * Deux variantes du rétro-remplissage 05 :
 *   plain   = tel quel (contexte du rôle qui exécute le script : aucune revendication JWT) ;
 *   service = les UPDATE de `requests` s'exécutent avec la revendication JWT role = service_role (valable pour la transaction seulement), c'est-à-dire
 *             dans le contexte qu'utilise l'API pour ses écritures administratives ; les triggers de modération passent par leur branche « service ».
 * Le fichier 05 lui-même n'est PAS modifié : c'est un choix d'exécution (décision X6), arbitré après la mesure de P3.
 */
function backfillVariants(sql05) {
    if (!sql05.includes(MARK_BEGIN) || !sql05.includes(MARK_END)) throw new Error('05: repères @requests-backfill absents');
    return {
        plain: sql05,
        service: sql05.split(MARK_BEGIN).join(`${MARK_BEGIN}\n${SERVICE_ON}`).split(MARK_END).join(`${SERVICE_OFF}\n${MARK_END}`),
    };
}

/** Retire les BEGIN; / COMMIT; de plus haut niveau d'un brouillon, pour le jouer dans une transaction englobante (répétition à blanc, mesures). */
function stripTransaction(sql) {
    return sql.replace(/^BEGIN;[ \t]*$/gm, '-- (BEGIN retiré : transaction englobante)').replace(/^COMMIT;[ \t]*$/gm, '-- (COMMIT retiré : transaction englobante)');
}

module.exports = { stripTransaction, install, moderationState, backfillVariants, REQUEST_MODERATION_COLUMNS, MARK_BEGIN, MARK_END };
