# Migration 94 — application contrôlée sur Staging (Phase 3.2C-4)

- Projet : `tdktfbtqceldlaeqjtow` (« Lyann-staging-v2 », ACTIVE_HEALTHY). Production `gzispjfoywklpqatjyop` (« LYANN.APP ») : jamais touchée.
- Branche `feature/marketplace-v3-2c-ui`, SHA de référence `72788947345b1b29e1a82b33708846054a39559d`.
- Migration : `94_visitor_member_detail_lock_staging.sql` (sha256 `7a00e733…d2a5`), retour arrière `94_visitor_member_detail_lock_rollback.sql` (sha256 `a7fa0de5…1c1`). Aucun déploiement Vercel, aucune autre migration.

## Préflight (avant toute écriture)

1. Identité Staging confirmée via `get_project` / `list_projects` (Production est un autre projet, jamais ciblé).
2. Générateurs de répétition (`--snapshot`, `--rehearsal`) régénérés : octets identiques aux fichiers qui ont réussi la répétition ; le SQL embarqué = le fichier de migration (hors BEGIN/COMMIT).
3. Empreintes vivantes AVANT = empreintes de la répétition : col_acl `b7521379…`, data `a050a78e…`, fn_acl `3c72bb1f…`, policies `6c177519…`, rel_acl `b73a110e…`, views `c4cac83f…`.
4. Aucune vue dépendante de `public_profiles`, aucune dépendance aux politiques touchées, seuls les event triggers standard Supabase (PostgREST, pg_graphql…).
5. Le code serveur (`api/server.js`, `api/business-routes.js`, modération) lit ces tables avec la clé service ou le jeton de l'utilisateur, jamais avec la seule clé anon : aucun effet sur les flux serveur.
6. Sauvegarde de l'état initial : `artifacts/phase-3-2c/backup94/` (`initial-state-staging.json`, copies de la migration et du retour arrière, `SHA256SUMS`). Intégrité : JSON valide, 5 politiques, 2 fonctions, hachages relus. La migration ne modifie aucune donnée : les empreintes `data` servent de preuve.
7. Retour arrière : identique octet pour octet aux définitions capturées (politiques, vue, ACL) et prouvé par la répétition.
8. Aucun effet externe non annulable : DDL transactionnel uniquement, aucun appel réseau, aucune écriture métier.

## Application

Une seule transaction `BEGIN … COMMIT` : instructions de la migration + post-conditions de la migration + bloc d'assertions de droits effectifs (anon, membre, service_role : 0 ligne d'avis/portfolio/recommandations/bios/photos pour anon, nombre de cartes inchangé, agrégat de notes conservé, RPC refusées à anon, membre conserve avis/bio/portfolio/RPC). Le COMMIT n'est atteignable que si tout passe. Résultat : exécutée sans erreur, COMMIT effectif (confirmé depuis une connexion neuve).

## Avant / après (connexion neuve)

| Section | Avant | Après | Verdict |
|---|---|---|---|
| col_acl | `b7521379…` | `b7521379…` | inchangé |
| data | `a050a78e…` | `a050a78e…` | inchangé |
| rel_acl | `b73a110e…` | `b73a110e…` | inchangé |
| policies (168) | `6c177519…` | `7b87e80c…` | 5 politiques remplacées |
| fn_acl (185) | `3c72bb1f…` | `21a4ccdb…` | 2 RPC |
| views (2) | `c4cac83f…` | `6144ae1e…` | `public_profiles` |

Politiques de lecture après : `Members read reviews`, `Members read user_portfolio_items`, `Members read recommendations`, `Members read portfolio_images`, `Members read request-photos`, toutes `TO authenticated`. Les politiques d'écriture, de suppression et « owner » ne sont pas touchées. ACL des deux RPC : `postgres`, `authenticated`, `service_role` (ni PUBLIC ni anon).

## Accès réels après COMMIT

Sondes SQL par rôle (rôle de base + claims JWT, transaction toujours annulée) :

| Sonde | anon | membre QA A | admin | service_role |
|---|---|---|---|---|
| reviews | 0 | 110 | 110 | 110 |
| user_portfolio_items | 0 | 1 | 1 | 1 |
| recommendations | 0 | 0 | 0 | 0 |
| public_profiles (cartes) | 82 | 82 | 82 | 82 |
| bios non vides / recherche ilike | 0 / 0 | 59 / 59 | 59 / 59 | 59 / 59 |
| notes agrégées / territoire / avatars | 52 / 58 / 53 | idem | idem | idem |
| services | 208 | 208 | 208 | 208 |
| listage `portfolio_images` + `request-photos` | 0 | 8 | 8 | 8 |
| `get_user_trust_and_reputation` | permission denied | ok | ok | ok |
| `get_public_profile_pro_status` | permission denied | ok | ok | ok |
| requests, request_locations, messages, payments, conversations | refusé | lisible (les siennes) | lisible | lisible |

Sondes REST réelles avec la clé anon : reviews, portfolio, recommandations, bios (y compris `ilike`) → 200 avec `[]` ; `select=*` sur `public_profiles` → 200 ; les deux RPC → 401 (`42501`) ; listage storage `request-photos` et `portfolio_images` → `[]` ; `requests` et `messages` → 401. URL publiques d'objets (`request-photos`, `avatars`, `editorial-highlights`) → 200 ; un bucket privé → refusé.

## Playwright après migration (`LYANN_E2E_EXPECT_MIGRATION_94=1`)

- `visitor_data_lock.spec.js` : 20/20 (groupes A et B).
- `auth_interaction_gate` (sans les tests d'écriture persistante), `explorer_discovery`, `explorer_public_contract`, `annonce_card_structure` : 56 réussis, 1 échec antérieur et sans rapport (badge « Pro vérifié » de `annonce_card_structure`, test 1).
- Vérification membre en lecture seule : fiche d'un membre avec avis (note, avis, bio visibles) et fiche d'un membre avec réalisations (portfolio visible), sans écriture métier.

## Données créées depuis le COMMIT

Aucune : requests, messages, conversations, payments, user_favorites, reviews, profiles → 0 ligne créée après le COMMIT.

## Résidus QA (identifiés, NON supprimés)

Toutes ces annonces appartiennent au compte QA `qa.a.author.stagingv2@lyann.invalid` (`41f31232-70c7-4515-b987-e8160a127f85`), statut `OPEN`.

| id | titre | dépendances |
|---|---|---|
| `6ea797c7-c5e0-40b5-b01a-5b9790b41f52` | Explorer validation 1794459177882… | aucune |
| `389672fe-459b-4721-b413-ee4b1516cc66` | Explorer validation 1794459139305… | aucune |
| `6afc30ec-491d-41cb-9a19-309f3d355c5c` | Validation mission 1794458126064 | invitation ACCEPTED `0622a378…` vers QA B, conversation partagée `7bd66c95…` : à traiter à part |

Nettoyage préparé (à exécuter seulement après autorisation ; les deux annonces « Explorer validation » n'ont aucune ligne dépendante, les tables liées à `requests` sont en `ON DELETE CASCADE` ou vides) :

```sql
BEGIN;
DELETE FROM public.requests
 WHERE id IN ('6ea797c7-c5e0-40b5-b01a-5b9790b41f52','389672fe-459b-4721-b413-ee4b1516cc66')
   AND requester_id = '41f31232-70c7-4515-b987-e8160a127f85'
   AND status = 'OPEN'
   AND description LIKE 'Explorer validation %';   -- doit supprimer exactement 2 lignes
COMMIT;
```

## Données publiques des cartes (intentionnelles ?)

- `services` (titre, description, prix) : lisible par tous, politique « viewable by everyone ». C'est le catalogue d'offres utilisé par la recherche visiteur : décision produit à confirmer, non modifiée ici.
- Annonces publiques (`/v1/explorer/requests`) : projection serveur (territoire/commune, extrait de 120 caractères, champs auteur : nom, avatar, note, nombre d'avis, badges). Pas d'identifiant d'auteur.
- `public_profiles` : nom, avatar, territoire, ville, métier, badges, agrégat de notes : champs de carte voulus.

## Risques de sécurité encore présents (hors périmètre, sans correction ici)

1. Cinq fonctions SECURITY DEFINER exécutables par `anon` sans garde d'identité : `lyann_ensure_support_welcome`, `lyann_insert_notification`, `lyann_pair_conversation` (à auditer en priorité), `lyann_public_badges` et `lyann_support_user_id` (publiques volontairement, utilisées par l'explorateur). Une trentaine d'autres fonctions anon-exécutables portent une garde d'identité interne mais devraient être restreintes à `authenticated`.
2. `bokantaj_likes` lisible publiquement (« viewable by everyone »).
3. Lecture publique de `feature_flags` et de `services.description`/prix.
4. Droits de table par défaut larges pour `anon` (le verrou repose sur la RLS, pas sur les GRANT).
5. Buckets `request-photos` et `portfolio_images` publics par URL : seul le listage est fermé.
6. Advisors Supabase : `security_definer_view` (`public_profiles`, voulu), protection des mots de passe compromis désactivée, extension dans `public`, `search_path` mutable sur une fonction.
