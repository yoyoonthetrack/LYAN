# 08 — Plan de migration non destructif

> **Plan — rien n'est appliqué.** Principe directeur : **ajouter, doubler, basculer, déprécier — jamais supprimer ni réécrire** les données historiques. Chaque étape a une porte d'entrée, une sortie vérifiable et un retour arrière.

## 1. Les trois garanties

1. **Aucune donnée historique modifiée** : seules des colonnes NULLables sont ajoutées ; le backfill n'écrit que `node_code`, `taxonomy_node_code`, `taxonomy_node_source` (vérifié par test).
2. **Les anciens clients continuent de fonctionner** (bundles iOS 1.0-15/16, Android existants) : ils lisent `lyann_taxonomy`, `services.title`, `requests.category`/`taxonomy_id`, tous inchangés.
3. **Retour arrière complet à chaque étape** : `09_rollback_taxonomy_v2.sql` restitue l'état exact (empreinte MD5 identique, testée) ; ré-application possible ensuite.

## 2. Séquence

| Étape | Contenu | Environnement | Porte d'entrée | Porte de sortie | Retour arrière |
|---|---|---|---|---|---|
| **0** | Décisions humaines D1-D8 (doc. 09) ; autorisation du recensement Production **en lecture seule** (`sql/readonly-census.sql`) ; revue juridique des 3 nœuds réglementés | — | rapport 3.2B livré | décisions consignées | — |
| **1** | **Répétition à blanc sur Staging** : `BEGIN; 01…05; 07; ROLLBACK;` puis, si vert, application réelle | Staging | étape 0 + sauvegarde / point de restauration | `07_verify` : **zéro ligne** sur V01-V10 ; V11 relevé | `09_rollback` |
| **2** | Lecture seule côté serveur/app **derrière un drapeau** : l'app peut lire l'arbre et appeler `lyann_taxonomy_search` ; aucun écran visible | Staging | étape 1 verte | tests contrat + non-régression des écrans actuels | désactiver le drapeau |
| **3** | **Double écriture** : annonces et profils écrivent le **code** *et* les champs historiques ; RPC `lyann_sync_profile_skills_v2` | Staging | étape 2 | 100 % des nouvelles lignes ont `taxonomy_node_code` ; anciens clients lisent toujours ; pas d'écart (V10 = 0) | désactiver le drapeau d'écriture v2 |
| **4** | **Backfill par lots** (`05`), avec provenance (`backfill_leaf` · `backfill_title` · `backfill_category`) ; file « à classer » pour les non résolus et les `ambiguous` | Staging puis Production | recensement Production relu ; seuil d'ambiguïté accepté | V07-V10 = 0 ; couverture mesurée ; relecture humaine des `ambiguous` | `UPDATE … SET taxonomy_node_code = NULL WHERE taxonomy_node_source LIKE 'backfill_%'` (colonnes ajoutées uniquement) |
| **5** | **Bascule de lecture** : écrans Découvrir, Lyanneurs, Annonces, carte et sélecteur lisent la v2 ; l'ancien classement reste écrit en double | Staging → Production | métriques étape 4 ; revue UX | parcours testés sur appareils (iOS WebKit + Android Chromium) ; pas de régression de recherche | drapeau de lecture → v1 |
| **6** | **Dépréciation** : version minimale d'app exigée après N semaines ; `lyann_taxonomy` passe en lecture seule ; **aucune suppression** | Production | adoption mesurée | trafic ancien clients résiduel < seuil | réactiver la double écriture |

La **Production** n'est touchée qu'aux étapes 4-6, après répétition Staging, avec sauvegarde, créneau creux et `lock_timeout`/`statement_timeout` courts sur les DDL.

## 3. Correspondance ancien → nouveau (résumé)

Détail ligne à ligne : [`05-correspondence-matrix.md`](05-correspondence-matrix.md) et [`generated/legacy-map.csv`](generated/legacy-map.csv).

| Source | Volume | Résultat |
|---|---:|---|
| Feuilles `lyann_taxonomy` | 89 | `exact` 39 · `broad` 10 · `split` 35 · `merge` 2 · `ambiguous` 3 — **toutes couvertes** |
| Titres de compétences (Staging ∪ catalogue Maison) | 103 | `exact` 72 · `broad` 8 · `split` 1 · `ambiguous` 22 |
| Boutons « compétences rapides » | 9 | 9 couverts |
| Catégories libres de `requests.category` | 15 | 15 couvertes (dont 4 vers « Autres ») |
| Familles de pins de carte | 8 | 8 couvertes (`quotidien` éclaté sur Transport / Famille / Événementiel) |
| Clés d'exigences pro | 3 | 3 couvertes (liste de métiers par clé) |

### Catégories ambiguës (décision humaine requise)
| Ancienne feuille | Cible par défaut | Pourquoi |
|---|---|---|
| Mer & Nautisme › Bateau › Entretien & Sortie | `bateau_mecanique_marine` | entretien = mécanique, sortie = activité nautique (autre famille) |
| Transport & Livraison › Aéroport › Transfert | `covoiturage_trajets_aeroport_port` | transport rémunéré de personnes = activité **réglementée** (taxi/VTC) |
| Transport & Livraison › Courses › Livraison courses | `courses_commissions_courses_alimentaires` | courses pour autrui (Famille) ou livraison (Transport) |

### Traitement des `split` (35 feuilles)
Le backfill rattache au **nœud par défaut** (le plus fréquent/sûr) et conserve les alternatives dans `legacy_map.alt_codes` ; à l'étape 4, une **file de relecture** propose les alternatives aux membres concernés ; **jamais de réaffectation silencieuse**.

### Traitement des titres libres
Titre connu → nœud (`backfill_title`). Titre inconnu → **reste NULL** et entre dans la file « à classer » ; le classifieur peut **proposer** (jamais imposer) un nœud. Les 22 titres génériques (« installation », « entretien »…) reçoivent un défaut **de faible confiance** à confirmer par le membre.

## 4. Compatibilité transitoire (règles d'écriture des nouveaux clients)

| Champ historique | Valeur écrite par un client v2 |
|---|---|
| `requests.taxonomy_node_code` | **le code choisi** (métier ou spécialité) |
| `requests.taxonomy_id` | UUID de la feuille historique **de correspondance par défaut** du nœud (table inversée) si elle existe ; sinon NULL |
| `requests.category` | libellé de la **catégorie historique** de cette feuille ; à défaut, libellé court de la **famille** (ex. « Maison & travaux ») |
| `services.title` / `.category` | libellé du nœud (stub historique) ; `taxonomy_node_code` renseigné |
| `classification_status` | **inchangé** par défaut (voir D10 : sa sémantique actuelle est inopérante) |

La table inversée (nœud → feuille historique par défaut) se déduit de `legacy_map` ; les nœuds sans feuille historique (la majorité des 414 spécialités) écrivent `taxonomy_id = NULL`, ce que les anciens clients tolèrent déjà (85 % des demandes Staging n'en ont pas : 68 sur 80).

## 5. Plan de tests

| Famille de tests | Où | État |
|---|---|---|
| Structure (codes, parents, familles, sous-domaines, libellés uniques) | `tests/taxonomy-v2-proposal.test.js` | ✅ vert |
| Couverture de l'existant (89 feuilles, 103 titres, boutons, catégories, carte, clés pro) | idem | ✅ vert |
| Sécurité du référentiel (réglementé non sélectionnable, spécialité ≥ métier) | idem | ✅ vert |
| Classification (jeu principal, hors échantillon, titres réels Staging) | idem | ✅ vert (voir doc. 09 R5 pour la portée) |
| Innocuité des brouillons SQL (étiquette, additif, pas de `DROP`/`TRUNCATE` hors rollback, RLS partout, `search_path`) | idem | ✅ vert |
| **Rejeu SQL complet** (application, vérifications V01-V12, backfill idempotent, recherche, RLS, RPC, **rollback à l'identique**, rejouabilité) | `scripts/taxonomy-v2/validate-sql-pglite.js` | ✅ 47/47 (Postgres embarqué, hors dépôt : `npm i --no-save @electric-sql/pglite`) |
| Répétition sur Staging réel (transaction annulée) | à faire à l'étape 1 | ⏳ |
| Parcours appareils (WebKit 375/390/430, Android Chromium) sur écrans v2 | à faire après implémentation | ⏳ |

## 6. Points de sécurité à vérifier avant chaque application
1. `07_verify` **V12** : RLS active sur les 7 nouvelles tables du référentiel (+ `lyann_profile_skill`).
2. Aucun droit `INSERT/UPDATE` direct pour `anon` ; `legacy_map` illisible hors admin.
3. `SECURITY DEFINER` : `search_path` fixé, contrôle `auth.uid()`, entrée validée par motif strict, refus atomique.
4. Les clés étrangères posées `NOT VALID` sont **validées** après le backfill (`ALTER TABLE … VALIDATE CONSTRAINT`).
5. Aucun identifiant d'environnement dans les scripts (testé : pas d'ID Production).
6. Les conseils de sécurité de la plateforme Supabase (advisors) sont relus **à l'étape 1** — non exécutés en 3.2B (lecture des conseils interdite dans le cadrage de cette phase).

## 7. Indicateurs de réussite par étape
| Étape | Indicateur | Seuil proposé |
|---|---|---|
| 1 | violations V01-V10 | 0 |
| 3 | nouvelles lignes avec code v2 | 100 % |
| 4 | feuilles avec `node_code` | 100 % ; compétences rattachées ≥ 90 % (reste en file) |
| 5 | recherches sans résultat / recherches totales | mesuré avant/après, pas de dégradation |
| 6 | trafic clients < version minimale | < 2 % avant gel de `lyann_taxonomy` |
