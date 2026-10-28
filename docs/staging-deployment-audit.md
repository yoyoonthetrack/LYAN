# Audit du déploiement Vercel Staging

Date : 2026-10-28
Branche : `release/lyann-rc-v1-1`
PR : https://github.com/yoyoonthetrack/LYAN/pull/13 (brouillon)
Domaine : `https://staging.lyann.app`
Projet : `lyann-staging-preview` `prj_FHIKUKYa8IwpiitigUma4gTtTF6q`
Déploiement servi : `dpl_3s5U43QkPhe1R9prL1EeSYAakAh8`
SHA annoncé par `GET /v1/runtime/identity` : `6270df9efc231f98efe6f8f56eb47b224dcd6e3f`
Supabase : `tdktfbtqceldlaeqjtow`
Isolation : `STAGING_ISOLATED`, `production=false`
Stripe : `stripe_mode=test`
Plan Vercel du déploiement : Pro. Un cron chaque minute est accepté. Trois crons sont enregistrés. `api/index.js` a `maxDuration` 60. La collecte éditoriale du 27 octobre a duré 38 s.

Le projet Production `lyan` et le domaine `lyann.app` n’ont pas été modifiés. `GET https://lyann.app/v1/runtime/identity` répond 404.

## Verdict

Cohérence du déploiement Staging : **GO**.
Notifications push TestFlight : **NO-GO**. La clé APNs chargée sur `staging.lyann.app` est acceptée par Apple. Aucun compte QA n’a de jeton production, donc l’envoi automatique n’a pas été allumé et aucun membre n’a été notifié.
Release candidate : **NO-GO**, pour les blocages déjà écrits dans `docs/rc-final-go-no-go.md`. Les contrôles CI ne suffisent pas à les lever.

## Routes

Le code de `api/` contient 166 chemins `/v1` distincts. Le contrôle automatique en a exercé 13 sur le domaine réel, avec la méthode prévue et un corps vide pour les POST. Aucune n’a répondu par une page d’absence de la plateforme.

| Méthode et chemin | Réponse observée |
| --- | --- |
| `GET /v1/runtime/identity` | 200, ref Staging, SHA `cb65a1d` |
| `GET /v1/payments/config` | 200, `stripe_mode=test` |
| `GET /v1/explorer/requests` | 200 |
| `GET /.well-known/apple-app-site-association` | 200, `appIDs`, chemin `/auth/callback` |
| `POST /v1/editorial/collect/scheduled` | 401 |
| `POST /v1/internal/moderation/run` | 401 |
| `GET /v1/internal/bokantaj/media-sweep` | 401 |
| `POST /v1/notifications/push-drain` | 401 |
| `POST /v1/payments/webhook` | 400, signature absente |
| `POST /v1/auth/delete-account` | 401 |
| `GET /v1/admin/editorial/bots` | 401 |
| `GET /v1/store/config` | 403, achats réservés |
| `GET /v1/business/rights` | 401 après correction |

`GET /v1/members` et `POST /v1/auth/login` répondent 410. Ces parcours legacy sont fermés dans le code.

Les applications natives TestFlight 1.0 (12), identifiant `ios-mvqzsf62-86ab71`, SHA `c35d68ee75365bc815d096120a5c5a9a8e1c2e24`, appellent `https://staging.lyann.app`. L’AAB Android `395d82e8…` a le même backend et n’a pas été envoyé. Aucun binaire n’a été reconstruit : cet audit ne change pas le client.

## Crons

Vercel enregistre les crons du `vercel.json` contenu dans l’archive envoyée. `--local-config` choisit le projet, il ne remplace pas ce fichier. `scripts/deploy-staging.sh` construit maintenant l’archive à partir de `vercel.staging.json`, y ajoute `maxDuration` 60, puis restaure le `vercel.json` du dépôt. Le fichier Git de Production ne contient que le cron de modération.

| Tâche | Décision | Chemin | Fréquence | Enregistré |
| --- | --- | --- | --- | --- |
| Collecte éditoriale | À planifier | `/v1/editorial/collect/scheduled` | `0 11,16,21 * * *` | Oui |
| Modération et reprise vidéo | À planifier | `/v1/internal/moderation/run` | `* * * * *` | Oui |
| Drain des notifications | Indispensable sur Vercel. La boucle locale de 8 s ne tourne pas là | `/v1/notifications/push-drain` | `* * * * *` | Oui. L’envoi reste éteint |
| Nettoyage des médias | Non. Suppression seulement avec `apply=true`, à la demande | `/v1/internal/bokantaj/media-sweep` | — | Non, volontaire |
| Échéances, jalons, Stripe, abonnements | Non. Webhook ou requête | — | — | Non, volontaire |
| `lyann_agent_schedules` | Stocké pour l’admin. Aucun exécuteur ne lit ces expressions | — | — | Non |

Les trois crons ont été relus après le déploiement `dpl_E633F59q5UhSNbHAZifwKFYXxyd8` : éditorial `0 11,16,21 * * *`, modération présent, drain `* * * * *`, liste manquante vide. Sans secret, ces routes répondent 401. Avec le secret de cron, le drain répond HTTP 200, `PUSH_AUTOMATIC_DISABLED`, 0 traité. Aucune notification n’est partie. La file compte 0 livraison `pending`, `retry` ou `processing`.

## Notifications

Le chemin est hybride. Un trigger Postgres enfile `push_deliveries` à l’insertion d’une notification (`NEW_MESSAGE`, `QUOTE_RECEIVED`, `MISSION_ACCEPTED`, `WORK_TO_VALIDATE`, `PAYOUT_READY`, `PAYMENT_FAILED`, `OPPORTUNITY`). Le claim SQL ignore les lignes expirées, pose un verrou et déduplique. Cinq tentatives au plus, avec un délai croissant. Le serveur Vercel n’exécute pas la boucle locale.

TestFlight 1.0 (12) a `aps-environment` production et déclare l’environnement `production` hors debug. Le jeton QA actif est `sandbox`, mis à jour le 21 octobre 2026. Le seul jeton `production` actif n’appartient pas à un compte QA. Il n’a pas été utilisé. Aucune réception iPhone n’est donc déclarée.

Les quatre variables APNs sont présentes en secret sur la cible servie. Une sonde autorisée, vers un jeton qui n’appartient à aucun appareil, a répondu HTTP 400 `BadDeviceToken` : la clé EC est lisible, l’identifiant de clé a la forme attendue, l’équipe est `WLV4WC47U2`, le bundle est `app.lyann.mobile`, et Apple a accepté le jeton fournisseur. `PUSH_AUTOMATIC_ENABLED` reste absent. `PUSH_QA_ONLY` et `PUSH_QA_USER_IDS` restent les secrets des trois comptes QA. Le seul jeton `production` actif n’est pas l’un de ces comptes. Il n’a pas été utilisé.

Il reste à ouvrir TestFlight 1.0 (12) sur l’iPhone avec un compte QA, à autoriser les notifications, puis à laisser l’application au premier plan quelques secondes. Ensuite seulement : `PUSH_AUTOMATIC_ENABLED=true`, redéploiement Staging, et un seul message depuis l’autre compte QA. La preuve de réception reste l’affichage sur l’iPhone.

## Médias, échéances, maintenance

Le nettoyage immédiat d’un fichier non référencé a été exécuté sur un fichier déposé pour l’essai dans `bokantaj-media-hold`, puis retiré. Le bucket public `bokantaj-media` refuse les nouveaux fichiers. L’inventaire à blanc compte 8 fichiers, 0 orphelin de plus de 48 h, 2 publications refusées encore conservées. Aucun cron de nettoyage n’a été ajouté : il effacerait ces deux refus, et aucun orphelin n’attend.

Trois devis sont `SENT`. Aucun n’a dépassé `valid_until`. L’acceptation refuse déjà un devis expiré. Aucun cron. Les jalons notifient par trigger. Les abonnements Store restent fermés et la table d’adhésion lue est vide. `lyann_agent_schedules` contient 0 ligne et n’a pas d’exécuteur.

## Éditorial

Dix-sept propositions `PENDING` restent en base, chacune avec une source. Les trois du 27 octobre sont dedans : Actu, Trafik et Kilti. Rien n’a été approuvé. Le propriétaire ouvre `https://staging.lyann.app/admin.html`, section Comptes éditoriaux, lit le lien de source, puis Valider ou Refuser. La route exige `agents.approve`. Les comptes QA ne l’ont pas.

## Variables

Noms seulement. Cible lue : l’environnement `production` du projet Staging, celui qui sert `staging.lyann.app`.

Présentes et utilisées : `SUPABASE_URL`, `LYANN_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LYANN_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `MODERATION_WORKER_SECRET`, `OPENAI_API_KEY`, `LYANN_RUNTIME`, `LYANN_STAGING_PUBLIC_ORIGIN`, `LYANN_E2E_WRITE_PROJECT_REF`.

`LYANN_SUPABASE_SERVICE_ROLE_KEY` est listé avec une valeur vide. La clé `SUPABASE_SERVICE_ROLE_KEY` est celle qui a écrit la collecte. Aucun secret n’a été recréé.

Absentes, avec un remplaçant déjà actif : `EDITORIAL_CRON_SECRET` (remplacé par `CRON_SECRET`), `LYANN_AI_API_KEY` et `LYANN_EDITORIAL_AI_ENABLED` (chemin direct `OPENAI_API_KEY`).

Absentes, fermeture voulue : `STRIPE_LIVE_ENABLED` sur la cible servie, `PUSH_AUTOMATIC_ENABLED`, `PUSH_CRON_SECRET`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`. `PUSH_QA_ONLY` et `PUSH_QA_USER_IDS` sont présents en secret sur la cible servie. Le nom `STRIPE_LIVE_ENABLED` existe sur la cible Preview. La cible servie ne l’a pas.

`LYANN_SUPABASE_LOCK` est absent de la liste d’environnement de la cible servie. La page servie contient quand même le verrou `tdktfbtqceldlaeqjtow`, repris depuis l’URL Supabase au build. `LYANN_RELEASE_SHA` est injecté au déploiement. Le serveur annonce `6270df9`.

Google et Apple ne sont pas des variables Vercel. `GET /auth/v1/authorize?provider=google` sur le projet Supabase Staging répond 302. Le même appel Apple, sans paramètres OAuth, répond 400 `validation_failed`. Le fournisseur répond. La configuration OAuth reste dans Supabase Auth.

## Routage

L’association Apple servie vient de `config/apple-app-site-association.staging.json` : équipe `WLV4WC47U2`, bundle `app.lyann.mobile`, chemins `/auth/callback`, `/confirm-signup` et le retour Stripe Connect. Les en-têtes de cache sont ceux du fichier Staging.

`https://staging-bokantaj.lyann.app` sert encore le commit `80ceae7c`, Supabase Staging, depuis le projet `lyan`. Les paquets actuels appellent `staging.lyann.app`. Le dépôt l’autorise encore comme ancienne origine dans `shared-html-build.js` et dans des tests. Retrait proposé, sans l’exécuter : retirer l’alias du projet `lyan` après accord, puis retirer l’origine des tests dans un commit séparé. Aucun alias Production n’a été changé.

## Corrections

- `api/business-routes.js` traite `LYANN_RUNTIME=staging` avec l’URL Supabase Staging comme Staging, y compris quand `VERCEL_ENV` vaut `production`. Une URL Supabase Production reste refusée. Les achats Store continuent de répondre 403 sur cette cible.
- `scripts/staging-vercel-upload.js` et `scripts/deploy-staging.sh` envoient les crons Staging, la réécriture Apple et la durée de 60 s, puis rendent le `vercel.json` Git.
- `scripts/verify-staging-release.js` contrôle la configuration locale et, si `LYANN_STAGING_PUBLIC_ORIGIN` vaut `https://staging.lyann.app`, les 13 routes ci-dessus. Il refuse `lyann.app`. Il n’envoie aucun secret et ne crée aucune donnée.
- Tests : `tests/staging-vercel-upload.test.js` et les assertions ajoutées à `tests/business-workflow.test.js`. 19 tests locaux passés avant le déploiement.
- Redéploiement du seul projet `lyann-staging-preview`. Contrôle HTTP PASS. Crons relus. `vercel.json` Git revenu à la version Production.
- Le drain `/v1/notifications/push-drain` est enregistré chaque minute. Sur Staging, l’envoi exige `PUSH_AUTOMATIC_ENABLED` et une liste QA. Les deux sont séparés : la liste est posée, le flag reste absent. 23 tests locaux de file, cron et éditorial sont passés avant ce déploiement.

## Écart avec TestFlight 1.0 (12)

Le binaire iOS est `c35d68e`. Le serveur est `6270df9`. TestFlight 1.0 (12) reste le binaire. Pas de build 13.
