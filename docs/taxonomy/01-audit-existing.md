# 01 — Audit de l'existant : catégories, métiers, spécialités, compétences

> Phase 3.2B — audit en **lecture seule**. Sources : dépôt (branche `feature/v3-2b-taxonomy-audit`, issue de `7d42905`) et Supabase **Staging** (`tdktfbtqceldlaeqjtow`, requêtes `SELECT` uniquement). **Production non consultée** (interdite).
> Agrégats de Staging : [`data/staging-snapshot.json`](data/staging-snapshot.json) (aucune donnée personnelle).

## 1. Verdict en cinq lignes

1. LYANN n'a pas **une** taxonomie mais **au moins dix mécanismes de classement parallèles**, sans clé commune : aucune annonce, aucune compétence et aucun filtre ne partagent la même référence.
2. Le référentiel en base (`lyann_taxonomy`, 89 feuilles, 20 univers) est **plat, sans identifiant stable côté application**, et ne sert qu'à **12 annonces sur 80** (15 %) sur Staging.
3. Les **compétences de profil sont du texte libre** (`services.title = services.category`) : 208 lignes, 101 titres distincts, **aucun lien** vers le référentiel.
4. Le suivi de classification est **inopérant** : `classification_status = UNCLASSIFIED` sur **80/80** demandes, y compris les 12 qui portent un `taxonomy_id`.
5. Les données de Staging sont des **données de recette** (≈ 60 % de demandes « QA »), pas une mesure de la demande réelle : le recensement Production (requêtes fournies, non exécutées) reste à faire avec autorisation.

## 2. Inventaire des mécanismes de classement

| # | Mécanisme | Où | Nature | Clé / valeur | Problème principal |
|---|---|---|---|---|---|
| 1 | `lyann_taxonomy` | base ; migrations `17`, `24`, `38` | 89 lignes à 3 niveaux texte (`universe`/`category`/`subcategory`) + synonymes, tags, `safety_level` | UUID par ligne, **pas de code stable** | libellés = identité ; doublons ; pas de FK entrante |
| 2 | `categories` (héritée) | base ; `schema.sql` | table vide | `category_id` | FK `services`, `requests`, `projects` → table morte |
| 3 | `user_matching_skills`, `internal_taxonomy_tags` | base ; `schema.sql` | tables **non alimentées** | — | schéma mort, sans politique d'écriture |
| 4 | `requests.category` | base | texte libre (15 valeurs sur Staging) | libellé | valeur par défaut « Jardinage » : 48/80 |
| 5 | `requests.taxonomy_id` | base | UUID **sans clé étrangère** | UUID de feuille | 12/80 renseignés ; `classification_status` jamais mis à jour |
| 6 | `services.title` / `.category` | base ; RPC `lyann_sync_profile_skills` (migration `83`) | compétence = titre libre, `category = title` | texte | 101 titres distincts / 208 lignes ; génériques (« installation », « entretien », « dépannage ») |
| 7 | 9 boutons « compétences rapides » | `payment-portal.html` | lots de compétences | libellé | chaque bouton recouvre 1 à 3 métiers (« Transport & Déménagement », « Cours & Soutien scolaire ») |
| 8 | Assistant d'annonce (univers / catégorie) | `discover.html` (`wizardDomain`) | 17 univers statiques + « Autres Besoins » | libellé | **liste ≠ base** : 3 univers de la base (7 feuilles) sont injoignables à la main ; « Autres Besoins » n'existe pas en base |
| 9 | Classifieur client | `ai-classifier.js`, `search-engine.js`, `matching-engine.js` | base embarquée + récupération base | libellés | niveaux de sécurité divergents entre base embarquée et base ; vocabulaire lacunaire |
| 10 | 8 familles de pins de carte | `needs-map-category-families.js` | `plomberie, electricite, bricolage, jardinage, menage, beaute, numerique, quotidien` | id court | `quotidien` = fourre-tout (auto, colis, courses, aéroport, déménagement…) |
| 11 | Rail Annonces / Lyanneurs | `explorer-ui.js`, `explorer-repository.js` | « Tous + 4 domaines avec résultats + Plus » (≤ 6) | famille de carte | dépend du #10, donc de ses limites |
| 12 | Clés d'exigences réglementaires | `pro-verification-engine.js` ; `professional_documents.activity_category` | 3 clés : `electricite`, `batiment`, `jardinage` | slug | `activity_requirements` **vide** sur Staging : règles uniquement dans le code |
| 13 | Catalogue de démonstration | `maison-catalog.js` | 50 profils, 93 compétences distinctes | libellés | vocabulaire propre, recoupe mal les autres |

## 3. Volumes réels sur Staging (non représentatifs du marché)

| Mesure | Valeur |
|---|---:|
| Demandes | 80 |
| … avec `taxonomy_id` | 12 (15 %) |
| … avec `classification_status = UNCLASSIFIED` | **80 (100 %)** |
| … catégorie « Jardinage » (valeur par défaut) | 48 (60 %) — toutes issues de scripts de recette (« qa … », « rc14 … ») |
| … « Service direct » (catégorie « Général ») | 11 (14 %) |
| … titres réellement descriptifs | ≈ 20 demandes (≈ 25 %), 17 titres distincts exploitables |
| Lignes de compétences (`services`) | 208 |
| … titres distincts | 101 |
| … avec un lien vers un nœud de taxonomie | **0** |
| Feuilles `lyann_taxonomy` | 89 sur 20 univers |
| … utilisées par au moins une demande | 8 (Plomberie ×3, Bricolage ×2, Couture ×2, 5 autres ×1) |
| Feuilles jamais utilisées | 81 (91 %) |

Feuilles utilisées (Staging) : `Plomberie › Fuite & Dépannage` (3), `Bricolage › Montage meuble` (2), `Couture › Retouche & Création` (2), `Mécanique Automobile`, `Piscine`, `Électroménager`, `Menuiserie`, `Peinture` (1 chacune).

**Lecture** : ce sont des volumes de test. Ils prouvent des **défauts structurels** (pas de clé, statut jamais mis à jour, 100 % de feuilles sans lien pour les compétences) mais **pas** quelles familles pèsent le plus sur le marché. La répartition en 8 familles repose donc sur la logique métier et les 103 titres de compétences connus, pas sur des parts de marché.

## 4. Constats détaillés

### A. Absence de référence commune (critique)
- Une annonce porte `category` (texte) **et** `taxonomy_id` (UUID sans FK) ; un profil porte des `services.title` (texte). Aucune de ces trois valeurs ne se recoupe mécaniquement. Un prestataire « Plomberie » et une annonce « Plomberie › Fuite & Dépannage » ne sont reliés que par une comparaison de chaînes.
- Les filtres Liste et Carte utilisent les **8 familles de pins**, le profil utilise des **titres libres**, l'assistant utilise **17 univers** : trois vocabulaires pour la même intention.

### B. Qualité du référentiel `lyann_taxonomy`
- **Doublons d'intention** : `Aide du Quotidien › Soutien scolaire` et `Cours & Apprentissage › Soutien Scolaire` ; `Coiffure & Esthétique › Tresses` et `Mode & Couture › Tresses & Mèches`.
- **Niveaux mélangés** : `Entretien Jardin › Débroussaillage` (la catégorie est un domaine, la sous-catégorie un métier) ; `Coiffure & Esthétique` regroupe deux métiers.
- **Feuilles regroupant plusieurs intentions** : « Anglais & Espagnol », « Courses & Présence », « Primaire & Collège », « Pose & Entretien » (climatisation), « Bateau › Entretien & Sortie ».
- **Profondeur insuffisante pour exprimer le besoin** : Électricité n'a qu'une feuille (« Panne & Dépannage ») — rien pour le tableau électrique, les luminaires ou le groupe électrogène ; une seule feuille Plomberie « Fuite » et une « Installation sanitaire ».
- **Métiers absents** : gardiennage, nuisibles, conciergerie de location, énergie solaire, automatismes de portail, épilation / soins du visage, serrurerie détaillée, aide administrative détaillée…
- **Vocabulaire local quasi absent** : 5 feuilles sur 89 mentionnent un terme local ou créole ; 6 synonymes par feuille en moyenne (≈ 530 au total) contre ≈ 65 termes par métier dans la proposition. « fuite » n'apparaît que dans les synonymes de 2 feuilles.

### C. Compétences
- Texte libre sans normalisation : « Photo » et « Photographie », « Smartphone » et « Smartphones », « Jardinage », « Jardinage & Élagage » et « Élagage léger » coexistent pour le même métier.
- Titres sans objet (« Installation », « Dépannage », « Entretien », « Courses », « Transport », « Organisation ») : **22 titres ambigus sur 103** connus.
- La RPC `lyann_sync_profile_skills` **supprime et recrée** des lignes `services` à partir de libellés : toute évolution de libellé casse l'identité.

### D. Carte et filtres
- 8 familles de pins dont `quotidien` fourre-tout. Le rail Annonces/Lyanneurs ne propose que 4 domaines « avec résultats » + « Plus » : le découpage est donc contraint par #10.
- L'écran Découvrir présente ses propres domaines, indépendamment du #8 et du #10.

### E. Sécurité métier et réglementation
- 3 clés d'exigences pros (`electricite`, `batiment`, `jardinage`) pour tout le périmètre : aucune notion de **métier réglementé** hors BTP/électricité (soins à la personne, leçons de conduite payantes, traduction assermentée, transport rémunéré de personnes, encadrement de plongée…).
- Niveaux `safety_level` présents en base (`NORMAL` ×84, `CAUTION` ×4 : élagage, serrurerie, toiture, plongée ; `PRO_REQUIRED` ×1 : climatisation), mais **divergents** de la copie embarquée dans `ai-classifier.js`.

### F. Sécurité des données (RLS)
- `lyann_taxonomy` : lecture publique + gestion admin — **bon modèle**, repris tel quel pour la v2.
- `user_matching_skills` : politique de lecture propriétaire uniquement, jamais alimentée.
- Aucune table de taxonomie ne dépend de l'identité d'un membre : le catalogue peut être public sans risque (aucune donnée personnelle).

### G. Données qui ne doivent pas guider la conception
- 48 demandes « Jardinage » et ≈ 20 titres « qa/rc » : artefacts de recette. Le rattachement par catégorie libre (`backfill_category`) est donc **à faible confiance** et traçable (colonne de provenance prévue).
- La catégorie `k7mqp4lyannrc` est un résidu de test.

## 5. Implications pour la conception

| Constat | Exigence retenue dans la proposition |
|---|---|
| Pas de clé commune | un **code de nœud permanent** unique pour annonces, compétences, filtres, carte |
| Libellés = identité | codes indépendants des libellés ; libellé modifiable sans migration |
| Aucun lien compétence ↔ référentiel | `lyann_profile_skill(user_id, node_code)` + stub `services` écrit en double pendant la transition |
| 89 feuilles trop larges | 105 métiers / 414 spécialités, avec **spécialités optionnelles** (on peut s'arrêter au métier) |
| Vocabulaire lacunaire | 7 007 termes : synonymes, problèmes en langage naturel, vocabulaire local/créole |
| `quotidien` fourre-tout | la carte adopte les **8 familles** |
| Réglementation | `safety` à 5 niveaux + `selectable = false` pour les activités réglementées |
| Statut jamais mis à jour | statut de classification **dérivé** et provenance explicite du rattachement |
| Données de recette | recensement Production lecture seule fourni ([`sql/readonly-census.sql`](sql/readonly-census.sql)), outil de mesure fourni (`scripts/taxonomy-v2/census-coverage.js`) |
