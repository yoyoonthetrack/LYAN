-- LYANN 99 — consultation catalogue Staging uniquement.
-- Projet attendu : tdktfbtqceldlaeqjtow
-- Projet interdit : gzispjfoywklpqatjyop
--
-- SELECT seulement. Aucune écriture, aucun DDL, aucun GRANT.
-- À coller dans le SQL Editor du projet Staging, pas dans Production.
-- Avant d'exécuter : l'URL doit contenir tdktfbtqceldlaeqjtow
-- et ne doit pas contenir gzispjfoywklpqatjyop.
-- Si une ligne d'identité contient le projet interdit, s'arrêter.

-- 1. Identité de la session
SELECT
    'tdktfbtqceldlaeqjtow' AS expected_project_ref,
    'gzispjfoywklpqatjyop' AS forbidden_project_ref,
    current_database() AS database_name,
    current_user,
    session_user,
    inet_server_addr() AS server_addr,
    inet_server_port() AS server_port,
    current_setting('server_version') AS server_version;

SELECT
    pid,
    usename::text AS usename,
    application_name,
    datname,
    client_addr
FROM pg_stat_activity
WHERE pid = pg_backend_pid();

SELECT name, setting
FROM pg_settings
WHERE setting ILIKE '%tdktfbtqceldlaeqjtow%'
   OR setting ILIKE '%gzispjfoywklpqatjyop%';

-- 2. Schémas, rôles, appartenances
SELECT nspname, pg_get_userbyid(nspowner) AS owner
FROM pg_namespace
WHERE nspname IN ('public', 'private', 'auth')
ORDER BY nspname;

SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname IN (
    'anon', 'authenticated', 'authenticator', 'service_role',
    'postgres', 'supabase_admin'
)
ORDER BY rolname;

SELECT
    member.rolname AS member,
    role.rolname AS member_of
FROM pg_auth_members link
JOIN pg_roles member ON member.oid = link.member
JOIN pg_roles role ON role.oid = link.roleid
WHERE member.rolname IN (
        'anon', 'authenticated', 'authenticator', 'service_role',
        'postgres', 'supabase_admin'
    )
   OR role.rolname IN (
        'anon', 'authenticated', 'authenticator', 'service_role',
        'postgres', 'supabase_admin'
    )
ORDER BY member.rolname, role.rolname;

-- 3. Tables concernées : présence, propriétaire, ACL
SELECT
    c.relname,
    c.relkind,
    pg_get_userbyid(c.relowner) AS owner,
    c.relacl::text AS acl,
    c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'quotes', 'milestones', 'payments', 'missions', 'messages',
      'notifications', 'push_deliveries', 'system_settings', 'profiles',
      'quote_revisions', 'quote_amendments', 'request_invitations',
      'conversation_participants'
  )
ORDER BY c.relname;

SELECT
    c.relname,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
    acl.privilege_type,
    acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
WHERE n.nspname = 'public'
  AND c.relname IN (
      'quotes', 'milestones', 'payments', 'missions', 'messages',
      'notifications', 'push_deliveries'
  )
  AND (
      acl.grantee = 0
      OR grantee.rolname IN ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
  )
ORDER BY c.relname, grantee, acl.privilege_type;

-- 4. Droits effectifs des rôles applicatifs
SELECT
    r.rolname,
    c.relname,
    privilege.priv,
    has_table_privilege(r.oid, c.oid, privilege.priv) AS allowed
FROM pg_roles r
CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privilege(priv)
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND n.nspname = 'public'
  AND c.relname IN ('quotes', 'milestones', 'payments', 'missions', 'messages')
ORDER BY c.relname, r.rolname, privilege.priv;

-- 5. Triggers existants
SELECT
    c.relname AS table_name,
    t.tgname,
    t.tgenabled,
    p.proname AS function_name,
    pg_get_userbyid(p.proowner) AS function_owner,
    pg_get_triggerdef(t.oid, true) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND c.relname IN ('quotes', 'milestones', 'payments', 'missions', 'messages', 'notifications')
ORDER BY c.relname, t.tgname;

-- 6. Contraintes
SELECT
    c.relname AS table_name,
    con.conname,
    con.contype,
    pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('quotes', 'milestones', 'payments', 'messages', 'missions')
ORDER BY c.relname, con.conname;

-- 7. Index uniques partiels que la migration 99 remplace
SELECT
    c.relname AS table_name,
    i.relname AS index_name,
    ix.indisunique,
    pg_get_indexdef(ix.indexrelid) AS definition
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class c ON c.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('messages', 'payments', 'quotes', 'milestones')
  AND (
      ix.indisunique
      OR i.relname ILIKE '%timeline%'
      OR i.relname ILIKE '%quote_updated%'
      OR i.relname ILIKE '%payment%'
  )
ORDER BY c.relname, i.relname;

-- 8. Fonctions : présentes, absentes, propriétaire, droits
SELECT expected.name,
       EXISTS (
           SELECT 1
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = expected.name
       ) AS present
FROM (VALUES
    ('lyann_insert_timeline_event'),
    ('lyann_quote_timeline'),
    ('lyann_notify_quote_push'),
    ('lyann_notify_on_message'),
    ('lyann_enqueue_push_from_notification'),
    ('revise_sent_quote'),
    ('lyann_timeline_claim'),
    ('lyann_conversation_for_quote'),
    ('lyann_pref_enabled'),
    ('lyann_insert_notification'),
    ('lyann_support_user_id'),
    ('is_blocked_between'),
    ('accept_request_quote'),
    ('start_mission_secure'),
    ('cancel_mission_secure'),
    ('validate_milestone_secure'),
    ('create_milestone_payment_secure'),
    ('lyann_mission_cap_eur'),
    ('lyann_mission_prestation_cap_eur'),
    ('lyann_money_cents'),
    ('lyann_assert_prestation_cap'),
    ('lyann_guard_quote_cap'),
    ('lyann_guard_milestone_money'),
    ('lyann_assert_quote_milestone_bounds'),
    ('lyann_guard_quote_bounds'),
    ('lyann_guard_milestone_sum'),
    ('lyann_skip_legacy_system_card'),
    ('lyann_record_mission_transition'),
    ('withdraw_sent_quote'),
    ('propose_quote_amendment'),
    ('accept_quote_amendment'),
    ('lyann_lock_quote_payment_rows'),
    ('lyann_refuse_paid_amendment'),
    ('lyann_insert_milestone_payment'),
    ('lyann_guard_payment_insert')
) AS expected(name)
ORDER BY expected.name;

SELECT
    p.oid::regprocedure::text AS signature,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.proconfig AS config,
    p.proacl::text AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'lyann_insert_timeline_event',
      'lyann_quote_timeline',
      'lyann_notify_quote_push',
      'lyann_notify_on_message',
      'lyann_enqueue_push_from_notification',
      'revise_sent_quote',
      'lyann_timeline_claim',
      'lyann_conversation_for_quote',
      'lyann_pref_enabled',
      'lyann_insert_notification',
      'lyann_support_user_id',
      'is_blocked_between',
      'accept_request_quote',
      'start_mission_secure',
      'cancel_mission_secure',
      'validate_milestone_secure',
      'create_milestone_payment_secure',
      'lyann_mission_cap_eur',
      'lyann_mission_prestation_cap_eur',
      'lyann_money_cents',
      'lyann_insert_milestone_payment',
      'lyann_guard_payment_insert',
      'lyann_refuse_paid_amendment'
  )
ORDER BY signature;

SELECT
    p.oid::regprocedure::text AS signature,
    r.rolname,
    has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
WHERE n.nspname = 'public'
  AND p.proname IN (
      'lyann_insert_timeline_event',
      'lyann_quote_timeline',
      'lyann_notify_quote_push',
      'lyann_notify_on_message',
      'lyann_enqueue_push_from_notification',
      'revise_sent_quote',
      'lyann_timeline_claim',
      'lyann_conversation_for_quote',
      'lyann_pref_enabled',
      'lyann_insert_notification',
      'lyann_support_user_id',
      'is_blocked_between',
      'accept_request_quote',
      'start_mission_secure',
      'cancel_mission_secure',
      'validate_milestone_secure',
      'create_milestone_payment_secure',
      'lyann_mission_prestation_cap_eur',
      'lyann_money_cents',
      'withdraw_sent_quote',
      'propose_quote_amendment',
      'accept_quote_amendment',
      'lyann_insert_milestone_payment',
      'lyann_guard_payment_insert'
  )
ORDER BY signature, r.rolname;

-- 9. Définitions des fonctions remplacées ou qui écrivent un paiement
SELECT
    p.oid::regprocedure::text AS signature,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'lyann_insert_timeline_event',
      'lyann_quote_timeline',
      'lyann_notify_quote_push',
      'lyann_notify_on_message',
      'lyann_enqueue_push_from_notification',
      'revise_sent_quote',
      'create_milestone_payment_secure',
      'accept_request_quote',
      'start_mission_secure',
      'cancel_mission_secure',
      'validate_milestone_secure'
  )
ORDER BY signature;

-- 10. ACL explicite et propriétaire de create_milestone_payment_secure(uuid)
SELECT
    p.oid::regprocedure::text AS signature,
    r.rolname AS owner,
    p.proacl::text AS explicit_acl,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'create_milestone_payment_secure'
  AND pg_get_function_identity_arguments(p.oid) = 'uuid';

-- 11. Doublons qui empêcheraient les index de la migration 99
SELECT 'timeline_event' AS index_name, entity_type, entity_id::text, message_type, NULL AS version, count(*) AS copies
FROM public.messages
WHERE entity_id IS NOT NULL
  AND message_type IS NOT NULL
  AND message_type NOT IN (
      'text', 'photo', 'document', 'visit_proposed', 'visit_rescheduled', 'system', 'quote_updated'
  )
GROUP BY entity_type, entity_id, message_type
HAVING count(*) > 1
UNION ALL
SELECT 'quote_updated_version', NULL, entity_id::text, message_type, COALESCE(metadata->>'version', ''), count(*)
FROM public.messages
WHERE message_type = 'quote_updated'
  AND entity_id IS NOT NULL
GROUP BY entity_id, message_type, COALESCE(metadata->>'version', '')
HAVING count(*) > 1;
