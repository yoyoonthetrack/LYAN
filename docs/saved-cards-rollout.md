# LYANN — Enregistrement volontaire des cartes (Stripe test)

## Fonctionnement

- Le paiement continue de reposer sur le PaymentIntent canonique du jalon.
- Le Payment Element Stripe affiche une option d'enregistrement volontaire (désactivée par défaut par Stripe) et les cartes déjà autorisées.
- Stripe collecte et conserve les données bancaires. LYANN ne stocke que l'identifiant Stripe Customer, la marque et les quatre derniers chiffres sont affichés dans les paramètres.
- La réutilisation exige **toujours** l'action de l'utilisateur, y compris la vérification 3D Secure si nécessaire. Aucun paiement hors session n'est autorisé.
- Le lien compte LYANN/Stripe est partitionné entre les environnements Stripe test et live.
- En cas d'échec de création de la Customer Session, le paiement classique par carte reste possible sans enregistrement.
- La suppression est disponible dans la rubrique Paramètres > Mes moyens de paiement ainsi que dans le Payment Element.

## Prérequis techniques

1. **Ne pas activer en production avant validation.**
2. Appliquer `48_optional_saved_cards_migration.sql` dans **le Supabase de test uniquement**.
3. Vérifier que Staging n'utilise ni la base de données Supabase production ni les clés Stripe live. Le garde-fou backend bloque les écritures financières sur staging pointant vers la base de production.
4. Déployer la branche en environnement d'essai après validation du schéma et des secrets de test Stripe.
5. Vérifier les reçus de Webhook Stripe avec la logique existante : aucun changement de statut de paiement sur la seule foi d'un retour navigateur.
6. Construire le paquet iOS après vérification Web, tester dans le WKWebView réel sans désinstaller l'application.

## Scénarios manuels indispensables

- Premier paiement avec carte 4242... : case non cochée → paiement validé mais carte absente des cartes enregistrées.
- Deuxième paiement avec case cochée → carte présente dans Paramètres, Stripe PaymentMethod allow_redisplay=always.
- Devis/jalon suivant → carte enregistrée visible, confirmation du nouveau paiement obligatoire.
- Supprimer la carte depuis Paramètres → elle disparaît de Stripe et du prochain checkout.
- Deux comptes LYANN distincts → impossible de consulter, effacer ou récupérer la carte de l'autre membre.
- Refus d'authentification / session expirée → aucune méthode de paiement n'est divulguée.
- Tester 3DS, cartes refusées, double-clic, timeout, fermeture et réouverture de checkout.
- Contrôler les PaymentIntent et Webhooks Stripe : aucune double facturation, pas de changement du montant canonique, état des jalons cohérent.
- Sans migration, sans Customer Session ou avec Stripe indisponible → afficher le formulaire carte historique, sans promesse d'enregistrement.
- Vérifier Safari macOS, Safari iPhone, app iOS Capacitor, petit écran iPhone et clavier ouvert.
- Contrôler que les environnements test/live ne partagent pas de profil Stripe Customer.

## Avant production

- Audit sécurité des routes et évaluation des règles de conservation / suppression des données Stripe Customer à la fermeture d'un compte.
- Tests E2E sur infrastructure de test isolée. Le test statique du code n'atteste pas du succès des paiements.
- Décider si le libellé Stripe natif du consentement convient et ajuster la microcopie LYANN si nécessaire.
- Déploiement en production seulement après validation explicite.
