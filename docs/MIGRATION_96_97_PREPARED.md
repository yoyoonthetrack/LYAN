# Phase 3.2C-5.2 — Migrations 96 et 97 préparées (NON appliquées)

Staging uniquement. Production : aucun appel.

## 96 — politique « Users can insert conversations »

Fichiers : `96_conversations_insert_policy_lockdown_staging.sql` (sha256 `af5a85db…`), `96_conversations_insert_policy_lockdown_rollback.sql` (sha256 `80be9615…`), sauvegarde `artifacts/phase-3-2c/backup96/`.

### Analyse

- Deux politiques INSERT PERMISSIVE pour `{public}` sur `public.conversations` : « No direct insert on conversations for standard users » (`WITH CHECK is_current_user_admin()`, migration 02, la règle voulue) et « Users can insert conversations » (`WITH CHECK true`, issue de `schema.sql`, jamais retirée). Les politiques permissives s'additionnent : la seconde annule la première.
- GRANT effectifs : anon et authenticated ont tous les droits de table (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE) et INSERT sur chacune des six colonnes. C'est le réglage par défaut de Supabase : seule la RLS limite. Pas de politique UPDATE ni DELETE : ces opérations sont refusées. TRUNCATE ignore la RLS mais PostgREST ne l'expose pas.
- Insertion directe par REST : constatée par sonde en rôle `anon` et `authenticated` (transaction annulée) : `INSERT INTO conversations (started_by, context_mode)` réussit, y compris avec `started_by` d'un autre membre (usurpation du champ). Avec `Prefer: return=representation` la lecture du retour échouerait, la politique SELECT exigeant d'être participant (non testé).
- Autres politiques : `conversation_participants` INSERT réservé aux administrateurs, `messages` INSERT réservé aux participants avec `sender_id = auth.uid()`, `notifications` sans INSERT pour les membres. La ligne créée reste donc orpheline, illisible, mais elle peut être créée sans limite, avec un `started_by` forgé et un `mission_id` existant (clé étrangère). Elle fausse les comptes côté admin (`api/admin-control-center.js` compte `conversations`).
- Créations légitimes : `get_or_create_conversation` et `lyann_pair_conversation` (seules fonctions qui insèrent dans `conversations`), toutes deux `SECURITY DEFINER` propriétaire `postgres` ; `open_direct_conversation`, `lyann_open_support_conversation`, `lyann_ensure_support_welcome`, `initiate_lyann_help_conversation` passent par elles ; le serveur utilise service_role. Tous contournent la RLS.
- Blocage entre membres : appliqué par `trg_refuse_blocked_new_participant` et `trg_refuse_message_between_blocked_users`, indépendant de la politique retirée. Sonde : comportement identique avant et après.
- Anciens clients iOS et Android : le code web, le paquet TestFlight 15 et le paquet 16 ne font que `select` sur `conversations` (`messaging-repository.js`). Aucun ne l'insère. Aucun impact attendu.
- Administrateurs : conservent l'INSERT direct.

### Correctif

`DROP POLICY "Users can insert conversations" ON public.conversations;`, rien d'autre. Assertions avant : politique présente avec `WITH CHECK true`, politique administrateur présente, RLS active. Assertions après : plus aucune politique INSERT inconditionnelle, exactement une politique INSERT. Retour arrière : recrée la politique à l'identique (`FOR INSERT TO public WITH CHECK (true)`).

### Preuves

- Test local PGlite `tests/conversations-insert-policy-lockdown-sql.test.js` : dérive reproduite, 96 appliquée (anon et membre refusés, y compris `started_by` usurpé), chemin `SECURITY DEFINER`, service_role et administrateur intacts, retour arrière exact, refus d'appliquer si la politique attendue est absente.
- Répétition sur Staging, intégralement annulée (`probe_apply96.sql`) : assertions de 96 réussies, une seule politique retirée, anon et membre refusés (`42501`), administrateur et service_role OK, flux légitimes OK, notification créée, blocage inchangé, **retour arrière exact** (empreinte des politiques identique). Les empreintes vivantes sont identiques avant et après (la politique est toujours présente).

Application durable : **non faite**, autorisation distincte requise.

## 97 — privilèges EXECUTE par défaut (futures fonctions)

Fichiers : `97_default_function_privileges_lockdown_staging.sql` (sha256 `115edbdb…`), `97_default_function_privileges_lockdown_rollback.sql` (sha256 `02d0a5a9…`). **Non appliquée et non répétée sur Staging.**

### Cause (lecture du catalogue Staging)

Une fonction créée par `postgres` dans `public` reçoit l'union de deux choses :
1. le défaut intégré de PostgreSQL : EXECUTE pour PUBLIC ;
2. le défaut de schéma de `pg_default_acl` (`postgres`, `public`, `f`) : EXECUTE pour anon, authenticated, service_role.

Il n'existe aucune entrée par défaut globale. Les migrations 39 et 40 ne retiraient que PUBLIC fonction par fonction. Un `REVOKE … IN SCHEMA public` ne peut retirer que (2) ; (1) exige la forme globale. Preuve PGlite : avec seulement la forme `IN SCHEMA`, une nouvelle fonction garde `=X/postgres` (PUBLIC).

### Correctif préparé

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

plus la même règle pour `supabase_admin` si le rôle l'autorise (sinon notice, sans erreur). Une nouvelle fonction obtient `{postgres, service_role}`. Les fonctions existantes ne changent pas.

Conséquences à connaître avant application :
- toute future RPC doit recevoir un `GRANT EXECUTE … TO authenticated` explicite (et `anon` seulement pour les visiteurs) ;
- les fonctions évaluées avec le rôle appelant (aides de politiques RLS, valeurs par défaut de colonnes, vues) ont besoin de ce GRANT ;
- la forme globale s'applique aussi aux fonctions créées par `postgres` dans d'autres schémas, par exemple une future extension dans `extensions` : à vérifier par une répétition annulée sur Staging avant d'appliquer. Non vérifié ici ;
- la possibilité pour `postgres` de modifier les défauts de `supabase_admin` n'est pas vérifiée.

Tests : `tests/conversations-insert-policy-lockdown-sql.test.js` (PGlite) : nouvelle fonction exposée avant, `{postgres, service_role}` après, fonction existante inchangée, GRANT explicite fonctionnel, `pg_default_acl` identique après retour arrière.

## Constat connexe, hors périmètre de 95, 96 et 97

Sur Staging, 114 des 185 fonctions de `public` sont exécutables par anon, dont 57 `SECURITY DEFINER`. Beaucoup sont des RPC légitimes avec contrôle `auth.uid()` (celles examinées ici le sont), mais elles n'ont pas été auditées. Ce n'est pas un audit : c'est un décompte. À traiter par une phase dédiée, avec autorisation.
