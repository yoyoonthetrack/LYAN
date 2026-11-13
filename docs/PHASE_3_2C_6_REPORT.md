# LYANN Phase 3.2C-6 : déploiement propre et reproductible (rapport)

Branche `feature/marketplace-v3-2c-ui`. Aucune Preview déployée, la Preview actuelle n'a pas été modifiée, `staging.lyann.app` n'a pas été touché, pas de `--prod`, aucune migration, aucun accès Production, aucune fusion.
Vérifié en lecture seule : la liste des **noms** de variables du projet `lyann-staging-preview` (aucune valeur lue).

## 1. Branche et SHA final

- Branche : `feature/marketplace-v3-2c-ui`.
- **Commit du paquet : `e56163af45b27ac01709956b33c53882edea1b4a`**.
- Empreinte du paquet : `c106be84863b1b373552a83a51e2f927043e5f8c380295befb8c27e8de278a38` (396 fichiers).
- Le commit de rapport qui suit ne contient que `docs/` et `artifacts/`, qui sont exclus du paquet. L'empreinte reste donc identique (vérifiée sur le commit de rapport, voir la fin du chat).
- Les neuf fichiers locaux modifiés sans rapport sont intacts et non commités.

## 2. Cause du problème de carte

Leaflet, MapLibre et les glyphes Nunito Sans étaient **ignorés par Git** (`vendor/leaflet`, `vendor/maplibre`, `assets/maps/glyphs`), tout comme `package-lock.json`.
- Le déploiement 5.3 ne fonctionnait que parce que le CLI envoyait les copies locales de ces fichiers.
- Un checkout propre devait les régénérer pendant le build : téléchargement réseau, module natif `fontnik`, lockfile absent et périmé (`npm ci` échouait).

## 3. Solution de packaging

1. Les 28 ressources de carte sont **suivies par Git** et épinglées par `config/map-assets.sha256.json`. Elles sont aussi comparées aux paquets npm épinglés : Leaflet 1.9.4, MapLibre GL 5.6.1, bridge 0.1.4.
2. `package-lock.json` est suivi et cohérent. Seuls 4 paquets ont été ajoutés, aucune version n'a changé.
3. `scripts/build-staging-package.js --commit <sha>` exporte le commit avec `git archive`, puis sélectionne les fichiers selon `config/staging-preview-package.json`. La sélection est la fermeture des `require` et des noms de fichiers cités depuis les pages, `api/index.js` et `api/render.js`. Les fichiers interdits et les ressources indispensables sont contrôlés.
4. Le paquet reçoit `lyann-package.json` : commit, nombre de fichiers, empreinte du manifeste.
5. Build Vercel dédié `scripts/build-staging-preview.js` (uniquement via `vercel.staging-preview.json`, `vercel.staging.json` et la Production sont intacts). Il ne télécharge rien et n'appelle pas `fontnik`. Il vérifie, dans cet ordre :
   - l'environnement Staging ;
   - le SHA et chaque fichier du paquet ;
   - les ressources de carte ;
   - les pages construites.
6. `scripts/deploy-staging-preview.sh` (préparé, non exécuté) déploie depuis le dossier du paquet, avec `--meta lyannReleaseSha` et `--meta lyannPackageSha256`. Sans `LYANN_AUTHORIZE_STAGING_PREVIEW=1` il refuse. Le dry run (`artifacts/.../deploy-dry-run.txt`) imprime la commande et ne déploie rien.

## 4. Fichiers exclus

Sur les 681 fichiers déployés, 289 sont retirés (liste complète dans `comparison-with-681.tsv`) :

| Catégorie | Fichiers |
|---|---|
| scripts d'outillage, d'audit, de seed et de déploiement | 140 |
| docs, tests, artefacts, `work/` | 101 |
| racine : audits `.md`, `test_*.py`, `netlify.toml`, `CNAME`, `momentic.config.yaml`… | 21 |
| outils agents/IDE/CI (`.codex`, `.momentic-mcp`, `.claude`, `.agents`, `.cursor`, `.github`) | 15 |
| `api/` non référencée (`openapi.json`, `taxonomy.json`, `post-transfer-http-simulation.js`, `server_python.py`) | 4 |
| `assets/icon.png`, `splash.png`, `maps/README.md` | 3 |
| mobile / SQL (`.entitlements`, projets iOS) | 2 |
| `vercel.json`, `vercel.staging.json` | 2 |
| `.env.example` | 1 |

Cela représente 931 fichiers du commit au total, jamais envoyés. Les clés et profils (`*.pem`, `*.p8`, `.env*`…) sont interdits par règle et par test.

## 5. Fichiers conservés (396)

| Catégorie | Fichiers | Justification |
|---|---|---|
| images racine | 146 | pages, héros, icônes |
| code de référence racine | 88 | JS requis par les pages et `api/` |
| ressources statiques | 79 | `assets/`, `vendor/` (carte, Phosphor), `sounds/` |
| fonctions serveur `api/` | 41 | fermeture de `api/index.js` et `api/render.js` |
| pages / styles | 37 | HTML et CSS |
| configuration de déploiement | 6 | `.vercelignore`, AASA staging, manifeste carte, lockfile, `package.json`, `vercel.staging-preview.json` |

Les scripts embarqués sont seulement `build-staging-preview.js`, `lib/package-integrity.js` et `staging-v2-guard.js` (requis par l'API). `.vercelignore` n'exclut aucun des 396 fichiers (vérifié avec la syntaxe gitignore).

## 6. Validation de la configuration Supabase

Le build échoue avec « REFUS » et n'affiche aucune valeur dans ces cas, tous testés :
- URL, clé anonyme ou verrou absents ou incohérents ;
- URL ou clé de la Production ;
- clé `service_role` ou clé d'un autre projet ;
- environnement non Preview ou runtime non Staging ;
- identifiant de projet Vercel inattendu ;
- clé Stripe Live ;
- SHA absent ou différent du paquet ;
- contenu du paquet modifié ;
- ressource de carte absente ou altérée.

Après le build, chaque page chargeant `api-client.js` doit porter `LYANN_SUPABASE_LOCK` Staging, l'URL Staging et l'origine API de la Preview. Aucune référence Production ni `service_role` n'est tolérée.
Le défaut Production inerte de `api-client.js` reste bloqué par le verrou. Vérifié dans le navigateur : l'injection Production donne `SUPABASE_LOCK_MISMATCH` et l'absence de configuration donne `SUPABASE_CONFIG_REQUIRED`.
Les variables requises existent côté projet Vercel pour la cible Preview (noms vérifiés).

## 7. Tests depuis une copie propre du commit

Les tests n'ont pas utilisé l'arbre de travail : export `git archive` du commit, puis `npm ci --omit=dev --ignore-scripts` (322 paquets), puis le vrai build Preview.
La copie du paquet est servie à la façon de Vercel : statique d'abord, `cleanUrls`, puis réécritures. Les pages passent par le vrai `api/render.js` et `/v1/explorer/requests` par le vrai gestionnaire, sur Staging en lecture.

| Test | Bureau 1440 | Mobile 390 |
|---|---|---|
| Découvrir | OK | OK |
| Lyanneurs : 53 fiches | OK | OK |
| Annonces : 18 fiches | OK | OK |
| Recherche : 53 résultats | OK | OK |
| Familles : 8 | OK | OK |
| Panneau Affiner : ouvert puis fermé | OK | OK |
| Fenêtre visiteur | OK | OK |
| Carte : Leaflet, MapLibre, pont, canevas, glyphes PBF servis par le paquet | OK | OK |
| Écran de connexion : client prêt, verrou Staging | OK | OK |
| Débordement horizontal | 0 | 0 |
| Erreurs JS et console, requêtes en échec | 0 | 0 |
| Hôtes contactés : Supabase | Staging seul | Staging seul |
| Requêtes vers la Production | 0 | 0 |

- Aucune écriture. Les requêtes d'écriture sont à 0. Deux POST `rpc/lyann_public_badges` sont des RPC en lecture seule (`STABLE`).
- Un GET vers `staging.lyann.app` : un avatar dont l'URL est stockée dans les données Staging.
- Exposition HTTP : 30 chemins sensibles (`.env`, `.git`, `work/`, `docs/`, `scripts/deploy-*`, `server.js`, `vercel.json`, `CLAUDE.md`, `ios/`…) sont absents du paquet et répondent 404.
- Aucun secret dans les fichiers du paquet (test : aucune clé privée, Stripe, `whsec`, `service_role` ; seuls des JWT anonymes sont tolérés).
- `tests/staging-package.test.js` : 26 tests, dont le déterminisme (deux exports, même empreinte), la présence des ressources, la falsification et les refus du build. Avec `staging-preview-script` et `staging-v2-guard` : **29/29**.
- Captures : `artifacts/phase-3-2c/package62/screens/` (11 images). Rapport complet : `local-validation.json`.

## 8. Manifeste du paquet

`artifacts/phase-3-2c/package62/` :
- `package-manifest.sha256` : 396 lignes, SHA-256 par fichier.
- `package-categories.tsv` : catégorie de chaque fichier conservé.
- `excluded-from-commit.tsv` : raison de chaque exclusion.

## 9. Comparaison avec les 681 fichiers

- 390 conservés identiques ;
- 2 conservés modifiés : `.vercelignore` et `package-lock.json` ;
- 289 retirés (point 4) ;
- 4 ajoutés : `scripts/build-staging-preview.js`, `scripts/lib/package-integrity.js`, `vercel.staging-preview.json`, `config/map-assets.sha256.json`.

Les ressources de carte étaient déjà dans les 681 (envoyées depuis le disque local). Elles sont maintenant versionnées.

## 10. Verdict pour une nouvelle Preview isolée : **GO sous réserves**

Le paquet est propre, reproductible et vérifié localement. Le déploiement reste à autoriser explicitement : `LYANN_AUTHORIZE_STAGING_PREVIEW=1 LYANN_PREVIEW_COMMIT=e56163af45b27ac01709956b33c53882edea1b4a sh scripts/deploy-staging-preview.sh`.

Réserves :
1. Le build n'a pas tourné dans le conteneur Vercel (aucun déploiement autorisé). La première Preview sert de preuve. Le build échoue de façon explicite plutôt que de dériver.
2. `ignoreCommand` de la Preview est remplacé par un test en ligne sur `LYANN_VERCEL_CLI_DEPLOY`. La porte (`vercel-target-gate`) s'exécute en local avant l'envoi, et le build vérifie l'identifiant du projet. La politique complète n'est plus publiée.
3. Le lockfile suivi s'appliquera aussi au prochain `npm install` du projet Production, et `.vercelignore` réduit aussi ses envois. Aucun changement de version. À garder en tête avant le prochain déploiement Production.
4. Tous les fichiers du paquet sont servis statiquement (`outputDirectory "."`). Ils ne contiennent aucun secret. `api/server.js` exporte une application Express, c'est un résidu connu.
5. La suite complète (151 fichiers) n'a pas pu être terminée ici (lente). Trois fichiers échouent déjà sur le commit de base avec les mêmes résultats :
   - `admin-ops-resources` ;
   - `admin-operations` (2 tests) ;
   - `annonce-publication-notice` (test navigateur, non exécutable ici).
   `staging-v2-blockers` échoue aussi, comme avant cette phase.
6. Pas de test sur iPhone réel : Chromium bureau et mobile émulé uniquement.
7. Les `crons` de `vercel.staging-preview.json` n'agissent pas sur une Preview (comportement Vercel), inchangé.

Phase 3.2D non commencée.
