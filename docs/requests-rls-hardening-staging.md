# Sécurisation RLS des annonces (`requests`) — préparation Staging

Phase 2.8B-1.2. Branche `feature/marketplace-approx-location-v1`, HEAD `300a9083ab3678c47ada6427443b70f90a0cc49c`.
Supabase Staging `tdktfbtqceldlaeqjtow`. **Rien n'est appliqué.** Production n'a pas été lue ni modifiée.

Fichiers préparés :

| Fichier | Rôle |
|---|---|
| `90_requests_select_rls_hardening_staging.sql` | Migration, une transaction, préconditions et postconditions |
| `90_requests_select_rls_hardening_rollback.sql` | Retour exact à la politique lue sur Staging (rétablit l'exposition) |
| `tests/rls/requests-select-roles-readonly.sql` | Vrais rôles `anon` et `authenticated`, tous les profils, lecture seule, avant et après |
| `tests/rls/requests-select-shadow-diff.sql` | Évaluation SQL pure de l'ancienne et de la nouvelle règle pour chaque profil, lecture seule |
| `tests/rls/requests-select-fixtures-rollback.sql` | Matrice par rôle avec fixtures, toujours terminée par `ROLLBACK`, à lancer après application |
| `tests/rls/requests-select-local-check.js` | Preuve locale sur un vrai moteur Postgres (PGlite en mémoire), migration et rollback exécutés tels quels |

## 1. Exposition confirmée (Staging, 5 novembre 2026)

Une seule politique SELECT existe sur `requests` : « Requests are viewable by everyone », rôle `{public}`.

1. L'auteur lit ses annonces non rejetées.
2. Une annonce dont `public_moderation_status` n'est pas `approved` n'est lisible que par un administrateur.
3. **Toute autre annonce, donc toute annonce approuvée, est lisible par tout le monde, `anon` compris.**

Elle ne teste ni `visibility`, ni `target_user_id`, ni `status`, ni `safety_status`, ni `classification_status`.
`anon` et `authenticated` ont SELECT sur les 32 colonnes. Cette politique n'existe dans aucun fichier du dépôt
(ni `02_security_migration.sql`, ni `70_public_content_moderation.sql`, ni `schema.sql`) : Staging a dérivé du dépôt.

Mesure réelle, avec `SET LOCAL ROLE` et un JWT (script lecture seule, 76 annonces, 81 profils) :

| Contexte | Annonces lues | Dont à ne pas lire |
|---|---|---|
| `anon` | 75 sur 76 | 14 annonces directes (4 OPEN, 3 IN_PROGRESS, 7 COMPLETED) et 50 publiques non OPEN (29 IN_PROGRESS, 12 PAUSED, 6 COMPLETED, 3 CLOSED), avec `requester_id` et `internal_tags` |
| Membre tiers | 75 sur 76 | 64 pour la plupart des profils |
| Administrateur | 76 | — |
| Ensemble des membres | 80 profils sur 81 avec fuite, 5 007 lectures indues | maximum 64 par profil |

Seule l'annonce en attente de modération est protégée. Les annonces privées, ciblées, fermées, en pause, en cours,
terminées et interdites (`safety_status = 'PROHIBITED'`) sont lisibles. Aucune ligne `rejected` n'existe sur Staging.

## 2. Correction proposée

Une seule politique SELECT, pour `authenticated`. L'ancienne est supprimée : les politiques permissives s'additionnent,
donc une politique restrictive ajoutée à côté ne fermerait rien. La migration refuse de s'exécuter si une autre
politique SELECT ou ALL existe sur `requests`.

```sql
USING (
    (requester_id = (SELECT auth.uid()) AND public_moderation_status IS DISTINCT FROM 'rejected')   -- auteur
    OR (SELECT public.is_current_user_admin())                                                      -- back-office
    OR (public_moderation_status = 'approved' AND (
        (visibility = 'PUBLIC' AND status = 'OPEN' AND safety_status = 'SAFE' AND target_user_id IS NULL
         AND classification_status IN ('CLASSIFIED','UNCLASSIFIED'))                                 -- règle Découvrir
        OR (safety_status IS DISTINCT FROM 'PROHIBITED' AND (
              target_user_id = (SELECT auth.uid())                                                   -- destinataire direct
              OR public.lyann_request_participant_access(id)))))                                     -- invité, devis, mission
)
```

- La règle publique est celle de `api/public-explorer-requests.js` (`eligible()`) : la base applique ce que l'API appliquait.
- `lyann_request_participant_access(uuid)` : `SECURITY DEFINER`, `search_path` fixé, `row_security = off`, même schéma que
  `is_current_user_conversation_participant`. Elle ne répond que pour `auth.uid()` : invité non annulé, fournisseur d'un devis,
  prestataire d'une mission liée. EXECUTE retiré à `anon`, donné à `authenticated`.
- `anon` : aucune politique et `REVOKE SELECT ON requests FROM anon`. L'API publique lit avec la clé service
  (`createPublicRequestsHandler(supabaseAdmin, …)`), le détail visiteur passe par `/v1/explorer/requests`.
- Index `idx_missions_related_request` (aucun index n'existait pour la recherche de mission par annonce).
- Aucune ligne n'est lue ni écrite par la migration.

Comportements conservés tels quels : l'auteur ne lit pas son annonce rejetée, le back-office lit tout, une annonce en attente
n'est lisible que par son auteur et l'administrateur. Les politiques INSERT, UPDATE, DELETE ne changent pas (un UPDATE avec
filtre exige aussi la lecture : l'auteur et l'administrateur passent par leurs branches).

## 3. Parcours examinés

Lecture directe de `requests` avec le jeton d'un membre (soumise à la politique) : `api-client.js` (`getRequests`, `getRequest`,
`updateRequest`, `deleteRequest`, `createRequest` avec `.select()`), `script.js` (Mes annonces, détail, dossiers),
`messaging-repository.js`, `chat-logic.js`, `platform-core.js`, `admin-script.js`. Tout le reste du serveur lit avec
`supabaseAdmin` (clé service, ignore la RLS) : `api/server.js`, `api/admin-control-center.js`, `api/content-moderation-routes.js`,
`api/public-explorer-requests.js`. Les fonctions SQL qui touchent `requests` sont toutes `SECURITY DEFINER`. Aucune vue, aucune
publication Realtime, aucune autre politique ne lit `requests`.

| Parcours | Lecture | Effet |
|---|---|---|
| Découvrir, liste des annonces, carte des besoins | `/v1/explorer/requests`, clé service | Aucun |
| Détail d'annonce, visiteur | liste de l'API (`publicRead`) | Aucun |
| Détail d'annonce, membre | `select('*')` direct | Annonce publique OPEN : inchangé. Annonce passée en pause, en cours ou fermée depuis l'affichage de la liste : plus lisible par un tiers, le détail retombe sur son message « indisponible ». Voulu |
| Mes annonces, modification, suppression | filtre `requester_id` | Aucun (branche auteur) |
| Annonces réservées (PAUSED, IN_PROGRESS) | auteur, prestataire | Conservées pour l'auteur, le prestataire (mission, devis), l'invité. Perdues pour un tiers |
| Dossiers de mission | `requests` par `request_id` des invitations, missions, devis | Aucun : invité, prestataire et auteur sont couverts |
| Titres des conversations | `requests` par `request_id` des invitations | Aucun |
| Contexte de chat par identifiant d'annonce | `maybeSingle`, dans un `try` | Un tiers sans lien, sur une annonce qui n'est plus OPEN, n'a plus la bannière |
| Notification (route `mission`) | `select id` | Participants : aucun. Alerte de compétence : l'annonce doit être OPEN |
| Back-office de modération et des annonces | jeton administrateur (`admin-script.js`), clé service (serveur) | Aucun (branche administrateur) |

Dépendances à surveiller : tests et scripts qui lisent comme un tiers des annonces non OPEN (`scripts/phase4-auth-rls-storage.js` accepte
déjà « présent ou vide »), `matching_dispatches` (vide sur Staging, non testé).

Évaluation SQL sur les 81 profils et les 76 annonces (`requests-select-shadow-diff.sql`) : **aucune annonce perdue par un profil qui
a un lien avec elle** (auteur, destinataire, invité, devis, mission, administrateur). Les seules pertes sont des tiers : 14 annonces
directes et 50 publiques non OPEN. Les 11 annonces publiques OPEN approuvées restent lisibles par tous les membres.

## 4. Colonnes sensibles

RLS filtre les lignes, pas les colonnes.

- **`anon`** : après correction, ni ligne ni privilège.
- **Membres** : ils reçoivent encore les 32 colonnes des lignes qu'ils peuvent lire, car `getRequest` et le détail font
  `select('*')`. Colonnes qui n'ont pas à quitter le serveur ou l'auteur : `internal_tags`, `classification_confidence`,
  `classification_status`, `safety_status`, `title_pending`, `description_pending`, `auto_close_at`, `close_notice_sent`.
  Un `REVOKE` de colonne casserait ces appels (`permission denied` sur `*`). Il demande de remplacer ces lectures par des listes de colonnes
  explicites, c'est-à-dire de modifier le code métier : hors périmètre ici, à faire dans une phase dédiée, puis révoquer.
- `requester_id` reste nécessaire aux membres (affichage de l'auteur, messagerie).

## 5. Tests

| Preuve | Où | État |
|---|---|---|
| Exposition réelle, `anon` et tous les profils, contre une spécification écrite à part | `requests-select-roles-readonly.sql` | Exécuté avant correction : verdict `MISMATCH`, anon 75 lignes, 80 profils sur 81 avec fuite, aucun accès manquant. Après correction : doit afficher `PASS` |
| Équivalence politique et spécification, 30 membres, 400 annonces aléatoires avec NULL, rejetées, interdites, invitations annulées | `requests-select-local-check.js` | Passé en local (PGlite). 4 mutants volontairement faux sont tous détectés |
| Rollback et préconditions | idem | Passé : politique, privilège et lectures de chaque membre restitués ; une seconde politique SELECT refusée ; politique de forme Production refusée ; migration appliquée deux fois refusée |
| Matrice avec fixtures, rôles réels | `requests-select-fixtures-rollback.sql` | **Non exécuté** (interdit en phase de préparation). Les ensembles attendus ont été vérifiés sur le moteur local |

Matrice des fixtures (annonces de l'auteur A) :

| Annonce | anon | Tiers S | Auteur A | Cible T | Invité en attente | Invité annulé | Devis Q | Mission H |
|---|---|---|---|---|---|---|---|---|
| R1 publique OPEN approuvée | non | oui | oui | oui | oui | oui | oui | oui |
| R2 publique PAUSED, liens I, C, Q, H | non | non | oui | non | oui | non | oui | oui |
| R3 publique CLOSED | non | non | oui | non | non | non | non | non |
| R4 directe vers T | non | non | oui | oui | non | non | non | non |
| R5 publique en attente | non | non | oui | non | non | non | non | non |
| R6 publique rejetée | non | non | non | non | non | non | non | non |
| R7 interdite (CANCELLED) | non | non | oui | non | non | non | non | non |
| R8 publique avec cible T | non | non | oui | oui | non | non | non | non |

Le script vérifie aussi : un tiers ne modifie aucune annonce, l'auteur modifie la sienne, `INSERT … RETURNING` de l'auteur
fonctionne (si la publication est ouverte), `anon` n'a ni SELECT ni EXECUTE sur l'aide.

La preuve locale n'est pas Supabase : `auth.uid()`, `auth.role()` et les tables liées y sont reproduits. D'où l'étape 5 ci-dessous.

## 6. Procédure d'application sur Staging

À ne lancer qu'après autorisation explicite. Toujours sur `tdktfbtqceldlaeqjtow`, jamais sur Production.

1. Vérifier le projet cible (référence `tdktfbtqceldlaeqjtow`) et le HEAD du dépôt.
2. Avant : exécuter `requests-select-roles-readonly.sql` (attendu `MISMATCH`, noter les chiffres) et `requests-select-shadow-diff.sql`.
3. Local : `npm i --no-save @electric-sql/pglite && node tests/rls/requests-select-local-check.js` doit afficher `passed`.
4. Appliquer `90_requests_select_rls_hardening_staging.sql` d'un seul bloc. Une précondition ou postcondition en échec annule tout.
5. Après, dans cet ordre :
   - `requests-select-roles-readonly.sql` : `PASS`, `anon` à 0 ou `permission denied`, zéro fuite, zéro accès manquant ;
   - `requests-select-fixtures-rollback.sql` : `requests RLS role matrix: PASS`, puis `ROLLBACK` si le script n'est pas allé au bout ;
   - `requests-select-shadow-diff.sql` : aucune ligne `regression = true`.
6. Parcours Staging : `GET /v1/explorer/requests` (même nombre d'annonces qu'avant : 11), Découvrir et carte en visiteur et en membre,
   détail d'une annonce publique, Mes annonces, publier une annonce, messagerie et dossier de mission d'un compte QA, annonce directe
   côté destinataire, modération et annonces dans le back-office.
7. Retour arrière si un contrôle échoue : `90_requests_select_rls_hardening_rollback.sql` (remet l'exposition), puis analyser.

## 7. Risques résiduels

- Les membres lisent encore toutes les colonnes des lignes autorisées (section 4).
- Le dépôt ne contient pas la politique en vigueur sur Staging. Production n'a pas été examinée : si elle porte la politique du
  fichier 70 (`approved` et (`PUBLIC` ou auteur ou cible), rôles `anon` et `authenticated`), elle expose aussi les annonces publiques
  non OPEN. La migration refuse cette forme. Production demande son propre audit et sa propre migration.
- `anon` exécute de nombreuses fonctions `SECURITY DEFINER` qui lisent `requests` (`get_conversation_request_context_secure`,
  `bind_conversation_request`, `prepare_direct_offer`, `send_request_invitations`, `accept_proposal_secure`…). Elles n'ont pas été
  auditées ici : à vérifier, en particulier celles qui renvoient le contenu d'une annonce.
- `anon` et `authenticated` gardent TRUNCATE, TRIGGER, REFERENCES sur la table (défaut Supabase, non exposés par PostgREST).
- Une annonce avec `requester_id` NULL n'est lisible que par l'administrateur après correction. Aucune n'existe sur Staging et le client
  renseigne toujours `requester_id`.
- Les destinataires d'une alerte de compétence perdent l'accès dès que l'annonce n'est plus OPEN.
- La matrice avec fixtures n'a pas été jouée sur Supabase. La migration n'est pas rejouable : une seconde exécution est refusée.
- Si `requests` rejoint un jour la publication Realtime, elle appliquera cette politique.
- Coût : la fonction de participation est appelée pour les lignes non publiques seulement. Négligeable à 76 annonces, à surveiller à l'échelle.

## 8. Verdict

**GO pour appliquer sur Staging**, avec la procédure de la section 6 et le rollback prêt. **NO-GO pour Production** tant qu'elle n'a pas
été auditée séparément.
