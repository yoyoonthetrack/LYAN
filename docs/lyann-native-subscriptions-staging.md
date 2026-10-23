# Abonnements natifs LYANN — préparation Staging

## État livré
Intégration directe StoreKit / Google Play Billing via @capgo/native-purchases 8.9.6 (Capacitor 8), sans compte ni service de facturation Capgo.
Vérification Apple via @apple/app-store-server-library 3.1.0 ; Google via google-auth-library 11.3.1 et Android Publisher subscriptionsv2.
Aucun produit n'existe encore dans les consoles (confirmation du propriétaire). Aucun achat ni secret magasin configuré dans ce lot.
Les achats sont donc désactivés. Ce code refuse Production et n'accepte que Sandbox Apple / achats Google de test.

- Prix affichés depuis les produits du magasin, pas depuis un montant envoyé par le navigateur.
- Formules mensuelles sans essai, promotion, engagement annuel ni partage familial dans cette première intégration.
- Achat lié à un identifiant aléatoire de compte de facturation LYANN ; aucun e-mail envoyé au magasin comme identifiant.
- Validation distante de l'état courant avant inscription atomique des droits. Un reçu signé ancien ne suffit pas à réactiver un abonnement.
- Restauration et reprise des transactions non finalisées ; iOS n'est finalisé qu'après confirmation serveur. Google est acquitté côté serveur après persistance.
- Le serveur conserve uniquement une empreinte du jeton Google / de la chaîne Apple, jamais le reçu brut ou le jeton Google.
- Notifications Apple signées et notifications Google authentifiées par OIDC ; elles relisent l'état courant du magasin.
- Notifications réessayées sans multiplier les droits ; contrôle des réponses arrivées dans le désordre et attribution à un seul compte.
- Abonnement déjà actif : nouvel achat masqué, boutons Restaurer / Gérer disponibles. Un abonnement Stripe existant est bloqué pour examen manuel, sans action Stripe.
- Aucun abonnement Entreprise, aucun achat Web. Paiement des missions physiques inchangé.

Migration 86 : tables privées store_accounts/store_subscriptions et deux RPC service_role uniquement. Aucun droit direct anon/authenticated.
La migration est appliquée seulement sur tdktfbtqceldlaeqjtow.

## Produits à créer par le propriétaire

Les identifiants ci-dessous sont **proposés, pas créés**. Ils peuvent être retenus avant toute création ; certains identifiants deviennent immuables dans les consoles.

| Magasin | Formule | Identifiant proposé | Période | Prix France visé |
|---|---|---|---|---|
| App Store | Plus | app.lyann.plus.monthly | 1 mois | 7,90 € |
| App Store | Pro | app.lyann.pro.monthly | 1 mois | 19,90 € |
| Google Play | Plus | lyann_plus | base plan monthly, renouvellement mensuel | 7,90 € |
| Google Play | Pro | lyann_pro | base plan monthly, renouvellement mensuel | 19,90 € |

Application attendue : app.lyann.mobile. Confirmer ce Bundle ID / package dans les consoles avant création.

### Apple
1. App Store Connect → LYANN → Monétisation → Abonnements.
2. Créer un groupe LYANN ; créer Plus et Pro mensuels, dans ce même groupe.
3. Ordre de service : Pro au niveau supérieur (niveau 1), Plus en dessous (niveau 2).
4. Désactiver le partage familial ; aucune offre introductive ni engagement annuel pour ce premier lot.
5. Localiser les noms et descriptions. Décrire uniquement les fonctionnalités déjà disponibles : ne pas promettre les vidéos du portfolio ni des factures comptables réelles.
6. Configurer les prix de référence et territoires ; le prix réellement proposé sera celui renvoyé par Apple.
7. Compléter les informations de revue et captures, les accords nécessaires et créer un compte Sandbox.
8. Créer une clé App Store Server API avec les droits requis ; déposer la clé privée, son Key ID et l'Issuer ID uniquement dans les secrets Staging.
9. Configurer App Store Server Notifications V2 pour Sandbox sur la passerelle Staging : /v1/store/notifications/apple. Ne pas modifier l'URL Production.
10. Envoyer une notification TEST, puis valider les scénarios Sandbox avant de déclarer le canal prêt.

### Google
1. Play Console → LYANN → Monétiser → Produits → Abonnements.
2. Créer lyann_plus et lyann_pro ; base plan monthly renouvelable automatiquement sur un mois. Aucune offre promotionnelle pour ce lot.
3. Configurer les prix, territoires et l'accès de test ; utiliser la piste interne et des testeurs de licence.
4. Configurer un compte de service autorisé à consulter et acquitter les abonnements ; déposer ses credentials uniquement dans les secrets Staging.
5. Configurer Real-time developer notifications via Pub/Sub avec une souscription push **authentifiée** vers /v1/store/notifications/google.
6. Renseigner l'audience OIDC exacte et l'e-mail exact de l'identité push autorisée ; configurer les permissions d'émission de jetons nécessaires.
7. Tester le canal. Le serveur refuse les achats qui n'ont pas le marqueur testPurchase de Google.

Ne pas acheter avec un compte de paiement réel pour tester ce lot. La protection serveur rejette un achat réel mais ne peut pas empêcher le magasin de facturer un compte mal configuré.

## Configuration serveur (Staging uniquement)
- LYANN_STORE_TEST_PURCHASES_ENABLED : laisser false jusqu'à la validation du dispositif de test.
- LYANN_APPLE_PRODUCTS : {"PLUS":{"productId":"app.lyann.plus.monthly"},"PRO":{"productId":"app.lyann.pro.monthly"}}
- LYANN_GOOGLE_PRODUCTS : {"PLUS":{"productId":"lyann_plus","basePlanId":"monthly"},"PRO":{"productId":"lyann_pro","basePlanId":"monthly"}}
- LYANN_APPLE_ISSUER_ID, LYANN_APPLE_KEY_ID, LYANN_APPLE_PRIVATE_KEY.
- LYANN_APPLE_ROOT_CERTIFICATES : tableau JSON des certificats racines DER Apple encodés en base64, obtenus depuis https://www.apple.com/certificateauthority/ et contrôlés. Aucun certificat fourni par le client n'est accepté comme racine de confiance.
- LYANN_GOOGLE_SERVICE_ACCOUNT : JSON de credentials privés.
- LYANN_GOOGLE_PUSH_AUDIENCE et LYANN_GOOGLE_PUSH_EMAIL.
- LYANN_APPLE_NOTIFICATIONS_READY et LYANN_GOOGLE_NOTIFICATIONS_READY : true seulement après contrôle de livraison du canal concerné.

Les notifications TEST doivent pouvoir être reçues avant d'activer les achats. Pour le premier diagnostic du canal, configurer la préparation des notifications puis effectuer le test immédiatement ; revenir à false en cas d'échec.
Ne pas coller les clés dans Git, les issues, les journaux ou la conversation.
La passerelle doit être joignable par les magasins ; la protection de la Preview n'est pas modifiée par ce lot. Utiliser un déploiement Staging validé avant de saisir son URL dans les consoles.
Requiert Node >=22. Les dépendances ajoutées sont épinglées ; le dépôt continue d'ignorer package-lock.json selon sa configuration existante.

## Validation iPhone / Android physique
1. Vérifier la branche feature/bokantaj-map-v1, construire en Staging, puis npx cap sync ios / android.
2. Xcode : vérifier la signature, le Bundle ID et la capacité In-App Purchase. Les achats Xcode locaux ne sont pas acceptés par ce serveur ; utiliser Sandbox/TestFlight.
3. Se connecter au compte LYANN de test, ouvrir Tarifs ou Mon activité. Vérifier les prix mensuels reçus du magasin.
4. Annuler un achat : aucun changement de droits ; aucun deuxième écran de paiement après double appui.
5. Acheter Plus en Sandbox/licence de test : badge Lyanneur Plus et droits serveur. Pro ne devient Vérifié qu'après l'examen séparé du dossier.
6. Couper le réseau après paiement et avant confirmation ; rouvrir Mon activité ou utiliser Restaurer mes achats. Les droits doivent apparaître sans nouvel achat.
7. Restaurer après réinstallation avec le même compte LYANN ; essayer avec un autre compte LYANN : aucune réattribution.
8. Renouvellement accéléré, annulation de renouvellement, expiration et remboursement : vérifier notifications et retrait des droits à l'échéance/au remboursement.
9. Google : achat pending puis validé, acknowledgment ; iOS : transaction non finalisée puis reprise.
10. Contrôler le paiement par étape en Gratuit et les demandes client illimitées, sans paiement Live.

## Tests et limites
Tests Node : normalisation des réponses des magasins, refus Production et mauvais compte, JWS falsifié refusé par la bibliothèque Apple réelle, droits atomiques, erreurs serveur, absence d'acquittement prématuré, restauration et reprise sans rachat.
Tests navigateur 390/1280 avec plugin natif et API simulés, réseau externe bloqué ; tests SQL Staging avec ROLLBACK et PostgreSQL local jetable.

Pas encore validés : achat réel Sandbox, signature d'un reçu Apple authentique de LYANN, réception d'une notification réelle, binaire Xcode ou téléphone physique.
Les secrets et produits manquent ; la livraison n'est pas une ouverture commerciale.
Les changements de formule avec prorata dans l'application ne sont pas implémentés. Utiliser Gérer ; ne pas ouvrir deux abonnements sur deux magasins.
Pas de réconciliation périodique des magasins dans ce lot : les notifications et Restaurer assurent la mise à jour ; expiration serveur toujours appliquée. La supervision et la réconciliation doivent être prévues avant ouverture commerciale.
Les vidéos du portfolio et la conformité fiscale des factures restent des chantiers distincts.

La réponse à Apple 2.1(b) devra décrire la version effectivement soumise. Ne pas déclarer les achats natifs opérationnels avant ces tests. Aucun message envoyé à Apple dans ce lot.
