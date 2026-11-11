# 13 — Verrouillage avant la migration Staging (phase 3.2B)

Branche `feature/v3-2b-taxonomy-audit`, point de départ `8f194f0`. Cible future : Staging `tdktfbtqceldlaeqjtow`. Production : jamais.

**Rien n'a été exécuté contre une base** : aucune migration, aucune écriture Supabase, aucun déploiement, aucune permission modifiée, aucun changement Stripe ni authentification, aucun build mobile. Une seule requête distante, en **lecture seule** (comptages et noms de déclencheurs, §6.3), a été faite sur Staging.

Tout le reste a été prouvé sur le banc local PGlite, avec le **vrai code** des migrations 70, 71, 82 et 83 extrait de leurs fichiers.

## 1. Décisions produit et suite donnée

| | Décision | Suite donnée |
|---|---|---|
| X1 | T1 provisoire, pas de T2 | Impact des 134 nœuds chiffré (§2). Aucun faux classement. |
| X2 | Politique C conditionnelle | Garde de quota prouvée sur 76 contrôles, dont 5 profils × 3 forfaits (§4). |
| X3 | Durcissement `services` à part | Dépendances documentées, brouillon + rollback prêts, **non appliqués** (§3). |
| X4 | Gel de l'ancienne API : accord de principe | Consommateurs vérifiés : aucun POST/PATCH. Gel **éteint** (§6.1). |
| X5 | Spécialités héritées | Règle implémentée et testée : feuille précise si certaine, sinon métier parent + « besoin de précision » (§5.1). |

## 2. X1 — les 134 nœuds non couverts par T1

**Ce que T1 fait** : 382 nœuds sur 516 (74 %) sont retrouvés par les filtres d'un ancien build. Le pont n'est jamais plus précis que le nœud. Détail : [12](12-staging-validation-and-legacy-compat.md) §4.

**Les 134 nœuds** : 133 ont un pont `none`, plus `video_captation_live` (deux catégories historiques possibles, aucune n'est choisie). Ils se répartissent en 33 métiers racines (dont « Autre besoin » volontaire) et leurs spécialités :

| Famille | Nœuds | Métiers racines (exemples) |
|---|---|---|
| Maison | 31 | alarme/portail, solaire, plâtrerie/isolation, ferronnerie, clôtures, termites/humidité, rénovation tous corps d'état |
| Entretien | 30 | linge/repassage, nettoyages spécialisés, locaux/parties communes, conciergerie, gardiennage, nuisibles, rangement |
| Numérique | 20 | TV/antenne, domotique, initiation, secrétariat, formation/coaching |
| Jardin | 14 | paysagisme, nettoyage extérieur, terrasses/abris/allées |
| Beauté et loisirs | 14 | tresses/cheveux texturés, esthétique, activités nautiques, randonnée |
| Événementiel | 12 | organisation d'événements, cuisine à domicile, vidéo |
| Transport | 7 | dépannage/remorquage, bateau/hors-bord |
| Famille | 3 | seniors : présence et accompagnement |
| Autres | 3 | volontaire |

**Effet réel pour l'utilisateur d'un ancien build** (les builds embarquent leur JavaScript : aucune correction côté serveur ne change leurs filtres) :

1. **Aujourd'hui, aucun effet.** Sur Staging, les 80 annonces portent 15 valeurs de catégorie, toutes retrouvables.
2. **Après migration, l'annonce n'est pas perdue.** Une annonce écrite avec un de ces nœuds par un nouveau client porte `category` = le libellé du nœud et `taxonomy_id` vide. Elle reste dans les flux non filtrés, la recherche texte et la carte. Elle n'apparaît pas sous un **filtre de catégorie structuré** d'un ancien build, et la carte peut la placer sous l'heuristique par mots-clés de l'ancien build (repli « quotidien »).
3. **Le recoupement de mots n'est pas une garantie.** 75 des 133 nœuds `none` accrochent un filtre voisin par mots communs. Ce n'est pas un classement : on ne s'en prévaut pas.
4. **Les compétences** n'ont pas de `taxonomy_id`. L'ancien filtre lit le texte seulement : la politique C atteint 364 nœuds sur 383.

**Pas de mécanisme de mise à jour forcée.** `min_app_version`, `forceUpdate` et équivalents n'existent ni dans le dépôt, ni dans l'API, ni dans les bundles iOS/Android. Une application ancienne ne peut donc pas être invitée à se mettre à jour. Conséquence : T1 reste le seul levier sans nouveau build.

**Transition vers les applications mises à jour** (rien n'est activé) :

1. Migrations 01→06 et 08. Pour les anciens builds, rien ne change.
2. Nouveaux builds : lisent et écrivent par `taxonomy_node_code`. Le serveur complète les champs historiques quand un pont véridique existe.
3. Mesure : part de `taxonomy_node_source` en `client` (nouvelle application) contre `derived_*` (ancienne application, pont). Requête simple, sans donnée personnelle.
4. Avant toute coupure : décider séparément d'un mécanisme de version minimale. **Aucune date de coupure n'est proposée.**
5. T2 (32 coquilles) reste disponible si l'un de ces métiers devient prioritaire. Il n'est pas installé. Il faut alors ajouter la ligne de correspondance pour que 06 rattache la coquille à son nœud.

**Seuil de rouvrir X1** : si la part d'annonces portant un nœud `none` dépasse un seuil à fixer par le produit (la mesure de l'étape 3 la donne), T2 ou une mise à jour obligatoire devient plus rentable que l'attente.

## 3. X3 — privilèges TRUNCATE, TRIGGER, REFERENCES sur `services`

**Constat** (pré-vol P08) : `anon` et `authenticated` portent SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER et REFERENCES sur `public.services`. La migration 91 n'a traité que `requests`. La RLS ne couvre pas TRUNCATE.

**Dépendances réelles** (vérifiées dans le code et rejouées sur le banc) :

| Mécanisme | Dépend de TRUNCATE/TRIGGER/REFERENCES des rôles exposés ? | Pourquoi |
|---|---|---|
| Clients et API (PostgREST) | Non | Seulement SELECT / INSERT / UPDATE / DELETE. PostgREST n'expose pas TRUNCATE. |
| Déclencheur `lyann_category_entitlement` (82), dérivation taxonomie (06) | Non | Un déclencheur s'exécute sous les droits de son propriétaire (`postgres`). |
| RPC `lyann_sync_profile_skills` (83) et v2 (03) | Non | `SECURITY DEFINER`, propriétaire `postgres`. |
| Clés étrangères vers `services` (`service_reviews.related_service_id` ON DELETE SET NULL, etc.) | Non | Le contrôle d'intégrité référentielle s'exécute avec les droits du propriétaire. Prouvé : un DELETE de membre fonctionne après correction. |
| Création d'une clé étrangère ou d'un déclencheur par un rôle exposé | Oui, et c'est la surface à fermer | Aucun parcours LYANN ne le fait. |

**Correctif préparé** : `docs/taxonomy/security-draft/100_services_dangerous_privileges_staging.sql` (`REVOKE TRUNCATE, TRIGGER, REFERENCES … FROM PUBLIC, anon, authenticated`, avec instantanés avant/après des politiques et des privilèges non visés, retour arrière automatique si le résultat diffère). Rollback : `…_rollback.sql`. Les deux portent « BROUILLON — NON APPLIQUÉ ».

**Preuves locales** (`validate-quotas-pglite.js`) : SELECT/INSERT/UPDATE/DELETE conservés, politiques RLS identiques, déclencheurs, RPC v2 et ancienne RPC fonctionnent après correction, quota inchangé, TRUNCATE refusé à `anon` et `authenticated`, rollback restitue l'état initial.

**À valider sur Staging, pas sur le banc** : `authenticator` et `supabase_admin` (rôles propres à Supabase), et d'éventuelles fonctions externes à ce dépôt. Le script le recontrôle avec `has_table_privilege` sur `authenticator`. Application : demande séparée.

## 4. X2 — préservation des quotas par la politique C

**Mécanisme réel** (migration 82) : clé de quota = `lyann_service_category(category_id, category)`, soit `id:<uuid>` ou `label:<catégorie normalisée>`. Plafonds : FREE 1, PLUS 3, PRO 5. Refus seulement si `v_used > limite ET v_used > v_before` (les membres déjà au-dessus sont conservés, sans pouvoir ajouter). Le déclencheur n'écoute que `UPDATE OF category_id, category, owner_id, active, is_active`.

**La politique C** écrit `title = description = category` = `Métier · Spécialité` (ou le libellé seul pour un métier). Chaque compétence garde donc **sa propre clé**, comme aujourd'hui (un stub = une catégorie).

**Preuves** (`scripts/taxonomy-v2/validate-quotas-pglite.js`, `tests/taxonomy-quota.test.js`, 76/76) :

- 513 nœuds proposables donnent 513 clés distinctes, 0 collision. Titres ≤ 120 caractères.
- 5 profils × 3 forfaits : un métier ; un métier + 3 spécialités ; 2 métiers + 4 spécialités ; six métiers ; deux spécialités de métiers différents. Le nombre de compétences acceptées et le rang du premier refus sont **identiques** à ceux d'un ancien client.
- RPC v2 : 4e catégorie PLUS refusée (`CATEGORY_QUOTA_REACHED`), écriture annulée en bloc, aucun état partiel.
- Ancien client et client v2 sur le même profil : mêmes clés, mêmes plafonds, compétences v2 conservées.
- Grandfathering : un FREE avec 5 catégories est conservé, ne peut pas en ajouter. Le rétro-remplissage ne déclenche pas la garde et ne change ni titre, ni catégorie, ni `category_id`, ni `active`, ni `is_active`.
- Contrôle négatif : la politique B (même `category` pour plusieurs spécialités) ferait tenir 3 compétences dans 1 clé pour un FREE. B reste exclue.
- Le jeu 01→08 ne modifie ni la garde, ni la clé, ni les forfaits, ni le déclencheur. Le rollback les restitue à l'identique.

**Réserve** : le banc n'a que les tables nécessaires à la garde. Le comportement de `lyann_plan_memberships` en production (statuts, expirations) est celui du code de la migration 82, pas observé. P3 contrôle que les fonctions de garde présentes sur Staging ne bougent pas (empreinte du catalogue).

## 5. Sécurité SQL des migrations proposées

### 5.1 X5 — spécialités héritées (`lyann_legacy_certain_node`)

La fonction (05, `SECURITY DEFINER STABLE`, `search_path` fixé, aucune écriture, `REVOKE` à `PUBLIC`/`anon`/`authenticated`) tranche :

- mapping `exact`/`broad`, ou sans alternative : le nœud de la correspondance, **sans** besoin de précision ;
- plusieurs nœuds possibles, **tous sous un même métier** : ce métier, source `*_parent` = « besoin de précision » ;
- plusieurs métiers possibles : **rien** (reste à classer).

Résultat sur le banc : `electricite_panne` (feuille certaine), `plomberie` en `derived_leaf_parent` (ambigu dans un métier), NULL pour « DJ & Son » (deux métiers). 12 demandes en `backfill_leaf_parent`. 7 feuilles multi-métiers listées par V20, aucune spécialité inventée (V18). Le suffixe `_parent` est repris par V14 et par la regex de recalcul `^(derived_|backfill_)`.

### 5.2 Revue des brouillons

| Contrôle | Résultat |
|---|---|
| Tables v2 : RLS activée | oui (test `taxonomy-v2-proposal`) |
| Fonctions `SECURITY DEFINER` : `search_path` fixé | oui |
| `GRANT`/`REVOKE` sur fonctions d'écriture | `REVOKE` à `PUBLIC`, `anon`, `authenticated` |
| Écritures dans `category`, `category_id`, `active`, `is_active`, `owner_id` de `services` | aucune (test) |
| Désactivation de déclencheur, `session_replication_role` | aucune |
| Rétro-remplissage de `requests` : colonnes écrites | `taxonomy_node_code`, `taxonomy_node_source` seulement (test) |
| Politiques RLS existantes | non touchées (empreinte du catalogue) |
| `COMMIT`/`TRUNCATE`/`NOTIFY`/`nextval`/réseau dans P3 | interdits par le linter |

### 5.3 Aléa trouvé : la modération se redéclenche

Les migrations 70 et 71 posent `trg_enforce_request_moderation` (BEFORE INSERT/UPDATE, **toutes colonnes**) et `trg_touch_request_moderation_job` (AFTER INSERT/UPDATE). Un `UPDATE` de rétro-remplissage lancé depuis le rôle `postgres` n'est pas un contexte « service » (`lyann_is_service_role()` lit le claim JWT) : chaque demande est **remise en modération**.

Mesure sur le banc : 80 demandes, variante « telle quelle » = **+80 lignes de `content_moderation_queue`, +80 tâches `moderation_jobs`**, variante contexte service = 0 et 0. Les lignes et tâches sont des lignes de base : annulées avec la transaction de P3. Sur une exécution durable, elles seraient réelles et un worker pourrait agir dessus après commit.

**Mesures prises dans 05** :
- les deux UPDATE de `requests` ne touchent que les demandes `approved` sans `title_pending` ni `description_pending` (le contexte service peut publier ou effacer une modification en attente : il ne faut donc jamais y toucher). Les autres sont comptées par V22 ;
- les deux UPDATE sont encadrés par `-- @requests-backfill:begin/end`, pour qu'un exécuteur y place le contexte service sans réécrire le fichier.

**Décision X6 (ouverte, pour la migration réelle, pas pour P3)** : exécuter le rétro-remplissage de `requests` avec `set_config('request.jwt.claim.role', 'service_role', true)` local à la transaction. Ce n'est pas un changement de permission, c'est le contexte que l'API utilise déjà. P3 mesure les deux variantes sur Staging et la décision se prend sur ces chiffres.

### 5.4 Effets externes non annulables

| Candidat | Verdict |
|---|---|
| Brouillons 01–09 | aucun `NOTIFY`, `pg_net`, `http`, `dblink`, `COPY`, `nextval` (recherche automatique + linter de P3) |
| `trg_lyann_notify_matching_request` (marqué `external_effect_keyword` au pré-vol) | `AFTER INSERT` seulement : le rétro-remplissage fait des `UPDATE`, il ne se déclenche pas |
| File push (49) | alimentée par INSERT dans `notifications` : aucun brouillon n'en fait |
| `content_moderation_queue`, `moderation_jobs` | lignes de base, annulées. Effet externe seulement après COMMIT par un worker. P3 ne commit jamais |
| 6 déclencheurs UPDATE de `requests`/`services` | examinés un par un, ci-dessous |

Déclencheurs UPDATE relevés sur Staging (lecture seule) :

| Déclencheur | Effet d'un UPDATE de `taxonomy_node_*` |
|---|---|
| `trg_block_restricted_requests_upd` | rend NEW si pas de JWT (`auth.uid()` NULL) : sans effet |
| `trg_enforce_request_moderation` | voir §5.3 |
| `trg_touch_request_moderation_job` | voir §5.3 |
| `trg_enforce_simplified_request_safety` | force `status = CANCELLED` sur toute demande `PROHIBITED` : **0 concernée sur Staging** ; P3 compte et arrête si > 0 |
| `trg_lyann_block_request_close_when_paid` | `UPDATE OF status` seulement : ne se déclenche pas |
| `lyann_category_entitlement` (services) | `UPDATE OF category_id, category, owner_id, active, is_active` : ne se déclenche pas |

## 6. Compatibilité et gel

### 6.1 X4 — consommateurs de l'ancienne API de taxonomie

Recherche dans le dépôt, `www/`, `ios/…/public`, `android/…/assets`, les `intermediates` Android, `admin-script.js` et les scripts : le **seul** appel est `GET /v1/admin/taxonomy` (`admin-script.js:1306`, copies de bundles comprises, et `scripts/admin-pr5-staging-circuit.js:159`). **Aucun POST ni PATCH**. Pas de `DELETE` côté API.

L'interface d'administration n'écrit pas sur cette route. Rien ne dépend donc du POST/PATCH de l'ancienne API dans le code que nous possédons. **Limite** : un consommateur extérieur (script d'un administrateur, outil non versionné) ne peut pas être exclu par une lecture de code. La réponse 423 `LEGACY_TAXONOMY_FROZEN` nomme la cause, ce qui rend l'incident diagnostiquable.

Le gel (`LYANN_FREEZE_LEGACY_TAXONOMY_WRITES=true`, éteint par défaut, valeur stricte, refus après le contrôle des droits, GET intact) est **éteint**. Il n'est activé nulle part dans cette phase. Tests : `tests/taxonomy-compat.test.js`.

### 6.2 Anciens clients

Preuve : [12](12-staging-validation-and-legacy-compat.md) §4 (matrice complète des 516 nœuds sur le vrai code TF 1.0-15/1.0-16, 0 faux positif de feuille) et `tests/taxonomy-compat.test.js`. Les changements de cette étape (X5, garde de modération) n'altèrent ni la matrice ni le pont 08.

### 6.3 Lecture seule faite sur Staging

Une seule requête `SELECT` : noms des déclencheurs UPDATE de `requests`/`services`/`lyann_taxonomy` (+ état), nombre de demandes `PROHIBITED` non annulées (0), total de demandes (80). Aucune donnée d'utilisateur lue.

## 7. P3 — répétition à blanc : plan, effets, arrêts, récupération

**Statut : préparée, NON AUTORISÉE.** L'exécution exige une demande séparée contenant ce qui suit. Le script refuse de s'exécuter sans la variable `LYANN_P3_AUTHORIZED` (valeur écrite dans `p3-rehearsal.js`), lit le jeton depuis un fichier, vérifie que le projet est Staging, refuse tout chemin contenant l'identifiant Production.

### 7.1 Scripts exécutés, dans l'ordre (un seul appel SQL)

`scripts/taxonomy-v2/p3-rehearsal.js` assemble, en **une transaction sans COMMIT** :

1. prérequis (aucun objet v2 présent, RPC 83 présente, PostgreSQL ≥ 15, volumétrie), journal et état de référence ;
2. sondes (`risk_probes` : déclencheurs UPDATE, demandes `PROHIBITED`) ;
3. `01` schéma → `02` colonnes additives → `03` recherche et RPC compétences → `04` amorçage ;
4. mesure du rétro-remplissage `05` **deux fois, en sous-transactions annulées** (telle quelle, puis contexte service) ;
5. `05` en contexte service → `06` double écriture → `08` projection historique ;
6. état après application, verrous tenus, empreinte du catalogue ;
7. les contrôles `07` (V01–V22) ;
8. `09` retour arrière, puis comparaison catalogue et données avec l'état de référence ;
9. **exception volontaire `P3R01`** : tout est annulé, le rapport JSON voyage dans le message d'erreur.

**Non inclus** : `100` (privilèges `services`), toute migration d'une autre phase, le gel, les builds.

Commandes (aucune n'est lancée) :

```
node scripts/taxonomy-v2/p3-rehearsal.js --plan    # texte du plan
node scripts/taxonomy-v2/p3-rehearsal.js --print   # SQL complet (≈ 0,9 Mo)
LYANN_P3_AUTHORIZED=<phrase> LYANN_SUPABASE_ACCESS_TOKEN_FILE=<fichier> node scripts/taxonomy-v2/p3-rehearsal.js --execute
```

### 7.2 Effets attendus

- **Aucun effet durable.** Empreinte du catalogue public et de ses lignes **identique** avant/après (le script la compare lui-même depuis l'extérieur de la transaction).
- Pendant l'appel : verrous exclusifs sur `requests`, `services`, `lyann_taxonomy` (`lock_timeout` 5 s, `statement_timeout` 300 s). Durée locale : < 1 s. Sur Staging : quelques secondes (80 demandes).
- Séquences non consommées, aucune notification, aucun appel réseau.
- Rapport : < 20 ko.

### 7.3 Conditions d'arrêt (NO-GO pour la suite)

Le script les évalue (`evaluateReport`) et sort en erreur si l'une est vraie :

1. un contrôle V01–V22 (hors informatifs) renvoie des lignes ;
2. un objet **préexistant** change, hors `lyann_sync_profile_skills(uuid,text[])` ;
3. `09` ne restitue pas le catalogue de référence ;
4. une colonne historique de `requests`, `services`, `lyann_taxonomy` change après application ou après retour arrière ;
5. le rétro-remplissage en contexte service ajoute une ligne de file ou une tâche de modération ;
6. une demande `PROHIBITED` non annulée existe ;
7. un déclencheur UPDATE de `requests`/`services` hors des six examinés (§5.4) apparaît ;
8. l'erreur finale n'est pas `P3R01`, ou l'empreinte avant/après diffère ;
9. un prérequis échoue (c'est un arrêt **avant écriture**) ;
10. délai de verrou dépassé : ne pas relancer en boucle, chercher le détenteur du verrou.

### 7.4 Plan de récupération

| Situation | Action |
|---|---|
| Échec avant `P3R01` (erreur SQL) | La transaction est annulée par PostgreSQL. Le script envoie `ROLLBACK;` puis compare l'empreinte. |
| Connexion coupée | PostgreSQL annule à la fermeture de la session. Vérifier l'empreinte et `pg_stat_activity` (état `idle in transaction`). |
| Transaction restée ouverte | `ROLLBACK;` explicite. En dernier recours, par le propriétaire du projet, depuis le tableau de bord (interdit au script par le linter). |
| Empreinte différente | **Arrêt total.** Aucune autre action. Comparer `p3_catalog_before` (perdu) à l'instantané du pré-vol P1 (`docs/taxonomy/data/staging-snapshot.json`) et à `git`. Les objets v2 se retirent par `09`. |
| Verrous longs | Aucun effet durable ; les écritures des utilisateurs attendent au plus quelques secondes. |

## 8. Risques SQL résiduels

1. **Le banc n'est pas Staging.** Il ne contient que les objets nécessaires. P3 existe pour combler cet écart ; ses résultats priment sur les nôtres.
2. **X6 non tranchée.** Sans contexte service, le rétro-remplissage de `requests` remet en modération (§5.3).
3. **Verrous exclusifs** sur trois tables le temps de la migration. Pour 80 demandes c'est négligeable, pas pour une base plus grande (prérequis : 20 000 lignes maximum).
4. **`ALTER TABLE services`/`requests`** peut attendre un verrou tenu par une transaction longue ; `lock_timeout` 5 s fait échouer proprement.
5. **Privilèges `services`** (X3) restent ouverts tant que 100 n'est pas appliquée.
6. **Contenu en modération** : les demandes `pending` ne reçoivent pas de nœud tant que leur modération n'est pas réglée (V22). À rattraper après coup.
7. **Rôles Supabase** (`authenticator`, `supabase_admin`) non reproduits localement.
8. **Consommateur externe de l'ancienne API** non détectable par lecture de code (§6.1).
9. **Écart banc / Staging trouvé au pré-vol de P3** : `unaccent` et `pg_trgm` sont dans le schéma `public` sur Staging (le banc les mettait dans `extensions`). L'index `lyann_taxonomy_term_trgm_idx` de `01` qualifiait `extensions.gin_trgm_ops` et aurait échoué. Corrigé (nom non qualifié), banc rejoué dans les deux configurations, test ajouté.
10. **Rollback `09` après données v2 réelles** : il supprime les nœuds v2 de `requests`/`services`. Prévu, mais irréversible sans sauvegarde : une sauvegarde logique précède toute migration réelle.

## 9. Fichiers de cette étape

| Fichier | Rôle |
|---|---|
| `docs/taxonomy/migration-draft/03,05,06,07,09` | X5, garde de modération, politique C, V18–V22 |
| `scripts/taxonomy-v2/build.js` | génère 05 |
| `scripts/taxonomy-v2/moderation-fixture.js` | vrai code de modération (70/71) pour le banc |
| `scripts/taxonomy-v2/validate-sql-pglite.js` | banc complet (116 contrôles) ; accepte maintenant un point d'accroche pour P3 |
| `scripts/taxonomy-v2/validate-quotas-pglite.js` | quotas, grandfathering, X3 (76 contrôles) |
| `scripts/taxonomy-v2/p3-rehearsal.js` | constructeur, linter, évaluateur et exécuteur verrouillé de P3 |
| `docs/taxonomy/security-draft/100_*` | X3 : correctif et rollback (NON APPLIQUÉS) |
| `tests/taxonomy-quota.test.js`, `tests/taxonomy-p3-rehearsal.test.js` | tests node du lot |
