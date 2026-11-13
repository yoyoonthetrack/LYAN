# Phase 3.2C-5.3 — Migration 96 et Preview Vercel isolée : rapport

Production : aucun accès. Projet `lyan` : non utilisé. `staging.lyann.app` : non modifié. Migration 97 : non appliquée. Phase 3.2D : non commencée.

## 1. Branche et SHA

- Branche `feature/marketplace-v3-2c-ui`, SHA `0bc6b03ffc86e73e1c912fdd72ebfb440cdde909`.
- Commit de la phase : `docs/PHASE_3_2C_5_3_REPORT.md`, `artifacts/phase-3-2c/apply96/`, `artifacts/phase-3-2c/preview53/` uniquement (SHA du commit donné dans le message de livraison). Le SHA déployé reste `0bc6b03f…` : le commit de preuve vient après le déploiement et n'est pas ce qui tourne sur la Preview. Aucune fusion.

## 2. Migration 96 : appliquée, COMMIT confirmé

- Projet Supabase `tdktfbtqceldlaeqjtow` (`Lyann-staging-v2`), identité confirmée avant écriture.
- Fichier `96_conversations_insert_policy_lockdown_staging.sql`, sha256 `af5a85db…2ea9b3`. Rollback `…_rollback.sql`, sha256 `80be9615…c72f2`. Identiques aux copies de `artifacts/phase-3-2c/backup96/` et à la version répétée.
- Prérequis relus avant écriture : six empreintes de référence identiques, politiques et ACL de `conversations` conformes, seules deux fonctions `SECURITY DEFINER` insèrent dans `conversations` (`get_or_create_conversation`, `lyann_pair_conversation`), aucun `insert` ou `upsert` sur `conversations` dans le code web, serveur ou paquets iOS/Android.
- Exécution : une transaction `BEGIN … COMMIT` avec assertions avant et après, réponse `[]`, aucune erreur.
- Relecture ce jour (connexion distincte, lecture seule) : l'état durable est confirmé (section 3).

## 3. Politiques et permissions, avant et après

| Élément | Avant | Après |
|---|---|---|
| Politiques INSERT sur `conversations` | « No direct insert … » (`is_current_user_admin()`) + « Users can insert conversations » (`WITH CHECK true`) | « No direct insert … » seule |
| Politique SELECT | « Participants can view conversation » | identique |
| RLS | activée, non forcée | identique |
| Politiques `public` (total) | 146 | 145 |
| ACL des fonctions `lyann_insert_notification`, `lyann_pair_conversation`, `lyann_ensure_support_welcome` | `{postgres, service_role}` (migration 95) | identique |
| Empreintes `col_acl`, `data`, `fn_acl`, `rel_acl`, `views` | `b7521379…`, `a050a78e…`, `b81c68fc…`, `b73a110e…`, `6144ae1e…` | identiques |
| Empreinte `policies` | `7b87e80c…` | seule valeur modifiée |
| Compteurs | 85 conversations, 124 participants, 541 messages, 4017 notifications, 595 push_deliveries | identiques (relus aujourd'hui) |

Une seule politique a été retirée. Aucune autre politique, aucun GRANT n'a changé.

## 4. Tests de sécurité

Sonde SQL par rôle, toujours annulée (`artifacts/phase-3-2c/apply96/probe_post96.sql`, résultats dans `probe_post96_report.json`) :

- insertion directe de conversation : `anon` refusé (`42501`), membre authentifié refusé (`42501`), membre avec `started_by` d'un autre refusé (`42501`) ;
- administrateur et `service_role` : insertion directe OK ;
- les trois fonctions helper de la migration 95 : `anon` et `authenticated` refusés (`42501`), `service_role` OK ;
- écritures directes d'un membre : notification, participant pour autrui, message au nom d'un autre, toutes refusées (`42501`).

Tests automatisés rejoués aujourd'hui (`node --test`) :

| Suite | Résultat |
|---|---|
| `internal-helper-rpc-lockdown-sql` (95) | 2/2 |
| `conversations-insert-policy-lockdown-sql` (96 et 97, PGlite) | 4/4 |
| `staging-preview-script` | 3/3 |
| `staging-v2-isolation` | 18/18 |
| `visitor-experience-v32c2` | 16/16 |
| `runtime-isolation` | 5/5 |
| `profiles-anon-rls` | 3/3 |
| `staging-v2-blockers` | 3/4 (échec préexistant, voir section 14) |

`visitor_data_lock` (Playwright, contre un serveur local branché sur Staging, `LYANN_E2E_EXPECT_MIGRATION_94=1`) : 20/20.

## 5. Tests de messagerie

Dans la même sonde annulée, après 96 : conversation de support (idempotente), `get_or_create_conversation`, `open_direct_conversation`, envoi d'un message et notification créée pour le destinataire par la chaîne de déclencheurs, tous OK. Règle de blocage : « Ce membre ne peut pas recevoir vos messages. » (`42501`), comme avant. Dans la transaction les compteurs ont monté, tout a été annulé : les compteurs vivants sont identiques. Aucun envoi externe, aucune donnée QA persistante.

Non testé : messagerie réelle d'un membre connecté dans l'interface de la Preview (voir section 11).

## 6. Projet Vercel

`yoyo-d85d/lyann-staging-preview` (`prj_FHIKUKYa8IwpiitigUma4gTtTF6q`), via `scripts/deploy-staging-preview.sh` avec `LYANN_AUTHORIZE_STAGING_PREVIEW=1`. La porte de ciblage a répondu « ACCEPTÉ ». Pas de `--prod`, pas d'alias, pas de promotion. Le script n'écrit que `--environment preview`, et le test `staging-preview-script` vérifie qu'il ne contient ni `--prod`, ni `alias`, ni `promote`, ni `domains`.

## 7. SHA déployé

Le déploiement `dpl_E1kjRoA1Qo5CzMx9xxe4pYaZHLrJ` expose `commit = 0bc6b03ffc86e73e1c912fdd72ebfb440cdde909` dans `/v1/runtime/identity`, relu aujourd'hui.

Réserve : l'envoi est l'arbre de travail, pas le commit (Vercel a enregistré `gitDirty = 1`). Preuve complète dans `artifacts/phase-3-2c/preview53/DEPLOYED_CONTENT.md`, établie en lisant l'arbre de fichiers du déploiement (681 fichiers) et en comparant les SHA-1 :

- 616 fichiers identiques au commit ;
- 3 fichiers différents du commit : `docs/rc-final-go-no-go.md`, `docs/staging-deployment-audit.md`, `scripts/backup-production-database.js` (patch de lecture : `deployed-vs-head.patch`). Les 6 autres fichiers modifiés (4 captures `artifacts/explorer`, 2 fichiers `ios/`) n'ont **pas** été envoyés : ils sont exclus par `.vercelignore` ;
- 62 fichiers absents du commit : 28 fichiers de la carte ignorés par `.gitignore` (`vendor/leaflet`, `vendor/maplibre`, glyphes `assets/maps/glyphs`, `package-lock.json`), 25 fichiers `work/` et 9 scripts non suivis. **Un déploiement refait depuis le seul commit n'aurait pas la carte.**

Le déploiement est daté du 2026-11-12 22:58 UTC (`READY` à 23:03 UTC), manifeste des 681 fichiers dans `deployed-files-manifest.tsv`.

## 8. URL HTTPS Preview

https://lyann-staging-preview-p3wky5j7d-yoyo-d85d.vercel.app (état `READY`, environnement `preview`).

## 9. Statut HTTP et protection

- Sans session : 401 sur `/`, `/v1/runtime/identity`, `/v1/explorer/requests`, `/discover.html`, `/results.html`.
- Protection : Vercel Authentication et mot de passe (`deploymentProtection: vercel_authentication, password`).
- Avec la session Vercel normale du navigateur Cursor : toutes les pages se chargent, sans secret de contournement ni désactivation de la protection.

## 10. Supabase Staging et Stripe Test

`/v1/runtime/identity` sur la Preview, lu aujourd'hui :
`vercel_env=preview, kind=staging, supabase_ref=tdktfbtqceldlaeqjtow, isolation=STAGING_ISOLATED, staging=true, production=false, commit=0bc6b03f…`.

- Supabase : les appels de l'interface vont vers `tdktfbtqceldlaeqjtow` (observé dans les ressources chargées).
- Référence Production inerte dans le code source déployé : `lyann-runtime-config.js` et `api-client.js` (déjà publiés en Production) contiennent l'URL, la référence et la clé **anon** (publique) de Production comme valeurs par défaut. Sur la Preview, `LYANN_SUPABASE_LOCK=tdktfbtqceldlaeqjtow` refuse cette configuration (`SUPABASE_PRODUCTION_BLOCKED`). Les pages construites ne contiennent aucune référence Production (contrôle de la phase 3.2C-5.2), mais le dépôt déployé en contient. Aucune clé `service_role` ni clé Stripe réelle dans les 681 fichiers texte.
- Stripe : `assertHostedIsolation` refuse une clé Live en environnement Preview, et la garde a répondu `STAGING_ISOLATED`. Aucune clé Stripe n'a été lue ni affichée dans le rapport. Je n'ai pas conservé le résultat du contrôle explicite du préfixe `sk_test_` fait avant le déploiement : la preuve est la garde d'exécution, pas ce préfixe.
- Aucun cron : Vercel n'exécute pas les crons sur une Preview. Pas de clés APNs en Preview.
- Base partagée : la Preview écrit dans la même base Staging que `staging.lyann.app`. Ne pas tester les paiements sur la Preview.

## 11. Recette fonctionnelle

Méthode : navigateur Cursor, session Vercel normale, mesures DOM et requêtes réseau (`performance.getEntriesByType('resource')`). Aucune écriture, aucune connexion membre.

Visiteur, 1440 px et 390 px :

| Parcours | Résultat |
|---|---|
| Découvrir | s'affiche, 10 familles, annonces du moment chargées par `/v1/explorer/requests` |
| Lyanneurs : recherche, famille, territoire | OK ; 53 Lyanneurs, 19 après la famille « Maison & travaux » |
| Lyanneurs : clic sur un profil | fenêtre d'inscription/connexion |
| Annonces : recherche, famille, territoire | OK ; 18 annonces, 4 après la famille « Maison & travaux » |
| Annonces : clic sur une annonce | fenêtre « Envie d'en savoir plus ? Rejoignez LYANN… » |
| Données protégées | 0 lecture de `requests`, `messages`, `payments`, `conversations`, `reviews`, `user_favorites`, `request_locations` ni du détail d'annonce |
| Carte (Annonces) | s'ouvre, marqueurs présents, aucune lecture protégée |
| Messages (`/feed?action=messages`) | affiche « Connexion / Inscription », 0 lecture de `messages`, `conversations`, `payments`, `notifications` |

Mobile 390 px :

- une famille sélectionnée filtre immédiatement (53 → 19 en 250 ms) ;
- aucun grand panneau inline : les résultats ne descendent que de 56 px à la sélection d'une famille ;
- « Filtres » ouvre le bottom sheet « Filtrer les Lyanneurs » (capture `lyanneurs-390-affiner-sheet.png`) ;
- la carte garde ses dimensions (366 × 513 px, pas de débordement horizontal). La couche MapLibre est plus large que le conteneur par construction (canvas Leaflet/MapLibre, rogné par le panneau) ;
- aucun défilement horizontal à 390, 430, 1280 et 1920 px.

**Non testé (membre connecté)** : ouverture des fiches, favoris, contact et messagerie dans l'interface, avis et réalisations, reprise d'une fiche après authentification. Cela demande de saisir des identifiants QA et écrirait des données. À faire manuellement (section 13). Les parcours membre par SQL (messagerie, blocage) sont couverts en section 5.

Limite des tests locaux : lors de la phase, 9 tests `explorer_public_contract` ont échoué contre le serveur local `preview-v32c.js`, qui ne sert pas les routes API (erreurs 404). Je ne les ai pas relancés contre la Preview. Ces échecs ne sont pas liés à la migration 96.

## 12. Captures

`artifacts/phase-3-2c/preview53/` :

- `discover-1440.png`, `lyanneurs-1440.png`, `lyanneurs-visitor-gate-1440.png`, `annonces-1440.png`
- `lyanneurs-390.png`, `lyanneurs-390-affiner-sheet.png`

Non capturées : Annonces à 390 px, la carte, 430 et 1280 px. Les captures mobiles d'Annonces ont été interrompues par l'outil à trois reprises. Les largeurs 430 et 1280 sont couvertes par des mesures DOM (iframes de même origine), pas par des captures.

Recette visuelle (mesures et captures 1440 et 390) : photo d'en-tête chargée sur Lyanneurs et Annonces à 430, 1280 et 1440, sans voile vert ou jaune visible sur les captures ; pages centrées, texte lisible. Le bouton « Poster une annonce » de Découvrir a bien un `linear-gradient` à 430 et 1280. Sur les pages de résultats, le bouton « Publier une annonce » est masqué à 1280 et son fond est un vert uni (`rgb(36, 107, 73)`), sans dégradé : à confirmer par rapport à la maquette.

**Maquette OPTION 3** : je n'y ai pas accès dans cet environnement. Aucune comparaison fidèle n'a été faite : la recette visuelle se limite aux critères listés ci-dessus.

## 13. Accès depuis Safari iPhone

**Non vérifié sur un iPhone.** Aucun appareil n'a été utilisé, l'URL ne peut donc pas être déclarée accessible sur iPhone. Étapes à faire manuellement :

1. Ouvrir l'URL de la section 8 dans Safari sur l'iPhone.
2. Choisir « Log In with Vercel », se connecter avec un compte membre de l'équipe `yoyo-d85d`, ou saisir le mot de passe de déploiement si la page le demande.
3. Vérifier que Découvrir, Lyanneurs, Annonces et la carte se chargent, que les images s'affichent et que le bottom sheet « Filtres » s'ouvre.
4. Se connecter avec un compte QA pour la recette membre (fiches, favoris, contact, messages).

À confirmer : le cookie d'authentification Vercel doit être accepté par Safari (suivi intersite et blocage des cookies tiers).

## 14. Anomalies et risques résiduels (hors périmètre, non traités)

- **Fonctions `SECURITY DEFINER` exécutables par anon** : sur Staging, 114 des 185 fonctions de `public` sont exécutables par anon, dont 57 `SECURITY DEFINER` (décompte du 3.2C-5.2, non audité).
- **Privilèges par défaut trop larges** : une future fonction créée par `postgres` reste exécutable par PUBLIC, anon et authenticated. Correctif préparé : migration 97, **non appliquée et non répétée**.
- **Fichiers de buckets publics** : non traités dans cette phase.
- **Deux annonces QA** à nettoyer : non touchées (aucune suppression de données).
- **Échec préexistant** : `staging-v2-blockers`, test « 58 changes only the existing-active-quote refusal to P0001 » (lié à la migration 58, antérieur à cette phase).
- **9 échecs `explorer_public_contract`** contre le serveur local (limite du banc local, section 11).
- **Bouton « Publier une annonce »** sans dégradé sur les pages de résultats (section 12).
- **Fichiers publiés par le déploiement sans utilité** (derrière la protection) : `.momentic-mcp/`, `.codex/`, `work/`, scripts de production non suivis, fichiers de test racine. `.vercelignore` ne les exclut pas. Non corrigé (aucun redéploiement dans cette phase).
- **Reproductibilité** : les fichiers de la carte (`vendor/leaflet`, `vendor/maplibre`, glyphes) sont ignorés par Git. Un déploiement depuis le commit seul perdrait la carte.
- **Widget Vercel** (cercle flottant « commentaires ») visible sur la Preview : fonction de Vercel, pas de l'application.
- **Cookie de session Vercel** requis pour toute vérification : `scripts/verify-staging-release.js` échouera sur une Preview protégée.

## 15. Verdict

**GO pour la recette utilisateur, sous réserves.**

- GO : migration 96 appliquée et vérifiée, aucune régression de messagerie, isolation Preview confirmée (`STAGING_ISOLATED`, `production=false`, SHA attendu), protection Vercel active, parcours visiteur conformes sur ordinateur et mobile, aucune lecture de données protégées.
- Réserves : recette membre et Safari iPhone à faire manuellement ; pas de comparaison à la maquette OPTION 3 ; captures mobiles d'Annonces et de la carte manquantes ; dégradé du bouton de publication à confirmer sur les pages de résultats.
