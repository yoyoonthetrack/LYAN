# LYANN — Release Candidate V1.1 à V1.4

Verdict : **NO-GO**

Le passage V1.4 a validé des lectures et quelques écritures admin sur Staging, la création, la modification et l’annulation d’un devis, le changement de rôle d’un compte QA, et la suppression de ce compte. Il n’y a toujours pas d’IPA, pas d’AAB signé pour Play, pas d’appareil physique et pas de remboursement Stripe exécuté. Aucune fusion vers `main`, aucun déploiement Production, aucun Stripe Live.

## V1.4 — back-office, compte, devis, builds

Commit du code : `3435372fcced2d65b0879519a92f218e9bd9cf56`. Preuve `artifacts/rc-v14/pass.json` : 76 cas, 0 échec, le 26 oct 2026. API `127.0.0.1:8098`, `isolation=STAGING_ISOLATED`, Supabase `tdktfbtqceldlaeqjtow`, Stripe test.

| Fonction | Statut | Preuve |
| --- | --- | --- |
| 18 ressources `/v1/admin/ops`, dont territoires et feature flags | OK | HTTP 200 admin, HTTP 403 pour le membre QA |
| Écrans action, marketplace, utilisateurs, maison, territoires, feature flags | OK | Playwright, HTTP 200. Le 400 de V1.3 était `feature-flags`, ressource absente, corrigée dans `3435372` |
| Filtre utilisateurs | OK | une recherche inconnue ne laisse pas la liste |
| Ticket d’aide créé, relu, fermé, seconde fermeture | OK | ticket QA fermé. Le membre reçoit 403 |
| Profils maison | OK | 50 profils lus. Le membre reçoit 403 |
| Devis créé, modifié à 25, refusé par le client, second refus refusé | OK | le prestataire seul peut modifier |
| Révision avec une version périmée | KO sur Staging | la fonction déployée lève `40001`. PostgREST réessaie jusqu’au timeout. La source `51_quote_modifications_and_safety.sql` utilise maintenant `P0001`. Cette migration n’a pas été appliquée : aucune URL de base n’est disponible |
| Remboursement d’un jalon `FUNDED` | KO volontaire | HTTP 409 `EXECUTION_DISABLED`. Le moteur est codé `return false` et le grant ne vise qu’un paiement historique. Aucun contournement, aucun Stripe Live |
| Rôle d’un compte QA passé à `EMPLOYEE` | OK | `POST /v1/admin/ops/users/:id/role`. Le membre reçoit 403. `OWNER` est refusé. L’ancien RPC, qui lit `profiles.role`, refuse aussi l’admin du back-office |
| Formule expirée | OK | `effectivePlan` renvoie `FREE`. Pas d’achat Sandbox |
| Suppression d’un compte `@lyann.invalid` créé pour l’essai | OK | sessions `revoked`, deux JWT refusés, reconnexion impossible, avatar retiré, jeton push désactivé puis absent, profil absent, journal `ACCOUNT_DELETED` |
| Conservation | OK documentée | paiements, devis, jalons, missions, factures, pièces de chat et preuves de signalement ne sont pas effacés |
| Les 33 rubriques, chaque bouton d’écriture | NON TESTÉ | les boutons Mika, génération éditoriale, export, suspension et remboursement n’ont pas été actionnés |
| IPA, AAB Play, appareil, Sandbox store | NON TESTÉ | voir les builds |

### Builds du commit `3435372`

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvpo0omh-5a6365` |
| Compilé le | `2026-10-26T19:44:19.623Z` |
| SHA source | `3435372fcced2d65b0879519a92f218e9bd9cf56` |
| Version | `1.0` |
| Hash bundle | `76555f229ae28c8b05b27f12a18a539abec5d1ec3bc7034887fc151c468ce5ca` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| iOS et Android | même `www`, sans référence Production |

Signature : deux identités Apple Development, zéro Apple Distribution, zéro profil d’approvisionnement, zéro keystore d’upload Android. Le keystore debug local `~/.android/debug.keystore` existe. `./gradlew assembleDebug` n’a pas démarré : aucune JVM n’est installée sur cette machine. TestFlight exige un certificat Apple Distribution et un profil App Store. Play Internal exige un keystore d’upload et un JDK. Aucun certificat n’a été inventé.

## V1.3 — paiements, back-office, cycle de vie, builds

Le passage V1.3 a exécuté Stripe Test sur Staging, une libération réelle, une suppression de compte QA jetable, et un inventaire des 33 rubriques. Il ne validait pas encore les écritures du back-office, le remboursement exécuté, le changement de rôle, ni un binaire installé.

## V1.3 — paiements, back-office, cycle de vie, builds

Code produit sous test : `013f04b6e41c1b0ec410559fcc53c9f693d96ad2`. Ce passage n’a pas modifié le produit. Il ajoute le script `scripts/rc-v13-followup.js` et les preuves `artifacts/rc-v13/followup.json`.

API locale `http://127.0.0.1:8098` : `supabase_ref=tdktfbtqceldlaeqjtow`, `isolation=STAGING_ISOLATED`, Stripe `sk_test_` / `pk_test_`.

### Classe des preuves

| Classe | Ce qui a été fait |
| --- | --- |
| Tests simulés | Playwright CI et local sur données mockées. Ils ne prouvent pas Supabase. |
| Tests connectés Staging | Auth QA, devis, jalons, Stripe Test, webhooks signés, libération, suppression d’un compte créé pour l’essai, lecture admin. |
| Tests natifs simulés | Aucun nouveau passage simulateur dans V1.3. Le paquet local est identifié, non lancé. |
| Appareils physiques | Aucun. |
| Sandbox Apple / Google | Aucun achat, aucune restauration. |

### CI

`013f04b` puis le commit de preuves `b0935e9f602ed542c4198ba3b8544b704efb8b79` ont chacun quatre checks terminés en succès : `architecture-audit`, `chromium-qa`, `android-qa`, Vercel Preview Comments. Les runs de `b0935e9` : architecture [40384733210](https://github.com/yoyoonthetrack/LYAN/actions/runs/40384733210), Chromium [40384732922](https://github.com/yoyoonthetrack/LYAN/actions/runs/40384732922), Android [40384732882](https://github.com/yoyoonthetrack/LYAN/actions/runs/40384732882).

Le statut combiné Vercel était déjà `success` pendant que Chromium de `013f04b` tournait encore. Il n’a pas été pris pour une CI verte. Chromium et Android se sont quand même relancés sur `b0935e9`. Les traces Playwright restent demandées par le workflow en cas d’échec. Ce passage n’a pas d’échec à archiver.

### Stripe Test et devis

`node scripts/saved-cards-staging-scenarios.js` : 23 réussis, 0 échec, cible `tdktfbtqceldlaeqjtow`, Stripe `test`. Le script crée une invitation, un devis (`create_request_quote`), l’accepte (`accept_request_quote`), puis le jalon.

| Parcours | Résultat |
| --- | --- |
| Deux appels `create-milestone-intent` | même PaymentIntent |
| Confirmation carte test `4242`, `livemode` faux | `succeeded` |
| Second confirm | pas de second débit |
| Webhook signé | jalon `FUNDED`, paiement `SUCCEEDED`, montant inchangé |
| Webhook sans signature | HTTP 400 |
| Carte refusée | `card_declined`, jalon non financé |
| 3DS `pm_card_authenticationRequired` | `requires_action`, jalon non `FUNDED` |
| Carte enregistrée | visible pour le titulaire, invisible et non supprimable par un autre membre, puis détachée |
| Prestataire marque le jalon réalisé | `COMPLETED` |
| Client libère | HTTP 200, jalon `RELEASED`, `transfer_status=TRANSFERRED`, identifiant Stripe `tr_`, brut 4149 cents, net prestataire 3880 |
| Seconde libération | HTTP 200, idempotente |
| Prestataire qui tente de libérer | HTTP 403 |
| Jeton invalide sur la libération | HTTP 401 |
| Remboursement d’un jalon sans paiement réussi | HTTP 409 `NOT_FUNDED` |
| Remboursement d’un jalon encore `FUNDED` | HTTP 409 `EXECUTION_DISABLED` |

L’édition d’un devis ou d’un montant de jalon déjà créé n’a pas été exécutée. Le remboursement Stripe d’un paiement réussi n’a pas été exécuté : le grant de remboursement avant transfert est inactif (`active: false`), et l’appel refuse sans écrire. Trois jalons `FUNDED` de ces essais restent en Staging. Ce sont des paiements test, pas des fonds réels.

### Back-office

Les 33 sections s’ouvrent avec la session admin Staging et deviennent `active`. Vingt-neuf déclenchent au moins une réponse HTTP 200 (`/v1/admin/ops`, centre de contrôle, stats). Quatre n’ont rien appelé dans la fenêtre observée : action, marketplace, users, maison. `sec-territories` a reçu un HTTP 400 sur `/v1/admin/ops`. Le journal d’audit a répondu 200, sans création d’une ligne d’audit par une écriture de ce passage.

Treize sections montrent des boutons (export, génération éditoriale, tâches Mika, remboursement, invitation, suspension, offre Pro). Ces boutons n’ont pas été actionnés. Aucune rubrique n’est validée : l’ouverture et la lecture ne prouvent pas une modification, un filtre soumis, une persistance ou un droit d’écriture.

Le compte QA C, après login sur `admin.html`, ressort `UNAUTHENTICATED`. Il n’est pas `AUTHORIZED`. La session membre n’est pas restée ouverte pendant le contrôle admin.

### Cycle de vie

| Parcours | Résultat |
| --- | --- |
| Compte jetable `@lyann.invalid`, créé pour cet essai | profil `first_name` modifié et relu |
| `POST /v1/auth/delete-account` | HTTP 200, `ok: true` |
| Nouvelle connexion | refusée |
| Utilisateur auth | absent. Pas de suppression des comptes QA A, B ou C |
| Jeton invalide | HTTP 401 |

Le handler anonymise le prénom, le nom et l’avatar, puis supprime l’utilisateur auth. Il ne parcourt pas le stockage média et n’applique pas une conservation réglementaire distincte. Ce compte n’avait pas de média. La déconnexion d’une session encore valide, l’expiration réelle d’un JWT, le changement de rôle et le changement d’abonnement n’ont pas été exécutés.

### Builds

Le paquet local iOS et le paquet Android restent ceux de V1.2. Aucun outil de signature Distribution ou de keystore n’est apparu, donc aucun IPA ni AAB n’a été produit.

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvpmc13z-9215ed` |
| Compilé le | `2026-10-26T18:57:09.789Z` |
| SHA source | `6b808c3dfca23a5f64ce1398ad369666260c8b81` |
| Version | `1.0` |
| Hash bundle | `4f4e84fe72aef10d90f4a7985a51d9328e065b6218bfb34a46c6fc9650144616` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| Signature | une identité Apple Development. Aucune Apple Distribution. Aucun keystore Android |
| Appareil | non installé |

Le HTML du paquet ne contient pas la référence Production. Une compilation sans `LYANN_RUNTIME=staging` et sans verrou `tdktfbtqceldlaeqjtow` retomberait sur Production. Cette compilation n’a pas été lancée. Le SHA du paquet est `6b808c3`, pas `013f04b` : les commits intermédiaires ne changent que le rapport.

## V1.2 — preuves Staging et builds

## V1.2 — preuves Staging et builds

Commit du code testé et compilé : `6b808c3dfca23a5f64ce1398ad369666260c8b81`.

API locale `http://127.0.0.1:8098/v1/runtime/identity` : `supabase_ref=tdktfbtqceldlaeqjtow`, `isolation=STAGING_ISOLATED`. Stripe dans `.env.staging-v2` : clés test, pas live. Le garde refuse Production.

`node scripts/rc-v12-staging-pass.js` : 20 cas, 0 échec. Preuve `artifacts/rc-v12/staging-pass.json`.

| Parcours | Résultat |
| --- | --- |
| Connexion des trois comptes QA existants | OK |
| A publie un repère arrondi `16.241,-61.534` via RLS | OK, statut `pending` |
| B ne le voit pas tant qu’il n’est pas approuvé | OK |
| Admin approuve, B le voit, admin masque, B ne le voit plus | OK |
| A écrit à B, B lit, C ne lit pas et ne peut pas écrire à la place de A (`42501`) | OK |
| Login UI de A sur `/feed.html`, publication persistée `pending`, invisible pour B | OK |
| HTML servi verrouillé Staging, sans référence Production | OK |
| Admin réel autorisé, 33 sections s’ouvrent | OK (navigation, pas chaque bouton) |
| Compte QA C sur l’admin | non autorisé (`UNAUTHENTICATED`) |
| Lignes QA de ce passage supprimées | OK |

Les 33 sections ont été ouvertes dans l’admin réel. Les boutons d’écriture (collecte éditoriale, paiements, suppressions) n’ont pas été actionnés.

Build natif, iOS et Android byte-identiques, non installé sur appareil :

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvpmc13z-9215ed` |
| Compilé le | `2026-10-26T18:57:09.789Z` |
| SHA | `6b808c3dfca23a5f64ce1398ad369666260c8b81` |
| Version | `1.0` |
| Hash bundle | `4f4e84fe72aef10d90f4a7985a51d9328e065b6218bfb34a46c6fc9650144616` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| `feed.html` iOS = Android | oui, sha256 `5309c2c3095486386f40776f347cb476592ca9f8efaa94dd30a8ecbebe6d4153` |
| Production ou `service_role` dans le HTML | non |
| Correctif de fil présent dans `script.js` du paquet | oui |

Une identité Apple Development est présente. Aucune identité Apple Distribution n’est listée, et aucun keystore Android n’est dans le dépôt. TestFlight et Play Internal ne sont pas préparés. Le paquet `ios-mvp6mel3-079240` est remplacé localement par celui-ci. Ce n’est pas une validation appareil.

## V1.1 — état antérieur

Aucun défaut P0 confirmé n’est resté ouvert dans le périmètre corrigé. L’absence de P0 confirmé ne vaut pas une validation.

## Versions

| Élément | Valeur vérifiée |
| --- | --- |
| Dépôt | `yoyoonthetrack/LYAN` |
| Branche RC | `release/lyann-rc-v1-1` |
| Base | `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20` (`origin/feature/bokantaj-map-v1`) |
| Sauvegarde des correctifs locaux | `3ec921ace26655ff948b606dcf45957f88ab521e` |
| Correctifs fil, traces, identité de build | `e1bf7d671e9855e3dae7cc3cb0ed4da35e75c2d9` |
| PR brouillon | https://github.com/yoyoonthetrack/LYAN/pull/13 (base `feature/bokantaj-map-v1`, pas `main`) |
| PR d’audit précédente | https://github.com/yoyoonthetrack/LYAN/pull/12 (`audit/rc-v1-evidence-gates`, non fusionnée) |
| `main` local | `f193272`, 46 commits derrière `origin/main`. Aucune fusion. |
| Worktree `feature/bokantaj-map-v1` | `/Users/mac/Developer/lyann` reste sur `f935386`. Non modifié. |

Le dépôt de travail était en HEAD détaché sur `80ceae7`, avec 1 861 lignes non commitées. Ces fichiers ont été commités sur la branche RC. Les captures `artifacts/` et `work/` sont restées non suivies.

`origin/audit/rc-v1-evidence-gates` (`a18842e`) ajoute la matrice d’évidence et la conservation des traces Playwright. La conservation des traces est reprise dans `e1bf7d6`. La branche d’audit n’a pas été fusionnée telle quelle, pour ne pas empiler trois commits identiques.

### Environnements

| Rôle | Identifiant | Isolation constatée |
| --- | --- | --- |
| Supabase Production | `gzispjfoywklpqatjyop` | Refusé par le garde Staging dans le code et les tests unitaires |
| Supabase Staging | `tdktfbtqceldlaeqjtow` | Seul projet accepté quand `LYANN_RUNTIME=staging` ou Vercel preview |
| Backend Staging connu | `https://staging-bokantaj.lyann.app` | Une des deux origines HTTPS autorisées pour un build mobile Staging |
| Web Production | `https://lyann.app` | Le runtime déployé sur cet hôte résout le projet Production |

Les tests `tests/staging-v2-isolation.test.js` passent (27 tests avec la visibilité publique et l’identité de build). Ils prouvent le garde dans le code. Ils ne lisent pas les variables réellement présentes sur Vercel. Aucun `.env`, `.env.local` ni lien `.vercel/project.json` n’est dans ce clone. Les secrets n’ont pas été cherchés ailleurs et ne sont pas recopiés ici.

Le paquet embarqué iOS et le paquet Android sont le même fichier `feed.html` :

| Champ | Valeur dans le paquet exécutable local |
| --- | --- |
| Build id | `ios-mvp6mel3-079240` |
| Compilé le | `2026-10-26T11:37:19.958Z` |
| Version application (projets natifs) | `1.0` (`MARKETING_VERSION`, `versionName`) |
| SHA Git du paquet | absent de ce paquet |
| Hash du bundle | absent de ce paquet |
| `LYANN_ASSET_VERSION` | `fd3dc536a858` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |

Ce paquet contient le libellé visible « Nom du quartier » et `zoomPosition: 'bottomright'`. Il ne contient pas le garde « pagination cursor unavailable » de `e1bf7d6`, et il appelle encore `ensureVideoPosterOriented` sur toutes les vidéos du fil. Les dossiers sources iOS et Android ne sont donc pas synchronisés avec le commit RC. Recompiler sans variables Staging retirerait le verrou et laisserait un binaire natif sans verrou retomber sur Production. Cette compilation n’a pas été lancée.

`build_mobile.js` écrit désormais `lyann-native-build.json` avec l’identifiant, la date, le SHA Git, la version, le hash du bundle (hors fichier d’identité), le projet Supabase injecté et le backend. Le HTML mobile reçoit `window.LYANN_NATIVE_BUILD` avec les mêmes champs sauf le hash, calculé après génération du HTML. Aucun build natif n’a été produit avec ce tampon.

## Corrections

| Commit | Pourquoi |
| --- | --- |
| `3ec921a` | Le nom de quartier était un libellé masqué. Le zoom de la carte passait sous la bande de catégories. Conservé aussi : onglets Fil/Carte collés, filtre de territoire, en-têtes, vidéos, tests associés. |
| `e1bf7d6` | Un `cursor()` absent vidait un fil déjà chargé. Chaque vidéo était téléchargée en Range avant sa fenêtre de 20. Les traces Playwright sont conservées en cas d’échec. L’identité de build natif est explicite. |

## Preuves locales

Commande statique `http://127.0.0.1:8090`, le même mode que la CI navigateur. Ces tests mockent l’API. Ce ne sont pas des preuves Supabase.

| Suite | Résultat |
| --- | --- |
| `bokantaj_map_web_ios.spec.js` + `bokantaj_map_android_touch.spec.js` + `bokantaj_feed_preload.spec.js` | 15 réussis, après correctif |
| Visibilité publique, modération navigateur, cloche, formulaire de compétence | 8 réussis |
| `explorer_contact_back.spec.js` | 2 ignorés : le fichier exige un Staging approuvé, absent de ce clone |
| `node --test` publication, territoire, politique vidéo | 23 réussis |
| `node --test` visibilité, isolation, identité de build | 27 réussis |
| `npm test` (porte architecture, parité Web/mobile, 33 rubriques en statique) | PASS |

Le premier passage du préchargement échouait : le fil affichait « Le Bokantaj est encore calme… » parce que l’échec de `cursor()` remplaçait les publications. Après correction, le test attendait 20 médias et en voyait 21 : `ensureVideoPosterOriented` range-fetchait la vidéo hors fenêtre, en plus du téléchargement de la carte. Les deux causes sont corrigées dans `e1bf7d6`. Le test n’a pas été assoupli.

## CI GitHub sur `e1bf7d6`

Déclenchée par la PR 13.

| Check | Résultat |
| --- | --- |
| `architecture-audit` | success — https://github.com/yoyoonthetrack/LYAN/actions/runs/40380086237 |
| `chromium-qa` | success — https://github.com/yoyoonthetrack/LYAN/actions/runs/40380086256 |
| `android-qa` | encore in progress au relevé manuel sur `e1bf7d6`. L’événement CI de `b5a3495` dit 5 checks verts sans les nommer. |
| Vercel | deployment completed, tableau https://vercel.com/yoyo-d85d/lyan/AQEHK5oezAPWrf5FiDVD84YLHoaw |
| Vercel Preview Comments | success |

URL annoncée par Vercel : `https://lyan-git-release-lyann-rc-v1-1-yoyo-d85d.vercel.app`. Un `GET /feed` répond 302 vers l’authentification SSO Vercel. Le HTML de l’application n’a pas été lu. Le projet Supabase servi par cette Preview n’est donc pas vérifié. Ne pas l’utiliser comme Staging tant que ce point n’est pas lu dans la page.

## Matrice fonctionnelle

Statuts : OK seulement avec une exécution réelle. Les tests Playwright ci-dessus sont marqués OK (mock), jamais comme un parcours Staging.

| Fonction | Plateforme | Scénario exécuté | Statut | Preuve |
| --- | --- | --- | --- | --- |
| Carte Fil/Carte, filtre, repère, zoom | Web Chromium desktop et 390×844 | Spec carte, données mockées | OK (mock) | 15 tests Playwright locaux |
| Publication avec quartier approximatif et point exact | Web + émulation Pixel 7 | Clic, champ visible, payload `exact: false` puis GPS exact | OK (mock) | mêmes specs |
| Confidentialité GPS (arrondi quartier) | Web | `publicCoordinate` sur le payload mocké | OK (mock) | spec GPS |
| Préchargement média par fenêtres de 20 | Web 390×844 | 25 publications mockées, scroll au 15e | OK (mock) | `bokantaj_feed_preload.spec.js` après `e1bf7d6` |
| Fil public sans pending/rejeté | Web | Spec visibilité + test unitaire du filtre approved | OK (mock / statique) | specs et `bokantaj-public-visibility.test.js` |
| Modération : commentaire masqué retiré du tiroir ouvert | Web | Test unitaire du rendu | OK (statique) | pas de session admin Staging |
| Publication masquée absente du fil d’une autre session en cache | Web / iOS / Android | Non exécuté contre Supabase | NON TESTÉ | le client refetch toutes les 8 s avec `force`, non observé en base |
| Auth inscription, Google, Apple, session expirée, récupération | Web / iOS / Android | Non exécuté | NON TESTÉ | pas de comptes de test dans ce clone |
| Annonces, recherche, contact, statuts | Web | Spec contact ignorée | NON TESTÉ | `explorer_contact_back` skip |
| Lyanneurs, badges, avis | Web | Non exécuté sur Staging | NON TESTÉ | |
| Messagerie, pièces jointes, lecture, hors ligne | Web / natif | Non exécuté | NON TESTÉ | audits d’architecture seulement |
| Devis, jalons, paiement, libération | Web | Non exécuté | NON TESTÉ | |
| Stripe Test, webhooks, idempotence, double clic | API | Non exécuté | NON TESTÉ | aucune clé utilisée |
| Abonnements Gratuit / Plus / Pro, restauration native | Web / iOS / Android | Non exécuté sur Sandbox | NON TESTÉ | un achat Sandbox n’est pas simulé ici |
| Profil, suppression de compte, médias | Web | Non exécuté | NON TESTÉ | |
| Back-office, 33 rubriques | Web admin | Comptage statique des `data-section` | NON TESTÉ en runtime | `admin-zero-dead-controls-audit.js` : static ok (33) |
| RLS, uploads, webhooks, journal d’audit | Staging | Garde d’isolation unitaire seulement | NON TESTÉ en base | |
| Caméra, galerie, GPS, push, rotation, arrière-plan | iOS / Android appareil | Non exécuté | NON TESTÉ | humain / appareil requis |
| Navigation, clavier, formulaire de compétence | Web 390×844 | Spec formulaire | OK (mock) | `profile_skill_form.spec.js` |
| Paquet natif = source RC | iOS et Android locaux | Comparaison `feed.html` / `script.js` / `bokantaj-map.js` | KO | le paquet `ios-mvp6mel3-079240` est en retard sur `e1bf7d6` |

Les 33 rubriques présentes dans `admin.html` : overview, action, marketplace, users, maison, lyanneurs, requests, missions, services, quotes, chat, editorial, bokantaj, agents, mika, content, support, disputes, notifications, reviews, finances, payouts, subscriptions, protection, invoices, taxonomy, team, rbac, audit-logs, feature-flags, territories, health, user-detail. Aucune n’a été cliquée contre Staging dans cette session.

## Anomalies

| Id | Classe | État | Détail |
| --- | --- | --- | --- |
| RC-1 | P1 | corrigé dans la source, encore dans le paquet natif | Le fil devenait vide si `cursor()` lançait une exception après un chargement réussi. |
| RC-2 | P1 | corrigé dans la source, encore dans le paquet natif | Toutes les vidéos du fil étaient range-fetchées dès le rendu, hors de la fenêtre de 20. |
| RC-3 | P1 | corrigé dans `3ec921a` et présent dans le paquet `ios-mvp6mel3` | Champ quartier masqué et zoom de carte couvert. Vérifié par Playwright sur la source RC, pas sur un appareil. |
| RC-4 | P1 | fermé dans le paquet local, non installé | `ios-mvpmc13z-9215ed` porte `6b808c3` et les correctifs RC-1 et RC-2. Pas d’installation appareil, pas d’envoi store. |
| RC-5 | P1 | ouvert pour la décision | Les parcours membres réels, la modération Bokantaj en base, Stripe Test et les 33 rubriques ne sont pas exécutés. |

Aucun P0 confirmé (perte de données, fuite de position exacte dans les specs mockées, mélange Production observé dans un déploiement). Les risques non testés restent des bloqueurs de GO, pas des P0 inventés.

## CI, builds, Preview

- CI locale architecture : PASS sur l’arbre `e1bf7d6`.
- CI GitHub : architecture et Chromium verts sur `e1bf7d6`. Commit `b5a3495` : 5/5 checks verts. Le job Android n’est pas nommé dans cet événement.
- Builds disponibles : paquet local déjà présent `ios-mvp6mel3-079240` (Staging, 26 oct 2026 11:37 UTC), en retard sur la RC. Pas de nouvel IPA, pas d’APK de cette session, pas de TestFlight, pas de Play Internal.
- URL Preview : `https://lyan-git-release-lyann-rc-v1-1-yoyo-d85d.vercel.app`, protégée par SSO. Isolation non lue.
- `main` et Production : non touchés. Stripe Live : non activé.

## Limites et validations manuelles restantes

1. Fournir des comptes Staging (membre A, membre B, professionnel, admin, compte sans droit admin) et les variables Staging, sans les commiter.
2. Rejouer la publication, la modération, la carte et le rechargement d’une seconde session contre `tdktfbtqceldlaeqjtow`.
3. Parcourir les 33 rubriques avec un admin et avec un compte sans droit, puis vérifier la persistance et le journal.
4. Exécuter Stripe Test (paiement, échec, webhook, transfert, remboursement, double clic) uniquement en mode test.
5. Recompiler iOS et Android avec le verrou Staging explicite, relever `lyann-native-build.json`, puis tester clavier, caméra, galerie, GPS, push, vidéo, rotation, arrière-plan et achats Sandbox sur appareil. Ne pas présenter un simulateur comme un achat Sandbox.
6. Attendre la CI de la PR 13. En cas d’échec, corriger le produit ou le test, sans allonger les timeouts.
7. Lire le projet Supabase réellement injecté dans la Preview Vercel avant de l’utiliser. L’URL est derrière le SSO Vercel.
8. Conclure `android-qa` sur `e1bf7d6`. Un échec de compilation ou de toucher ne doit pas être ignoré.

## Risques résiduels

- Un binaire natif sans verrou parle à Production. Toute compilation RC doit injecter `tdktfbtqceldlaeqjtow` et refuser `gzispjfoywklpqatjyop`.
- Le cache client du fil dure 15 s, mais le rafraîchissement forcé est à 8 s. Sans observation Staging, la disparition d’une publication masquée n’est pas prouvée pour une session qui aurait des lignes en mémoire.
- Le serveur local reflète toute origine CORS. Ce comportement n’a pas été modifié. Son équivalent sur le backend déployé n’a pas été relu.
- La porte « 33 rubriques » compte les liens. Elle ne prouve pas qu’une action admin écrit en base.

## Décision

**NO-GO** pour TestFlight, Google Play Internal et une promotion Production.

Le code `3435372` reconstruit le paquet `ios-mvpo0omh-5a6365`, verrouillé sur Staging. Les checks GitHub de ce SHA sont à relever après la poussée. `18daa18` avait ses quatre checks verts avant ces correctifs.

Reste bloquant :

1. La plupart des boutons d’écriture des 33 rubriques n’ont pas été exécutés. Les lectures, le filtre utilisateurs, le ticket d’aide et le rôle QA le sont.
2. Le remboursement Stripe Test d’un paiement réussi reste `EXECUTION_DISABLED`. Le verrou n’a pas été ouvert.
3. La révision d’un devis avec une version périmée expire sur Staging tant que `P0001` n’est pas migré.
4. Pas de certificat Apple Distribution, pas de profil, pas de keystore d’upload, pas de JDK pour l’APK debug, pas d’appareil, pas d’achat Sandbox.
5. La Preview Vercel reste derrière le SSO. Le projet Supabase qu’elle sert n’a pas été lu.
