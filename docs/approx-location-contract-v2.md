# Localisation approximative V2 — contrat de données et constat RLS

Phase 2.8B-1.1. Moteur : `approx-zone.js`. Référentiels : `approx-zone-referential.v1.js` (figé, lecture seule) et
`approx-zone-referential.v2.js`. Rien de ce document n'est appliqué à Supabase.

## 1. Référentiel V2

| Territoire | Secteurs fins (2,8 km) | Secteurs larges (5,6 km) |
|---|---|---|
| Guadeloupe 971 | 263 | 90 |
| Martinique 972 | 174 | 56 |
| La Réunion 974 | 354 | 101 |

- Cellule fine : 2,8 km de côté. Rayon nominal (centre de la cellule → coin) : 2 000 m.
- Rayon réel : `coverRadiusM` = coin le plus éloigné du centre représentatif. Médiane ≈ 2 100–2 200 m, maximum ≈ 3 200 m
  sur certaines cellules côtières (le centre est le point de terre le plus proche du milieu de la cellule).
- Cellule fine retenue si au moins 10 % de terre ; sinon un secteur large (≥ 3 % de terre) prend le relais.
- Appartenance à une commune : contours officiels (geo.api.gouv.fr, codes INSEE), jamais une distance au centroïde.
- Aucune population n'est utilisée. **Un rayon de 2 km n'est pas une garantie d'anonymat.**
- Guyane (973) : secteurs fins non activés (`GRANULARITY_NOT_VALIDATED`), fonctionnement actuel conservé.
  Saint-Martin (978), Mayotte (976), Saint-Barthélemy (977) : fonctionnement actuel conservé.
- Identifiants : `971-v2-a-12.2` (territoire, version, niveau, ix.iy), déterministes.
  Les identifiants V1 restent lisibles (annonces existantes) mais ne sont plus sélectionnables (`VERSION_NOT_SELECTABLE`).
- Régénération : `node scripts/build-approx-zone-referential.js --check` (V1 et V2 identiques au contour officiel).

## 2. Modes de publication

`service_mode` (où se fait la mission) est distinct de `location_visibility` (ce que voient les membres).

| Mode | `service_mode` | `location_visibility` | Stocké | Carte |
|---|---|---|---|---|
| Standard | `ON_SITE` | `STANDARD` | commune + secteur + version | centre représentatif du secteur |
| Discret | `ON_SITE` | `DISCREET` | commune seule | pin au centre de la commune, annonces groupées |
| À distance | `REMOTE` | NULL | rien | aucun pin, reste dans les listes |
| Existante | NULL | NULL | rien | comportement actuel inchangé (`LEGACY`) |

Aucune adresse, aucune coordonnée personnelle, aucun texte libre n'est stocké ou transmis.

## 3. Contrat de données proposé (non appliqué)

Colonnes de `public.requests` :

| Colonne | Type | Valeurs |
|---|---|---|
| `service_mode` | text NULL | `ON_SITE`, `REMOTE` |
| `location_visibility` | text NULL | `STANDARD`, `DISCREET` |
| `location_commune_code` | text NULL | INSEE, 5 chiffres |
| `location_zone_id` | text NULL | `^\d{3}-v\d{1,2}-[a-z]-\d{1,4}\.\d{1,4}$` |
| `location_zone_version` | smallint NULL | égal à la version de l'identifiant |

Contraintes CHECK (miroir testé dans `tests/approx-zone-v2.test.js`, section 13) :

- `service_mode` NULL ou `REMOTE` ⇒ les quatre autres colonnes sont NULL.
- `ON_SITE` sans visibilité ⇒ les trois colonnes de lieu sont NULL (territoire non pris en charge, ex. Guyane).
- `DISCREET` ⇒ commune renseignée, secteur et version NULL.
- `STANDARD` ⇒ commune, secteur et version renseignés, version = version de l'identifiant, commune dans le même territoire.
- Les annonces existantes gardent NULL partout.

Écriture : uniquement par une route serveur qui appelle `validateZoneSelection` (appartenance de la commune au secteur,
secteur présent dans le référentiel autorisé, version sélectionnable, confirmation explicite, champs de position refusés).
Un trigger du même type que `enforce_simplified_request_safety` doit refuser toute écriture directe de ces colonnes depuis
le client. Les insertions actuelles partent du navigateur vers Supabase : sans ce trigger, la validation serveur est contournable.

## 4. Textes (définis, non intégrés à l'interface)

Dans `LOCATION_COPY` : « Où avez-vous besoin d'aide ? » ; standard « Indiquez approximativement le secteur de votre mission. » ;
discret « Seule votre commune sera affichée. » ; à distance « Cette mission peut être réalisée sans déplacement. » ;
avant publication « Voici la localisation approximative visible par les autres membres. » ; confirmation explicite requise.

## 5. Constat RLS sur Staging (`tdktfbtqceldlaeqjtow`, lecture seule, rien modifié)

RLS est activé sur `public.requests`. Politique SELECT « Requests are viewable by everyone » (rôle `public`) :

1. l'auteur voit ses annonces non rejetées ;
2. une annonce dont `public_moderation_status` n'est pas `approved` n'est lisible que par un admin ;
3. **toute autre annonce (donc toute annonce approuvée) est lisible par tous, y compris le rôle `anon`.**

La politique ne regarde ni `visibility`, ni `target_user_id`, ni `status`, ni `safety_status`. `anon` et `authenticated`
ont le privilège SELECT sur la table entière (toutes colonnes).

Conséquences, **à corriger dans une phase dédiée, non modifié ici** :

- **V-1. Annonces privées lisibles.** Une annonce approuvée mais `visibility <> 'PUBLIC'`, ciblée (`target_user_id`),
  `CLOSED`/`CANCELLED` ou `safety_status <> 'SAFE'` reste lisible par n'importe quel porteur de la clé `anon`, par
  requête directe PostgREST. Les filtres d'éligibilité (`needs-map.js`, API publique) ne sont appliqués que côté code.
- **V-2. Zones non réservées aux membres.** Des colonnes de secteur ajoutées à `requests` seraient lisibles par `anon`.
  La règle « zones visibles uniquement aux membres authentifiés » ne tient pas au niveau base avec le modèle actuel.
  L'API publique ne limite que sa propre réponse, pas la table.
- **V-3. Écriture.** La politique UPDATE de l'auteur n'a pas de `WITH CHECK` distinct et ne protège aucune colonne : le
  contrôle des nouvelles colonnes repose entièrement sur un trigger.
- Hygiène : `anon` et `authenticated` ont aussi TRUNCATE, TRIGGER, REFERENCES sur la table (défaut Supabase ; non exposés par
  PostgREST, à resserrer plus tard).

Pistes pour la migration (à valider avant toute application) :

1. Stocker les colonnes de lieu dans une table séparée `request_locations(request_id)` avec RLS : SELECT réservé à
   `authenticated` et conditionné à l'éligibilité publique de l'annonce (ou à l'auteur). Cela règle V-1 et V-2 pour les
   nouvelles données sans toucher aux droits existants de `requests`.
2. Corriger la politique SELECT de `requests` (visibilité, ciblage, statut, sécurité) dans une migration distincte.
3. Trigger d'écriture + route serveur de validation.

## 6. Limites de confidentialité restantes

- Un secteur de 2,8 km n'est pas anonyme : dans un secteur peu peuplé il peut désigner un foyer. Seul le mode discret
  (commune seule) réduit l'indice ; aucune affirmation de sécurité n'est fondée sur la population.
- Les cellules côtières peuvent s'écarter jusqu'à ≈ 3 km du centre affiché.
- Tant que V-1 et V-2 existent, la confidentialité des zones n'est pas garantie côté base.
- Les annonces existantes gardent leur localisation actuelle (niveau commune).
