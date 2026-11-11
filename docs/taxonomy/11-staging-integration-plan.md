# 11 — Plan d'intégration technique de la taxonomie v2 sur Staging

> **Mise à jour du 11 nov. 2026 (soir) — voir [`12-staging-validation-and-legacy-compat.md`](12-staging-validation-and-legacy-compat.md).** P1 est exécuté (15/15, lecture seule) : **B1 est levé**. P2 est livré localement derrière des drapeaux OFF. Le plan P3-P9 est **amendé** (§6 du document 12 : brouillon `08`, RPC `lyann_sync_profile_skills` protégée, instantané obligatoire, étape facultative T2). **B6** : consommateurs identifiés, garde de gel livré éteint (aucune route désactivée). Nouveaux points ouverts : X1-X5 (document 12, §7). Banc PGlite : **103 contrôles**.

> **Statut : PLAN. Rien n'est appliqué.** Aucune migration, aucune permission créée ou modifiée, aucun déploiement, Production non consultée. Staging n'a pas été interrogé dans cette étape (voir B1).
> Ce qui a été fait : cartographie des dépendances (dépôt), un brouillon SQL supplémentaire (`06`) rejoué en local (PGlite, 66 contrôles), un pré-vol Staging en lecture seule prêt à exécuter. Les étapes marquées **🔐** exigent une autorisation spécifique avant toute exécution.

## 0. Arbitrages retenus et traduction technique

| Décision | Retenu | Traduction technique | Effet sur le plan |
|---|---|---|---|
| **D1** | Validé | 8 familles métier ; 10 tuiles (9 accès thématiques, Maison répartie Dépannage/Travaux, + Autres) ; `autres` n'est jamais une compétence | structure figée ; la RPC de compétences refuse déjà `autres` (testé) |
| **D4** | Conditionnel | `RESTRICTED` + `selectable=false` devient un **état provisoire « ouverture soumise à vérification »**, pas une interdiction de métier. Ouvrir = nouvelle version du catalogue (`RESTRICTED` → `PRO_REQUIRED`, `selectable=true`) + exigences professionnelles associées, après avis juridique. **Protections actuelles maintenues** (`safety_status`, matching `PRO_REQUIRED`, vérification pro) | aucun nœud réglementé n'est ouvert ; formulation produit « activité encadrée, ouverture en cours de vérification » |
| **D5** | À revoir | La formule « partage de frais uniquement » est **retirée** comme principe. Le nœud `covoiturage_trajets` décrit le partage de frais entre particuliers, rien de plus. Transport professionnel de personnes (taxi/VTC, **fluvial**, **maritime**) : à modéliser comme nœuds **fermés** (même mécanisme que D4), **sans ouverture** avant vérification des obligations | blocage B2 ; le plan prévoit l'emplacement, pas l'ouverture |
| **D8** | Validé en principe | **`taxonomy.manage` existe déjà** (migration 17, attribuée au rôle propriétaire) : le brouillon v2 la réutilise, **aucune permission à créer, aucun changement de RBAC**. « Je ne trouve pas mon métier » : plan dédié au §7, non construit | §7 |
| **D11** | Reporté | Aucun recensement Production. Mesures sur Staging, jeux d'audit déjà autorisés et panel de testeurs | les seuils de pertinence « sur demande réelle » ne peuvent pas être attestés avant Production (B3) |
| **D13** | Validé | Taxonomie technique commune aux 5 territoires + vocabulaires locaux (colonne `territories`). **Relecture linguistique avant publication** ; les scores obtenus sur des requêtes rédigées par l'agent ne valent pas validation de terrain | les termes territoriaux sont marqués « non relus » ; exclus de toute publication hors Staging (B4) |

## 1. Corrections de mes conclusions précédentes

La cartographie a invalidé quatre points des documents 09 et 10 ; ils sont corrigés dans le dépôt.

| # | Ce que j'avais écrit | Ce qui est vrai | Conséquence |
|---|---|---|---|
| 1 | « Valeur par défaut `Jardinage` dans l'assistant d'annonce » (A1) | **Introuvable dans le code d'écriture.** Les 48 demandes « Jardinage » de Staging viennent des scripts de recette. La vraie présélection silencieuse est ailleurs (§3, priorité 3) | A1 reformulée ; R14 reformulé |
| 2 | « `taxonomy.manage` n'existe pas encore » | Elle existe (migration 17) et protège déjà `lyann_taxonomy` | D8 n'exige aucune création de permission |
| 3 | Les brouillons suffiraient à la double écriture | **Non** : les builds iOS/Android déjà publiés embarquent leur code web (Capacitor, `webDir: www`, pas d'URL distante) et n'écriront jamais `taxonomy_node_code` | brouillon **`06_dual_write_derivation.sql`** ajouté (déclencheurs) |
| 4 | — | La table de correspondance est réservée à l'administration (RLS) : un déclencheur « invoker » **ne dériverait rien en silence** pour un membre | déclencheurs `SECURITY DEFINER`, `search_path` fixé, fail-open (testé avec un membre sans droit) |

Autres constats : les identifiants de familles de la carte (`plomberie`, `electricite`, `bricolage`, `jardinage`, `menage`, `beaute`, `numerique`, `quotidien`) **diffèrent** de ceux de la taxonomie v2 (`maison`, `jardin`, `entretien`, `beaute`, `transport`, `famille`, `evenement`, `numerique`) ; l'API d'administration de `lyann_taxonomy` (`api/server.js`) exige `moderation.manage` alors que la RLS exige `taxonomy.manage`, et utilise des niveaux de sécurité (`AUTORISE/SURVEILLE/INTERDIT`) qui ne sont pas ceux de la contrainte SQL (`NORMAL/CAUTION/PRO_REQUIRED…`) ; le bouton « Désactiver/Activer » de l'écran admin n'a pas de gestionnaire ; des traces de débogage `[REAL FALLBACK WRITE]` restent dans l'assistant.

## 2. Carte des dépendances (annonces, profils, compétences, filtres, recherche)

| Domaine | Fichiers principaux | Aujourd'hui | Impact v2 | Parade |
|---|---|---|---|---|
| **Création d'annonce** | `discover.html` (`wizardDomain`), `script.js` (~10148-10235, ~11282-11397), `api-client.js` (`createRequest`) | écrit `category` (libellé de la catégorie héritée), `taxonomy_id`, `classification_status='UNCLASSIFIED'` ; défaut `Général` | écrire aussi `taxonomy_node_code` + provenance | règle d'écriture W1-W4 (§4, P7) ; `06` pour les anciens clients |
| **Autres écrivains** | modale de mission (`script.js`), `api/server.js` (Maison), RPC de conversation directe (`42_…sql`), acceptation de devis (`05_…sql`) | `category='Général'` ou copie de la catégorie | `Général` reste « à classer » (NULL) ; la mission copie la catégorie lisible | aucune modification SQL de ces fonctions |
| **Lecture publique** | `api/public-explorer-requests.js`, `explorer-repository.js` | liste blanche de colonnes (`category`, `taxonomy_id`…) ; filtre exact sur le libellé de `lyann_taxonomy.category` | ajouter `taxonomy_node_code` (additif) ; filtrer par code | l'API ne sélectionne la colonne qu'après migration (détection) ; test de contrat |
| **Affichage** | `annonce-format.js` (`categoryLine`), `explorer-ui.js`, `needs-map.js`, `script.js` (5 emplacements), `api-client.js` (favoris), `admin-script.js` | valeur brute si pas de feuille : `Général`, `jardin`, `k7mqp4lyannrc`… | un **résolveur unique** de libellé | chaîne §3 priorité 2 |
| **Filtres, rail, carte** | `needs-map-category-families.js`, `explorer-ui.js`, `needs-map.js`, `app-shell.js` | 8 familles de pins aux identifiants historiques ; `quotidien` = fourre-tout ; liens `?category=jardinage` (slug ≠ libellé) | passer aux 8 familles v2 ; **table d'alias** pour liens et états sauvegardés | §3 priorité 6 |
| **Compétences** | table `services`, RPC `lyann_sync_profile_skills` (83), `api-client.js` (`syncUserSkills`), `profile-completion.js`, **9 boutons dupliqués dans 10 pages HTML** | compétence = titre libre (`title = category`) ; suppression/recréation des stubs | `lyann_profile_skill` + stubs `services` écrits en double ; un seul composant pour les 9 boutons | RPC v2 (testée) ; `06` pour les titres des anciens clients |
| **Annuaire Lyanneurs** | `explorer-repository.js` (`discover`) | tous les mots doivent figurer (sous-chaîne) ; bornes d'accents seulement | filtre par code/famille ; recherche tolérante | §3 priorité 7 |
| **Recherche / matching** | `ai-classifier.js`, `search-engine.js`, `matching-engine.js` | base embarquée de 37 lignes + `lyann_taxonomy` ; pas de radical, pas de faute de frappe ; niveaux de sécurité divergents | module partagé alimenté par le catalogue versionné | §3 priorité 7 |
| **Vérification pro** | `pro-verification-engine.js`, `23_…sql` | 3 clés (`electricite`, `batiment`, `jardinage`) comparées au libellé de catégorie | table nœud/famille → clé d'exigence | table `activity_key` déjà présente dans la correspondance |
| **Administration** | `admin-script.js`, `api/server.js` | lecture/écriture de `lyann_taxonomy` | passage en lecture seule (D9) ; édition v2 via `taxonomy.manage` | B6 |
| **SQL métier** | `39_notifications_and_support.sql` (correspondance par texte), `90/91` (RLS et privilèges de `requests`) | repose sur le texte de catégorie ; pas de privilège par colonne | colonnes additives héritent des droits de table | P09 du pré-vol le confirme |
| **Applications natives** | `capacitor.config.json`, `ios/…/public`, `android/…/public` | **code web embarqué** : les builds publiés ne changent pas | tolérance indéfinie aux champs historiques | `06` + ne jamais écrire un code dans `category` |

## 3. Les huit priorités : mesures et état de la preuve

| # | Priorité | Mesure | Preuve aujourd'hui | Reste à prouver |
|---|---|---|---|---|
| 1 | **Préserver catégories et identifiants** | aucune colonne ni ligne existante modifiée ; `lyann_taxonomy.id`, `requests.taxonomy_id`, `services.title`, `category` intacts ; identifiants de carte conservés comme alias | empreinte MD5 identique avant/après 01-06 et après rollback (PGlite) ; 66 contrôles | idem sur Staging (P3, C01-C03) |
| 2 | **Catégories techniques illisibles** | un **résolveur unique** (chaîne ci-dessous) ; `category` n'est jamais un code | Staging : **17 demandes sur 80 (21 %)** affichent une valeur brute (`Général` 11, `Autre / Je ne trouve pas` 3, `jardin` 1, `autre` 1, `k7mqp4lyannrc` 1) ; 9 points d'affichage identifiés | contrôle DOM (C20) |
| 3 | **Supprimer les présélections incorrectes** | voir ci-dessous | présélections identifiées (`script.js` ~10188-10222) | test d'interface (C21) |
| 4 | **Compatibilité des anciennes annonces** | `06` (dérivation fail-open) + 05 (rétro-remplissage) + résolveur à repli ; API publique additive | 14 contrôles d'anciens clients ; rejeu 05→06→05 neutre | contrat API, E2E avec JS historique (C12-C15) |
| 5 | **Référence métier commune** | `taxonomy_node_code` sur annonces et compétences ; FK posées `NOT VALID` puis validées ; filtres et carte par code | contrôles V07-V14 | C04-C08 |
| 6 | **8 familles sur filtres et carte** | familles v2 ; alias des anciens identifiants ; compteurs liste = carte | table d'alias dérivée de `MAP_FAMILIES` | C17-C19 |
| 7 | **Recherche tolérante** | module partagé (radical léger, accents, mots vides, pondération, ambiguïtés) alimenté par le JSON versionné ; RPC trigramme en complément | prototype : « sûr » 100 % (général) et 92 % (territorial) sur requêtes rédigées par l'auteur — **plancher, pas validation terrain** | C22-C25, panel |
| 8 | **Tests de migration et retour arrière** | PGlite complet + répétition annulée sur Staging + exercice de retour arrière | 66 contrôles locaux, rollback à l'identique, rejouable | C26-C28 (🔐) |

**Priorité 2 — chaîne du résolveur** (jamais de valeur technique affichée) : `taxonomy_node_code` → libellé v2 « Métier › Spécialité » ; sinon `taxonomy_id` → feuille historique (comme aujourd'hui) ; sinon `category` **si elle est lisible** (n'est ni `Général`, ni un identifiant, ni un résidu de test) ; sinon rien — ou « Besoin à préciser » sur les cartes. Les 9 points d'affichage à brancher : `annonce-format.js`, `explorer-ui.js` (carte et pastilles), `needs-map.js`, `script.js` (cartes Bokantaj, détail, liste du compte, liste d'administration), `api-client.js` (favoris), `admin-script.js` (modération).

**Priorité 3 — présélections à supprimer** (relevées dans `script.js`) : au changement d'univers, la **première catégorie** et la **première sous-catégorie** sont sélectionnées d'office (`catSelect.value = univCats[0]`) ; l'univers de repli est « Autres Besoins » ; la sous-catégorie par défaut est « Demande libre » ; la catégorie de repli est « Général » ; le lien d'accueil `?category=jardinage` n'est pas une catégorie valide. Cible : option vide « Choisir… » ; la proposition du classifieur est une **suggestion** que l'utilisateur confirme ; publication impossible sans choix explicite, ou « Autre besoin » assumé ; suppression des `console.trace` de débogage.

**Priorité 6 — alias des anciens identifiants de famille** (liens, états enregistrés, anciens favoris) :

| Ancien | Nouveau filtre |
|---|---|
| `plomberie` | Maison › Plomberie |
| `electricite` | Maison › Électricité, Électroménager, Climatisation |
| `bricolage` | Maison › Bricolage et petits travaux |
| `jardinage` | Jardin et extérieur |
| `menage` | Ménage et entretien |
| `beaute`, `numerique` | identiques |
| `quotidien` | union Famille + Transport + Événementiel (ancien fourre-tout) |

**Règles d'écriture d'un client v2 (dual-write)** : **W1** `category` reçoit toujours un libellé lisible (jamais un code) ; **W2** `taxonomy_id` reçoit la feuille historique équivalente quand elle existe — **seulement 146 des 516 nœuds sélectionnables** en ont une (80 métiers sur 105) : pour les autres, les anciens clients verront le libellé du métier sans pouvoir filtrer par catégorie historique, dégradation connue et acceptée ; **W3** `taxonomy_node_code` + provenance `client`/`classifier` ; **W4** une annonce ou compétence d'ancien client reste valide sans aucun champ v2.

## 4. Plan séquencé

Chaque phase a une **porte de sortie** : on n'avance pas si elle n'est pas verte. Les migrations seront numérotées à l'application (94 à 98) ; les en-têtes actuels des brouillons sont provisoires.

| Phase | Contenu | Où | Autorisation | Porte de sortie | Retour arrière |
|---|---|---|---|---|---|
| **P0** | cartographie, brouillon `06`, banc PGlite étendu, pré-vol rédigé | local | non | 66/66 contrôles, 20 tests | sans objet |
| **P1** | **Pré-vol Staging** : `sql/staging-preflight-readonly.sql` (P01-P15 : permission `taxonomy.manage`, extensions, colonnes, déclencheurs, RLS, privilèges, dépendances, migrations appliquées) | Staging, lecture seule | **🔐** exécution SQL | chaque critère « attendu » vérifié ; écart = arrêt | sans objet |
| **P2** | développement local sans effet visible : résolveur de libellé, alias de familles, wizard sans présélection, module de recherche partagé, champ additif de l'API (détecté), tests mis à jour (§6) | local | non | suites unitaires et E2E locales vertes, drapeau **OFF** par défaut | retirer le drapeau |
| **P3** | **répétition à blanc** : `BEGIN; 01→06; 07; ROLLBACK;` mesure de durée et de verrous ; instantané politiques/privilèges avant/après | Staging | **🔐** | V01-V14 à zéro ; empreintes identiques ; aucune différence de privilèges (migration 91 intacte) | transaction annulée |
| **P4** | application **01→04** (schéma, colonnes, recherche, amorçage) | Staging | **🔐** migration | V01-V06, V12 ; conseillers de sécurité Supabase sans nouvelle alerte | `09_rollback` |
| **P5** | **05 → 06 → 05** : correspondance et rétro-remplissage, puis déclencheurs, puis rejeu (rattrape les écritures de l'intervalle) | Staging | **🔐** migration | V07-V11, V13, V14 ; couverture mesurée ; colonnes historiques inchangées | `09_rollback` |
| **P6** | **lecture** derrière drapeau : résolveur, filtres par code, champ API additif | Staging (web) | **🔐** déploiement Staging | C09-C16 ; anciens clients inchangés | drapeau OFF |
| **P7** | **double écriture** des nouveaux écrans : assistant d'annonce v2 et compétences v2 | Staging | **🔐** | règles W1-W4 ; V09, V10, V13 à zéro sur les nouvelles lignes | drapeau OFF (les anciens écrans écrivent toujours) |
| **P8** | **bascule de lecture** : familles v2 sur filtres et carte, recherche tolérante, alias | Staging | **🔐** | C17-C25 | drapeau OFF |
| **P9** | **validation Staging complète** (§6) + exercice de retour arrière | Staging | **🔐** | tous les contrôles C01-C30 | `09_rollback` |
| **P10** | préparation Production | — | **hors périmètre** : autorisation spécifique, recensement D11, relecture linguistique D13, avis juridique D4/D5 | — | — |

**Pourquoi cet ordre.** (1) Les déclencheurs `06` sont posés **avant** le rejeu du rétro-remplissage : toute ligne écrite entre-temps est soit dérivée, soit rattrapée. (2) Les FK sont posées `NOT VALID` à la création et **validées après** le rétro-remplissage (verrou léger). (3) Le drapeau reste OFF jusqu'à P6 : on peut migrer sans rien changer à l'écran. (4) Les anciens clients ne sont jamais forcés d'évoluer : aucune colonne existante n'est lue différemment.

## 5. Blocages et points ouverts

| # | Blocage | Pourquoi | Qui débloque | Effet si non levé |
|---|---|---|---|---|
| **B1** | Aucune lecture de Staging faite dans cette étape : l'exécution SQL a été refusée par le contrôle automatique | l'état réel (permission, extensions, déclencheurs, politiques) n'est pas confirmé | autorisation d'exécuter `staging-preflight-readonly.sql` (SELECT seulement) | P3 impossible |
| **B2** | D5 : obligations du transport professionnel de personnes (terrestre, fluvial, maritime) non vérifiées | contenu réglementaire à confirmer par un juriste (autorisation d'exercer, assurance, immatriculation, contrôles) | vous / conseil juridique | aucun nœud de transport professionnel ouvert ; « piroguier » reste non classé avec guidage |
| **B3** | D11 reporté : pas de mesure sur la demande réelle | seuils de pertinence et répartition par famille non attestables | décision ultérieure | bascule de lecture Production non justifiable ; Staging seulement |
| **B4** | D13 : relecture linguistique non faite | 136 termes territoriaux sans validation de terrain | relecteurs Guyane, Réunion, Antilles | termes exclus de toute publication hors Staging |
| **B5** | D4 : avis juridique sur les 3 nœuds réglementés | formulation et conditions d'ouverture | conseil juridique | nœuds fermés (état provisoire) |
| **B6** | API d'administration de `lyann_taxonomy` incohérente (droit et niveaux) | `moderation.manage` vs `taxonomy.manage` ; énumérations différentes | décision : geler l'écriture héritée (D9) plutôt que corriger | risque d'écriture invalide tant qu'elle reste ouverte |
| **B7** | Dette de tests : l'API publique, le résolveur et les filtres changent de contrat | fixtures `category: 'Jardinage'`, clés exactes de l'API | P2 | échecs de non-régression |
| **B8** | Ancien code dupliqué : 9 boutons de compétences dans 10 pages | une correction doit être faite dix fois | P2 : composant unique | dérive entre pages |
| **B9** | Lien de dépendance avec `lyann_taxonomy.node_code` | les 3 feuilles `ambiguous` et 35 `split` sont rattachées par défaut (confiance faible) | file de relecture post-P5 | statistiques à exclure par provenance |

Aucun blocage ne nécessite de modifier le RBAC ni de créer une permission.

## 6. Contrôles pour la validation Staging complète

| ID | Domaine | Contrôle | Critère | Mode |
|---|---|---|---|---|
| C01 | Intégrité | empreinte des colonnes historiques de `requests`, `services`, `lyann_taxonomy` avant/après chaque étape | identique | auto |
| C02 | Intégrité | instantané des politiques RLS et privilèges (`P07`, `P08`) avant/après | identique, migration 91 intacte | auto |
| C03 | Intégrité | aucune permission créée ou modifiée (`admin_permissions`, `admin_role_permissions`) | identique | auto |
| C04 | Schéma | V01-V06, V12 | 0 ligne | auto |
| C05 | Schéma | V07-V11 (couverture du rétro-remplissage) | 0 anomalie ; couverture chiffrée | auto |
| C06 | Double écriture | V13, V14 | 0 ligne | auto |
| C07 | Référence commune | toute annonce/compétence avec nœud a une provenance ; FK validées | 0 violation | auto |
| C08 | Référence commune | filtre par code = filtre historique sur les lignes déjà classées | mêmes résultats | auto |
| C09 | API | contrat de l'API publique : clés exactes, colonne additive seulement | test de contrat vert | auto |
| C10 | API | pas de fuite : aucune colonne privée ajoutée à la liste blanche | revue + test | auto |
| C11 | Sécurité | `anon` ne peut rien écrire ; un membre non admin ne modifie pas le catalogue | refus | auto |
| C12 | Anciens clients | rejeu des écritures d'un client historique (fixtures des builds 15/16) : création d'annonce, compétences, modification | acceptées, nœud dérivé ou NULL | auto |
| C13 | Anciens clients | affichage des annonces créées par un client v2 dans le code historique | libellé lisible, aucun code | E2E |
| C14 | Anciens clients | filtre par catégorie historique sur anciennes annonces | résultats inchangés | E2E |
| C15 | Anciens clients | fail-open : anomalie de taxonomie simulée | écriture acceptée | auto |
| C16 | Lecture | résolveur : aucune valeur brute pour les 15 valeurs de Staging | 0 occurrence de `Général`, `k7mq…`, uuid, `UNCLASSIFIED` | auto |
| C17 | Familles | mêmes 8 familles, icônes et teintes sur liste et carte | identiques | E2E |
| C18 | Familles | compteurs liste = compteurs carte pour une même zone | égaux | E2E |
| C19 | Familles | alias des 8 anciens identifiants (liens, `localStorage`) | tous résolus, aucune page vide | auto |
| C20 | Affichage | balayage du DOM sur Découvrir, Lyanneurs, Annonces, carte, compte, favoris, admin | aucune valeur technique | E2E |
| C21 | Assistant | aucune présélection ; publication impossible sans choix ou « Autre besoin » | conforme | E2E |
| C22 | Recherche | jeux d'évaluation (`evaluate.js`) : erreurs silencieuses | 0 | auto |
| C23 | Recherche | tolérance : pluriels, accents, fautes d'un caractère, phrases naturelles | jeu dédié, seuil défini avant mesure | auto |
| C24 | Recherche | panel de testeurs par territoire (formulations libres), double étiquetage | seuils du doc. 10 §8.2 (hors demande réelle) | manuel |
| C25 | Recherche | performance : latence de saisie, taille du catalogue (≈ 66 Ko compressé) | < 100 ms par frappe, chargement différé | auto |
| C26 | Retour arrière | exercice : appliquer 01→06 puis `09_rollback` | état identique (C01-C02) | 🔐 |
| C27 | Retour arrière | rejouabilité après retour arrière | verte | 🔐 |
| C28 | Retour arrière | répétition à blanc (P3) : durée et verrous | mesurés, sans verrou long | 🔐 |
| C29 | Sécurité | conseillers de sécurité et de performance Supabase avant/après | aucune nouvelle alerte | 🔐 |
| C30 | Gouvernance | termes territoriaux non relus absents de tout export publiable | vérifié | auto |

Tests existants à mettre à jour en P2 : `need-classifier`, `needs-map-category-families`, `needs-map`, `annonce-publication-notice`, `editorial-highlights`, `approx-zone-v2`, et en E2E `explorer_public_contract`, `explorer_discovery`, `explorer_persistence`, `annonce_card_structure`, `account_honesty_and_dead_actions`, `business_journeys`, `isolated_jalon_ui`, `surface_close_back`, ainsi que `helpers/qa-fixtures` et les fixtures RLS de `requests`.

## 7. Plan dédié D8 — « Je ne trouve pas mon métier » (non construit)

Objectif : recueillir les métiers manquants **sans écrire dans le catalogue** et sans nouvelle permission.

| Exigence | Conception |
|---|---|
| Stockage | table `lyann_taxonomy_suggestion` (texte tronqué à 120 caractères et normalisé, famille facultative, statut `pending/accepted/rejected/duplicate`, horodatage) ; **aucune donnée de contact** |
| Écriture | uniquement via une RPC `SECURITY DEFINER` (`search_path` fixé, `auth.uid()` vérifié), **5 propositions par jour et par membre**, rejet des textes contenant un lien, un e-mail ou un numéro |
| Lecture | le membre lit les siennes ; l'administration lit via les permissions **existantes** (`taxonomy.read` pour consulter, `taxonomy.manage` pour décider) ; aucune création de rôle |
| Modération | file existante de modération ; aucune publication automatique ; une proposition acceptée devient une **nouvelle version du catalogue**, jamais une écriture directe |
| Vie privée | agrégats pour les statistiques ; suppression à la clôture du compte |
| Tests | RLS (membre/anon/admin), plafond quotidien, injection, rejet des liens, rollback — dans le banc PGlite avant tout Staging |

## 8. Livré dans ce lot

- `docs/taxonomy/migration-draft/06_dual_write_derivation.sql` (déclencheurs de dérivation, fail-open, `SECURITY DEFINER`) ; `07` (V13-V14) et `09` (retour arrière) mis à jour.
- `scripts/taxonomy-v2/validate-sql-pglite.js` : 66 contrôles, dont 14 pour les écritures d'anciens clients.
- `docs/taxonomy/sql/staging-preflight-readonly.sql` : 15 requêtes en lecture seule, **non exécutées**.
- Corrections des documents 01, 07, 09, 10 et du README (voir §1).

**Non livré volontairement** : aucune modification de l'application (assistant, résolveur, filtres, recherche), aucune migration, aucune permission, aucun déploiement.
