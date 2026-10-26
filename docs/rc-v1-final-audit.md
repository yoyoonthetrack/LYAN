# LYANN — Release Candidate V1.1

Verdict : **NO-GO**

Les parcours essentiels (authentification réelle, Bokantaj connecté à Staging, annonces, messagerie, devis, Stripe Test, abonnements natifs, back-office) n’ont pas été exécutés de bout en bout. Sur `e1bf7d6`, la porte d’architecture et les régressions navigateur GitHub sont vertes. Le job Android était encore en cours. Les paquets iOS et Android déjà compilés ne contiennent pas le dernier correctif de fil.

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
| `android-qa` | encore in progress au dernier relevé (compilation APK comprise, budget 35 min) |
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
| RC-4 | P1 | ouvert | Les binaires locaux ne portent ni le SHA `e1bf7d6` ni les correctifs RC-1 et RC-2. Les soumettre en l’état publierait un autre logiciel que la branche RC. |
| RC-5 | P1 | ouvert pour la décision | Les parcours membres réels, la modération Bokantaj en base, Stripe Test et les 33 rubriques ne sont pas exécutés. |

Aucun P0 confirmé (perte de données, fuite de position exacte dans les specs mockées, mélange Production observé dans un déploiement). Les risques non testés restent des bloqueurs de GO, pas des P0 inventés.

## CI, builds, Preview

- CI locale architecture : PASS sur l’arbre `e1bf7d6`.
- CI GitHub : architecture et Chromium verts sur `e1bf7d6`. Android non encore conclu. La CI n’est pas entièrement verte.
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

**NO-GO** pour une soumission App Store, Google Play ou une promotion Production.

Pour passer à GO il faut, sur un même SHA : CI GitHub verte, parcours essentiels exécutés sur Staging avec preuve en base, aucun P0, aucun P1 critique ouvert (RC-4 et RC-5 aujourd’hui), paquets iOS et Android identifiés par SHA, hash, backend et projet Supabase, et tests natifs indispensables réellement faits sur appareil.
