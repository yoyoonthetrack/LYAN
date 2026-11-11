# 09 — Risques, ambiguïtés et décisions à prendre

> **Arbitrages retenus le 11 nov. 2026** (D1 validé, D4 conditionnel, D5 à revoir, D8 validé en principe, D11 reporté, D13 validé) : voir [`11-staging-integration-plan.md`](11-staging-integration-plan.md) §0. Les recommandations ci-dessous sont celles soumises à la revue ; D4, D5, D8 et D11 sont **modifiées** par ces arbitrages.
>
> **Synthèse et recommandations arbitrables : voir [`10-product-review.md`](10-product-review.md) §0 et §5.** La validation humaine est réservée à **la structure métier finale** et à **toute future migration**. Ce document liste ce qui doit être tranché ; pour chaque décision, une **recommandation** est donnée, jamais appliquée.

## 1. Décisions à prendre (par ordre d'impact)

| # | Décision | Recommandation | Alternative | Impact si on change |
|---|---|---|---|---|
| **D1** | **8 familles vs 9 domaines sur Découvrir** | 8 familles ; **Maison** exposée par **2 tuiles** (Dépannage / Travaux) → 9 tuiles + « Autres » en 10ᵉ | scinder Maison en deux familles (9 familles) | modèle, carte (pins), correspondance : changement mécanique car `group` est déjà séparé |
| **D2** | **Sport dans « Beauté, bien-être et sport »** | garder (8 familles) | famille « Sport & loisirs » dédiée (9 familles) | 5 métiers sport/nautique bougent ; codes inchangés |
| **D3** | **Frontière traiteur ↔ cuisine à domicile** (« plats créoles pour dimanche » est réellement ambigu) | 2 métiers distincts + question de précision | fusionner en un métier « Cuisine & traiteur » | 2 métiers, ~12 spécialités |
| **D4** | **Activités réglementées** (leçons de conduite payantes, aide à la toilette/soins, traduction assermentée) | nœuds **non sélectionnables** + renvoi vers un guide | autoriser avec justificatif obligatoire | contrainte SQL à assouplir ; flux de vérification |
| **D5** | **Transport rémunéré de personnes** (aéroport, trajets) | **partage de frais uniquement** ; « Transfert aéroport » rattaché au covoiturage avec rappel | interdire / exiger statut pro VTC | modération, textes, éventuelle vérification |
| **D6** | **Courses pour autrui** : Famille ou Transport ? | métier `courses_commissions` en **Famille**, secondaire **Transport** | primaire Transport | 1 métier ; comptage des annonces |
| **D7** | **Remontée des recherches sans résultat** pour enrichir les synonymes | compteur **agrégé**, texte tronqué et normalisé, sans identifiant de membre | ne rien collecter | privacy (mentions légales, consentement), table de télémétrie |
| **D8** | **Qui administre la taxonomie** et comment sont acceptés de nouveaux métiers | permission `taxonomy.manage` (**déjà existante**, migration 17 : aucune création) + formulaire « Je ne trouve pas mon métier » modéré (plan dédié, doc. 11 §7) | passer par migration SQL uniquement | RBAC admin, back-office |
| **D9** | **Sort de `lyann_taxonomy`** | conserver en lecture seule (jamais de suppression), gel après adoption | purge future | aucune avant l'étape 6 |
| **D10** | **`classification_status`** (UNCLASSIFIED sur 80/80) | le **dériver** (`CLASSIFIED` si `taxonomy_node_code` renseigné, provenance `user`/`classifier`) | conserver la colonne telle quelle | logique serveur, tableaux admin |
| **D11** | **Recensement Production lecture seule** | à autoriser explicitement (requêtes prêtes, agrégats seulement) | décider sans données réelles | la répartition de la demande reste inconnue |
| **D12** | **Langues comme attribut** plutôt que nœuds | langue = attribut libre (traduction : 4 langues → 1 nœud) | un nœud par langue | volume de la table de termes |
| **D13** | **Périmètre territorial du vocabulaire** *(révisée en 3.2B-revue)* | **structure unique** pour les 5 territoires du produit (Guadeloupe, Martinique, Saint-Martin, Guyane, La Réunion) + **vocabulaire par région** : colonne `territories` (`antilles`, `guyane`, `reunion` ; NULL = partout), lot rédigé puis **relu par des locuteurs** avant publication | Antilles seules (écartée : sondage = Antilles 70 %, Guyane 50 %, Réunion 30 % de classements stricts avant enrichissement) | ajout de termes `local` et de valeurs `territories`, sans changement de structure |

## 2. Risques

| # | Risque | Gravité | Probabilité | Parade |
|---|---|---|---|---|
| **R1** | **35 feuilles `split` et 3 `ambiguous`** : un rattachement par défaut peut être faux | moyenne | élevée | provenance du backfill ; file de relecture ; jamais de réaffectation silencieuse ; alternatives conservées |
| **R2** | **Termes partagés** : 200 termes normalisés apparaissent dans plusieurs métiers | moyenne | élevée | pondération par partage ; registre d'ambiguïtés (33) ; `generated/shared-terms.csv` à relire par un éditeur ; test bloquant au-delà de 4 métiers |
| **R3** | **Anciens clients** (iOS 1.0-15/16, Android) | haute | certaine | colonnes ajoutées uniquement ; double écriture ; stubs `services` ; version minimale tardive (étape 6) |
| **R4** | **Mauvaise classification silencieuse** (faux positif) | haute | moyenne | statut `NEEDS_CLARIFICATION` ; proposition toujours modifiable ; aucune écriture automatique sans confirmation ; seuil de confiance |
| **R5** | **Portée limitée de la mesure de qualité** : jeux de tests écrits par l'auteur du vocabulaire (biais) ; Staging = recette (≈ 60 % de « qa ») ; 1ʳᵉ passe sur titres réels : au moins 5 échecs sur 14 avant réglage | haute | certaine | **ne pas annoncer de précision réelle** ; mesurer avec `census-coverage.js` sur le recensement Production (D11) ; jeu hors échantillon rédigé après réglage et jamais utilisé pour ajuster |
| **R6** | **Réglementation** : les notes `regulation` sont des repères, pas un avis juridique | haute | moyenne | revue juridique des nœuds `CAUTION`/`PRO_REQUIRED`/`RESTRICTED` avant publication ; libellés neutres |
| **R7** | **Double écriture divergente** (ancien vs nouveau) | moyenne | moyenne | `V10` (incohérence ancien/nouveau) ; test de non-régression ; drapeau de double écriture |
| **R8** | **Charge éditoriale** : 7 007 termes saisis à la main, à maintenir | moyenne | élevée | gouvernance (D8), version publiée, tests de collision, génération depuis une source unique |
| **R9** | **Divergence Staging ↔ Production** (schéma, volumes, FK) | moyenne | moyenne | répétition à blanc ; recensement Production ; codes texte identiques d'un environnement à l'autre |
| **R10** | **Verrous et durée** des DDL/backfill en Production | moyenne | faible | colonnes NULLables (métadonnées), FK `NOT VALID`, backfill par lots, `lock_timeout`, créneau creux |
| **R11** | **Découvrabilité** : un métier absent de la liste | moyenne | moyenne | recherche par problème/synonyme, « Autres », suggestion de métier modérée |
| **R12** | **Réutilisation d'un code** après désactivation | haute | faible | trigger d'immuabilité ; pas de suppression ; test |
| **R13** | **Multi-famille** : double comptage ou affichage dupliqué | faible | moyenne | famille primaire unique + secondaires (comptées une fois) |
| **R14** | **Données de recette en Production** (catégorie « Jardinage » issue des scripts) | moyenne | inconnue | provenance `backfill_category` exclue des statistiques ; correction du défaut de l'assistant (action **A1**, `10-product-review.md` §10) |
| **R15** | **Taille / performance** de la recherche | faible | faible | index GIN trigramme ; arbre ≈ 90 Ko ; surveiller > 100 000 termes |

## 3. Ambiguïtés relevées pendant l'audit

1. **Le brief demande « 8 familles » et « 9 domaines »** : résolu par D1 (une famille, deux tuiles) — c'est une interprétation, pas un fait.
2. **Catégorie « Jardinage »** : 48/80 demandes Staging, toutes issues de scripts de recette. **Vérifié (doc. 11) : ce n'est pas un défaut du code d'écriture** ; en revanche l'assistant présélectionne la première catégorie et la première sous-catégorie d'un univers, ce qui fausse tout autant les statistiques (action **A1** : ne présélectionner aucun métier).
3. **« Autres Besoins »** existe dans l'assistant mais pas dans la base ; **« Général »** et **« Service direct »** (11 demandes) sont des catégories libres sans équivalent. La proposition les mappe sur la famille **Autres** (`autre_demande_non_classee`, `autre_demande_service_direct`).
4. **Les 8 familles de pins de la carte** ne coïncident pas avec les 18 univers de l'assistant ni avec les domaines de Découvrir : trois découpages parallèles aujourd'hui.
5. **`classification_status`** n'a pas de sémantique vérifiable aujourd'hui (voir D10).

## 4. Limites de cette phase (à ne pas surinterpréter)
- **Aucune lecture Production** : les volumes et la répartition réelle de la demande sont inconnus.
- Les jeux de classification et le vocabulaire sont **écrits par l'auteur** de la proposition ; le jeu « hors échantillon » est rédigé après le réglage mais reste de même origine.
- Le rejeu SQL a eu lieu dans **PGlite** (Postgres embarqué, fonctions `auth.uid()` et `has_admin_permission` **simulées**) et non sur le Postgres de Staging : il valide la logique et la réversibilité, pas l'environnement réel (extensions, rôles, volumes). L'étape 1 du plan doit le refaire sur Staging.
- Aucun écran n'a été modifié ; l'UX est une proposition sans test utilisateur.
