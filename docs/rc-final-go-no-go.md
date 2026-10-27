# LYANN — décision de release

Verdict : **NO-GO**

Tête Git et PR : `c35d68ee75365bc815d096120a5c5a9a8e1c2e24`
Paquets natifs reconstruits : `c35d68ee75365bc815d096120a5c5a9a8e1c2e24`, identifiant `ios-mvqzsf62-86ab71`
Serveur Staging actuellement servi : déploiement `dpl_8WJbtuRYqd5ZMLnzAhN4sXaP9pbr`, estampille Git `cd0ed3ea16acfc919f5289ede08e0cd87f71c96d` plus le correctif éditorial de ce commit (le déploiement a été fait avant le commit)
Branche : `release/lyann-rc-v1-1`
PR : https://github.com/yoyoonthetrack/LYAN/pull/13 (brouillon, base `feature/bokantaj-map-v1`)
Date : 2026-10-27

## Identité exécutée

| Élément | Valeur |
| --- | --- |
| Web Staging | `https://staging.lyann.app` |
| Projet Vercel | `lyann-staging-preview` `prj_FHIKUKYa8IwpiitigUma4gTtTF6q` |
| Déploiement | `dpl_9wzJXx2Xs15EgabjAJHs7SFmQe2B` |
| Commit servi | `84cff869a7d281ea0ec40fc06f5fde4116a2756f` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| Isolation | `STAGING_ISOLATED`, `production=false` |
| Stripe | `stripe_mode=test` |
| Paquet natif | `ios-mvqzsf62-86ab71`, compilé le 2026-10-27T18:01:35Z |
| Hash d’assets | `5720b80a5b0e3cc398d368b8f6301b64e64c367b5773a08f374ed982751df576` |
| Version | 1.0, build iOS 10, `versionCode` Android 1, `versionName` 1.0, `minSdk` 24, `targetSdk` 36 |
| Backend du paquet | `https://staging.lyann.app`, verrou `tdktfbtqceldlaeqjtow` |
| iPhone | iPhone de yoann, développement, `app.lyann.mobile`, équipe `WLV4WC47U2`, installé et processus lancé. Capture noire : écran éteint ou verrouillé. Parcours devis non tapé sur l’appareil |
| APK debug | SHA-256 `dd1b331bf3e5c455d619aef7ce45bd6fea5745cbb642b1b7a15f2ba489d59522`, émulateur `lyann_api36` (`emulator-5554`), pas un téléphone |
| AAB | `android/app/build/outputs/bundle/release/app-release.aab`, SHA-256 `395d82e82febfdc9e0037a66263e6daa868641a0f961f7cd1e1cc8ec640d96e4`, certificat `CN=LYANN Upload`, `arm64-v8a` présent, hors Play. L’ancien fichier local `11f962e5…` est remplacé. Il n’avait pas été déposé |
| Keystore | `~/Library/Application Support/lyann-release/upload-keystore.jks`, alias `upload`, hors dépôt, non recréé |
| Ancien hôte | `https://staging-bokantaj.lyann.app` sert encore `80ceae7c` depuis le projet `lyan`. Les paquets actuels ne l’appellent pas. Les tests et `shared-html-build.js` l’autorisent encore comme ancienne origine Staging |
| Correspondance | Les paquets embarquent `c35d68e`. Le serveur Staging servi reste `84cff86`. `b77cb67` est le commit du rapport précédent, parent de `c35d68e`. Ce document n’avait pas encore été repris après « Voir le devis » |

## CI

`c35d68ee75365bc815d096120a5c5a9a8e1c2e24` est vert sur `architecture-audit`, `chromium-qa`, `android-qa` et `Vercel Preview Comments`. Le déploiement Vercel de ce commit est une prévisualisation, pas une promotion de Production. Les contrôles à lire pour ce document sont ceux du commit qui le contient.

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
| Google Play | AAB signé, non envoyé | OK pour la préparation | Fichier local relu | SHA-256 `395d82e82febfdc9e0037a66263e6daa868641a0f961f7cd1e1cc8ec640d96e4`, `CN=LYANN Upload`, `app.lyann.mobile`, `versionCode` 1, version 1.0, `targetSdk` 36, `arm64-v8a`, backend `https://staging.lyann.app`, verrou `tdktfbtqceldlaeqjtow`. Jamais déposé : le `versionCode` 1 reste utilisable pour un premier envoi de ce fichier | Pas d’envoi. Keystore non recréé | — | `c35d68e` | P1 | Accord explicite avant Internal Testing |
| Apple | Archive TestFlight | NON TESTÉ | Trousseau | Une seule identité : `Apple Development: yoann.danier@gmail.com (CH5MK7M6PD)`. Aucun certificat Apple Distribution, aucun `.p12`, aucun compte enregistré dans les données Xcode de ce Mac. L’app de développement installée est signée avec l’identité de développement | Archive non produite. Créer le certificat sur ce Mac exige une connexion au compte développeur | — | `c35d68e` | P1 | Procédure Xcode ci-dessous, puis accord d’envoi |
| Android émulateur | Voir le devis, détail, confirmation, acceptation | OK | Application installée, émulateur API 36 | Paquet `ios-mvqzsf62-86ab71`. Bouton « Voir le devis », détail avec prestation, 18 €, jalon et conditions du 15/11/2026. Le statut reste `SENT` à l’ouverture. La confirmation existante s’affiche, puis le devis passe à `ACCEPTED`. Aucun paiement créé | Ce n’est pas un téléphone physique. L’action est partie de la WebView de l’application installée | — | `c35d68e` | P1 | Toucher sur un téléphone Android |
| iPhone | Installation de développement | PARTIEL | Appareil | `App.app` Debug installé sur iPhone de yoann, processus lancé, capture `artifacts/rc-v17/iphone-launch.png` noire | Écran éteint ou verrouillé. `devicectl` ne tape pas. Le code n’a pas été saisi | — | `c35d68e` | P1 | Déverrouiller l’iPhone de yoann |
| Web | Carte, rayon 4 km, puces | OK | Playwright local | 18 tests du lot navigateur, puis les 2 pins | CI `c060bc3` attendait l’ancien titre | Titre de quartier attendu | `f02e6cc` | P1 | CI Chromium du SHA encore en cours au relevé |
| Staging SQL | `revise_sent_quote` P0001 | OK | RPC QA sur `tdktfbtqceldlaeqjtow` | Migration `20261027173159_revise_sent_quote_p0001`. Version attendue 0 sur le devis QA `f4abcf70` : HTTP 400, `P0001`, 793 ms, version et montant inchangés. Révision valide : HTTP 200 en 719 ms, version 2, total 22, statut `SENT` | Le devis déjà accepté `133d61f9` est inchangé. Aucun paiement ajouté, modifié ou retiré. Le jalon PENDING remplacé est celui de ce devis de contrôle | Migration appliquée hors de ce dépôt, non rejouée | — | P1 clos | Aucune |
| Stripe Test | Remboursement d’un jalon QA financé | KO contrôlé | API Staging et code du grant | `409 EXECUTION_DISABLED`. `preTransferRefundExecutionEnabled()` reste `false`. Un en-tête client ne l’ouvre pas. Le seul grant admissible vise le paiement `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, QA A, 4 349 centimes, `livemode` faux, 15 minutes. Cette ligne est absente de Staging. Le fichier local de grant n’existe pas et n’est pas déployé | Aucun remboursement créé | Protection conservée | — | P1 | Décision explicite, seulement si cette ligne de paiement existe |
| Back-office | Modération, signalement, suspension, rôles, abonnements, export | PARTIEL | Session du rôle `qa_finance_610q` | Ce membre Staging, hors compte personnel, a seulement `finance.refund`. Sur le serveur `84cff86` il reçoit 403 pour s’ajouter, pour se donner `OWNER`, pour suspendre le propriétaire, pour ouvrir la file de modération, pour traiter un signalement, pour sanctionner et pour changer un rôle. Le propriétaire reste `ACTIVE`. Son profil reste `USER`. Son journal d’audit compte 0 ligne. Une demande de remboursement inconnue répond `404 REQUEST_NOT_FOUND`. L’offre d’abonnement Pro est marquée indisponible. L’export CSV reste un téléchargement local | La route d’équipe est servie. Elle refuse `OWNER`, `SUPER_ADMIN` et l’auto-nomination | `84cff86` | P1 | Le propriétaire ajoute un membre MODERATION déjà existant |
| Auth, annonces, Lyanneurs, messagerie, abonnements | Parcours complets de cette passe | NON TESTÉ | — | Non rejoués ici | — | — | — | P1 | Comptes QA, plusieurs sessions |
| Production | Non-déploiement | OK | Contrôle | Projet `lyan` non déployé, `lyann.app` identity 404 | `staging-bokantaj` pointe encore vers ce projet | Non déplacé sans accord | — | P0 si on l’oublie | Décider du domaine |

## Éditorial Bokantaj

Verdict éditorial : **NO-GO** pour une nouvelle publication visible. La collecte automatique est rétablie. Les trois propositions du 27 octobre restent en attente, et aucun compte QA n’a la permission `agents.approve`.

Cause : les trois crons de `vercel.staging.json` partageaient le chemin `/v1/editorial/collect?scheduled=1`. Vercel n’enregistre pas un chemin en double ni un chemin avec une query. Le déploiement Staging ne lançait donc que `/v1/internal/moderation/run`. Le 401 sans secret est le refus normal. La dernière activité réelle avant correction datait du 22 octobre 2026. Les cinq comptes sont des identités de publication `system`, pas des connexions interactives. Leurs publications déjà approuvées n’ont pas été modifiées.

Preuve sur `https://staging.lyann.app`, Supabase `tdktfbtqceldlaeqjtow`, déploiement `dpl_8WJbtuRYqd5ZMLnzAhN4sXaP9pbr` :

- Cron enregistré : `/v1/editorial/collect/scheduled`, `0 11,16,21 * * *` (07:00, 12:00, 17:00 en Guadeloupe). Le cron de modération reste en place.
- Appel sans secret : HTTP 401. Les trois comptes QA : HTTP 403 `ADMIN_ACCESS_DENIED` sur la collecte manuelle et sur la suppression.
- Collecte authentifiée du passage `2026-10-27T17` : HTTP 200 en 38 s. 40 éléments trouvés, 11 doublons, 1 source inaccessible, 3 propositions `WAITING_APPROVAL`. Second appel du même passage : 5 agents « passage déjà traité », 0 création.
- Préparées, non visibles : Actu, RCI Guadeloupe, territoire Guadeloupe ; Trafik, RCI Guadeloupe, territoire Guadeloupe ; Kilti, Collectivité Territoriale de Guyane, territoire Guyane. Rimèd et Jardinaj : rien de neuf à proposer. Aucune de ces propositions n’a été approuvée.
- Visibles et inchangées : 5 posts `approved`, 4 `rejected`, tous antérieurs au 23 octobre.
- Une tâche `QA-EDITORIAL-20261027` a été créée, la suppression par QA a répondu 403, puis la tâche a été retirée. Les 3 propositions réelles sont restées.

Le prochain passage planifié est le 28 octobre 2026 à 07:00, heure de Guadeloupe. La publication continue d’exiger une validation humaine.

## Blocages qui empêchent le GO

1. Le remboursement Stripe Test reste fermé. Le paiement unique autorisé par le grant, `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, n’existe pas sur Staging.
2. L’iPhone n’a pas été piloté pour les messages, le devis, l’arrière-plan et la coupure réseau. Les achats Sandbox Apple et Google restent NON TESTÉ.
3. Ce Mac ne peut pas créer l’identité Apple Distribution sans une session du compte développeur. Le trousseau n’a que l’identité de développement, et Xcode n’a pas de compte enregistré. Pas d’archive. L’AAB signé est prêt pour un premier dépôt et n’a pas été envoyé.
4. Le seul administrateur hors compte personnel est `qa_finance_610q`. Il ne peut pas modérer, suspendre, changer un rôle ni exporter les paiements. La route d’équipe est servie et lui répond 403.
5. `staging-bokantaj.lyann.app` sert encore `80ceae7c` depuis le projet Production.
6. Les trois propositions éditoriales du 27 octobre 2026 attendent un administrateur qui possède `agents.approve`. Les comptes QA ne l’ont pas. Le propriétaire n’a pas été utilisé. Rien de nouveau n’est visible dans Bokantaj.

## Actions humaines

1. Membre modération. Ouvre `https://staging.lyann.app/admin.html` avec le compte propriétaire, section Équipe, et ajoute l’UUID d’un compte Staging déjà créé avec le rôle `MODERATION`. La route refuse `OWNER` et `SUPER_ADMIN`.
2. Signature Apple, sur ce Mac. Ouvre Xcode, puis Réglages, puis Comptes. Ajoute l’Apple ID du compte `WLV4WC47U2` s’il n’est pas listé. Sélectionne l’équipe, puis Manage Certificates, puis le bouton +, puis Apple Distribution. Xcode crée la clé privée dans le trousseau de session. Si le portail indique que le certificat `Apple Distribution: yoann danier (WLV4WC47U2)` existe déjà, exporte son `.p12` depuis le Mac qui l’a créé, ou révoque-le dans developer.apple.com, section Certificates, puis recrée-le ici. Une révocation demande ensuite de régénérer le profil Store. Le profil actuel est `~/Library/Developer/Xcode/UserData/Provisioning Profiles/db8e9c85-8649-4a45-97b4-c03d2ead4061.mobileprovision`. Quand l’identité apparaît dans « security find-identity -v -p codesigning », l’archive Release du scheme App peut être produite. L’envoi TestFlight attend un accord séparé.
3. Remboursement. Le verrou global reste fermé. La seule opération préparée est le paiement QA `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, Stripe Test, 4 349 centimes maximum, quinze minutes. Cette ligne n’est pas en base. Un accord dans le chat ne sert que lorsque la ligne existe.
4. Gestes sur l’iPhone de yoann, déverrouillé. L’app de développement `c35d68e` est installée et parle à `https://staging.lyann.app`. Le même parcours devis a été exécuté dans l’application de l’émulateur, pas sur cet iPhone. Sur l’appareil : ouvrir la conversation, « Voir le devis », lire le détail, confirmer, accepter, puis arrière-plan, coupure réseau et vidéo. Ne pas acheter en Sandbox. Ne pas utiliser l’iPhone de Tory. Ne pas saisir le code dans le chat.
5. Dépôt Play et déplacement de `staging-bokantaj.lyann.app` attendent un accord. L’alias appartient au projet `lyan`. Les paquets actuels n’en dépendent pas.
