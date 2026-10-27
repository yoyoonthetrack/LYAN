# LYANN — décision de release

Verdict : **NO-GO**

Paquets natifs : `f02e6cca302d4647d32fff61cebdcfc19a531df3`
Serveur Staging actuellement servi : `84cff869a7d281ea0ec40fc06f5fde4116a2756f`
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
| Paquet natif | `ios-mvqglbi4-f14a27` |
| Hash d’assets | `419af7b077c23ee784e7e0d1ff220423f17d555c0ed662bdd0130cf324bd59c6` |
| Version | 1.0, build iOS 10, `versionCode` Android 1 |
| Backend du paquet | `https://staging.lyann.app` |
| Compilation | 2026-10-27T09:04:11Z |
| iPhone | iPhone de yoann, `app.lyann.mobile`, équipe `WLV4WC47U2`, lancé |
| APK debug | SHA-256 `f56bed017e233a59fadc26c31b10a8810cea430cd499356b2c8c68ff6cd43cab`, émulateur `lyann_api36` |
| AAB | SHA-256 `11f962e552db0c7056b8a2527a0eb4042a361f9fcb6a28ee87e5cd636ab89dd6`, certificat `CN=LYANN Upload`, hors Play |
| Keystore | `~/Library/Application Support/lyann-release/upload-keystore.jks`, alias `upload`, hors dépôt |
| Ancien hôte | `https://staging-bokantaj.lyann.app` sert encore `80ceae7c` depuis le projet `lyan`. Les paquets actuels ne l’appellent pas. Les tests et `shared-html-build.js` l’autorisent encore comme ancienne origine Staging |
| Correspondance | Code client des paquets : `f02e6cc`. Serveur servi : `84cff86` (route d’équipe). Documentation : la tête de branche. Le client n’a pas changé depuis `f02e6cc`, hors droits Release iOS |

## CI

`63d1565fb311c3eafe19d6a1e79434db7d5e64a0` est vert sur `architecture-audit`, `chromium-qa`, `android-qa` et `Vercel Preview Comments`. Les contrôles à lire pour ce document sont ceux du commit qui le contient. Le rouge Chromium de `c060bc3` venait du titre de quartier et a été corrigé dans `f02e6cc`.

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
| Google Play | AAB signé, non envoyé | OK pour la préparation | Fichier local relu | SHA-256 `11f962e552db0c7056b8a2527a0eb4042a361f9fcb6a28ee87e5cd636ab89dd6`, `CN=LYANN Upload`, `app.lyann.mobile`, `versionCode` 1, version 1.0, backend `https://staging.lyann.app`, verrou `tdktfbtqceldlaeqjtow`. `minSdk` 24. Permissions Internet, localisation, caméra. Jamais déposé : le `versionCode` 1 reste utilisable pour un premier envoi | Pas d’envoi. Keystore non recréé | — | `f02e6cc` | P1 | Accord explicite avant Internal Testing |
| Apple | Archive TestFlight | NON TESTÉ | Trousseau et profil Store | Équipe `WLV4WC47U2`. Profil `db8e9c85-8649-4a45-97b4-c03d2ead4061`, `get-task-allow` faux, `beta-reports-active`, `aps-environment` production, domaines associés ouverts, expire le 2027-10-09. Aucune identité Apple Distribution dans le trousseau. Aucun `.p12` local | Archive non produite. Les droits Release de la branche pointent maintenant `applinks:staging.lyann.app`, avec les notifications production exigées par TestFlight | `ios/App/App/App.release.entitlements` | ce commit | P1 | Importer le .p12, puis accord d’envoi |
| Web | Carte, rayon 4 km, puces | OK | Playwright local | 18 tests du lot navigateur, puis les 2 pins | CI `c060bc3` attendait l’ancien titre | Titre de quartier attendu | `f02e6cc` | P1 | CI Chromium du SHA encore en cours au relevé |
| Staging SQL | `revise_sent_quote` P0001 | KO | Management API et RPC QA | HTTP 401 encore. Aucun CLI Supabase, aucun MCP, aucun mot de passe base. Le devis QA `f4abcf70` avec version attendue 0 n’a pas répondu en 12 s | La fonction Staging garde le réessai `40001`. Le fichier `59_revise_sent_quote_p0001.sql` contient déjà `P0001` et un `lock_timeout` de 4 s. Il n’est pas appliqué | Aucune écriture SQL | — | P1 | Nouveau jeton de gestion, projet `tdktfbtqceldlaeqjtow` |
| Stripe Test | Remboursement d’un jalon QA financé | KO contrôlé | API Staging et code du grant | `409 EXECUTION_DISABLED`. `preTransferRefundExecutionEnabled()` reste `false`. Un en-tête client ne l’ouvre pas. Le seul grant admissible vise le paiement `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, QA A, 4 349 centimes, `livemode` faux, 15 minutes. Cette ligne est absente de Staging. Le fichier local de grant n’existe pas et n’est pas déployé | Aucun remboursement créé | Protection conservée | — | P1 | Décision explicite, seulement si cette ligne de paiement existe |
| Back-office | Modération, signalement, suspension, rôles, abonnements, export | PARTIEL | Session du rôle `qa_finance_610q` | Ce membre Staging, hors compte personnel, a seulement `finance.refund`. Sur le serveur `84cff86` il reçoit 403 pour s’ajouter, pour se donner `OWNER`, pour suspendre le propriétaire, pour ouvrir la file de modération, pour traiter un signalement, pour sanctionner et pour changer un rôle. Le propriétaire reste `ACTIVE`. Son profil reste `USER`. Son journal d’audit compte 0 ligne. Une demande de remboursement inconnue répond `404 REQUEST_NOT_FOUND`. L’offre d’abonnement Pro est marquée indisponible. L’export CSV reste un téléchargement local | La route d’équipe est servie. Elle refuse `OWNER`, `SUPER_ADMIN` et l’auto-nomination | `84cff86` | P1 | Le propriétaire ajoute un membre MODERATION déjà existant |
| Auth, annonces, Lyanneurs, messagerie, abonnements | Parcours complets de cette passe | NON TESTÉ | — | Non rejoués ici | — | — | — | P1 | Comptes QA, plusieurs sessions |
| Production | Non-déploiement | OK | Contrôle | Projet `lyan` non déployé, `lyann.app` identity 404 | `staging-bokantaj` pointe encore vers ce projet | Non déplacé sans accord | — | P0 si on l’oublie | Décider du domaine |

## Blocages qui empêchent le GO

1. La migration devis `P0001` n’est pas sur Staging. Le jeton de gestion répond 401. Le devis QA `f4abcf70`, version attendue 0, n’a pas répondu en 12 secondes.
2. Le remboursement Stripe Test reste fermé. Le paiement unique autorisé par le grant, `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, n’existe pas sur Staging.
3. L’iPhone n’a pas été piloté pour les messages, le devis, l’arrière-plan et la coupure réseau. Les achats Sandbox Apple et Google restent NON TESTÉ.
4. Le certificat Apple Distribution est émis pour l’équipe, mais sa clé privée n’est pas sur ce Mac. Pas d’archive. L’AAB signé est prêt pour un premier dépôt et n’a pas été envoyé.
5. Le seul administrateur hors compte personnel est `qa_finance_610q`. Il ne peut pas modérer, suspendre, changer un rôle ni exporter les paiements. La route d’équipe est servie et lui répond 403.
6. `staging-bokantaj.lyann.app` sert encore `80ceae7c` depuis le projet Production.

## Actions humaines

1. Jeton Supabase. Ouvre https://supabase.com/dashboard/account/tokens, crée un jeton avec un compte qui voit `tdktfbtqceldlaeqjtow`, et remplace seulement la ligne `SUPABASE_ACCESS_TOKEN=` dans `/Users/mac/Developer/lyann/.env.local`. Ne change pas `SUPABASE_URL` de ce fichier : il désigne encore le projet Production. Ne colle pas le jeton dans le chat. Ensuite : `node scripts/rc-v15-apply-quote-errcode.js`.
2. Membre modération. Ouvre `https://staging.lyann.app/admin.html` avec le compte propriétaire, section Équipe, et ajoute l’UUID d’un compte Staging déjà créé avec le rôle `MODERATION`. La route refuse `OWNER` et `SUPER_ADMIN`.
3. Signature Apple. Importe dans le trousseau de ce Mac le fichier `.p12` du certificat `Apple Distribution: yoann danier (WLV4WC47U2)`. Le profil Store est déjà dans `~/Library/Developer/Xcode/UserData/Provisioning Profiles/db8e9c85-8649-4a45-97b4-c03d2ead4061.mobileprovision`. L’archive attend cette clé. L’envoi TestFlight attend un accord séparé.
4. Remboursement. Le verrou global reste fermé. La seule opération préparée est le paiement QA `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, Stripe Test, 4 349 centimes maximum, quinze minutes. Cette ligne n’est pas en base. Un accord dans le chat ne sert que lorsque la ligne existe.
5. Gestes sur l’iPhone de yoann, déverrouillé. L’app déjà installée parle à `https://staging.lyann.app`. Avec un compte QA : envoyer un message, créer puis accepter un devis, ouvrir la notification, passer l’app en arrière-plan, couper le réseau, le rétablir, rouvrir une vidéo. Ne pas acheter en Sandbox. Ne pas utiliser l’iPhone de Tory.
6. Dépôt Play et déplacement de `staging-bokantaj.lyann.app` attendent un accord. L’alias appartient au projet `lyan`. Les paquets actuels n’en dépendent pas.
