-- LYANN — diagnostic lecture seule avant 51_52_one_transaction.sql
-- A coller dans l editeur SQL Supabase. Ne rien executer d autre ensuite.
--
-- Ce script ne contient que des SELECT. Il n ecrit aucune ligne,
-- ne cree aucun objet et n appelle aucune fonction metier.
--
-- Lire les résultats dans cet ordre :
--   1. verdict
--   2. acceptation
--   3. messages
--   4. dependances
--   5. definitions
--
-- Verdict :
--   OK         le constat correspond à ce que 51_52 suppose
--   BLOQUANT   ne pas appliquer 51_52 tant que ce point n est pas compris
--   RISQUE     l application peut retirer un comportement deja en base
--   INFORMATION le script ne change pas ce point

-- ---------------------------------------------------------------------------
-- 1. Verdict
-- ---------------------------------------------------------------------------
WITH accept AS (
    SELECT p.oid,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_functiondef(p.oid) AS def,
           p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'accept_request_quote'
),
message_trigger AS (
    SELECT t.tgname,
           t.tgenabled,
           pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'messages'
      AND NOT t.tgisinternal
      AND t.tgname = 'trg_refuse_message_between_blocked_users'
),
message_fn AS (
    SELECT pg_get_functiondef(p.oid) AS def,
           p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'refuse_message_between_blocked_users'
),
open_report_dupes AS (
    SELECT count(*) AS n
    FROM (
        SELECT 1
        FROM public.user_reports
        WHERE status IN ('OPEN', 'IN_REVIEW')
        GROUP BY reporter_id, target_user_id
        HAVING count(*) > 1
    ) d
)
SELECT * FROM (
    SELECT 10 AS ordre, 'acceptation' AS section,
           'signatures' AS controle,
           COALESCE((SELECT string_agg(args, ' | ' ORDER BY args) FROM accept), 'absente') AS constate,
           'une seule signature : p_quote_id uuid' AS attendu,
           CASE
               WHEN (SELECT count(*) FROM accept) = 0 THEN 'BLOQUANT'
               WHEN (SELECT count(*) FROM accept) = 1
                    AND (SELECT count(*) FROM accept WHERE args = 'p_quote_id uuid') = 1 THEN 'OK'
               WHEN EXISTS (SELECT 1 FROM accept WHERE args = 'p_quote_id uuid, p_expected_version integer')
                    THEN 'INFORMATION'
               ELSE 'BLOQUANT'
           END AS verdict,
           '51_52 remplace cette fonction. Une signature inattendue serait écrasée.' AS detail
    UNION ALL
    SELECT 20, 'acceptation', 'droits anon et public',
           COALESCE((
               SELECT string_agg(
                   CASE
                       WHEN has_function_privilege(r.oid, a.oid, 'EXECUTE') THEN r.rolname || '=EXECUTE'
                       ELSE r.rolname || '=non'
                   END, ', ' ORDER BY r.rolname)
               FROM accept a
               JOIN pg_roles r ON r.rolname IN ('anon', 'public')
           ), 'fonction absente'),
           'anon=non, public=non',
           CASE
               WHEN EXISTS (
                   SELECT 1 FROM accept a
                   JOIN pg_roles r ON r.rolname IN ('anon', 'public')
                   WHERE has_function_privilege(r.oid, a.oid, 'EXECUTE')
               ) THEN 'RISQUE'
               WHEN (SELECT count(*) FROM accept) = 0 THEN 'BLOQUANT'
               ELSE 'OK'
           END,
           '51_52 retire aussi ces droits sur les deux signatures.'
    UNION ALL
    SELECT 30, 'acceptation', 'contrôle de version dans le corps actuel',
           CASE
               WHEN (SELECT count(*) FROM accept) = 0 THEN 'fonction absente'
               WHEN EXISTS (
                   SELECT 1 FROM accept
                   WHERE def ILIKE '%p_expected_version%'
                      OR def ILIKE '%COALESCE(version, 1)%'
                      OR def ILIKE '%v_version > 1%'
               ) THEN 'présent'
               ELSE 'absent'
           END,
           'absent avant 51_52, puis imposé par la nouvelle fonction',
           CASE
               WHEN (SELECT count(*) FROM accept) = 0 THEN 'BLOQUANT'
               WHEN EXISTS (
                   SELECT 1 FROM accept
                   WHERE def ILIKE '%p_expected_version%' OR def ILIKE '%v_version > 1%'
               ) THEN 'INFORMATION'
               ELSE 'OK'
           END,
           'Si le controle est deja present, comparer la definition complete avant de remplacer la fonction.'
    UNION ALL
    SELECT 40, 'acceptation', 'comportement que 51_52 ne recopierait pas',
           COALESCE((
               SELECT string_agg(token, ', ' ORDER BY token)
               FROM accept a
               CROSS JOIN (VALUES
                   ('stripe'),
                   ('public.payments'),
                   ('INSERT INTO public.messages'),
                   ('public.notifications')
               ) AS tokens(token)
               WHERE a.def ILIKE '%' || token || '%'
           ), 'aucun des marqueurs stripe, payments, messages, notifications'),
           'aucun de ces marqueurs dans le fichier 05 ni dans 51_52',
           CASE
               WHEN EXISTS (
                   SELECT 1 FROM accept a
                   WHERE a.def ILIKE '%stripe%'
                      OR a.def ILIKE '%public.payments%'
                      OR a.def ILIKE '%INSERT INTO public.messages%'
                      OR a.def ILIKE '%public.notifications%'
               ) THEN 'RISQUE'
               WHEN (SELECT count(*) FROM accept) = 0 THEN 'BLOQUANT'
               ELSE 'OK'
           END,
           'Un RISQUE ici signifie que le corps deploye fait plus que le fichier 05. Ne pas appliquer avant de le lire.'
    UNION ALL
    SELECT 50, 'messages', 'déclencheur trg_refuse_message_between_blocked_users',
           COALESCE((SELECT def || ' | enabled=' || tgenabled::text FROM message_trigger), 'absent'),
           'BEFORE INSERT ON public.messages FOR EACH ROW, enabled=O',
           CASE
               WHEN NOT EXISTS (SELECT 1 FROM message_trigger) THEN 'RISQUE'
               WHEN EXISTS (
                   SELECT 1 FROM message_trigger
                   WHERE tgenabled = 'D'
                      OR def NOT ILIKE '%BEFORE INSERT%'
                      OR def NOT ILIKE '%refuse_message_between_blocked_users%'
               ) THEN 'RISQUE'
               ELSE 'OK'
           END,
           '51_52 ne cree pas ce declencheur. S il est absent ou desactive, deux membres bloques qui ont deja une conversation peuvent encore s ecrire.'
    UNION ALL
    SELECT 60, 'messages', 'fonction du déclencheur',
           CASE
               WHEN NOT EXISTS (SELECT 1 FROM message_fn) THEN 'absente'
               WHEN (SELECT prosecdef FROM message_fn) THEN 'SECURITY DEFINER'
               WHEN (SELECT def FROM message_fn) ILIKE '%current_user <> ''authenticated''%'
                    AND (SELECT def FROM message_fn) ILIKE '%conversation_has_block_for%'
                    THEN 'invoker, saute le rôle service, appelle conversation_has_block_for'
               ELSE 'corps différent du fichier 46'
           END,
           'invoker, saute le rôle service, appelle conversation_has_block_for',
           CASE
               WHEN NOT EXISTS (SELECT 1 FROM message_fn) THEN 'RISQUE'
               WHEN (SELECT prosecdef FROM message_fn) THEN 'RISQUE'
               WHEN (SELECT def FROM message_fn) ILIKE '%current_user <> ''authenticated''%'
                    AND (SELECT def FROM message_fn) ILIKE '%conversation_has_block_for%'
                    THEN 'OK'
               ELSE 'RISQUE'
           END,
           '51_52 ne remplace pas cette fonction. Un RISQUE decrit l etat actuel, pas un ecrasement.'
    UNION ALL
    SELECT 70, 'dépendances', 'is_blocked_between(uuid, uuid)',
           CASE WHEN to_regprocedure('public.is_blocked_between(uuid, uuid)') IS NULL THEN 'absente' ELSE 'présente' END,
           'présente, et non remplacée par 51_52',
           CASE WHEN to_regprocedure('public.is_blocked_between(uuid, uuid)') IS NULL THEN 'BLOQUANT' ELSE 'OK' END,
           'Le declencheur de participant et l acceptation appellent cette fonction.'
    UNION ALL
    SELECT 80, 'dépendances', 'is_current_user_admin()',
           CASE WHEN to_regprocedure('public.is_current_user_admin()') IS NULL THEN 'absente' ELSE 'présente' END,
           'présente',
           CASE WHEN to_regprocedure('public.is_current_user_admin()') IS NULL THEN 'BLOQUANT' ELSE 'OK' END,
           'La politique de lecture des preuves appelle cette fonction.'
    UNION ALL
    SELECT 90, 'dépendances', 'get_or_create_conversation',
           COALESCE((
               SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ' ORDER BY pg_get_function_identity_arguments(p.oid))
               FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'get_or_create_conversation'
           ), 'absente'),
           'p_target_user_id uuid, non remplacée',
           'OK',
           '51_52 ne contient pas CREATE OR REPLACE de cette fonction, quelle que soit sa définition.'
    UNION ALL
    SELECT 100, 'dépendances', 'tables et colonnes requises',
           (
               SELECT string_agg(item, ', ' ORDER BY item)
               FROM (VALUES
                   ('quotes.version'),
                   ('quotes.status'),
                   ('quotes.requester_id'),
                   ('quotes.provider_id'),
                   ('quotes.total_amount'),
                   ('quotes.amount'),
                   ('quotes.description'),
                   ('quotes.details'),
                   ('quotes.valid_until'),
                   ('quotes.mission_id'),
                   ('quotes.request_id'),
                   ('quotes.request_invitation_id'),
                   ('quotes.conversation_id'),
                   ('milestones.quote_id'),
                   ('milestones.title'),
                   ('milestones.amount'),
                   ('milestones.percentage'),
                   ('milestones.display_order'),
                   ('milestones.status'),
                   ('payments.milestone_id'),
                   ('missions.requester_id'),
                   ('missions.helper_id'),
                   ('missions.related_request_id'),
                   ('missions.request_invitation_id'),
                   ('missions.title'),
                   ('missions.status'),
                   ('missions.total_amount'),
                   ('user_reports.reporter_id'),
                   ('user_reports.target_user_id'),
                   ('user_reports.reason'),
                   ('user_reports.details'),
                   ('user_reports.status'),
                   ('conversations.started_by'),
                   ('conversations.context_mode'),
                   ('messages.conversation_id'),
                   ('messages.sender_id'),
                   ('messages.content'),
                   ('messages.is_read')
               ) AS needed(item)
               WHERE NOT EXISTS (
                   SELECT 1
                   FROM information_schema.columns c
                   WHERE c.table_schema = 'public'
                     AND c.table_name = split_part(item, '.', 1)
                     AND c.column_name = split_part(item, '.', 2)
               )
           ),
           'aucune colonne manquante',
           CASE
               WHEN EXISTS (
                   SELECT 1
                   FROM (VALUES
                       ('quotes','version'), ('quotes','status'), ('quotes','requester_id'),
                       ('quotes','provider_id'), ('quotes','total_amount'), ('quotes','request_id'),
                       ('quotes','request_invitation_id'), ('milestones','display_order'),
                       ('milestones','status'), ('payments','milestone_id'),
                       ('missions','request_invitation_id'), ('missions','title'),
                       ('user_reports','reporter_id'), ('messages','content')
                   ) AS required(table_name, column_name)
                   WHERE NOT EXISTS (
                       SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema = 'public'
                         AND c.table_name = required.table_name
                         AND c.column_name = required.column_name
                   )
               ) THEN 'BLOQUANT'
               ELSE 'OK'
           END,
           'La première colonne liste uniquement les manques. Vide et OK signifie que les colonnes du script existent.'
    UNION ALL
    SELECT 110, 'dépendances', 'fonctions storage',
           (
               SELECT string_agg(name, ', ' ORDER BY name)
               FROM (VALUES ('foldername'), ('filename'), ('extension')) AS needed(name)
               WHERE to_regprocedure('storage.' || name || '(text)') IS NULL
           ),
           'storage.foldername(text), storage.filename(text), storage.extension(text)',
           CASE
               WHEN to_regprocedure('storage.foldername(text)') IS NULL
                 OR to_regprocedure('storage.filename(text)') IS NULL
                 OR to_regprocedure('storage.extension(text)') IS NULL
               THEN 'BLOQUANT'
               ELSE 'OK'
           END,
           'Les preuves de signalement découpent le chemin avec ces trois fonctions.'
    UNION ALL
    SELECT 120, 'dépendances', 'index unique des missions actives',
           CASE
               WHEN EXISTS (
                   SELECT 1 FROM pg_indexes
                   WHERE schemaname = 'public'
                     AND indexname = 'idx_missions_unique_active_invitation'
               ) THEN 'présent'
               ELSE 'absent'
           END,
           'présent',
           CASE
               WHEN EXISTS (
                   SELECT 1 FROM pg_indexes
                   WHERE schemaname = 'public'
                     AND indexname = 'idx_missions_unique_active_invitation'
               ) THEN 'OK'
               ELSE 'RISQUE'
           END,
           'Sans cet index, deux acceptations simultanées ne sont plus arrêtées par une contrainte unique.'
    UNION ALL
    SELECT 130, 'données', 'signalements ouverts en double',
           (SELECT n::text FROM open_report_dupes),
           '0',
           CASE WHEN (SELECT n FROM open_report_dupes) > 0 THEN 'BLOQUANT' ELSE 'OK' END,
           '51_52 crée un index unique sur les signalements OPEN ou IN_REVIEW. Un nombre supérieur à 0 annule toute la transaction.'
    UNION ALL
    SELECT 140, 'données', 'devis dont la version est déjà supérieure à 1',
           (SELECT count(*)::text FROM public.quotes WHERE COALESCE(version, 1) > 1),
           '0 avant l activation de la revision',
           'INFORMATION',
           'Ces devis ne sont pas modifies par le script. L ancienne application ne pourra plus les accepter apres 51_52.'
    UNION ALL
    SELECT 150, 'fonctions créées', 'objets que 51_52 va créer ou remplacer',
           (
               SELECT string_agg(name || '=' || state, ', ' ORDER BY name)
               FROM (
                   SELECT name,
                          CASE kind
                              WHEN 'function' THEN
                                  CASE WHEN to_regprocedure(signature) IS NULL THEN 'absent' ELSE 'déjà présent' END
                              ELSE
                                  CASE WHEN to_regclass(signature) IS NULL THEN 'absent' ELSE 'déjà présent' END
                          END AS state
                   FROM (VALUES
                       ('refuse_blocked_new_participant', 'function', 'public.refuse_blocked_new_participant()'),
                       ('submit_user_report', 'function', 'public.submit_user_report(uuid, text, text, uuid, text)'),
                       ('revise_sent_quote', 'function', 'public.revise_sent_quote(uuid, text, timestamptz, jsonb, integer)'),
                       ('refuse_blocked_commercial_write', 'function', 'public.refuse_blocked_commercial_write()'),
                       ('accept_request_quote_v2', 'function', 'public.accept_request_quote(uuid, integer)'),
                       ('report_evidence', 'table', 'public.report_evidence'),
                       ('quote_revisions', 'table', 'public.quote_revisions')
                   ) AS created(name, kind, signature)
               ) s
           ),
           'tous absents, sauf accept_request_quote à un argument',
           CASE
               WHEN to_regprocedure('public.revise_sent_quote(uuid, text, timestamptz, jsonb, integer)') IS NOT NULL
                 OR to_regprocedure('public.submit_user_report(uuid, text, text, uuid, text)') IS NOT NULL
                 OR to_regprocedure('public.accept_request_quote(uuid, integer)') IS NOT NULL
               THEN 'INFORMATION'
               ELSE 'OK'
           END,
           'Un objet deja present sera remplace si c est une fonction, ou laisse tel quel si c est une table creee avec IF NOT EXISTS.'
) checks
ORDER BY ordre;

-- ---------------------------------------------------------------------------
-- 2. Définition et droits de accept_request_quote
-- ---------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS resultat,
       p.prosecdef AS security_definer,
       p.proconfig AS search_path,
       COALESCE((
           SELECT string_agg(
               r.rolname || CASE WHEN has_function_privilege(r.oid, p.oid, 'EXECUTE') THEN '=EXECUTE' ELSE '=non' END,
               ', ' ORDER BY r.rolname
           )
           FROM pg_roles r
           WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'public')
       ), '') AS droits,
       (p.prosrc ILIKE '%for update%') AS verrou_ligne,
       (p.prosrc ILIKE '%requester_id%') AS controle_demandeur,
       (p.prosrc ILIKE '%sent%') AS controle_statut,
       (p.prosrc ILIKE '%valid_until%') AS controle_expiration,
       (p.prosrc ILIKE '%is_blocked_between%') AS controle_blocage,
       (p.prosrc ILIKE '%version%') AS controle_version,
       (p.prosrc ILIKE '%unique_violation%' OR p.prosrc ILIKE '%idx_missions_unique_active_invitation%') AS garde_mission_unique,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accept_request_quote'
ORDER BY arguments;

-- ---------------------------------------------------------------------------
-- 3. Déclencheur de blocage des messages
-- ---------------------------------------------------------------------------
SELECT c.relname AS table_name,
       t.tgname AS trigger_name,
       CASE t.tgenabled
           WHEN 'O' THEN 'actif'
           WHEN 'D' THEN 'désactivé'
           WHEN 'R' THEN 'réplica seulement'
           WHEN 'A' THEN 'toujours'
           ELSE t.tgenabled::text
       END AS etat,
       pg_get_triggerdef(t.oid) AS definition_declencheur,
       p.proname AS fonction,
       p.prosecdef AS security_definer,
       (p.prosrc ILIKE '%current_user <> ''authenticated''%') AS saute_le_role_service,
       (p.prosrc ILIKE '%conversation_has_block_for%') AS appelle_conversation_has_block_for,
       pg_get_functiondef(p.oid) AS definition_fonction
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_trigger t
       ON t.tgrelid = c.oid
      AND NOT t.tgisinternal
      AND t.tgname = 'trg_refuse_message_between_blocked_users'
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'messages';

-- ---------------------------------------------------------------------------
-- 4. Dépendances et contraintes qui peuvent faire échouer la transaction
-- ---------------------------------------------------------------------------
SELECT 'contrainte milestones.status' AS element,
       COALESCE(pg_get_constraintdef(con.oid), 'absente') AS constate
FROM (SELECT 1) AS anchor
LEFT JOIN pg_constraint con
       ON con.conrelid = 'public.milestones'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
UNION ALL
SELECT 'contrainte quotes.status',
       COALESCE((
           SELECT string_agg(pg_get_constraintdef(con.oid), ' | ')
           FROM pg_constraint con
           WHERE con.conrelid = 'public.quotes'::regclass
             AND con.contype = 'c'
             AND pg_get_constraintdef(con.oid) ILIKE '%status%'
       ), 'absente')
UNION ALL
SELECT 'index ' || indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'missions'
  AND indexdef ILIKE '%unique%'
UNION ALL
SELECT 'colonnes user_reports ajoutées par 51',
       COALESCE((
           SELECT string_agg(column_name, ', ' ORDER BY column_name)
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'user_reports'
             AND column_name IN ('conversation_id', 'source')
       ), 'absentes, elles seront ajoutées');

-- ---------------------------------------------------------------------------
-- 5. Définitions à comparer au dépôt, sans les remplacer
-- ---------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       md5(pg_get_functiondef(p.oid)) AS empreinte,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'get_or_create_conversation',
      'is_blocked_between',
      'conversation_has_block_for',
      'refuse_message_between_blocked_users',
      'is_current_user_admin'
  )
ORDER BY p.proname, arguments;
