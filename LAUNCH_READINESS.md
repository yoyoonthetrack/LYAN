# LYANN — préparation au lancement

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

Les rappels nomment la mission, ouvrent la conversation puis le dossier, et disparaissent quand l’état change. Deux missions entre les mêmes personnes restent distinctes. Le dossier affiche les centimes serveur, les frais et l’attente de validation, selon le rôle de cette mission.

### Manques classés, non développés

- Indispensable avant un GO : terminer Connect pour QA A, puis rejouer le paiement inversé. Safari et l’app iOS installée restent NON TESTÉ.
- Utile ensuite : confirmation réelle du virement bancaire, distincte du transfert Stripe.
- Après accord : exécuter les remboursements partiels (moteurs encore coupés) et accepter un domaine d’email pour les nouveaux comptes.

## Git

Les artefacts (`artifacts/`, y compris `isolated.env`) et les fichiers `.env*` ne sont pas commités. Ils contiennent des clés.
