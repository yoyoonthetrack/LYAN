# LYANN — préparation au lancement

Journal de reprise. Staging uniquement (`tdktfbtqceldlaeqjtow`). Pas de déploiement, pas de Stripe Live, pas d’écriture Production.

Les fixtures historiques (QA-616A, QA-610Q, etc.) ne sont pas modifiées. Les données de cette campagne portent le préfixe `[CAMPAGNE-J2]`.

## Données de campagne

Créées par `node -r ./scripts/force-staging-v2-env.js scripts/campagne-j2-seed.js`.
Identifiants : `tests/fixtures/campagne-j2.json`.

| Cas | État devis | Demandeur QA A | Lyanneur QA B |
|---|---|---|---|
| Tarif Direct | payé, jalon FUNDED | Vous demandez | Lyanneur voit « Déclarer la prestation terminée » |
| Devis par jalons | SENT | Accepter / Refuser visibles | en attente du demandeur |
| Devis à refuser | REJECTED | « Ce devis n’a pas été retenu. » | — |

## Campagnes

### 1. Authentification et profils

- PASS : connexion QA A et QA B sur `http://127.0.0.1:8098`.
- PASS : mauvais mot de passe refusé (message console « Adresse email ou mot de passe incorrect. »).
- PASS : étape 1 d’inscription. Un formulaire vide dit « Veuillez indiquer votre prénom. » Le mot de passe n’annonce plus 6 caractères puis 8 : la règle unique est 8. Compte non créé.
- NON TESTÉ : vérification email, mot de passe oublié jusqu’au mail, suppression de compte.

### 2. Annonces, Bokantaj, recherche

- PASS : page Annonces et champ « De quoi avez-vous besoin ? ».
- PASS : trois annonces `[CAMPAGNE-J2]` créées par l’API Staging, sans toucher aux fixtures.
- NON TESTÉ : wizard complet dans le navigateur, Bokantaj, filtres de résultats jusqu’à une carte cliquée.

### 3. Messagerie et notifications

- PASS : message `J2AUDIT-1792196974110` envoyé par B et lu par A.
- PASS : en-tête « Qa A. » / « Qa L. » (profil public).
- NON TESTÉ : cloche de notifications ouverte et lue, pièces jointes, coupure réseau.

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
- NON TESTÉ : clic « Déclarer la prestation terminée » jusqu’à un jalon COMPLETED, puis libération. Le virement après transfert reste désactivé.

### 6. Paramètres, abonnements, navigation

- PASS : « Commencer gratuitement » ouvre l’inscription.
- NON TESTÉ : offres payantes, réglages, suppression de compte.

### Transitions

Les pages restent des documents HTML distincts. Le fond entre deux pages est le crème de l’app. Les navigateurs récents fondent la page en 180 ms. Les autres font un fondu de sortie de 160 ms, sans bloquer si l’utilisateur demande moins d’animations. Les modales passent de 350 ms à 200 ms. L’écran d’accueil ne force plus 1,2 s d’attente.

### 7. Mobile et iOS

- PASS : Missions (n) visible en 390 px (32 px de haut).
- Le JavaScript source est recopié dans `ios/App/App/public` (`web-sync-j2-pay-copy`). L’application installée sur l’iPhone n’est pas ce bundle.

### 8. Lancement

- NO-GO pour une ouverture publique. Le paiement test de la campagne est enregistré et visible des deux côtés. Il reste l’inscription complète, Bokantaj publié, les notifications lues, la fin de mission et un build iPhone du même commit. Pas de déploiement.

## Corrections dans cet arbre

- Dossier affiché avant `reloadPairDossiers`, reprise annulée si une autre mission a été ouverte.
- Nom du fil via `getPublicProfileWithReputation`.
- Devis accepté sans jalon actif : pas d’invitation à payer.
- Le paiement accepte un `milestoneId` même si `mission_id` n’est pas encore sur le devis.
- Le checkout affiche les centimes renvoyés par `create-milestone-intent` même si le champ carte échoue ensuite.
- Un paiement `CREATED` se rouvre avec « Finaliser le paiement ».

## Git

Les artefacts (`artifacts/`, y compris `isolated.env`) et les fichiers `.env*` ne sont pas commités. Ils contiennent des clés.
