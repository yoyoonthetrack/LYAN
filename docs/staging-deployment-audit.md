# Audit du déploiement Vercel Staging

Date : 2026-10-28
Branche : `release/lyann-rc-v1-1`
PR : https://github.com/yoyoonthetrack/LYAN/pull/13 (brouillon)
Domaine : `https://staging.lyann.app`
Projet : `lyann-staging-preview` `prj_FHIKUKYa8IwpiitigUma4gTtTF6q`
Déploiement servi : `dpl_5PBWPQR2JZNHLPCU3ZqoSxPRZU41`
SHA annoncé par `GET /v1/runtime/identity` : `cb65a1d882b5181fec9bd23ad072da13cd4e44a0`
Supabase : `tdktfbtqceldlaeqjtow`
Isolation : `STAGING_ISOLATED`, `production=false`
Stripe : `stripe_mode=test`
Plan Vercel du déploiement : Pro. Un cron chaque minute est accepté. Deux crons sont enregistrés. `api/index.js` a `maxDuration` 60. La collecte éditoriale du 27 octobre a duré 38 s.

Le projet Production `lyan` et le domaine `lyann.app` n’ont pas été modifiés. `GET https://lyann.app/v1/runtime/identity` répond 404.

## Verdict

Cohérence du déploiement Staging : **GO**.
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
| Drain des notifications | Non. Le flag et APNs sont absents. Le drain local ne tourne pas sur Vercel | `/v1/notifications/push-drain` | — | Non, volontaire |
| Nettoyage des médias | Non. Suppression seulement avec `apply=true`, à la demande | `/v1/internal/bokantaj/media-sweep` | — | Non, volontaire |
| Échéances, jalons, Stripe, abonnements | Non. Webhook ou requête | — | — | Non, volontaire |
| `lyann_agent_schedules` | Stocké pour l’admin. Aucun exécuteur ne lit ces expressions | — | — | Non |

Les deux crons enregistrés ont été relus avec `scripts/verify-staging-editorial-cron.js` après le déploiement : éditorial `0 11,16,21 * * *`, modération présent, liste manquante vide. Sans secret, les deux POST répondent 401. Le secret de cron n’a pas été affiché. La collecte authentifiée du 27 octobre a créé 3 propositions puis a refusé le second passage du même créneau. L’API d’historique d’invocations Vercel ne fournit pas le journal d’exécution. Une minute sans travail de modération n’écrit pas de ligne.

## Variables

Noms seulement. Cible lue : l’environnement `production` du projet Staging, celui qui sert `staging.lyann.app`.

Présentes et utilisées : `SUPABASE_URL`, `LYANN_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LYANN_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `MODERATION_WORKER_SECRET`, `OPENAI_API_KEY`, `LYANN_RUNTIME`, `LYANN_STAGING_PUBLIC_ORIGIN`, `LYANN_E2E_WRITE_PROJECT_REF`.

`LYANN_SUPABASE_SERVICE_ROLE_KEY` est listé avec une valeur vide. La clé `SUPABASE_SERVICE_ROLE_KEY` est celle qui a écrit la collecte. Aucun secret n’a été recréé.

Absentes, avec un remplaçant déjà actif : `EDITORIAL_CRON_SECRET` (remplacé par `CRON_SECRET`), `LYANN_AI_API_KEY` et `LYANN_EDITORIAL_AI_ENABLED` (chemin direct `OPENAI_API_KEY`).

Absentes, fermeture voulue : `STRIPE_LIVE_ENABLED` sur la cible servie, `PUSH_AUTOMATIC_ENABLED`, `PUSH_CRON_SECRET`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`. Le nom `STRIPE_LIVE_ENABLED` existe sur la cible Preview. La cible servie ne l’a pas.

`LYANN_SUPABASE_LOCK` est absent de la liste d’environnement de la cible servie. La page servie contient quand même le verrou `tdktfbtqceldlaeqjtow`, repris depuis l’URL Supabase au build. `LYANN_RELEASE_SHA` est injecté au déploiement. Le serveur annonce `cb65a1d`.

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

## Écart avec TestFlight 1.0 (12)

Le binaire iOS est `c35d68e`. Le serveur est `cb65a1d`. L’écart est serveur : dossier Pro ouvert sur le domaine stable, archive Vercel qui emporte les crons et l’association Apple, collecte éditoriale déjà rétablie au déploiement précédent. Le client, le backend déclaré et le verrou Supabase du paquet sont les mêmes. Pas de nouvel envoi TestFlight ni Play.
