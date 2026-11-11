# LYANN — Taxonomie v2 : audit et conception (phase 3.2B)

> **Statut : PROPOSITION. Rien n'est implémenté, rien n'est appliqué.**
> Branche `feature/v3-2b-taxonomy-audit` (issue de `7d42905`, dernier commit de la phase 3.2A).
> Aucune écriture Supabase, aucune migration, aucun déploiement, **Production non consultée**. Staging consulté en **lecture seule** (`SELECT` d'agrégats, sans donnée personnelle).

## En une page

- **8 familles + « Autres »**, **105 métiers**, **414 spécialités**, **7 007 termes de recherche** (synonymes, problèmes formulés comme on parle, vocabulaire local/créole marqué par région : Antilles, Guyane, Réunion).
- **Un code permanent** par nœud (`plomberie`, `plomberie_fuite`), indépendant des libellés, identique dans tous les environnements ; une seule référence partagée par annonces, compétences, filtres et carte.
- **Découvrir : 9 domaines + « Autres » en 10ᵉ position** (la famille Maison, la plus dense, est exposée par deux tuiles).
- **Migration non destructive** : colonnes NULLables ajoutées, double écriture, backfill tracé, **rollback prouvé à l'identique**, anciens clients intacts.
- **Ce qui est prouvé** : cohérence de structure, couverture complète de l'existant (89 feuilles, 103 titres de compétences, 9 boutons, 15 catégories de demandes, 8 familles de carte, 3 clés pro), 47 contrôles SQL rejoués localement, jeux de classification.
- **Ce qui ne l'est pas** : la demande réelle (Production non lue), la précision de classification sur du langage réel (jeux écrits par l'auteur), la conformité juridique des nœuds réglementés, l'ergonomie (aucun test utilisateur).

> **Verrouillage avant migration Staging (X1–X5, quotas, modération, P3) : lire [`13-lock-before-staging-migration.md`](13-lock-before-staging-migration.md).** Il complète 12 : spécialités héritées (X5), aléa de modération du rétro-remplissage, preuves de quotas, brouillon `security-draft/100` non appliqué, répétition P3 préparée mais non autorisée.
>
> **Validation Staging et anciens clients : lire [`12-staging-validation-and-legacy-compat.md`](12-staging-validation-and-legacy-compat.md)** (pré-vol réel, matrice de compatibilité des builds iOS/Android, B6, plan et rollback amendés, verdict).
>
> **Pour intégrer : lire [`11-staging-integration-plan.md`](11-staging-integration-plan.md)** (arbitrages du 11 nov. 2026, plan P0-P10, contrôles C01-C30).
>
> **Pour décider : lire [`10-product-review.md`](10-product-review.md)** — revue produit (familles, métiers, tuiles, territoires, 13 décisions avec recommandation et risque, ambiguïtés, UX, protocole de test, structure finale).

## Les 10 livrables

| # | Livrable | Fichier |
|---|---|---|
| 1 | Audit de l'existant | [`01-audit-existing.md`](01-audit-existing.md) |
| 2 | 8 familles finales (+ tuiles Découvrir) | [`02-families.md`](02-families.md) *(généré)* |
| 3 | Métiers et spécialités par famille | [`03-trades-and-specialties.md`](03-trades-and-specialties.md) *(généré)* |
| 4 | Synonymes, problèmes, vocabulaire local | [`04-synonyms.md`](04-synonyms.md) *(généré)* · inventaire complet [`generated/terms.csv`](generated/terms.csv) |
| 5 | Matrice de correspondance ancien → nouveau | [`05-correspondence-matrix.md`](05-correspondence-matrix.md) *(généré)* · [`generated/legacy-map.csv`](generated/legacy-map.csv) |
| 6 | Proposition UX | [`06-ux-category-browser.md`](06-ux-category-browser.md) |
| 7 | Modèle technique cible | [`07-technical-model.md`](07-technical-model.md) |
| 8 | Plan de migration non destructif | [`08-migration-plan.md`](08-migration-plan.md) |
| 9 | Risques, ambiguïtés, décisions à prendre | [`09-risks-and-decisions.md`](09-risks-and-decisions.md) |
| 10 | Branche, SHA, fichiers produits | message de livraison + section « Fichiers » ci-dessous |
| + | **Plan d'intégration technique sur Staging** (arbitrages retenus, dépendances, plan séquencé, blocages, contrôles) | [`11-staging-integration-plan.md`](11-staging-integration-plan.md) |
| + | **Revue produit finale** (3.2B-revue) | [`10-product-review.md`](10-product-review.md) *(généré par `scripts/taxonomy-v2/review.js`)* |

## Source de vérité et régénération

```
docs/taxonomy/data/          ← SEULE source éditée à la main
  families.js, trades-*.js, _dsl.js, editorial-tuning.js, territory-vocabulary.js, taxonomy-v2.data.js
  legacy-map.data.js, staging-snapshot.json, classification-*.js (dont classification-territorial.js)
scripts/taxonomy-v2/         ← outillage hors application (aucun import depuis le site ni l'app)
  lib.js (normalisation + prototype de classification), build.js, evaluate.js, review.js, validate-sql-pglite.js, census-coverage.js
docs/taxonomy/generated/     ← dérivés (JSON, CSV)         ┐ régénérés par build.js,
docs/taxonomy/02..05-*.md    ← dérivés (Markdown)          │ ne pas éditer à la main
docs/taxonomy/migration-draft/04_*.sql, 05_*.sql ← dérivés ┘
```

```bash
node scripts/taxonomy-v2/build.js                      # régénère tous les dérivés
node scripts/taxonomy-v2/review.js                     # régénère 10-product-review.md
node scripts/taxonomy-v2/evaluate.js                   # mesures de classification (par jeu et par région)
node --test tests/taxonomy-v2-proposal.test.js         # 21 tests (66 contrôles SQL rejoués) (le rejeu SQL est ignoré si PGlite est absent)
# Rejeu SQL complet (Postgres embarqué en mémoire, hors dépôt) :
npm i --no-save @electric-sql/pglite && node scripts/taxonomy-v2/validate-sql-pglite.js
# Mesure sur un export de recensement (voir sql/readonly-census.sql) :
node scripts/taxonomy-v2/census-coverage.js export.json
```

## Brouillons SQL (`migration-draft/`) — NON APPLIQUÉS

| Fichier | Rôle |
|---|---|
| `01_schema_taxonomy_v2.sql` | 7 tables, normalisation, contraintes, trigger d'immuabilité, RLS |
| `02_additive_columns.sql` | colonnes NULLables + FK `NOT VALID` + provenance |
| `03_search_and_skills_rpc.sql` | recherche, vue à plat, compétences v2 (RPC sécurisée) |
| `04_seed_taxonomy_v2.sql` | amorçage des familles, métiers, spécialités, termes *(généré)* |
| `06_dual_write_derivation.sql` | déclencheurs : rattachement automatique des écritures d'anciens clients (fail-open, `SECURITY DEFINER`) |
| `05_legacy_map_and_backfill.sql` | table de correspondance + rétro-remplissage additif et idempotent *(généré)* |
| `07_verify_taxonomy_v2.sql` | 12 contrôles de cohérence (zéro ligne attendue) |
| `09_rollback_taxonomy_v2.sql` | retour à l'état antérieur, prouvé à l'identique |

`sql/readonly-census.sql` : recensement **Production en lecture seule**, **non exécuté**, à autoriser (décision D11).

## Fichiers produits
`docs/taxonomy/` (README, 01, 06, 07, 08, 09 rédigés ; 02-05 générés ; `data/`, `generated/`, `migration-draft/`, `sql/`) · `scripts/taxonomy-v2/` (4 fichiers) · `tests/taxonomy-v2-proposal.test.js`. **Aucun fichier existant du dépôt n'est modifié.**

**Étape 3.2B-staging (11 nov. 2026)** : `12-staging-validation-and-legacy-compat.md`, `scripts/taxonomy-v2/{compat,compat-matrix,build-legacy-projection}.js`, `migration-draft/08_legacy_projection.sql` (généré), `generated/legacy-compat-matrix.{json,csv}`, `taxonomy-ux.js` (derrière drapeaux OFF), garde de gel `api/server.js`, `tests/taxonomy-ux.test.js`, `tests/taxonomy-compat.test.js`. Ces fichiers touchent l'application **uniquement derrière des drapeaux désactivés** ; aucune migration n'est appliquée.

**Étape 3.2B-verrouillage (11 nov. 2026)** : `13-lock-before-staging-migration.md`, `scripts/taxonomy-v2/{p3-rehearsal,moderation-fixture,validate-quotas-pglite}.js`, `security-draft/100_services_dangerous_privileges_{staging,rollback}.sql` (NON APPLIQUÉS), `migration-draft/{03,05,06,07,09}` (X5, garde de modération), `tests/taxonomy-quota.test.js`, `tests/taxonomy-p3-rehearsal.test.js`. Rien n'est appliqué ni exécuté sur une base.
