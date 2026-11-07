# `requests` : retrait des privilèges structurels (Staging, migration 91)

Projet : Supabase Staging `tdktfbtqceldlaeqjtow` (`Lyann-staging-v2`). Jamais Production.
Fichiers : `91_requests_dangerous_privileges_staging.sql`, `91_requests_dangerous_privileges_rollback.sql`,
`tests/rls/requests-privileges-check.sql` (rôles réels, annulé par exception), `tests/rls/requests-privileges-local-check.js` (PGlite).

## Pourquoi
La RLS filtre les lignes pour SELECT, INSERT, UPDATE et DELETE. Elle ne protège pas contre `TRUNCATE`, qui vide la table sans
passer par une politique. `TRIGGER` et `REFERENCES` sont des privilèges de structure. Sur Staging, `anon` et `authenticated`
les avaient par les privilèges par défaut de Supabase (ACL `arwdDxtm` : insert, select, update, delete, truncate, references, trigger, maintain).

## Préflight (lecture seule, Staging)
- Aucun rôle hérité ni `PUBLIC` ne donne ces privilèges : `anon` et `authenticated` les avaient directement. `authenticator` ne les a pas
  (il n'hérite pas de `anon` ni de `authenticated`). Aucun privilège de colonne.
- Aucune fonction ne contient `TRUNCATE`, aucune fonction n'exécute de DDL sur `requests`, aucun cron (`pg_cron` absent).
- Les 7 triggers de `requests` et leurs fonctions appartiennent à `postgres`. Un trigger se déclenche sans que l'utilisateur ait `TRIGGER`.
- Les 6 clés étrangères vers `requests` appartiennent à `postgres`. `REFERENCES` n'est requis qu'à la création d'une clé étrangère.
- Le code du dépôt n'exécute `TRUNCATE` que sur `public.timeline_check_results` (`tests/sql/45_chat_timeline_checks.sql`), jamais sur `requests`.

Conclusion : aucune dépendance légitime. Les clients passent par PostgREST (SELECT, INSERT, UPDATE, DELETE), le serveur par `service_role`.

## Correction
`REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.requests FROM PUBLIC, anon, authenticated;` dans une transaction, avec :
- préconditions : migration 90 en place (une seule politique SELECT, pour `authenticated`, `anon` sans SELECT) ;
- instantanés avant : toutes les politiques de la table, tous les autres privilèges de toutes les entités (PUBLIC compris) ;
- postconditions : plus aucun des trois privilèges effectifs (direct, hérité, PUBLIC, colonne) pour `anon`, `authenticated`, `authenticator` ;
  `service_role` et `postgres` les gardent ; les autres privilèges et toutes les politiques sont identiques à l'instantané.

Hors changement : SELECT, INSERT, UPDATE, DELETE, MAINTAIN, les politiques, `service_role`, `postgres`, les autres tables.

## Risques restants, non traités dans cette phase
1. **Autres tables.** Avant cette phase, 55 relations du schéma `public` donnaient TRUNCATE à `anon` et 59 à `authenticated`. Après la migration 91, il en reste 54 et 58 (dont `profiles`, `messages`, `missions`, `quotes`,
   `conversations`, `notifications`, `request_invitations`, `admin_*`). Même défaut, mêmes conséquences, pas d'usage légitime. La migration 67 a
   déjà traité neuf tables. À traiter dans une phase dédiée, table par table, avec le même gabarit.
2. **Privilèges par défaut.** `ALTER DEFAULT PRIVILEGES` donne `arwdDxtm` à `anon` et `authenticated` sur toute nouvelle table de `public`. Une future table (`request_locations`)
   naîtra avec TRUNCATE, TRIGGER, REFERENCES. Il faudra les retirer dans la migration qui la crée.
3. **MAINTAIN** (PostgreSQL 17) reste accordé à `anon` et `authenticated` : il permet notamment `LOCK TABLE`. Non exposé par PostgREST. Hors périmètre demandé.
4. **Colonnes internes lisibles par les membres** (`internal_tags`, `classification_confidence`, `safety_status`, etc.) sur les lignes qu'ils peuvent lire. Demande un passage à des listes de colonnes côté code.
5. **`get_user_trust_and_reputation`** reste exécutable par `anon`. Elle ne renvoie aucune ligne de `requests`, seulement le top 3 des catégories des missions terminées d'un prestataire.
6. **Alertes** : `matching_dispatches` est vide sur Staging, le parcours d'alerte n'est pas testé avec données.
7. **Production** n'a pas été auditée.

## Rollback
`91_requests_dangerous_privileges_rollback.sql` redonne les trois privilèges. Il rétablit l'exposition : à n'utiliser que si une dépendance légitime est prouvée.
