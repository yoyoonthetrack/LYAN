# LYANN — décision de release

Verdict : **NO-GO**

SHA produit et paquets : `f02e6cca302d4647d32fff61cebdcfc19a531df3`
Branche : `release/lyann-rc-v1-1`
PR : https://github.com/yoyoonthetrack/LYAN/pull/13 (brouillon, base `feature/bokantaj-map-v1`)
Date : 2026-10-27

## Identité exécutée

| Élément | Valeur |
| --- | --- |
| Web Staging | `https://staging.lyann.app` |
| Projet Vercel | `lyann-staging-preview` `prj_FHIKUKYa8IwpiitigUma4gTtTF6q` |
| Déploiement | `dpl_HPN6MJn2qUvEKV1LaeGHxEL36rF4` |
| Commit servi | `f02e6cca302d4647d32fff61cebdcfc19a531df3` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| Isolation | `STAGING_ISOLATED`, `production=false` |
| Stripe | `stripe_mode=test` |
| Paquet natif | `ios-mvqglbi4-f14a27` |
| Hash d’assets | `419af7b077c23ee784e7e0d1ff220423f17d555c0ed662bdd0130cf324bd59c6` |
| Version | 1.0, build iOS 10, `versionCode` Android 1 |
| Backend du paquet | `https://staging.lyann.app` |
| Compilation | 2026-10-27T09:04:11Z |
| iPhone | iPhone de yoann, `app.lyann.mobile`, équipe `WLV4WC47U2`, lancé |
| APK debug | SHA-256 `f56bed017e233a59fadc26c31b10a8810cea430cd499356b2c8c68ff6cd43cab`, émulateur `lyann_api36` |
| AAB | SHA-256 `11f962e552db0c7056b8a2527a0eb4042a361f9fcb6a28ee87e5cd636ab89dd6`, certificat `CN=LYANN Upload`, hors Play |
| Keystore | `~/Library/Application Support/lyann-release/upload-keystore.jks`, alias `upload`, hors dépôt |
| Ancien hôte | `https://staging-bokantaj.lyann.app` sert encore `80ceae7c` depuis le projet `lyan` |

## CI du SHA produit

Au relevé de cette note, sur `f02e6cc` : `architecture-audit` vert, `android-qa` vert, `Vercel Preview Comments` vert, `chromium-qa` encore en cours. Le run Chromium de `c060bc3` était rouge : le repère de quartier annonce « secteur d’environ 4 km ». Le test a été aligné et les deux cas locaux passent. Une CI verte sur un SHA plus ancien ne compte pas.

## Matrice

| Plateforme | Scénario réel | Résultat | Type | Preuve | Anomalie | Correction | Commit | Priorité | Validation humaine |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Web Staging | Identité, isolation, Stripe Test | OK | HTTP | `GET /v1/runtime/identity`, `/v1/payments/config` | Le premier déploiement CLI n’estampillait pas le commit | `LYANN_RELEASE_SHA` | `f02e6cc` | P1 | Aucune |
| Web Staging | Vidéo Morne-à-l’Eau et Drums | OK | Base + worker | `f3d3cd3d` et `a9b1fc89` `approved` / `video_checked` en 4,3 s | L’ancien worker tenait toute vidéo ; le projet Staging n’avait pas de clé | Reprise si le vérificateur manque ; secrets posés ; relecture réelle | `f02e6cc` | P0 clos | Aucune sur ces deux lignes |
| iPhone | Ouverture, session QA, fil, lecture vidéo | OK | Appareil | Capture après lancement, vidéo Morne-à-l’Eau à l’écran | Le binaire précédent parlait encore à l’ancien hôte | Paquet `ios-mvqglbi4-f14a27` vers `staging.lyann.app` | `f02e6cc` | P1 | Parcours restants non tapés |
| iPhone | Messages, devis, paiements, notifications, arrière-plan, réseau | NON TESTÉ | — | Lancement seulement | Pas d’automatisation tactile sur l’appareil | — | — | P1 | Oui, iPhone déverrouillé, comptes QA |
| Android émulateur | Installation et fil Bokantaj | OK | Émulateur API 36 | APK installé, fil QA visible | Le System UI a bloqué au premier essai, puis le fil s’est affiché | Aucune | `f02e6cc` | P2 | Téléphone Android physique absent |
| Android | Vidéo, carte, clavier, retour, GPS, messages | NON TESTÉ | — | — | L’émulateur n’a pas rejoué ces parcours dans cette passe | — | — | P1 | Oui |
| Google Play | AAB signé, non envoyé | OK pour la préparation | Build local | `bundleRelease` signé, certificat LYANN Upload | Pas d’envoi | — | `f02e6cc` | P1 | Accord explicite avant Internal Testing |
| Apple | Archive TestFlight | NON TESTÉ | — | Build Debug installé, pas d’archive App Store envoyée | Distribution non lancée | — | — | P1 | Accord explicite avant envoi |
| Web | Carte, rayon 4 km, puces | OK | Playwright local | 18 tests du lot navigateur, puis les 2 pins | CI `c060bc3` attendait l’ancien titre | Titre de quartier attendu | `f02e6cc` | P1 | CI Chromium du SHA encore en cours au relevé |
| Staging SQL | `revise_sent_quote` P0001 | NON TESTÉ | Management API | HTTP 401, jeton invalide | Migration absente ou non relue | Aucune écriture | — | P1 | Jeton de gestion Staging |
| Stripe Test | Remboursement d’un jalon | KO contrôlé | Code | `EXECUTION_DISABLED` | Le moteur global est fermé et le grant est inactif | Protection laissée en place | — | P1 | Autorisation explicite d’un seul paiement QA |
| Back-office | Actions encore non jouées | NON TESTÉ | — | Les ouvertures déjà faites ne sont pas rejouées | Modération manuelle, signalements, suspension QA, exports, rôles | — | — | P1 | Session admin QA |
| Auth, annonces, Lyanneurs, messagerie, abonnements | Parcours complets de cette passe | NON TESTÉ | — | Non rejoués ici | — | — | — | P1 | Comptes QA, plusieurs sessions |
| Production | Non-déploiement | OK | Contrôle | Projet `lyan` non déployé, `lyann.app` identity 404 | `staging-bokantaj` pointe encore vers ce projet | Non déplacé sans accord | — | P0 si on l’oublie | Décider du domaine |

## Blocages qui empêchent le GO

1. Les parcours essentiels ne sont pas tous rejoués de bout en bout dans cette passe.
2. La CI Chromium du SHA produit n’était pas encore verte au relevé.
3. Le remboursement Stripe Test n’est pas ouvert, et la migration devis n’est pas appliquée.
4. L’iPhone n’a pas rejoué messages, devis, paiements, notifications, arrière-plan et coupure réseau.
5. Aucun téléphone Android. L’AAB n’est pas sur une piste Play, et aucune archive n’est sur TestFlight. L’envoi attend un accord.
6. `staging-bokantaj.lyann.app` sert encore l’ancien worker. Un paquet ancien qui l’appelle ne publie pas les vidéos comme le serveur actuel.

## Actions impossibles sans une personne

- Saisir le code ou Face ID, et enchaîner les gestes sur l’iPhone.
- Acheter en Sandbox Apple ou Google.
- Envoyer une archive vers TestFlight ou un AAB vers Play Internal.
- Fournir un jeton Supabase de gestion valide pour la migration 59.
- Autoriser nommément un remboursement Stripe Test.
- Tester un téléphone Android physique.
- Réassigner `staging-bokantaj.lyann.app` hors du projet Production.
