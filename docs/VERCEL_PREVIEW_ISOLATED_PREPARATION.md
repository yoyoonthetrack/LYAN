# Phase 3.2C-5.2 — Préparation de la Preview Vercel isolée (NON déployée)

Projet : `yoyo-d85d/lyann-staging-preview` (`prj_FHIKUKYa8IwpiitigUma4gTtTF6q`). Projet `lyan` et Production : non utilisés. Aucun déploiement, aucun alias modifié, `staging.lyann.app` inchangé.

## Commande préparée

`scripts/deploy-staging-preview.sh` (testé : `tests/staging-preview-script.test.js`, 3/3).

- Refuse sans `LYANN_AUTHORIZE_STAGING_PREVIEW=1`.
- Passe la porte `vercel-target-gate.js` (lien, équipe, projet, absence de référence Production).
- Déploie avec `--environment preview`. Le script ne contient ni `--prod`, ni `--environment production`, ni `alias`, `promote`, `rollback`, `domains`, `env add/rm` (vérifié par test).
- `LYANN_STAGING_PREVIEW_DRY_RUN=1` affiche la commande sans rien publier. Sortie du dry-run local :
  `npx vercel deploy --local-config vercel.staging.json --project prj_FHIKUKYa8IwpiitigUma4gTtTF6q --scope <équipe> --environment preview --yes --build-env LYANN_VERCEL_CLI_DEPLOY=1 --build-env VERCEL_PROJECT_NAME=lyann-staging-preview --build-env LYANN_RELEASE_SHA=<sha> --env LYANN_RELEASE_SHA=<sha>`
- `deploy-staging.sh` (stable, `--prod`) n'est pas modifié.

L'envoi est l'arbre de travail, pas le commit. Le script affiche un avertissement si des fichiers suivis sont modifiés. L'arbre actuel en contient neuf sans rapport (captures, iOS, docs, `backup-production-database.js`).

## Vérifications faites (lecture seule)

| Point | Résultat |
|---|---|
| Variables (noms seulement) | Présentes en Preview : `LYANN_RUNTIME`, `LYANN_SUPABASE_URL`/`SUPABASE_URL`, clés anon et service, `LYANN_SUPABASE_LOCK`, `LYANN_E2E_WRITE_PROJECT_REF`, `LYANN_STAGING_PUBLIC_ORIGIN`, Stripe (secret, publiable, webhook), `CRON_SECRET`, `MODERATION_WORKER_SECRET`, `OPENAI_API_KEY`. Absentes en Preview : `APNS_*`, `PUSH_AUTOMATIC_ENABLED`, `PUSH_QA_*`, `STRIPE_TEST_AUTO_REFUND`, `LYANN_CUSTOMER_FEE_REFUND`. Valeurs non lues. |
| Isolation du runtime | `assertHostedIsolation` en environnement Preview : `STAGING_ISOLATED` (Supabase `tdktfbtqceldlaeqjtow` obligatoire, Stripe Live refusé, origine `lyann.app` refusée). Vérifié avec des clés factices locales. |
| Fichiers embarqués | Construction simulée (`VERCEL_ENV=preview`) de `discover.html`, `feed.html`, `results.html`, `pricing.html` : `LYANN_BACKEND_ORIGIN` = l'URL de la Preview elle-même, verrou `tdktfbtqceldlaeqjtow`, aucune référence Production, aucune clé `service_role`, configuration d'exécution chargée avant `api-client.js`. L'interface de la Preview appelle donc l'API de la Preview, pas celle de `staging.lyann.app`. |
| CORS | L'origine de la Preview (`lyann-staging-preview-<id>-yoyo-d85d.vercel.app`) est acceptée, une autre origine `vercel.app` est refusée. |
| `.vercelignore` et fonctions | `*.sql`, `ios`, `android`, `tests`, `artifacts` exclus ; `commune-geo.js`, `discover.html`, `api/index.js`, `api/render.js`, l'association Apple Staging sont publiés. Test existant : `commune-geo.js` est livré avec la fonction. |
| Commande de build | `ignoreCommand` ne construit que si `LYANN_VERCEL_CLI_DEPLOY=1` (donné par `--build-env`) et si la porte accepte. Un push git ne publie rien. |
| API des annonces | `/v1/explorer/requests` : `api/public-explorer-requests.js`, projection serveur fixe, commune officielle ou territoire seulement, extrait de 120 caractères pour les visiteurs, filtre de modération. Indépendante des migrations 95, 96 et 97 (aucune des trois fonctions n'est utilisée). Tests locaux : `explorer-annonces-ux`, `visitor-experience-v32c2`, `staging-v2-isolation`, 44/44 au total avec les nouveaux. Aucun appel HTTP vers `staging.lyann.app` : la lecture a été refusée par la revue automatique et n'a pas été contournée. |
| Protection du déploiement | Une ancienne Preview et l'URL unique d'un déploiement Production du projet répondent `401 Protected Page` sans session. `staging.lyann.app` répond `200`. La protection est donc active sur les Preview. |

Correction faite : le test `built product HTML loads the runtime config before api-client` lisait `index.html`, devenu une simple redirection (commit `7e75a62`). Il lit maintenant `discover.html`.

## Effets attendus d'une Preview

- Nouvelle URL, aucun domaine stable, `staging.lyann.app` continue de servir `a880cc10…` (identité lue avant l'arrêt de la revue automatique : `vercel_env=production`, `kind=staging`, `isolation=STAGING_ISOLATED`).
- Aucun cron enregistré (Vercel n'exécute les crons que sur la production) : pas de `push-drain`, de modération planifiée ni de collecte éditoriale.
- Sans clés APNs : aucun push possible depuis la Preview.
- Base partagée : la Preview écrit dans la même base Staging que le domaine stable. L'isolation est celle du code et du domaine, pas des données.
- Stripe : mode test ; les URL de retour viennent de `LYANN_STAGING_PUBLIC_ORIGIN` (`staging.lyann.app`). Ne pas tester les paiements sur la Preview.
- Retour arrière : supprimer la Preview (`npx vercel remove <url> --scope <équipe>`), rien d'autre ne bouge.

## Accès pour la vérification (décision à prendre)

La Preview est protégée. Options, aucune appliquée :
1. session Vercel de l'équipe dans le navigateur ;
2. `npx vercel curl <chemin> --deployment <url>` avec « protection bypass automatique » : à tester d'abord, car il peut créer un secret de contournement sur le projet, ce qui est une modification de réglage qui demande un accord ;
3. secret de contournement créé volontairement dans les réglages du projet : modification persistante, accord requis.

`scripts/verify-staging-release.js` suppose un domaine public (crons en 401, webhook en 400) : il échouera sur une Preview protégée. Après déploiement, vérifier à la main `/v1/runtime/identity` (attendu : `vercel_env=preview`, `isolation=STAGING_ISOLATED`, `production=false`, `commit` = SHA), `/v1/explorer/requests` (200, sans champ de position exacte), puis parcours Découvrir, Lyanneurs, Annonces.

## Conditions avant de lancer

1. Migration 95 appliquée : **faite**.
2. Migration 96 : **recommandée avant** (elle ferme la création de conversations orphelines que le nouveau code ne corrige pas), autorisation distincte requise.
3. Autorisation explicite de déployer la Preview.
4. Choix de la méthode d'accès (ci-dessus).
