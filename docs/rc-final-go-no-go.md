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

## CI

Sur `7ab9b4731fad7824303c3f7e2156acf2b3b22878`, tête de la PR avant cette note : `architecture-audit`, `chromium-qa`, `android-qa` et `Vercel Preview Comments` sont verts. Ce n’est pas le résultat d’un SHA plus ancien. Le rouge Chromium de `c060bc3` venait du titre de quartier et a été corrigé dans `f02e6cc`.

## Matrice

| Plateforme | Scénario réel | Résultat | Type | Preuve | Anomalie | Correction | Commit | Priorité | Validation humaine |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Web Staging | Identité, isolation, Stripe Test | OK | HTTP | `GET /v1/runtime/identity`, `/v1/payments/config` | Le premier déploiement CLI n’estampillait pas le commit | `LYANN_RELEASE_SHA` | `f02e6cc` | P1 | Aucune |
| Web Staging | Vidéo Morne-à-l’Eau et Drums | OK | Base + worker | `f3d3cd3d` et `a9b1fc89` `approved` / `video_checked` en 4,3 s | L’ancien worker tenait toute vidéo ; le projet Staging n’avait pas de clé | Reprise si le vérificateur manque ; secrets posés ; relecture réelle | `f02e6cc` | P0 clos | Aucune sur ces deux lignes |
| iPhone | Ouverture, session QA, fil, lecture vidéo | OK | Appareil | Capture après lancement, vidéo Morne-à-l’Eau à l’écran | Le binaire précédent parlait encore à l’ancien hôte | Paquet `ios-mvqglbi4-f14a27` vers `staging.lyann.app` | `f02e6cc` | P1 | Parcours restants non tapés |
| Staging QA | Messages A et B, relecture, idempotence, refus de C | OK | Comptes QA, base Staging | Une ligne pour le même `client_message_id` (`23505`), B lit A, C lit 0 ligne | Pas de pilotage tactile de l’iPhone : aucun `idb` | — | `7ab9b47` | P1 | Gestes sur l’appareil |
| Staging QA | Devis créé, modifié à 25, accepté, jalon | OK | Comptes QA, base Staging | Devis `133d61f9` version 2, statut `ACCEPTED`, jalon `PENDING:25`, relu par A | — | — | `7ab9b47` | P1 | Écran iPhone |
| Staging QA | Notification de message | OK | Compte QA B | Compteur de 333 à 334 après l’envoi de A | Le contenu de la notification n’a pas été ouvert sur l’iPhone | — | `7ab9b47` | P2 | Ouverture dans l’app |
| iPhone | Arrière-plan, coupure réseau, navigation complète | NON TESTÉ | — | Aucun outil de toucher sur l’appareil | `devicectl` lance et photographie, il ne tape pas | — | — | P1 | Gestes sur l’iPhone |
| Android émulateur | Installation et fil Bokantaj | OK | Émulateur API 36 | APK installé, fil QA visible | Le System UI a bloqué au premier essai, puis le fil s’est affiché | Aucune | `f02e6cc` | P2 | Téléphone Android physique absent |
| Android | Vidéo, carte, clavier, retour, GPS, messages | NON TESTÉ | — | — | L’émulateur n’a pas rejoué ces parcours dans cette passe | — | — | P1 | Oui |
| Google Play | AAB signé, non envoyé | OK pour la préparation | Build local | `bundleRelease` signé, certificat LYANN Upload | Pas d’envoi | — | `f02e6cc` | P1 | Accord explicite avant Internal Testing |
| Apple | Archive TestFlight | NON TESTÉ | Trousseau | Une identité : Apple Development. Zéro Apple Distribution. Trois profils locaux | Archive non produite, rien n’est envoyé | — | — | P1 | Certificat Apple Distribution, puis accord d’envoi |
| Web | Carte, rayon 4 km, puces | OK | Playwright local | 18 tests du lot navigateur, puis les 2 pins | CI `c060bc3` attendait l’ancien titre | Titre de quartier attendu | `f02e6cc` | P1 | CI Chromium du SHA encore en cours au relevé |
| Staging SQL | `revise_sent_quote` P0001 | KO | Management API + RPC QA | HTTP 401. Une version périmée ne revient pas : PostgREST réessaie, l’appel a été arrêté. Le total est resté 25 | Migration non appliquée | Aucune écriture SQL | — | P1 | Jeton de gestion Supabase valide, projet `tdktfbtqceldlaeqjtow` |
| Stripe Test | Remboursement d’un jalon QA financé | KO contrôlé | API Staging | `409 EXECUTION_DISABLED`. `stripe_refund_id` inchangé, paiement `SUCCEEDED`. Jalon inconnu `404`. Webhook `{}` `400` | Le verrou global reste fermé. Aucun grant QA n’est actif | Protection conservée | — | P1 | Autoriser un seul paiement QA en Test |
| Back-office | Signalement, rôles, suspension, export | PARTIEL | API Staging | QA B crée un signalement, C ne le lit pas. QA C reçoit 403 sur rôle, paiements admin et sanction | La session admin active est le compte personnel : aucune écriture admin n’a été faite avec lui. L’export CSV est un téléchargement local des lignes déjà chargées | — | `7ab9b47` | P1 | Un admin qui n’est pas le compte personnel, ou un accord pour cette session |
| Auth, annonces, Lyanneurs, messagerie, abonnements | Parcours complets de cette passe | NON TESTÉ | — | Non rejoués ici | — | — | — | P1 | Comptes QA, plusieurs sessions |
| Production | Non-déploiement | OK | Contrôle | Projet `lyan` non déployé, `lyann.app` identity 404 | `staging-bokantaj` pointe encore vers ce projet | Non déplacé sans accord | — | P0 si on l’oublie | Décider du domaine |

## Blocages qui empêchent le GO

1. La migration devis `P0001` n’est pas sur Staging. Une version périmée reste un `40001` que PostgREST réessaie.
2. Le remboursement Stripe Test d’un jalon QA financé répond encore `EXECUTION_DISABLED`. Le verrou n’a pas été ouvert.
3. L’iPhone n’a pas été piloté pour les messages, le devis, l’arrière-plan et la coupure réseau. Les mêmes comptes QA ont fait ces écritures par l’API Staging.
4. Aucun certificat Apple Distribution : pas d’archive TestFlight. L’AAB signé n’est pas déposé. L’envoi attend un accord.
5. La modération manuelle, la suspension QA, le changement de rôle et l’export n’ont pas été exécutés : cela exigerait la session du compte personnel.
6. `staging-bokantaj.lyann.app` sert encore `80ceae7c` depuis le projet Production.

## Actions impossibles sans une personne

- Saisir le code ou Face ID, et enchaîner les gestes sur l’iPhone.
- Acheter en Sandbox Apple ou Google.
- Envoyer une archive vers TestFlight ou un AAB vers Play Internal.
- Fournir un jeton Supabase de gestion valide pour la migration 59.
- Autoriser nommément un remboursement Stripe Test.
- Tester un téléphone Android physique.
- Réassigner `staging-bokantaj.lyann.app` hors du projet Production.
