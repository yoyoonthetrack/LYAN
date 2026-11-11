# 12 — Validation Staging, compatibilité des anciens clients, gel conditionnel de l'ancienne API

> **Statut : DÉVELOPPEMENT LOCAL + LECTURE SEULE.** Aucune migration appliquée, aucune écriture Supabase, Production non consultée, aucun déploiement, aucune permission modifiée, aucun build iOS/Android.
> Seule interaction avec Staging (`tdktfbtqceldlaeqjtow`, `Lyann-staging-v2`) : les 15 requêtes `SELECT` de `sql/staging-preflight-readonly.sql` (§1), plus une requête de catalogue sur les ACL de colonnes.
> Tout ce qui change le comportement de l'application est derrière un drapeau **désactivé par défaut**.

## 0. Ce qui a été fait, et ce qui ne l'a pas été

| Sujet | Fait | Pas fait (autorisation spécifique requise) |
|---|---|---|
| P1 pré-vol | exécuté, 15/15 requêtes, lecture seule | — |
| P2 développement local | résolveur de libellé, assistant sans présélection, derrière drapeaux OFF ; tests | activation des drapeaux, déploiement |
| B6 ancienne API | consommateurs identifiés ; **garde de gel éteint par défaut** ; aucune route désactivée | activer le gel, supprimer les routes |
| Anciens clients | matrice de 516 nœuds sur le **vrai code** des builds 1.0-15/1.0-16 ; pont véridique ; brouillons SQL (06 enrichi, 08) ; tests | appliquer 06/08, créer des « coquilles » (T2) |

## 1. Pré-vol réel sur Staging (P1)

Conditions vérifiées avant exécution : projet connecté = `tdktfbtqceldlaeqjtow` (`get_project` → `Lyann-staging-v2`, `ACTIVE_HEALTHY`, Postgres 17.11) ; requêtes `SELECT` uniquement ; aucune fonction à effet de bord ; aucune lecture de secret ni de donnée personnelle (catalogues et agrégats) ; aucune modification de permission, de migration ou de donnée.

| # | Contrôle | Attendu | Observé | Verdict |
|---|---|---|---|---|
| P01 | permissions `taxonomy.*` | 2 | `taxonomy.manage`, `taxonomy.read` | ✔ |
| P02 | détenteur de `taxonomy.manage` | propriétaire seul | `OWNER` | ✔ |
| P03 | extensions | `pg_trgm`, `unaccent` | installées (1.6, 1.1) | ✔ |
| P04 | tables v2 existantes | 0 | 0 | ✔ |
| P05 | colonnes | pas de `taxonomy_node_*` | absentes ; `requests.category` text, `classification_status` défaut `UNCLASSIFIED`, `services.category` text | ✔ |
| P06 | déclencheurs | ordre BEFORE à connaître | `requests` : `trg_block_restricted_requests`, `trg_enforce_request_moderation`, `trg_enforce_simplified_request_safety`, `trg_lyann_block_request_close_when_paid` (BEFORE) ; `trg_lyann_notify_matching_request`, `trg_touch_request_moderation_job` (AFTER). `services` : `lyann_category_entitlement` (AFTER INSERT/UPDATE) | ✔ (voir F2, F3) |
| P07 | politiques RLS | instantané | `requests` : SELECT `authenticated` seul (migration 90) ; `lyann_taxonomy` : lecture publique, écriture administrateur | ✔ |
| P08 | privilèges | migration 91 intacte | `requests` anon : DELETE/INSERT/UPDATE ; authenticated : + SELECT (**pas** de TRUNCATE/TRIGGER/REFERENCES) — **`services` anon ET authenticated : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES** | ⚠ voir F4 |
| P09 | privilèges de colonne | aucun | 0 colonne avec ACL propre (`pg_attribute.attacl`) sur `requests` (32 col.) et `services` (17 col.) : les nouvelles colonnes seront couvertes par les droits de table. *(La vue `information_schema.column_privileges` renvoie 18 lignes : ce sont les droits de table projetés par colonne.)* | ✔ |
| P10 | fonctions dépendantes | à relire | `get_user_trust_and_reputation`, `lyann_guard_category_entitlement`, `lyann_notify_matching_request`, `lyann_sync_profile_skills` | ⚠ voir F1, F3, F5 |
| P11 | vues dépendantes | 0 | 0 | ✔ |
| P12 | catégories de demandes | = snapshot | 80 demandes : `Jardinage` 48 (0 feuille), `Général` 11, `Plomberie` 5 (3), `Autre / Je ne trouve pas` 3, `Couture` 2 (2), `Bricolage` 2 (2), 9 valeurs isolées dont `jardin`, `autre`, `k7mqp4lyannrc` (résidu de recette) | ✔ identique |
| P13 | `classification_status` | — | `UNCLASSIFIED` : 80 (aucune annonce classée par le classifieur) | ✔ |
| P14 | doublons de compétences | 0 | 0 (208 services au total, 89 feuilles `lyann_taxonomy`) | ✔ |
| P15 | migrations | 94-99 libres | dernière : `20261110034620 93_editorial_highlights_staging` | ✔ |

### Faits nouveaux que le pré-vol et la cartographie ont fait apparaître

| # | Fait | Conséquence sur le plan |
|---|---|---|
| **F1** | `lyann_guard_category_entitlement` (trigger AFTER sur `services`) compte les `category` **distinctes** par propriétaire et les compare au plafond du forfait. | Ne **jamais** changer la sémantique de `services.category` sans décision commerciale. Les compétences v2 écrivent `category = title` comme aujourd'hui. |
| **F2** | Les triggers BEFORE de `requests` sont `trg_*` ; nos déclencheurs `lyann_requests_*` passent **avant** (ordre alphabétique) : modération et restrictions voient les champs déjà dérivés/projetés. | Plus strict, jamais plus permissif. À rejouer en P3. |
| **F3** | `lyann_notify_matching_request` (alertes de correspondance) est textuelle. | Aucun changement nécessaire ; les alertes ne dépendent pas des nouveaux champs. |
| **F4** | **`services` : `anon` et `authenticated` ont encore `TRUNCATE`, `TRIGGER`, `REFERENCES`** (la migration 91 n'a traité que `requests`). La RLS ne protège pas `TRUNCATE`. | **Constat de sécurité, hors périmètre de cette phase (aucune permission modifiée).** À traiter par une migration dédiée sur le modèle de 91 ; indépendant de la taxonomie. Voir §7. |
| **F5** | L'ancienne RPC `lyann_sync_profile_skills` (migration 83) **supprime tout stub de profil absent de la liste de titres envoyée**. Un ancien client enregistrant son profil effacerait les compétences v2. | **Corrigé dans le brouillon 06** (protège les compétences à nœud explicite) ; rollback = définition de 83 restituée à l'identique. Prouvé (§5). |
| **F6** | Les anciens builds chargent la liste des feuilles **depuis la base** (`lyann_taxonomy`), pas depuis leur code. | Levier T2 (§4.6) : une ligne ajoutée côté serveur apparaît dans les filtres d'un ancien build sans mise à jour. |
| **F7** | Brouillon 06 initial : une valeur explicite v2 n'était jamais recalculée, même si un ancien client écrivait ensuite une autre catégorie → nœud contredit par la catégorie visible. | Règle 3 enrichie (§5) : recalcul seulement si valeur **informative et contradictoire** ; les replis (« Général », « Autre / Je ne trouve pas ») ne contredisent rien. |

## 2. Développement local P2 (drapeaux OFF)

Nouveau module pur `taxonomy-ux.js` (aucun réseau, aucune écriture, aucun DOM), chargé avant `annonce-format.js` sur les 4 pages concernées (`discover`, `results`, `bienvenue`, `feed`). Drapeaux : `window.LYANN_FEATURES.taxonomyResolver` et `.taxonomyNoPreselect`, **`=== true` strict**, posés par aucun fichier du dépôt.

**Résolveur de libellé** (`taxonomy_node_code` → feuille historique → `category` *si lisible* → rien). Aucune valeur technique n'est jamais affichée : `Général`, UUID, `UNCLASSIFIED`, snake_case, résidu de recette (`k7mqp4lyannrc`). Les 15 valeurs de catégorie de Staging sont testées. Points câblés : `annonce-format.categoryLine`, liste « mes annonces », badge du détail d'annonce, favoris (`api-client.js`). Drapeau éteint : valeur brute **octet pour octet** (test).

**Assistant sans présélection métier.** Aujourd'hui `syncWizardTaxonomyDropdowns` coche d'office la première catégorie ou « Autre / Je ne trouve pas ». Drapeau allumé : trois listes qui commencent par une option vide, aucune valeur « parce qu'elle est première », seule une proposition `CLASSIFIED` **présente dans la taxonomie** est reprise, changer un niveau vide les suivants, « Demande libre » et « Autre » restent des sorties explicites, publication refusée sans catégorie. Un classifieur qui répond « Autres Besoins » n'est **pas** une proposition métier. La fonction réelle de `script.js` est extraite et exécutée sur de faux `<select>` dans les tests.

Non fait (hors autonomie ou dépendant de P3+) : filtres par code de nœud, écriture du nœud, champ additif de l'API publique, module de recherche partagé, alias de familles.

## 3. B6 — ancienne API de gestion de la taxonomie

**Routes** : `GET /v1/admin/taxonomy` (tout administrateur actif), `POST /v1/admin/taxonomy` et `PATCH /v1/admin/taxonomy/:id` (`moderation.manage`, alors que la permission dédiée est `taxonomy.manage`).

**Consommateurs identifiés** (dépôt, builds 1.0-15 et 1.0-16 archivés inclus) :

| Consommateur | Appel | Dépend du gel ? |
|---|---|---|
| `admin-script.js` (aussi embarqué dans 1.0-15/1.0-16) | **GET** uniquement (tableau « Taxonomie » du back-office) | non — lecture jamais gelée |
| `scripts/admin-pr5-staging-circuit.js` | **GET** (recette) | non |
| Quiconque d'autre | **aucun appel POST ni PATCH** dans le dépôt ni dans les builds | non |

**Constats** : POST échoue toujours contre la contrainte de la table (`AUTORISE/SURVEILLE/INTERDIT` envoyés ≠ `NORMAL/CAUTION/PRO_REQUIRED/RESTRICTED/PROHIBITED` attendus) ; PATCH fonctionne mais n'a aucun appelant ; ces écritures passent par la clé service (contournent la RLS) et ne passent pas par `taxonomy.manage`. Les boutons correspondants du back-office sont inertes.

**Conséquences d'un gel des écritures** : aucune pour l'application, le back-office ou les anciens clients (ils ne l'appellent pas). **Un gel de la lecture, lui, casserait le tableau d'administration** et les anciens builds : non retenu.

**Livré** : variable `LYANN_FREEZE_LEGACY_TAXONOMY_WRITES`, **égale à `true` stricte**, éteinte par défaut. Allumée : POST et PATCH répondent `423 LEGACY_TAXONOMY_FROZEN` **après** la vérification des droits (un non-administrateur reste 401/403) et avant toute écriture. GET inchangé. Aucune route supprimée, **RBAC et RLS intacts**. Testé (variable, ordre dans le gestionnaire, absence de DELETE, consommateurs).

**Alternative sécurisée prévue** (non construite) : API v2 `/v1/admin/taxonomy/v2/*` protégée par **`taxonomy.manage`** (déjà existante, D8), écrivant dans les tables de nœuds avec audit, versions de catalogue et refus de rendre sélectionnable un nœud `RESTRICTED`/`PROHIBITED`. Tant qu'elle n'existe pas, le gel est sans risque (aucun appelant). **Recommandation** : allumer le gel sur Staging dès l'autorisation de déploiement Staging, retirer les routes d'écriture seulement après l'API v2.

## 4. Compatibilité des anciens builds iOS/Android

### 4.1 Comment un ancien build trouve une annonce ou un Lyanneur

Les builds embarquent leur JavaScript (`webDir: www`, pas d'URL distante) : leurs filtres tournent **sur le téléphone**, sur les données lues dans Supabase. Menu de filtres = lignes de `lyann_taxonomy` (**dynamique**). Une annonce correspond à un filtre « feuille » seulement par `taxonomy_id` ; à un filtre « catégorie » par `taxonomy_id`, par **égalité du nom** de catégorie, ou par recoupement de mots (`matchesTaxonomy`). Les **services (compétences) n'ont pas de `taxonomy_id`** : texte seulement (titre, catégorie). Les épingles de carte viennent d'une heuristique par mots-clés (repli « quotidien »). Les invités lisent `/v1/explorer/requests` (côté serveur, donc adaptable).

Le code de `matchesTaxonomy` est **identique** dans 1.0-15, 1.0-16 et le code courant (empreinte `e37c3461714d`) : une seule simulation vaut pour les trois, vérifiée par un échantillon rejoué sur chacun (0 écart).

### 4.2 Règle absolue et pont véridique

> Jamais de fausse catégorie métier pour « faire marcher » un filtre.

Un pont n'existe que si la feuille (ou catégorie) historique est **identique** au nœud, ou **plus large et le contient**. Il n'est **jamais plus précis** que le nœud. Cinq types : `direct` (86 nœuds), `covered` (54, feuille plus large), `inherited` (181, spécialité d'un métier ponté), `category` (62, tout ce que l'ancienne taxonomie sait dire du métier tient dans **une** catégorie), `none` (133). Écriture historique d'un nœud : feuille **seulement si elle est la seule possible**, sinon sa catégorie commune si elle est unique, sinon **rien** (jamais « Général » déguisé en choix).

### 4.3 Matrice (516 nœuds sélectionnables, code réel de TF 1.0-16)

Fichiers : `generated/legacy-compat-matrix.csv` (une ligne par nœud) et `.json` (détail, paramètres de parité).

| Mesure | Écriture naïve (libellé v2 dans `category`) | **Pont véridique** |
|---|---|---|
| Nœuds retrouvés par le filtre de leur catégorie (et de leur feuille si écrite) | 133 (26 %) | **382 (74 %)** |
| Nœuds sans équivalent véridique (**non filtrables**) | 383 | **134 (26 %)**, dont 3 volontaires (famille « autres ») |
| Faux positifs de **feuille** (un filtre de feuille accroche hors pont) | — | **0** |
| Bruit de catégorie voisine (33 nœuds) | — | hérité du code ancien : « Déménagement » accroche « Ménage », « Garde d'enfants » accroche « Garde d animaux », « Peinture » accroche « Peinture & Dessin »… **Déjà présent aujourd'hui pour tout enregistrement historique**, le pont n'y ajoute rien (prouvé en test) |
| Épingle de carte dans la bonne famille v2 | 223 / 516 | 350 / 516 (les autres retombent sur l'heuristique ancienne, pour les enregistrements historiques aussi) |

**Non filtrables par famille** (134) : maison 31, entretien 30, numérique 20, jardin 14, beauté 14, événementiel 12, transport 7, famille 3, autres 3. Exemples réels : alarme/portail, solaire, plâtrerie/isolation, ferronnerie, clôtures, termites/humidité, rénovation tous corps d'état, paysagisme, nettoyage extérieur, linge/repassage, nuisibles, rangement, conciergerie, esthétique, activités nautiques, randonnée, remorquage, mécanique marine, organisation d'événements, cuisine à domicile, vidéo, domotique, secrétariat. 32 **métiers (ou spécialités isolées)** en sont la racine (liste dans le JSON, `shellScenario.shellRows`).

**Impact réel** : sur Staging, les 80 annonces portent 15 valeurs, **toutes** retrouvables aujourd'hui ; les 134 nœuds non filtrables concernent les **futures** annonces écrites avec un nœud v2 par un nouveau client, et ne sont perdus que pour les filtres **structurés** d'un ancien build. Par texte libre, l'annonce reste trouvable si son titre contient les mots du métier (75 des 133 nœuds « none » accrochent au moins un filtre par recoupement de mots, parfois un filtre voisin : on ne s'en prévaut pas).

### 4.4 Compétences (Lyanneurs) — aucun champ structuré

Un ancien filtre ne lit que `title`/`category`. Trois politiques d'écriture pour une compétence v2 :

| Politique | Titre / catégorie écrits | Nœuds atteignables | Effet sur le quota (F1) |
|---|---|---|---|
| A — libellé seul (brouillon actuel) | `Fuite & recherche de fuite` | 255 / 383 (67 %) | aucun |
| **C — titre composé** | `Plomberie · Fuite & recherche de fuite` (`category = title`) | **364 / 383 (95 %)** | **aucun** (une catégorie distincte par compétence, comme aujourd'hui) |
| B — `category` = catégorie historique | libellé + `category` historique | 382 / 383 | **oui : plusieurs compétences partagent une catégorie → le plafond de catégories du forfait change de sens** |

**Recommandation : C**, qui n'exige aucune décision commerciale. B est exclu tant que le quota n'est pas redéfini. Les nouveaux clients affichent le libellé du nœud, pas le titre composé.

### 4.5 Stratégies, par ordre d'engagement croissant

| | Stratégie | Couverture des anciens filtres | Écriture requise | App à mettre à jour ? |
|---|---|---|---|---|
| **T1** | **Pont véridique** : le serveur complète `category`/`taxonomy_id` d'une annonce écrite avec un nœud (brouillon **08**, 382 lignes générées) ; titre composé pour les compétences | 382 / 516 (74 %) | migration 08 (🔐) | non |
| **T2** | **Coquilles de compatibilité** : 32 lignes ajoutées à `lyann_taxonomy` (une par métier sans équivalent), chacune **exactement aussi précise que son métier** (`catégorie = sous-catégorie = libellé du métier`). Les anciens builds les affichent dans leurs menus **sans mise à jour** | **513 / 516** (reste « autres », volontaire) | insertion dans `lyann_taxonomy` + lignes de correspondance (🔐, `taxonomy.manage`) | non |
| **T3** | Mise à jour de l'application (nouveaux builds) | 100 % | — | **oui** |

Résultat de la simulation T2 : **0 faux positif de feuille, 0 enregistrement historique accroché par une catégorie coquille**, bruit de catégorie voisine passant de 33 à 43 nœuds (recoupements de mots entre nouveaux libellés, même mécanisme que l'existant). **Conséquence à décider** : les coquilles apparaissent aussi dans l'**assistant** des anciens builds (ils pourraient publier dans ces catégories, ce qui est souhaitable, à condition d'ajouter la ligne de correspondance pour que 06 les rattache au nœud) et dans la liste Lyanneurs.

### 4.6 Quand la mise à jour de l'application reste indispensable

1. Afficher les **libellés v2** et les 9 domaines : un ancien build ne montre que ses catégories (le pont ne le change pas).
2. Les **3 nœuds de la famille « autres »** et tout futur nœud sans équivalent si T2 est refusée (134).
3. **Filtres de compétences structurés** : pas de `taxonomy_id` sur `services`, texte seulement (95 % avec la politique C, jamais 100 %).
4. **Recherche tolérante, familles v2, carte par famille v2, classifieur v2** : code client.
5. Annonces d'un ancien build : pour les **nouveaux** métiers sans coquille, l'ancien assistant ne peut pas les proposer.

### 4.7 Transition vers les nouveaux builds

(1) Déployer migrations 01→06, 08 : **rien ne change** pour personne. (2) Nouveaux builds : écrivent nœud + champs historiques (ou laissent le serveur les compléter), lisent par code. (3) Anciens builds : continuent d'écrire catégorie/feuille ; 06 les rattache au nœud, **sans jamais écraser un choix** et sans inventer de catégorie. (4) Mesurer la part d'écritures `derived_*` vs `client` pour décider du retrait du support ancien ; **aucune date de coupure** n'est proposée ici.

## 5. Brouillons SQL : ce qui a changé (banc PGlite 66 → 103 contrôles, tous verts)

| Fichier | Changement |
|---|---|
| `06_dual_write_derivation.sql` | **aides de cohérence** (`lyann_legacy_value_is_placeholder`, `lyann_node_related_to`, `lyann_request_legacy_matches_node`, `lyann_service_legacy_matches_node`, `SECURITY DEFINER`, droits retirés) ; **règle 3** : un nœud explicite est recalculé si l'ancien client écrit une valeur **informative** qui le **contredit** (replis « Général »/« Autre » : jamais) ; **RPC `lyann_sync_profile_skills` protégée** (compétences v2 conservées, comportement identique pour les anciens stubs) |
| `07_verify_taxonomy_v2.sql` | **V10** assouplie (une annonce v2 peut être plus précise que la feuille, jamais ailleurs) ; **V12** inclut la table de projection ; **V15** (feuilles de projection existantes), **V16** (jamais plus précis que le nœud), **V17** (rien vers « autres ») |
| `08_legacy_projection.sql` | **nouveau, généré** (`build-legacy-projection.js`, test d'identité avec la régénération) : table `lyann_taxonomy_legacy_projection` (382 lignes, RLS, illisible pour les membres) + trigger `lyann_requests_legacy_projection_trg` ; ne complète que si les champs historiques sont vides, de repli ou le libellé v2 recopié ; recalcule si le nœud change sans que les champs suivent ; **fail-open** |
| `09_rollback_taxonomy_v2.sql` | retire trigger, fonctions, table de projection ; **restitue la RPC de la migration 83 à l'identique** (haché et comparé) |

Cas prouvés : feuille cohérente conservée ; catégorie du pont (« Plomberie ») conservée ; replis conservés ; feuille d'une autre catégorie → re-dérivée ; valeur informative sans équivalent → « à classer » (jamais de nœud inventé) ; nœud sans pont → **rien d'écrit** ; catégorie choisie jamais écrasée ; anomalie de taxonomie → écriture acceptée.

## 6. Plan de migration et de retour arrière (mis à jour)

Les migrations sont numérotées à l'application (94 à 99, libres).

| Étape | Contenu | Autorisation | Porte de sortie | Retour arrière |
|---|---|---|---|---|
| P3 | répétition **à blanc** `BEGIN; 01→06; 08; 07; ROLLBACK;` : durée, verrous, instantané politiques/privilèges, **ordre des déclencheurs** (F2), empreinte de `lyann_sync_profile_skills` | 🔐 | V01-V17 à zéro ; empreintes identiques ; migration 91 intacte | transaction annulée |
| P4 | 01→04 (schéma, colonnes NULLables, recherche, amorçage) | 🔐 | V01-V06, V12 ; aucun nouveau conseil de sécurité | `09` |
| P5 | **05 → 06 → 05** (correspondance + rétro-remplissage, déclencheurs + RPC protégée, rejeu) | 🔐 | V07-V11, V13, V14 ; colonnes historiques inchangées | `09` (restitue la RPC 83) |
| P5b | **08** projection historique (facultatif, T1) | 🔐 | V15-V17, V10, V13, V14 | `09` |
| P5c | **T2** coquilles (facultatif) : lignes `lyann_taxonomy` + correspondance exacte | 🔐 + droit `taxonomy.manage` | 0 faux positif de feuille (matrice rejouée) ; menus anciens builds relus | suppression des lignes `shell-*` (aucune annonce ne peut y pointer avant P7) |
| P6-P9 | inchangés (doc. 11) : lecture derrière drapeau, double écriture, bascule, validation complète | 🔐 | C01-C30 | drapeaux OFF / `09` |

**Instantané obligatoire avant P5** : définition de `lyann_sync_profile_skills` (restituée à l'identique par `09`), politiques et privilèges de `requests`, `services`, `lyann_taxonomy`.

## 7. Points qui exigent une vraie décision

| # | Décision | Options | Recommandation |
|---|---|---|---|
| **X1** | Atteindre les 134 nœuds non filtrables : **T2** (coquilles) ou accepter T1 + mise à jour | T2 = écriture dans `lyann_taxonomy` visible des anciens clients (menus, assistant) | **T2 seulement si** le produit accepte que 32 nouvelles catégories apparaissent chez les anciens utilisateurs ; sinon T1 + T3 |
| **X2** | Politique d'écriture des compétences | A / **C** / B | **C** ; B exige de redéfinir le quota de catégories du forfait |
| **X3** | **`services` : TRUNCATE/TRIGGER/REFERENCES encore ouverts à `anon` et `authenticated`** (F4) | migration dédiée type 91 / statu quo | **traiter** (hors taxonomie, hors de cette phase) ; indépendant du verdict ci-dessous |
| **X4** | Activer le gel `LYANN_FREEZE_LEGACY_TAXONOMY_WRITES` sur Staging | oui / non | oui, avec le prochain déploiement Staging ; aucune route supprimée avant l'API v2 |
| **X5** | Feuille ou catégorie seule pour les spécialités héritées (08) | feuille du métier (retrouvable par filtre de feuille) / catégorie seule | feuille (plus large que la spécialité, donc véridique) — à confirmer, affichage ancien « CATÉGORIE · feuille » |
| D4, D5, D11, D13 | inchangées (avis juridique, recensement, relecture linguistique) | — | — |

## 8. Verdict pour la répétition de migration sur Staging

**GO conditionnel** pour **P3 puis P4→P5b** (répétition à blanc, puis application sur Staging) : préconditions du pré-vol toutes vérifiées, brouillons additifs, fail-open, rollback prouvé à l'identique (103/103), anciens clients protégés (RPC 83, règle 3, projection véridique), rien de ce qui est exécutable n'allume de drapeau. Conditions : **autorisation spécifique** d'écriture/migration ; instantanés du §6 ; exécution dans l'ordre ; arrêt au premier contrôle V non nul.

**NO-GO** pour : activation des drapeaux, T2/P5c (décision X1), Production, déploiement, et tout changement de permission (X3 est un constat, pas un correctif de cette phase).

## 9. Fichiers de cette étape

`taxonomy-ux.js`, `annonce-format.js`, `script.js`, `api-client.js`, 4 pages HTML (balise de script) · `api/server.js` (garde B6) · `scripts/taxonomy-v2/{compat,compat-matrix,build-legacy-projection,validate-sql-pglite}.js` · `docs/taxonomy/migration-draft/{06,07,08,09}*.sql` · `docs/taxonomy/data/legacy-taxonomy-staging.js` · `docs/taxonomy/generated/legacy-compat-matrix.{json,csv}` · `tests/taxonomy-ux.test.js` (17), `tests/taxonomy-compat.test.js` (16), `tests/taxonomy-v2-proposal.test.js`.

Régénération : `node scripts/taxonomy-v2/compat-matrix.js` (≈ 3 min), `node scripts/taxonomy-v2/build-legacy-projection.js`, `PGLITE_PATH=… node scripts/taxonomy-v2/validate-sql-pglite.js`.
