# LYANN — Plans et parcours Pro (Staging, 23 octobre 2026)

Branche : `feature/bokantaj-map-v1`. Aucun changement de Production, Stripe Live ou main.

## Formules retenues
| Fonction | Gratuit | Plus — 7,90 €/mois | Pro — 19,90 €/mois | Entreprise |
|---|---|---|---|---|
| Bokantaj, annonces, carte, messagerie, favoris, avis | Oui | Oui | Oui | Bientôt |
| Paiement par étape | Oui | Oui | Oui | Bientôt |
| Missions prestataire (cible, quota non activé) | 2/mois | Illimitées | Illimitées | Sur contact |
| Demandes de service (cible) | Illimitées | Illimitées | Illimitées | Sur contact |
| Portfolio (cible) | 5 photos | 20 photos, 1 vidéo | 50 photos, 3 vidéos | Sur contact |
| Catégories (cible) | 1 | 3 | 5 | Sur contact |
| Badge de formule | — | Lyanneur Plus | Pro | — |
| Vérification documentaire | — | — | Après contrôle humain | — |
| Vitrine permanente | — | — | 1, après validation | — |
| Suivi / CSV / documents PDF | Historique existant | Historique existant | Espace professionnel | — |
| Souscription dans cette version | Gratuit | Désactivée | Désactivée | Nous contacter |

La règle est confirmée : deux missions par mois comme prestataire en Gratuit ; demandes illimitées comme client. Les contrôles serveur sont installés pour les missions, photos et catégories, avec activation de test par compte pendant 24 heures. L’activation générale reste désactivée tant que les achats ne sont pas disponibles. Les limites vidéo restent une cible : le parcours vidéo du portfolio n’est pas activé.

## Parcours réellement livré
- Page tarifs, quatre cartes, détails, Entreprise grisée avec contact actif, espace Partenariat.
- `professional.html` : identité entreprise, SIRET, représentant, activité, justificatifs PDF/JPEG/PNG (2 Mo), envoi, statut, motif de correction/refus, téléchargement privé.
- Pro actif requis pour déposer. Expiration de formule ne supprime pas les documents ni l'accès du propriétaire.
- Construction : immatriculation, RC professionnelle, décennale. Activité réglementée : immatriculation, qualification, assurance. Cas général : immatriculation. Le contrôle humain doit vérifier leur pertinence à l'activité réelle.
- `business-admin.html` : files dossiers/vitrines/contacts, consultation des pièces, validation, demande de complément, refus, suspension, historique. Permissions distinctes ; auto-validation interdite ; contrôle de version.
- Bucket privé `lyann-pro-private`, aucun lien public. RLS et tables privées réservées au backend. Téléchargement authentifié en pièce jointe.
- Vitrine : horaires, fermetures, promotion datée, téléphone, position explicite, quatre photos maximum issues du portfolio public déjà modéré. Toute modification repasse en modération. Repère indépendant des Bokantaj temporaires. Visibilité conditionnée à Pro actif et documents approuvés non expirés. Avis calculés sur des missions attribuées au prestataire et rédigés par le demandeur.
- Suivi mensuel missions/paiements et export CSV en centimes, protection contre les formules de tableur.
- Factures de test d'acompte/solde, avoir intégral, PDF, numérotation par entreprise/année, idempotence et données immuables. Le client et l'émetteur conservent l'accès aux PDF.
- Chaque PDF affiche **STAGING — DOCUMENT DE TEST SANS VALEUR COMPTABLE**. Aucun débit ou transfert déclenché.
- Terme visible « jalon » remplacé par « paiement par étape » ; identifiants techniques historiques conservés.
- Accès Plus/Pro de test pour 24 h uniquement depuis le back-office avec permission `settings.manage`. Ne remplace pas un abonnement d'un autre fournisseur.

## Base Staging
Migrations appliquées exclusivement à `tdktfbtqceldlaeqjtow` :
- `78_lyann_plans_pro_workflow.sql`
- `80_lyann_business_places.sql`
- `81_lyann_business_invoices_staging.sql`

Le numéro 79 est volontairement absent : le brouillon de quotas n'est pas livré.
Tests SQL transactionnels annulés par ROLLBACK : droits anon/authenticated, audit des décisions, facturation 30+70 sur mission de 100, idempotence, refus de sur-facturation, immutabilité, avoir intégral, bornes géographiques. Aucune donnée utilisateur ni aucun média supprimé.

## Validation reproductible
- `npm test` : audits architecture.
- `node --test tests/business-workflow.test.js tests/payment-quote-type.test.js tests/phase635-milestone-editor.test.js` : 24 tests.
- `node tests/business-browser.cjs` : Chromium 390 et 1280 px, tarifs, détails, contacts, session workspace. API simulée ; réseau externe bloqué.
- Build mobile avec configuration Staging factice non secrète : artefacts Web/iOS/Android identiques. Ce contrôle ne valide ni une connexion réelle ni un binaire Xcode.
- Trois tests préexistants échouent aussi au commit de départ de67b466 : `quote-context-selection` (texte Plusieurs demandes), `quote-payment-eligibility` (appendFundingAction, providerFundsSecuredNote). Ils ne sont pas présentés comme corrigés.

## Limites avant ouverture commerciale
1. Configurer les produits et la vérification serveur Apple/Google, restauration, annulation, renouvellement et notifications avant d'activer l'achat. La facturation de services réels et l'achat d'un abonnement numérique sont des parcours distincts. Ne pas déclarer à Apple une intégration IAP qui n'existe pas.
2. Activer ensuite les quotas serveur déjà installés (actuellement réservés aux comptes de test sélectionnés), migrer les droits historiques, distribuer les badges authentifiés sur toutes les surfaces de profils. Le badge Vérifié du parcours Pro exige déjà les pièces validées ; les anciens badges de profil ne sont pas encore unifiés.
3. Valider les mentions fiscales, TVA, règles de facturation/avoirs et obligations de facturation électronique avant d'émettre une facture réelle. Le CSV est un export d'activité, pas une comptabilité certifiée.
4. Définir conservation, purge revue et analyse antivirus des justificatifs. Les signatures de fichier sont contrôlées ; cela ne remplace pas une analyse antivirus. Pas de suppression automatique ajoutée.
5. Prévoir vérification registre SIRENE, notifications de renouvellement/expiration et traitement opérationnel des contacts. Le SIRET n'est pas validé auprès du registre. Aucun email envoyé automatiquement.
6. Optimiser les jointures de lecture des vitrines pour un grand volume. Résultats carte limités à 100.
7. Factures listées par 100 ; l'export mensuel refuse de tronquer silencieusement au-delà de 10 000 lignes.
8. Les vidéos du portfolio et l'assistance prioritaire restent des objectifs de formule, pas de nouveaux services activés par ce lot.

## Test sur iPhone physique
Depuis `/Users/mac/Developer/lyann`, vérifier la branche et un arbre propre avant de récupérer le commit. Utiliser la configuration Staging existante, jamais une clé de service dans l'application :
```sh
git branch --show-current
git status --short
git pull --ff-only origin feature/bokantaj-map-v1
npm install
LYANN_RUNTIME=staging LYANN_STAGING_PUBLIC_ORIGIN=https://staging.lyann.app node -r ./scripts/force-staging-v2-env.js build_mobile.js &&
npx cap sync ios &&
npx cap open ios
```
Le domaine Staging doit servir le commit testé et pointer sur tdktfbtqceldlaeqjtow avant ce test.
- Sur iPhone : tarifs et contact Entreprise/Partenariat ; clavier, défilement, fermeture et retour.
- Sans Pro : dépôt refusé ; aucun achat lancé.
- Avec accès Pro de test : photo/PDF depuis Fichiers, fichier trop lourd/type incorrect refusés, envoi, correction, nouvel envoi.
- Avec un autre administrateur : lecture de pièce, validation ; deux onglets ne doivent pas écraser la décision.
- Vitrine : géolocalisation refusée/acceptée, placement manuel, photos approuvées, modération puis visibilité sur carte ; aucun Bokantaj normal ne devient permanent.
- Suivi : sélection de mois, téléchargement CSV/PDF, acompte puis solde et avoir. Vérifier les téléchargements/partage dans WKWebView ; comportement physique non validé ici.
- Expiration d'accès : plus de dépôt/vitrine visible, anciens documents encore téléchargeables par le propriétaire.
- Paiement par étape : parcours existant accessible en Gratuit et libellé lisible.


### Badges serveur
Les badges sont désormais raccordés aux droits actifs et aux justificatifs approuvés sur les surfaces principales. Voir [règles, limites et validation iPhone](lyann-badges-subscriptions-staging.md). Les achats natifs restent désactivés.


### Achats natifs en préparation
Le plugin et les parcours achat/restauration/vérification serveur sont intégrés mais désactivés. Les produits des magasins ne sont pas encore créés. Voir [création des produits et validation physique](lyann-native-subscriptions-staging.md). Aucun achat réel ni ouverture commerciale.
