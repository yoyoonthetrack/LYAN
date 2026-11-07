# `request_locations` : stockage sécurisé des localisations (Staging, migration 92)

Projet : Supabase Staging `tdktfbtqceldlaeqjtow`. Jamais Production. Contrat de données : `docs/approx-location-contract-v2.md`.
Fichiers : `92_request_locations_staging.sql`, `92_request_locations_rollback.sql`, `api/request-location-routes.js`,
`tests/request-location-routes.test.js`, `tests/rls/request-locations-local-check.js`, `tests/rls/request-locations-roles-check.sql`,
`scripts/request-locations-staging-check.js`.

## Décisions produit
- STANDARD : secteur V2 d'environ 2 km de rayon (id de zone + commune + version du référentiel).
- DISCREET : commune uniquement.
- REMOTE : aucune localisation.
- Anciennes annonces : aucune ligne, comportement inchangé (`LEGACY`).
- Le formulaire de publication et la carte ne sont pas modifiés dans cette phase.

## Table
Une ligne par annonce (`request_id` est la clé primaire et la clé étrangère `ON DELETE CASCADE` vers `requests`).
Colonnes : `service_mode`, `location_visibility`, `commune_code`, `zone_id`, `zone_version`, `created_at`, `updated_at`.
Aucune coordonnée, aucune adresse, aucun texte libre.

| Forme | service_mode | visibility | commune | zone / version |
|---|---|---|---|---|
| À distance | REMOTE | NULL | NULL | NULL |
| Territoire sans référentiel (Guyane…) | ON_SITE | NULL | NULL | NULL |
| Discret | ON_SITE | DISCREET | requise | NULL |
| Standard | ON_SITE | STANDARD | requise | requises, version = version de l'id, même territoire que la commune |

Les ids V1 restent stockables et décodables (version de 1 à 99). Le format de l'id est canonique (`971-v2-a-15.16`, sans zéro en tête).
Que le secteur existe dans le référentiel ne peut pas se vérifier en SQL : seule la route serveur écrit, après `validateZoneSelection`.

## Sécurité SQL
- RLS activée dans la même transaction que la création.
- Aucun privilège pour `anon`. `authenticated` n'a que SELECT. `service_role` écrit. `PUBLIC` n'a rien. Les privilèges par défaut de Supabase
  (dont TRUNCATE, TRIGGER, REFERENCES, MAINTAIN) sont révoqués explicitement et les droits effectifs sont vérifiés par la migration elle-même.
- Une seule politique, SELECT pour `authenticated` : la localisation est lisible si l'annonce l'est dans `public.requests`. La sous-requête
  s'exécute avec le rôle de l'appelant, donc la politique de la migration 90 s'applique. Aucune fonction `SECURITY DEFINER` n'est ajoutée.
  Dépendance assumée : si la politique de `requests` change, la lecture des localisations suit. Le test par rôle compare les deux ensembles pour les 81 profils.
- Seule fonction ajoutée : le trigger `lyann_request_locations_touch` (non `SECURITY DEFINER`, non exécutable par les clients). Il garde `created_at`,
  refuse un changement de `request_id` et met à jour `updated_at`.
- Suppression d'une annonce : la localisation disparaît avec elle. Les missions gardent leurs règles (leur clé étrangère vers `requests` n'est pas modifiée :
  une annonce qui a une mission ne peut toujours pas être supprimée).

## Route serveur
`PUT /v1/requests/:id/location`, définie dans `api/request-location-routes.js`, branchée dans `api/server.js` (sept lignes).
1. JWT vérifié par Supabase Auth (`requireBearerUser`). L'identifiant de l'appelant ne vient jamais du corps.
2. L'annonce est lue côté serveur. Si elle n'appartient pas à l'appelant, ou n'existe pas, la réponse est la même : 404.
3. Modifiable si le statut est OPEN ou PAUSED et si elle n'est pas rejetée par la modération. Sinon 409.
4. Corps accepté : `service_mode`, `location_visibility`, `location_confirmed`, `territory`, `commune`, `zone_id`. Tout autre champ est refusé (400), les noms de
   position précise (`lat`, `lng`, `coords`, `gps`, `address`, `street`, `location`…) avec le code `FORBIDDEN_FIELD`. Les valeurs doivent être des chaînes.
5. Territoire et commune sont lus sur l'annonce (`territory`, `city`, ou le texte `location` publié : « Commune (971 - Guadeloupe) »). Ceux du navigateur ne sont
   acceptés que s'ils concordent. Une commune ambiguë entre deux territoires, ou absente, est refusée (`REQUEST_PLACE_UNKNOWN`) : rien n'est inventé.
6. Le moteur `approx-zone.js` valide le secteur (présent dans le référentiel, version sélectionnable, commune dans le secteur, confirmation explicite).
7. Chaque appel remplace toute la ligne (upsert), donc aucun changement de mode ne laisse une ancienne zone ou commune. La base refuse les formes incohérentes.
La clé service reste sur le serveur. La réponse ne contient que la ligne enregistrée et le secteur pour l'auteur. L'API publique n'est pas modifiée.

## Procédure Staging
1. Préflight : politique de `requests` (migration 90), privilèges (migration 91), clés de `requests`, moteur et référentiels, accès serveur.
2. Appliquer `92_request_locations_staging.sql` (transaction, préconditions, postconditions).
3. `tests/rls/request-locations-roles-check.sql` (rôles réels, annulé par exception).
4. `node scripts/request-locations-staging-check.js` (sessions réelles QA A, B, C ; serveur local ; fixtures `QA-LOC-2.8B-2` supprimées).
5. Rollback d'urgence : `92_request_locations_rollback.sql` (refuse tant que la table contient des lignes sauf instruction explicite).

## Risques restants
- La route n'est pas déployée. Avant la mise en ligne, vérifier que `approx-zone.js` et les deux référentiels sont inclus dans le paquet de l'API.
- L'annonce ne porte pas de commune structurée : la route la déduit du texte `location`. Le futur formulaire devra publier « Commune (code - Territoire) ».
- Le secteur de 2,8 km n'est pas une garantie d'anonymat, et la lecture dépend de la politique de `requests` (colonnes internes encore visibles aux membres).
- Aucune lecture publique : l'API publique ne renvoie pas les localisations dans cette version.
- Production n'a pas été auditée ni modifiée.
