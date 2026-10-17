# LYANN — préparation au lancement

## Phase 8 — Release Candidate

Verdict : **NO-GO** pour un lancement public. La candidate Web est le commit `d35ba7a`. Elle a été exécutée sur Staging `tdktfbtqceldlaeqjtow` et Stripe Test. Elle ne prouve pas le comportement de Production.

Bundle iOS `ios-mvbvjyzb-206610`, identique à `www/`, backend Staging `http://172.20.10.2:8098`. Simulateur iPhone 17, iOS 26.5. XCUITest pilote la WebView quand l’élément est à l’écran et `hittable`. Pas de TestFlight.

| Sujet | Résultat |
|---|---|
| Quatre transferts Stripe Test (7,76 €, 11,64 €, 19,40 €, 29,10 €), `livemode: false` | PASS |
| Deux libérations simultanées du même jalon déjà transféré | PASS, les deux répondent déjà transféré, un seul id |
| Lyanneur qui tente de valider | PASS, HTTP 403 |
| Missions « Jalons neufs » et « Devis par jalons » | PASS, COMPLETED, jalons RELEASED |
| Somme des quatre paiements | PASS, frais 5,96 €, total client 75,96 €, nets 67,90 € |
| Virement bancaire confirmé | NON TESTÉ, et non affiché comme reçu |
| Remboursement avant transfert, remboursement après transfert, reversement | DÉSACTIVÉS. Les fonctions renvoient false. Non réactivés |
| Litige | Le code gèle le transfert. Exécution d’un remboursement de litige absente |
| Reprise d’un transfert TRANSFER_FAILED | Présente dans le verrou, non rejouée sur un vrai échec Stripe |
| Version 1 refusée après révision en version 2 | PASS. HTTP 400, code P0001, environ 2,6 s, message de rechargement. Le devis reste SENT version 2, aucune mission |
| Acceptation de la version courante, refus du Lyanneur | PASS |
| Inscription réelle, Google, Apple | NON TESTÉ. Action humaine : créer le compte avec une adresse lue, puis ouvrir le lien Supabase |
| Connect de QA A | BLOQUÉ humain. Captcha Stripe. Le compte ne peut pas encore recevoir |
| Safari | NON TESTÉ |
| App iOS, simulateur iPhone 17 | Voir la section Phase 8.2. Connexion QA A, session, annonces, inbox, activité, finances : exécutés. Fil de discussion, devis créé sur l’appareil, Stripe et Safari : NON TESTÉS |
| Production (migrations, RLS, webhooks, lyann.app) | NON MODIFIÉE. Audit code seulement |

Risque financier : un transfert Stripe Test n’est pas un virement reçu. Les remboursements ne s’exécutent pas. Un jalon à 8 € coûte 1,49 € de frais, soit 2,98 € pour deux petits jalons.

Risque de sécurité : ne pas poser de clé live sur le processus qui sert `release-payment`. Ce chemin utilise la clé du processus. Le serveur de campagne refuse déjà une clé live au démarrage quand il est verrouillé sur Staging.

Écart Web / iOS : le bundle installé est le même `www/`. La WebView affiche les parcours. Un premier chargement de l’inbox a affiché « Impossible de charger les conversations » ; le chargement suivant a listé Support et Qa L. Les requêtes Staging équivalentes répondent en moins de deux secondes. Ce n’est pas un faux vert de XCUITest.

## Phase 8.2 — XCUITest et simulateur

Diagnostic, au même instant qu’une capture :

- Écran blanc : seulement dans la première seconde, avant peinture. Après l’attente, l’accueil est complet.
- WebView : trois web views. Les boutons et champs HTML sont exposés. `exists` et `isHittable` sont vrais pour ce qui est à l’écran.
- Le formulaire de connexion existe déjà sur la slide suivante, à x = 1237, donc `hittable = false`. Le bouton du pied de page, lui, est à l’écran et atteignable. Après son tap, les champs « Adresse email de connexion » et « Mot de passe de connexion » passent à x = 31 et deviennent atteignables. Le bouton d’envoi est « Valider la connexion », distinct du pied de page.
- Un clic par coordonnées sur une rangée du menu a manqué sa cible. Les tests suivants n’utilisent que `element.tap()` sur un élément `hittable`.

| Parcours iOS | Résultat |
|---|---|
| Connexion QA A à froid, identité `qa.a.author.stagingv2@lyann.invalid` | PASS. Compte « Qa A. », e-mail affiché |
| Fermeture puis relance | PASS. La même identité revient |
| Annonces | PASS. 14 annonces, dont `[CAMPAGNE-J2] Devis à refuser` |
| Lyanneurs | PASS. Ludivine R., Saint-François |
| Bokantaj | PASS. Compositeur visible, session ouverte |
| Clavier | PASS. « Test clavier », 12/280, clavier iOS ouvert, texte non publié |
| Messagerie | PASS liste : Support et Qa L., devis accepté « Version HTTP ». L’ouverture d’un fil n’a pas été faite. Un essai précédent s’est arrêté sur l’erreur de chargement |
| Notifications | PASS panneau : 61 non lues, propositions de devis et travaux à valider. Le clic jusqu’au dossier n’a pas été fait |
| Mon activité | PASS liste des annonces, dont Jalons neufs terminée. L’onglet « Mes missions (31) » est visible, pas ouvert |
| Finances | PASS. À recevoir 0,00 €, dépenses sécurisées 182,43 €, remboursé 173,96 €, sans compensation. Les quatre jalons de campagne apparaissent avec 1,49 € de frais chacun |
| Profil public | PASS. Qa A., Basse-Terre |
| Inscription, Google, Apple | NON TESTÉ. Le formulaire s’affiche. Aucun compte créé |
| Devis créé, payé ou validé dans l’app | NON TESTÉ sur iOS. Déjà exécuté sur le Web Staging |
| Fil de discussion, pièce jointe | NON TESTÉ |
| Retour Stripe, lien externe, Safari, push APNs | NON TESTÉ. Réservés à l’iPhone physique |
| Mise en arrière-plan | PASS. L’app revient sur la session |

## Incidents financiers — procédure manuelle

Les moteurs restent éteints. `preTransferRefundExecutionEnabled` et `postTransferFinancialExecutionEnabled` renvoient false. Ne pas les activer.

Ce qui fonctionne déjà, en Stripe Test seulement :

- Le transfert initial passe par `POST /v1/milestones/release-payment`, idempotence `tr_milestone_<id>`.
- Un second appel répond déjà transféré.
- Un webhook en double répond `duplicate: true`.
- Un litige (`DISPUTED`) bloque le transfert dans `evaluateTransfer`.
- Un transfert `TRANSFER_FAILED` peut reprendre le verrou. Ce cas n’a pas été rejoué sur un échec Stripe réel.

Conduite si un incident arrive :

1. Vérifier que la clé du processus est `sk_test` et que `livemode` est false. Ne rien faire sur Stripe Live.
2. Transfert échoué : ne pas créer un second transfert à la main. Relancer la validation demandeur, qui réutilise la même clé d’idempotence. Si Stripe a le transfert et Supabase non, noter les deux identifiants et s’arrêter.
3. Paiement contesté : ne pas libérer le jalon. Le dossier Stripe est la source. Aucun remboursement automatique n’existe.
4. Remboursement demandé avant transfert : l’application ne crée pas le refund. Rembourser le PaymentIntent dans le tableau Stripe Test pour le total client, puis noter l’identifiant. Ne pas écrire la ligne dans Supabase à la main.
5. Remboursement demandé après transfert : ne pas faire de reversal manuel. Le moteur est éteint, un reversal de tableau désynchroniserait le grand livre.
6. Webhook en retard : rejouer l’événement depuis le tableau Stripe Test vers l’URL Staging. Ne pas pointer un webhook Live vers Staging. Un second envoi est idempotent.

Conditions pour allumer ces moteurs plus tard : tests de reprise `TRANSFER_FAILED`, de gel de litige, de remboursement avant et après transfert, d’idempotence du reversal, et une répétition Staging qui compare Stripe et Supabase après un webhook retardé. Accord explicite requis.

## Phase 8.3 — messagerie, missions, notifications

Bundle `ios-mvbw21dt-794541`. La liste des conversations s’est affichée à trois lancements froids. L’écran « Impossible de charger les conversations » vient du délai de 8 secondes autour de `listConversations` : les mêmes requêtes Staging répondent en moins de deux secondes, et l’ouverture suivante montrait déjà la liste. Le délai passe à 15 secondes. Si la réponse arrive après le message d’erreur, la liste se peint quand même. Le bouton Réessayer reste.

| Parcours | Résultat |
|---|---|
| Liste au lancement | PASS. Qa L. visible en 3,7 s, lancement compris |
| Envoi QA A | PASS. `IOS83-1792210842` dans le fil et dans Supabase, conversation `96c52b91-888a-46c6-9e99-f1b740965f8e` |
| Réception QA B | PASS. La ligne Qa A. montrait 16 non lus et le texte. Le fil l’affiche à gauche |
| Réponse QA B | PASS. `IOS83R-1792210842`, marqué Envoyé. Supabase : auteur B, non lu pour A. Le message de A est passé à lu à l’ouverture |
| Retour à la liste, autre conversation | NON TESTÉ. La liste de B montre aussi Qa O., sans l’ouvrir |
| Notification d’un nouveau message | NON TESTÉ |
| Mes missions | PASS liste et filtres. Ouvertes : Tarif Direct « Sécuriser le paiement », A est Lyanneur « En attente du paiement ». Terminées : Jalons neufs et Devis par jalons |
| Dossier Jalons neufs | PASS. Vous demandez, Terminé, 20 €, Taille 9,49 € et Évacuation 13,49 € avec 1,49 € de frais, historique présent. Un toast « Cette demande n’accepte plus de nouvelles propositions » apparaît avant le dossier |
| Retour du dossier vers le chat | NON TESTÉ. Le bouton « Retour au chat » est visible |
| Notification individuelle | PARTIEL. La carte « Proposition de devis » est atteignable. Le rappel groupé n’a pas été ouvert |
| Reprise après le bouton principal | La capture montre l’écran d’accueil iOS. La session après fermeture complète reste celle déjà prouvée |

## Phase 8.4 — mesures, retour au fil, iPhone

Bundle `ios-mvbx5rhh-35b11e`, Staging `tdktfbtqceldlaeqjtow`, API locale `http://172.20.10.2:8098`. Signature automatique, équipe `WLV4WC47U2`, identifiant `app.lyann.mobile`.

Chargement de la liste, un lancement à froid, session déjà en mémoire : session 0 ms, requête 2 192 ms, rendu 3 ms, 3 lignes, total 2 195 ms. Le bouton Messages apparaît 4,4 s après le lancement. Une réponse de liste plus ancienne est ignorée dès qu’un message local met la ligne à jour (`inboxRenderGeneration`). Le rendu d’un fil plus ancien est déjà ignoré si l’interlocuteur a changé.

| Parcours | Résultat |
|---|---|
| Deuxième fil, Support LYANN | PASS |
| Retour de la liste des missions vers le fil | PASS. Le compositeur et les messages de Qa A. reviennent |
| Dossier depuis le fil, Jalons neufs, côté Lyanneur | PASS. 7,76 € et 11,64 € à recevoir, versement bancaire non confirmé. Pas de toast de nouvelle proposition |
| Retour du dossier au fil | PASS |
| Rappel groupé | NON TESTÉ. Aucune carte « missions — » dans le panneau de QA B |
| Reprise par le bouton principal de l’iPhone | La capture a montré l’écran d’accueil. La session après fermeture complète reste prouvée plus haut |

Ouvrir un dossier déjà lié ne lance plus `initiate_lyann_help_conversation`. Cette fonction sert à créer une proposition. Fermer la liste des missions retire l’état qui cachait les messages et le champ de saisie.

Installation sur l’iPhone, sans TestFlight : brancher le téléphone, lui faire confiance, ouvrir `ios/App/App.xcodeproj`, schéma App, destination le téléphone, puis Run. Ne pas archiver et ne pas envoyer à App Store Connect. Le téléphone doit être sur le même réseau que le Mac pour joindre l’API `8098`. La messagerie et les missions passent par Supabase en HTTPS.

## Phase 8.5 — installation iPhone

Commit `00d96c7`, puis le correctif de retour natif. Bundle local `ios-mvbxq3t8-77ddd5`, identique à `www/`. Verrou Supabase `tdktfbtqceldlaeqjtow`. Clé embarquée : rôle `anon`, pas de `service_role`, pas de `sk_live`. Stripe du processus sur 8098 : `test`.

L’API écoute sur toutes les interfaces, port 8098. Le Mac répond sur `http://172.20.10.2:8098` (en0). Le pare-feu macOS est désactivé. Cette adresse est celle du partage de connexion, pas une preuve que l’iPhone l’atteint. ATS n’autorise pas le HTTP arbitraire : seulement le réseau local (`NSAllowsLocalNetworking`) et Stripe en HTTPS. Aucune exception supplémentaire.

Le serveur Staging réécrit encore tout retour `lyann.app` vers `http://127.0.0.1:8098`. Sur un iPhone, cette adresse est le téléphone, pas le Mac. L’app native demande désormais `capacitor://localhost/feed.html?action=finances&connect=return`, URL déjà acceptée par le serveur. Si Stripe Test refuse ce schéma, l’onboarding s’arrête. Ne pas continuer sur lyann.app.

L’inscription native demande la confirmation vers `capacitor://localhost/confirm-signup.html`. Google revient par `app.lyann.dom://google-auth`. Apple utilise la connexion native.

| Sujet simulateur déjà exécuté | Résultat |
|---|---|
| Deuxième conversation, Support LYANN | PASS |
| Retour liste des missions, puis dossier, puis fil | PASS |
| Rappel groupé | NON TESTÉ, aucune carte chez QA B |
| Reprise par le bouton principal | Capture de l’écran d’accueil. Session après fermeture complète : PASS |

Bêta privée possible comme application Staging installée à la main. Elle ne peut pas encaisser d’argent réel. Les remboursements restent éteints. QA A ne peut pas recevoir. Production et Stripe Live restent interdits.

## iPhone physique — seulement ce que le simulateur ne couvre pas

- Ouvrir le lien de confirmation d’un compte créé avec une adresse réellement lue. Google et Apple.
- Connect de QA A : captcha Stripe, IBAN de test `FR1420041010050500013M02606`, code téléphone `000000`. Ne pas utiliser Stripe Live. Ne pas valider le versement de la mission inversée tant que Connect n’est pas actif.
- Installer ce bundle avec Xcode, schéma App, sans archive ni TestFlight.
- Notification push réelle, retour depuis la page Stripe, et un lien qui quitte l’application.
- Un rappel groupé, s’il apparaît, doit ouvrir la liste filtrée des missions.

À reporter : paiement groupé de plusieurs jalons, abonnements payants, confirmation bancaire.

Le journal ci-dessous garde l’historique. Là où il dit que la validation n’a pas été cliquée, la Phase 8 prévaut.

Journal de reprise. Staging uniquement (`tdktfbtqceldlaeqjtow`). Pas de déploiement, pas de Stripe Live, pas d’écriture Production.

Les fixtures historiques (QA-616A, QA-610Q, etc.) ne sont pas modifiées. Les données de cette campagne portent le préfixe `[CAMPAGNE-J2]`.

## Données de campagne

Créées par `node -r ./scripts/force-staging-v2-env.js scripts/campagne-j2-seed.js`.
Identifiants : `tests/fixtures/campagne-j2.json`.

| Cas | État devis | Demandeur QA A | Lyanneur QA B |
|---|---|---|---|
| Tarif Direct | jalon COMPLETED, paiement SUCCEEDED | QA A doit valider | prestation déclarée terminée |
| Devis par jalons | SENT | Accepter / Refuser visibles | en attente du demandeur |
| Devis à refuser | REJECTED | « Ce devis n’a pas été retenu. » | — |

## Campagnes

### 1. Authentification et profils

- PASS : connexion QA A et QA B sur `http://127.0.0.1:8098`.
- PASS : mauvais mot de passe refusé (message console « Adresse email ou mot de passe incorrect. »).
- PASS : étape 1 d’inscription. Un formulaire vide dit « Veuillez indiquer votre prénom. » Le mot de passe n’annonce plus 6 caractères puis 8 : la règle unique est 8. Compte non créé.
- BLOQUÉ : création d’un compte neuf. Staging refuse `campagne.j2…@lyann.invalid` et `@example.com` (« Email address is invalid »). Pas de session, pas de profil, pas de reconnexion. Google et Apple non rejoués.
- NON TESTÉ : mot de passe oublié jusqu’au mail, suppression de compte.

### 2. Annonces, Bokantaj, recherche

- PASS : page Annonces et champ « De quoi avez-vous besoin ? ».
- PASS : trois annonces `[CAMPAGNE-J2]` créées par l’API Staging, sans toucher aux fixtures.
- PASS : QA B a publié `[CAMPAGNE-J2] Lyann visible …` (`1d50e769-2290-4bec-9006-e1a9fb488d3b`). QA A le voit dans le fil. Un premier Lyann de campagne a été supprimé par son auteur. Modification du texte non rejouée.
- NON TESTÉ : wizard complet dans le navigateur, filtres de résultats jusqu’à une carte cliquée.

### 3. Messagerie et notifications

- PASS : message `J2AUDIT-1792196974110` envoyé par B et lu par A.
- PASS : en-tête « Qa A. » / « Qa L. » (profil public).
- PASS : la cloche ouvre le panneau. Exemple lu : « Mission acceptée », « Proposition de devis », 28 non lues.
- NON TESTÉ : clic d’une notification jusqu’à sa destination, pièces jointes, coupure réseau.

### 4. Devis et missions

- PASS : dossier ouvert en moins d’une seconde, titre stable après rechargement serveur.
- PASS : second clic pendant le rechargement ne revient pas au dossier précédent (génération).
- PASS : jalon annulé (QA-616A) n’affiche plus « sécuriser le paiement ».
- PASS : jalons SENT montrent Accepter et Refuser. Refus historique de campagne affiché. Acceptation du Tarif Direct faite par le seed, pas par un clic UI sur ce devis.
- NON TESTÉ : clic UI Accepter / Refuser sur le devis jalons encore SENT.

### 5. Stripe Test

- Grille : frais client = 3 % avec minimum **1,49 €** (`CUSTOMER_FEE_MINIMUM_CENTS = 149`). Pour 18 € : 1 800 + 149 = 1 949 centimes. Commission Lyanneur 3 % = 54 centimes. Net 17,46 €. Revenu LYANN 2,03 €.
- PASS : écran **18.00 € / 1.49 € / 19.49 €**, carte prête.
- Les montants serveur s’affichent dès la réponse de l’intention, avant le chargement de Stripe.js. Le libellé d’attente est « Calcul… », plus un « … » muet. Pendant la vérification du compte de versement, le dossier explique que les actions arrivent ensuite.
- L’iframe Stripe n’a pas accepté la saisie automatique. Confirmation faite par l’API Stripe Test sur l’intention réelle `pi_3URLut…` (`pm_card_visa`, `livemode: false`, montant 1949). Ce n’est pas une écriture directe en base.
- PASS : webhook signé `payment_intent.succeeded` → HTTP 200. Rejeu du même événement → `duplicate: true`.
- PASS : paiement `SUCCEEDED`, transfert `PENDING_VALIDATION` (pas de virement). Jalon `FUNDED`, montant 18.
- PASS : second `create-milestone-intent` refusé : « Cette Partie n'est pas payable (statut actuel: FUNDED). »
- PASS après rechargement : QA A voit « Le paiement est sécurisé ». QA B, après la vérification du compte, voit « Déclarer la prestation terminée ».
- PASS : QA B a déclaré la prestation. Réponse serveur : « Prestation réalisée — en attente de validation du client. » Jalon `COMPLETED`.
- PASS : QA A voit « Le Lyanneur a déclaré la prestation terminée. Vérifiez le travail avant de confirmer. » Actions : « Valider et libérer le paiement », « Signaler un problème ».
- NON EXÉCUTÉ : le clic Valider. Cette route enregistre la validation puis appelle le versement Stripe. Le compte Connect du Lyanneur est payable, donc le clic créerait un transfert Stripe Test. Les moteurs post-transfert restent désactivés ; ce chemin de libération ne les consulte pas. Le clic n’a pas été fait.

### 6. Paramètres, abonnements, navigation

- PASS : « Commencer gratuitement » ouvre l’inscription.
- NON TESTÉ : offres payantes, réglages, suppression de compte.

### Transitions

Les pages restent des documents HTML distincts. Le fond entre deux pages est le crème de l’app. Les navigateurs récents fondent la page en 180 ms. Les autres font un fondu de sortie de 160 ms, sans bloquer si l’utilisateur demande moins d’animations. Les modales passent de 350 ms à 200 ms. L’écran d’accueil ne force plus 1,2 s d’attente.

### 7. Mobile et iOS

- PASS : Missions (n) visible en 390 px (32 px de haut).
- Le JavaScript source est recopié dans `ios/App/App/public` (`web-sync-j2-pay-copy`). L’application installée sur l’iPhone n’est pas ce bundle.

### 8. Lancement

- NO-GO pour une ouverture publique. Le paiement test et la déclaration de fin sont faits. Il reste la validation sans transfert, un compte neuf (bloqué par la politique email Staging), le clic jusqu’à la cible d’une notification, et un iPhone du même commit. Pas de déploiement.

## Corrections dans cet arbre

- Dossier affiché avant `reloadPairDossiers`, reprise annulée si une autre mission a été ouverte.
- Nom du fil via `getPublicProfileWithReputation`.
- Devis accepté sans jalon actif : pas d’invitation à payer.
- Le paiement accepte un `milestoneId` même si `mission_id` n’est pas encore sur le devis.
- Le checkout affiche les centimes renvoyés par `create-milestone-intent` même si le champ carte échoue ensuite.
- Un paiement `CREATED` se rouvre avec « Finaliser le paiement ».

## Phase 7 — un seul compte

Un utilisateur peut demander et réaliser en même temps. L’onglet Finances agrège les deux sans solde net : filtres Tout, Gains, Dépenses. Une dépense affiche la prestation et les frais payés. Un gain affiche le brut, la commission et le net. Un remboursement n’est pas présenté comme une dépense encore active. Un transfert Stripe n’est pas un virement bancaire reçu. Le dossier reprend les mêmes états serveur.

QA A ne peut pas encore recevoir un paiement : son compte Connect test existe, mais les virements Stripe ne sont pas actifs (`requirements_past_due`, onboarding incomplet). La règle d’éligibilité n’a pas été assouplie. Le devis inversé « [CAMPAGNE-J2] A est Lyanneur » reste accepté, avec QA B demandeur. L’inscription Stripe Test s’arrête sur le captcha hébergé par Stripe ; elle n’a pas été contournée. Tant que ce compte n’est pas prêt, le paiement n’est pas présenté comme réussi. Le retour Stripe ramène sur le dossier local, et le rappel « compte de versement » disparaît dès que l’état change.

Sur le même écran Finances de QA A, après le devis inversé non payé : à recevoir 0,00 €, dépenses sécurisées 106,47 €, remboursements 173,96 €, sans compensation. QA B reste le Lyanneur des missions précédentes (17,46 € à recevoir sur 18,00 € brut). Le mélange gains + dépenses sur un même paiement réel reste NON TESTÉ tant que Connect n’est pas actif ; il est couvert par le test unitaire.

### Onboarding Stripe Test, à la main

Ne pas contourner le captcha ni accepter les conditions à la place de QA A.

1. Se connecter sur `http://127.0.0.1:8098/feed.html` avec QA A.
2. Ouvrir la conversation avec QA B, puis le dossier « [CAMPAGNE-J2] A est Lyanneur ».
3. Choisir **Configurer mon compte de versement**. Stripe Test s’ouvre (compte Express déjà créé).
4. Utiliser le numéro de téléphone de test proposé par Stripe, puis le code `000000` s’il est demandé.
5. Renseigner l’identité de test, l’adresse et l’IBAN de test `FR1420041010050500013M02606`. Passer le captcha dans le navigateur.
6. Revenir sur LYANN. Le dossier doit se rouvrir. Le bouton Payer apparaît chez QA B seulement quand les virements Stripe sont actifs.
7. Rejouer alors le paiement inversé en Stripe Test, sans cliquer « Valider et libérer le paiement » : ce bouton peut créer un transfert.

### Rappels, profils, dossier

Les notifications regroupent les rappels du même type. La liste Missions, elle, garde chaque mission et son action réelle (répondre, payer, déclarer, valider). Rien n’est retiré de Missions pour alléger les notifications. Le dossier affiche les centimes serveur, les frais et l’attente de validation, selon le rôle de cette mission.

Inscription d’un nouveau compte : NON TESTÉ jusqu’à une adresse réelle. Parcours prévu, sans assouplir Auth : ouvrir « Créer un compte », prénom, une adresse que tu lis, mot de passe d’au moins 8 caractères. Staging refuse `@lyann.invalid` et `@example.com`. Supabase envoie ensuite le lien de confirmation. Action à faire de ton côté : ouvrir ce lien. Aucun compte n’est marqué confirmé par contournement.

Un rappel groupé ouvre Missions filtré sur cette action. Vérifié : « 7 missions — un paiement peut être sécurisé » affiche 7 lignes et « 7 missions · paiements à sécuriser ». Le filtre ne survit pas au rechargement. Un rappel d’une seule mission ouvre son dossier. Les rappels ne gonflent pas le compteur de non lues (62 hors rappels).

Devis par jalons : l’acceptation depuis le dossier ne trouvait pas la version du devis, donc la confirmation ne s’ouvrait pas. Elle utilise maintenant la version déjà chargée. « [CAMPAGNE-J2] Devis par jalons » est accepté, version 1, jalons 20 € et 30 €. Un devis neuf « Jalons neufs » (8 € puis 12 €) est aussi accepté.

Le minimum de 1,49 € s’applique à chaque jalon. Pour 8 € + 12 €, les frais sont 2,98 € et le total à régler 22,98 €. La confirmation d’acceptation le dit maintenant avant de créer la mission. Un paiement groupé de plusieurs jalons n’est pas développé.

Libération : le transfert après validation du demandeur est le chemin normal (`release-payment`, idempotence `tr_milestone_<id>`, montant = net Lyanneur). Les mécanismes désactivés sont les remboursements et reversements après transfert ; ils ne sont pas appelés ici. Stripe du serveur : mode test. QA B qui valide est refusé. QA A a libéré Taille : transfert test `livemode: false`, 7,76 €, second appel idempotent. Évacuation, Préparation et Plantation ont suivi le même chemin (nets 11,64 €, 19,40 €, 29,10 €). Les quatre jalons sont RELEASED. Les missions « Jalons neufs » et « Devis par jalons » sont COMPLETED. Ce n’est pas un versement bancaire confirmé.

Version : PostgREST réessayait le code SQL 40001 jusqu’à couper l’appel. Le refus métier utilise maintenant P0001. Vérifié : HTTP 400 en 2,6 s, corps « Ce devis a changé. Rechargez-le avant d’accepter la nouvelle version. », devis resté SENT version 2, aucune mission. Deux acceptations simultanées de la version courante : une HTTP 200, l’autre HTTP 400 « statut actuel: ACCEPTED », une seule mission. Safari et une inscription avec une adresse réelle restent NON TESTÉ. Pas de TestFlight.

### Manques classés, non développés

- Indispensable avant un GO : terminer Connect pour QA A, puis rejouer le paiement inversé. Safari et l’app iOS installée restent NON TESTÉ.
- Utile ensuite : confirmation réelle du virement bancaire, distincte du transfert Stripe.
- Après accord : exécuter les remboursements partiels (moteurs encore coupés) et accepter un domaine d’email pour les nouveaux comptes.

## Git

Les artefacts (`artifacts/`, y compris `isolated.env`) et les fichiers `.env*` ne sont pas commités. Ils contiennent des clés.
