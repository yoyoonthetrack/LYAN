# 07 — Modèle technique cible

> **Proposition — non appliquée.** Brouillons SQL : [`migration-draft/`](migration-draft/). Ils ont été **rejoués localement** (PGlite, Postgres embarqué, en mémoire) : application, vérifications, RLS, RPC, rollback et rejouabilité — 47 contrôles, tous verts. Rien n'a été exécuté sur Staging ni sur Production.

## 1. Vue d'ensemble

```
lyann_taxonomy_release ──(version publiée lue par l'app)

lyann_taxonomy_group (famille, sous-domaine)
        ▲
lyann_taxonomy_node  (code PERMANENT · kind = family | trade | specialty · parent_code · family_code · safety · selectable)
   ▲   ▲   ▲
   │   │   └── lyann_taxonomy_node_family   (familles secondaires : multi-famille sans duplication)
   │   └────── lyann_taxonomy_term           (label | syn | problem | local ; term_norm ; recherche)
   └────────── lyann_taxonomy_legacy_map     (ancien → nouveau : feuilles, titres, catégories, familles de carte, clés pro)

lyann_taxonomy_ambiguous_term               (termes qui déclenchent une question de précision)

Existant (colonnes AJOUTÉES, NULLables, rien de modifié) :
  lyann_taxonomy.node_code            ─┐
  requests.taxonomy_node_code (+source)├─► lyann_taxonomy_node.code
  services.taxonomy_node_code (+source)┘
lyann_profile_skill(user_id, node_code)  — compétence de profil = un code, plus un texte libre
```

## 2. Décisions de conception

### 2.1 Identifiant : un **code texte permanent**, pas un UUID
| Option | Pour | Contre | Choix |
|---|---|---|---|
| UUID par nœud | uniforme avec l'existant | **différent entre Staging et Production** si on regénère ; illisible dans les logs et les migrations ; la correspondance doit être rejouée par environnement | non |
| **Code texte** (`plomberie`, `plomberie_fuite`) | **identique dans tous les environnements**, lisible, stable dans les fichiers de seed, facile à tester, utilisable dans une URL ou un lien profond | demande une règle d'immuabilité | **oui** |

Règles : `^[a-z0-9_]{2,80}$` ; **un code n'est jamais renommé, jamais supprimé, jamais réutilisé** (trigger `lyann_taxonomy_node_guard` : `code`, `kind`, `parent_code` immuables, suppression refusée → désactivation `active = false`). Le **libellé français** est un simple attribut modifiable (testé). Le préfixe d'une spécialité (`plomberie_…`) est un **nom historique** : déplacer un métier dans une autre famille ne change aucun code.

### 2.2 Trois niveaux, la spécialité est optionnelle
`family` (8 + `autres`) › `trade` (105) › `specialty` (414). Un rattachement valide peut s'arrêter au métier. Les **sous-domaines** (`group`) ne sont que de l'affichage (ils regroupent des métiers dans une famille) : ils ne portent pas de sens métier et n'apparaissent dans aucun rattachement.

### 2.3 Multi-famille sans duplication
Un métier a **une** famille primaire (`family_code`) et zéro ou plusieurs familles secondaires (`lyann_taxonomy_node_family`) : 14 métiers sur 105 (ex. *Clôtures & portails* : Maison + Jardin ; *Danse* : Beauté/sport + Événementiel ; *Courses & commissions* : Famille + Transport). Le métier est **trouvable** dans chaque famille mais **compté une fois**.

### 2.4 Référence unique annonces ↔ compétences
`requests.taxonomy_node_code` et `lyann_profile_skill.node_code` pointent la **même clé**. Faire correspondre une annonce à des prestataires devient une égalité de code (ou d'ancêtre) et non plus une comparaison de chaînes. Une compétence sur un **métier** couvre ses spécialités ; une annonce sur une **spécialité** est servie par les compétences du métier parent.

### 2.4 bis. Sécurité métier portée par le nœud
`safety` ∈ `NORMAL | CAUTION | PRO_REQUIRED | RESTRICTED | PROHIBITED`, `regulation_note`, `selectable`. Contrainte SQL : **un nœud `RESTRICTED`/`PROHIBITED` ne peut pas être sélectionnable**. Une spécialité n'est **jamais moins stricte** que son métier (testé). Ces 3 nœuds sont réglementés dans la proposition : leçons de conduite payantes, aide à la toilette/soins, traduction assermentée.

### 2.5 Recherche : termes typés + registre d'ambiguïtés
`lyann_taxonomy_term` (6 864 lignes) : `label` 528 · `syn` 4 969 · `problem` 1 171 · `local` 196. Normalisation **unique** (`lyann_taxonomy_norm` : unaccent + minuscules + non-alphanumérique → espace, **sans racinisation**), appliquée à l'écriture (seed) et à la lecture (RPC), vérifiée par `V04`. Les termes génériques ou partagés (« dépannage », « batterie », « portail », « cuisine »…) sont déclarés dans `lyann_taxonomy_ambiguous_term` : ils ne classent jamais seuls et déclenchent une **question**.

### 2.6 Versionnement
`lyann_taxonomy_release` : une version `draft` → `published`. L'app lit la dernière version publiée et la **met en cache** ; comme les codes sont immuables, une version ultérieure **ajoute** ou **désactive**, elle ne casse jamais un rattachement existant.

## 3. Compatibilité ascendante (additive, double lecture / double écriture)

| Objet existant | Ce qui change | Ce qui reste vrai pour les anciens clients |
|---|---|---|
| `lyann_taxonomy` | + colonne `node_code` (NULL) | lignes, UUID, libellés, politiques **inchangés** |
| `requests` | + `taxonomy_node_code`, `taxonomy_node_source` (NULL) | `category`, `taxonomy_id`, `classification_*` **inchangés** ; les nouveaux clients continuent de les écrire |
| `services` | + `taxonomy_node_code`, `taxonomy_node_source` (NULL) | `title`, `category`, `slug` **inchangés** ; la RPC v2 écrit **aussi** le stub historique |
| RPC `lyann_sync_profile_skills` | rien | continue de fonctionner (titres libres) |
| `needs-map-category-families.js` | remplacé à terme par les 8 familles v2 | tant que l'ancien bundle vit, la table de correspondance reste la référence |

Ajouter une colonne NULLable sans défaut est une opération de **métadonnées** (pas de réécriture) ; les clés étrangères sont posées `NOT VALID` puis validées après le backfill.

## 4. API de lecture / écriture (brouillon)

| Fonction | Rôle | Sécurité |
|---|---|---|
| `lyann_taxonomy_norm(text)` | normalisation | `STABLE`, `search_path` fixé |
| `lyann_taxonomy_search(text, int)` | recherche métier / problème / synonyme + question | `SECURITY INVOKER` (RLS appliquée) ; saisie normalisée donc **aucun caractère spécial de `LIKE`** ; `limit` borné à 50 |
| `lyann_taxonomy_v2_flat` (vue) | export / administration | `security_invoker = true` |
| `lyann_sync_profile_skills_v2(uuid, text[])` | remplace les compétences d'un membre par des **codes** | `SECURITY DEFINER`, `search_path` fixé, `auth.uid() = p_user`, ≤ 60 codes au format strict, nœuds **existants, actifs, sélectionnables, hors `autres`** (sinon refus **atomique**), verrou consultatif par membre, ne supprime **jamais** un service tarifé |

## 5. Sécurité (RLS et droits)

| Table | Lecture | Écriture |
|---|---|---|
| `…_node`, `…_term` | `anon` + `authenticated`, lignes **actives** | `has_admin_permission(auth.uid(), 'taxonomy.manage')` |
| `…_group`, `…_node_family`, `…_ambiguous_term` | `anon` + `authenticated` | idem |
| `…_release` | versions **publiées** | idem |
| `…_legacy_map` | **administrateurs uniquement** | idem |
| `lyann_profile_skill` | `authenticated` | **uniquement via la RPC** (aucun droit d'écriture direct) |

Contrôles vérifiés dans le rejeu local : `anon` lit le catalogue ; `anon` n'écrit pas ; `anon` ne lit pas la correspondance ; un membre non administrateur ne modifie pas le catalogue ; usurpation d'un autre membre refusée ; nœud réglementé / `autres` / code inexistant / injection refusés ; RLS activée sur les 8 tables (test statique + `V12`).

> ⚠️ La permission `taxonomy.manage` **n'existe pas encore**. L'ajouter touche au système de permissions d'administration : c'est une **décision à valider** (doc. 09, D8) — la contrainte de la mission interdit de modifier les permissions admin dans cette phase.

## 6. Performance
- `lyann_taxonomy_term` ≈ 6 800 lignes : index sur `term_norm` et index **GIN trigramme** ; la RPC filtre par contenu de mots entiers, préfixe et similarité. À cette taille, un balayage reste de l'ordre de la milliseconde ; à surveiller si le vocabulaire dépasse ~100 000 termes.
- Le client charge **l'arbre** (≈ 90 Ko) pour naviguer ; la **recherche** passe par la RPC ou par la copie complète (≈ 65 Ko compressée) pour le hors-ligne.

## 7. Ce que le modèle ne fait volontairement pas
- Il ne supprime ni ne renomme aucune ligne existante.
- Il ne décide pas de la **réglementation applicable** : les notes sont des **repères** à faire valider juridiquement (doc. 09, R6), pas un avis juridique.
- Il ne stocke **aucune saisie utilisateur** dans la taxonomie.
- Il ne modifie ni l'authentification, ni Stripe, ni la modération.
