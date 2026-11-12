-- LYANN — contrôle de sécurité LECTURE SEULE pour Production (gzispjfoywklpqatjyop)
-- NON EXÉCUTÉ. Nécessite une autorisation distincte et explicite du propriétaire.
-- Aucune écriture, aucun appel de fonction cible : uniquement des lectures du catalogue.
-- Exécuter dans une session en lecture seule : SET default_transaction_read_only = on;

-- 1. Les trois fonctions existent-elles, quelle est leur ACL ?
SELECT p.oid::regprocedure AS fn,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS config,
       p.proacl::text AS acl,
       md5(pg_get_functiondef(p.oid)) AS body_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('lyann_insert_notification', 'lyann_pair_conversation', 'lyann_ensure_support_welcome')
ORDER BY p.oid::regprocedure::text;

-- 2. Droits effectifs (verdict direct : true = vulnérable)
SELECT p.oid::regprocedure AS fn,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('lyann_insert_notification', 'lyann_pair_conversation', 'lyann_ensure_support_welcome');

-- 3. Cause probable : privilèges par défaut du schéma public
SELECT pg_get_userbyid(defaclrole) AS creator, defaclnamespace::regnamespace AS ns, defaclobjtype, defaclacl::text
FROM pg_default_acl;

-- 4. Autres fonctions SECURITY DEFINER de public exécutables par anon (généralise la recherche)
SELECT p.oid::regprocedure AS fn, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.oid::regprocedure::text;

-- 5. Politique d'insertion permissive sur conversations (voie alternative constatée sur Staging)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('conversations', 'conversation_participants', 'notifications')
ORDER BY tablename, policyname;
