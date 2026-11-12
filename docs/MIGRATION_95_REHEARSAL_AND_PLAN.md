# Phase 3.2C-5.1 — Migration 95 : répétition annulée, validation et plan (Staging)

Statut : **répétition réussie, migration 95 NON appliquée durablement**.
Projet : `tdktfbtqceldlaeqjtow` (Staging). Production : aucun appel. Aucun déploiement.
Commit de départ : `4eef59d79fdb68df3c4c9d383c7ea78db70eec2a`.
Fichiers : `95_internal_helper_rpc_lockdown_staging.sql` (sha256 `c5fe97cf…5023c`), `95_internal_helper_rpc_lockdown_rollback.sql` (sha256 `776306be…96f90`).

## 1. Préflight

- Identité : le projet interrogé est `tdktfbtqceldlaeqjtow`, jamais `gzispjfoywklpqatjyop`.
- Sauvegarde : `artifacts/phase-3-2c/backup95/` (ACL et md5 des corps des trois fonctions, privilèges par défaut, copies du SQL, `SHA256SUMS`).
- Empreintes de base (six sections) : col_acl `b75213796e1bbcc6abea7c72256f50a5`, data `50f8507d336b58f579bcc68a6101cb84`, fn_acl `21a4ccdbc6dfbf0f66d0a3a7d7cd6bd5`, policies `7b87e80cfabaff84de5311db5335de14`, rel_acl `b73a110ef62de84d7d6111e3907ac95e`, views `6144ae1e8b4985e5a25eb4e5fd7f24e2`.

## 2. Fonctions : permissions et dépendances

| Fonction | EXECUTE avant | EXECUTE après 95 |
|---|---|---|
| `lyann_insert_notification(uuid,text,text,text,text,text)` | anon, authenticated, service_role | postgres, service_role |
| `lyann_pair_conversation(uuid,uuid)` | idem | idem |
| `lyann_ensure_support_welcome(uuid)` | idem | idem |

SECURITY DEFINER, propriétaire `postgres`, `search_path=public`, aucun contrôle d'identité.
Cause : les privilèges par défaut (`pg_default_acl`, postgres et supabase_admin sur `public`) donnent EXECUTE à anon et authenticated à toute nouvelle fonction. `REVOKE … FROM PUBLIC` (migrations 39 et 40) ne les retire pas.
Appelants légitimes : serveur via `supabaseAdmin` (service_role) ; fonctions SECURITY DEFINER propriétaires `postgres` (`lyann_notify_*`, `lyann_open_support_conversation`, `lyann_send_welcome_message`). Aucun appel navigateur. Ces appelants gardent leur accès : le propriétaire et service_role ont toujours EXECUTE.

## 3. Répétition transactionnelle

Un bloc `DO` unique : application de 95, sondes par rôle (`SET LOCAL ROLE` et `request.jwt.claims`), puis rollback exact, terminé par `RAISE EXCEPTION 'REHEARSAL95_REPORT …'`. Aucune notification externe : l'enqueue de push est interne (`push_deliveries`), sans `net.http`, et rien n'a été validé.

| Sonde | Résultat |
|---|---|
| anon appelle les trois fonctions après 95 | refusé (42501) |
| authenticated appelle les trois fonctions après 95 | refusé (42501) |
| service_role appelle les trois fonctions | autorisé |
| conversation de support d'un membre | OK |
| `get_or_create_conversation`, `open_direct_conversation` | OK |
| chaîne message → déclencheur → notification | OK |
| INSERT direct dans `notifications` et `conversation_participants` (membre) | refusé par la RLS |
| RPC gardées (anon) | « Non authentifié » |
| seule la section fn_acl change à l'application | oui |
| rollback exact | oui |

Dans la transaction : messages +1, conversations +1, notifications +2, push_deliveries +1, tous annulés.

## 4. Preuve de retour arrière

Empreinte fn_acl : `21a4ccdb…` (avant) → `b81c68fc…` (après application) → `21a4ccdb…` (après rollback interne). Policies inchangées par l'application.
Contrôle sur la base vivante après la répétition : **les six empreintes sont identiques à la base de départ**, donc aucune donnée historique modifiée et rien de durable. Les valeurs de séquences ont pu avancer (sans conséquence).

## 5. Tests

- `tests/internal-helper-rpc-lockdown-sql.test.js` : 2/2 (PGlite : reproduction de la dérive, application, appelant SECURITY DEFINER intact, rollback exact).
- Compatibilité : conversations et messages existants, notifications légitimes, ouverture depuis un profil, support et helpdesk, blocages, anciens clients iOS et Android (aucun n’appelle ces fonctions), RLS existante (policies inchangées).
- À rejouer après application durable : sondes de rôle et `visitor_data_lock` avec `LYANN_E2E_EXPECT_MIGRATION_94=1`.

## 6. Risques résiduels

1. **Voie alternative préexistante, non corrigée** : la politique PERMISSIVE « Users can insert conversations » (INSERT, public, `WITH CHECK true`) laisse un visiteur créer des conversations vides orphelines (pas de participant, pas de message, pas de notification). Le correctif 95 ne la couvre pas. À traiter par une migration séparée, à autoriser.
2. D'autres fonctions SECURITY DEFINER de `public` peuvent présenter la même dérive des privilèges par défaut. La recherche générale (requête 4 du fichier de contrôle) est à faire sur Staging puis, avec autorisation, sur Production. Une correction durable serait de retirer les privilèges par défaut d'anon dans `public`, ce qui est plus large que 95 et exige sa propre répétition.
3. Fonctions futures : sans changement des privilèges par défaut, toute nouvelle fonction réintroduit la dérive.
4. Tant que 95 n'est pas appliquée, la vulnérabilité reste ouverte sur Staging, et un déploiement `--prod` y active le cron `push-drain` chaque minute (voir §8).

## 7. Plan d'application définitif (après autorisation explicite)

1. Vérifier l'identité (`tdktfbtqceldlaeqjtow`) et rejouer les six empreintes.
2. Un seul `BEGIN … COMMIT` avec `95_internal_helper_rpc_lockdown_staging.sql` (garde-fous de signature et post-conditions `has_function_privilege` intégrés).
3. Nouvelle connexion : `has_function_privilege` anon, authenticated (faux) et service_role (vrai) ; empreintes : seule fn_acl change.
4. Rejouer les sondes de rôle et `visitor_data_lock`.
5. En cas d'écart : `95_internal_helper_rpc_lockdown_rollback.sql` (ACL d'origine exacte).
6. Rapport d'application et commit. Pas de déploiement ni de Production dans cette étape.

## 8. Vercel : Preview isolée et domaine stable (lecture seule)

Constats (CLI en lecture, noms de variables seulement, aucune valeur lue, aucun déploiement) :

- Projet lié : `yoyo-d85d/lyann-staging-preview` (`prj_FHIKUKYa8IwpiitigUma4gTtTF6q`). Le projet Production `lyan` n'est pas utilisé.
- `scripts/deploy-staging.sh` exige `LYANN_AUTHORIZE_STAGING_DEPLOY=1`, passe la porte `vercel-target-gate.js`, le préflight, puis déploie avec `--prod`. Dans ce projet, `--prod` cible l'environnement « Production » de `lyann-staging-preview`, c'est-à-dire **le domaine stable `staging.lyann.app`**, pas le projet `lyan`.
- Les derniers déploiements du projet : trois « Production » (24 h, 1 j, 2 j) et plusieurs « Preview » (8 à 12 j). Les deux modes ont donc déjà servi.

| | Preview isolée | `--prod` (domaine stable) |
|---|---|---|
| URL | `lyann-staging-preview-<hash>-yoyo-d85d.vercel.app` | `staging.lyann.app` remplacé |
| Clients concernés | uniquement qui reçoit l'URL | TestFlight 1.0 (12) et tout client appelant `staging.lyann.app` |
| Crons de `vercel.staging.json` (`push-drain` et `moderation/run` chaque minute, collecte éditoriale 11 h, 16 h, 21 h) | non exécutés (Vercel ne lance les crons que sur la production) | actifs |
| Variables d'environnement | seulement celles ciblant Preview | celles ciblant Production |
| Retour arrière | supprimer le déploiement | `vercel rollback` vers le précédent |

Variables (noms) : `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `PUSH_AUTOMATIC_ENABLED`, `PUSH_QA_ONLY`, `PUSH_QA_USER_IDS`, `STRIPE_TEST_AUTO_REFUND`, `LYANN_CUSTOMER_FEE_REFUND` existent **uniquement en Production** du projet Staging. Une Preview ne peut donc pas envoyer de push APNs ni exécuter de remboursement automatique. Les clés Supabase Staging, Stripe, `CRON_SECRET`, `MODERATION_WORKER_SECRET`, `OPENAI_API_KEY` sont en Production et Preview. `LYANN_SUPABASE_LOCK`, `LYANN_E2E_ALLOW_WRITES`, `STRIPE_LIVE_ENABLED` n'existent qu'en Preview (valeurs non lues).

Recommandation : tester d'abord le code sur une Preview isolée (`npx vercel deploy --local-config vercel.staging.json --project … --scope …` sans `--prod`, commande distincte de `deploy-staging.sh` qui force `--prod`), puis promouvoir sur `staging.lyann.app` seulement après application de 95. Le script actuel ne sait pas faire une Preview : sa modification n'a pas été faite.
Limite : la Preview peut être derrière la protection de déploiement Vercel (non vérifié).
Un alias `staging-bokantaj.lyann.app` pointe encore sur un déploiement du projet `lyan` (déjà documenté dans `docs/staging-deployment-audit.md`) ; il n'a pas été touché.

## 9. Production : indices et contrôle préparé

Indices de présence probable de la même faille :
- les migrations 39 et 40 (définition et `REVOKE FROM PUBLIC`) sont dans la même suite que celle de Production ;
- le comportement des privilèges par défaut de Supabase est celui de tout projet Supabase, pas propre à Staging ;
- les fonctions sont appelées par les triggers 49, 54 et 55, donc probablement présentes si ces migrations y sont passées ;
- le dépôt contient des scripts de migration pour Production (`68_69_production_*`), mais **aucune preuve lue** de ce qui y est appliqué.

Non vérifié : Production n'a pas été interrogée. Contrôle préparé, lecture seule du catalogue, non exécuté : `docs/PRODUCTION_READONLY_HELPER_RPC_CHECK.sql`. Il demande une autorisation distincte. Si le résultat est positif (anon peut exécuter), la correction pour Production serait une migration séparée, avec sa propre répétition, sans lien avec cette phase.

## 10. Verdict

**GO conditionnel** pour appliquer durablement la migration 95 sur Staging, sous autorisation explicite supplémentaire : répétition réussie, rollback exact, aucune régression, empreintes identiques. **NO-GO** pour tout déploiement `--prod` tant que 95 n'est pas appliquée.
