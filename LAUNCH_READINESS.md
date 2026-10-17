# LYANN — préparation au lancement

Journal de reprise. Staging uniquement (`tdktfbtqceldlaeqjtow`). Pas de déploiement, pas de Stripe Live, pas d’écriture Production.

Les fixtures historiques (QA-616A, QA-610Q, etc.) ne sont pas modifiées. Les données de cette campagne portent le préfixe `[CAMPAGNE-J2]`.

## Données de campagne

Créées par `node -r ./scripts/force-staging-v2-env.js scripts/campagne-j2-seed.js`.
Identifiants : `tests/fixtures/campagne-j2.json`.

| Cas | État devis | Demandeur QA A | Lyanneur QA B |
|---|---|---|---|
| Tarif Direct | ACCEPTED | Vous demandez | invité |
| Devis par jalons | SENT | Accepter / Refuser visibles | en attente du demandeur |
| Devis à refuser | REJECTED | « Ce devis n’a pas été retenu. » | — |

## Campagnes

### 1. Authentification et profils

- PASS : connexion QA A et QA B sur `http://127.0.0.1:8098`.
- PASS : mauvais mot de passe refusé (message console « Adresse email ou mot de passe incorrect. »).
- PASS : étape 1 d’inscription (Apple, Google, prénom). Compte non créé.
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

- Le serveur, pour le jalon Tonte à 18 €, répond `service_amount_cents=1800`, `customer_fee_cents=149`, `customer_total_cents=1949`. 1800 + 149 = 1949.
- PASS : après chargement de Stripe.js, l’écran affiche **18.00 €**, **1.49 €**, **19.49 €**. Le champ carte passe à `ready=true`.
- Les « … » étaient l’état de chargement. Les montants n’arrivent qu’après l’intention Stripe, pas avant. Un paiement déjà créé (`CREATED`) n’avait plus de bouton : le dossier dit maintenant « Finaliser le paiement » et rouvre le checkout.
- NON TESTÉ : saisie de la carte 4242 et confirmation. Le second essai n’a pas atteint l’iframe dans le délai. Aucun paiement SUCCEEDED.
- Politique : remboursements et virements après transfert restent désactivés. Non contournés.

### 6. Paramètres, abonnements, navigation

- PASS : « Commencer gratuitement » ouvre l’inscription.
- NON TESTÉ : offres payantes, réglages, suppression de compte.

### 7. Mobile et iOS

- PASS : Missions (n) visible en 390 px (32 px de haut).
- Le JavaScript source est recopié dans `ios/App/App/public` (`web-sync-j2-pay-copy`). L’application installée sur l’iPhone n’est pas ce bundle.

### 8. Lancement

- NO-GO. Les montants du checkout sont corrects, le paiement carte n’est pas confirmé. Bokantaj, notifications et inscription complète ne sont pas exécutés. Pas de déploiement.

## Corrections dans cet arbre

- Dossier affiché avant `reloadPairDossiers`, reprise annulée si une autre mission a été ouverte.
- Nom du fil via `getPublicProfileWithReputation`.
- Devis accepté sans jalon actif : pas d’invitation à payer.
- Le paiement accepte un `milestoneId` même si `mission_id` n’est pas encore sur le devis.
- Le checkout affiche les centimes renvoyés par `create-milestone-intent` même si le champ carte échoue ensuite.
- Un paiement `CREATED` se rouvre avec « Finaliser le paiement ».

## Git

Les artefacts (`artifacts/`, y compris `isolated.env`) et les fichiers `.env*` ne sont pas commités. Ils contiennent des clés.
