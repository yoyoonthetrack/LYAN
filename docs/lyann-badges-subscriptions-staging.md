# Badges et abonnements — Staging

Ce lot raccorde les badges aux tables privées de droits et de dossiers, sans ouvrir les achats.

## Règles
- Gratuit : aucun badge commercial.
- Plus actif : **Lyanneur Plus**.
- Pro actif : **Pro**, puis **Vérifié** si le dossier est approuvé, contient tous les documents requis pour l'activité et si toutes les pièces sont approuvées et valides.
- Expiration ou révocation : retour Gratuit à la prochaine lecture.
- Suspension du dossier ou expiration d'une pièce : le badge Vérifié disparaît ; Pro reste tant que l'abonnement est actif.
- Aucun badge n'est déduit du champ de profil modifiable is_pro, d'un ancien KYC ou d'un cache local d'abonnement.
- En cas d'échec de lecture, les badges restent neutres.

Migration 85 appliquée uniquement sur tdktfbtqceldlaeqjtow. RPC publique limitée à 100 identifiants déjà présents dans public_profiles ; réponse limitée à user_id, plan, verified et une validité de présentation de 30 secondes maximum. Aucune identité légale, pièce, date d'abonnement, référence de paiement ou décision administrative n'est exposée. Les droits d'accès restent vérifiés côté serveur : un badge ne donne aucune permission.

Surfaces raccordées : profil complet, profil rapide, compte/menu, explorateur, auteurs d'annonces, contacts de messagerie et libellés du matching/recherche. Les données sont chargées par lots. Les caches existants restent de 30 secondes ; un écran déjà affiché nécessite un rafraîchissement pour refléter une décision administrative. Au nouveau rendu, une réponse expirée est masquée.

## Tests
- 30 tests Node ciblés : règles des formules, dossiers, API, paiement par étape et badges.
- PostgreSQL 18 local jetable : permissions, lecture anonyme minimale, plafonnement des lots, expiration, pièces manquantes/date invalide ; concurrence des quotas maintenue.
- Tests SQL Staging intégralement annulés par ROLLBACK, sans compte fictif persistant.
- Audits architecture et navigateur tarifs/espace Pro 390 et 1280 px.
- Construction mobile avec configuration Staging et clé factice : ne constitue pas un test Xcode ni iPhone physique.

## Validation iPhone physique
1. Construire depuis la branche feature/bokantaj-map-v1 avec la configuration Staging ; vérifier tdktfbtqceldlaeqjtow avant connexion.
2. Avec un compte test Gratuit, ouvrir profil, explorateur, annonce et menu : aucun badge Pro/Vérifié, même si un ancien indicateur existe.
3. Depuis business-admin, donner l'accès Plus de test : après rafraîchissement, Lyanneur Plus.
4. Donner l'accès Pro de test : Pro sans Vérifié avant examen du dossier.
5. Envoyer les pièces, faire approuver par un autre administrateur autorisé : Pro · Vérifié.
6. Suspendre le dossier puis rafraîchir : Pro uniquement. Vérifier la restitution du badge après nouvelle approbation valide.
7. Tester hors réseau : aucune nouvelle attribution ; après reconnexion, rafraîchir les données.
8. Contrôler les documents privés depuis un autre compte et le fonctionnement du paiement par étape en Gratuit, sans paiement Live.

## Prochain lot : achats natifs
Le dépôt ne contient pas de plugin d'achat StoreKit/Google Play. Aucun connecteur App Store Connect/Google Play n'est disponible dans cette session. Les achats, la restauration commerciale et le blocage général des quotas restent désactivés.

À configurer dans les consoles pour app.lyann.mobile :
- Un groupe d'abonnements iOS avec les deux produits mensuels Plus et Pro ; produits Android équivalents, essais et changements de formule explicitement décidés.
- Les identifiants exacts des produits et applications, leurs environnements de test et comptes testeurs. Ne pas inventer des identifiants dans le code.
- Les accès serveur nécessaires déposés dans le gestionnaire de secrets Staging, jamais dans Git ni dans une conversation.
- Notifications Apple et Google authentifiées, traitement idempotent et restauration des achats liés au compte LYANN.
- Validation serveur du produit, de l'application, de l'environnement et de la transaction avant attribution ; achat annulé, expiré ou remboursé ne donne aucun droit.
- Prix affichés depuis les magasins ; 7,90 € et 19,90 € sont les tarifs visés, soumis aux prix configurés dans chaque pays.
- Tests Sandbox/TestFlight et piste interne Android avant activation.

La demande Apple 2.1(b) doit décrire le comportement réellement soumis. Ne pas déclarer les achats natifs disponibles tant qu'ils ne le sont pas. Les abonnements débloquent des fonctionnalités numériques ; les paiements des missions physiques sont un parcours distinct. Ne pas présenter Plus/Pro individuels comme une offre réservée aux entreprises. Aucun message envoyé à Apple dans ce lot.
