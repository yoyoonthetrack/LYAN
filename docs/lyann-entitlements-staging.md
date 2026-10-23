# Droits des formules — Staging

## Règles confirmées
| Droit | Gratuit | Plus — 7,90 €/mois | Pro — 19,90 €/mois |
|---|---|---|---|
| Missions comme prestataire | 2 par mois | Illimitées | Illimitées |
| Demandes comme client | Illimitées | Illimitées | Illimitées |
| Paiement par étape | Oui | Oui | Oui |
| Photos du portfolio | 5 | 20 | 50 |
| Catégories actives des services | 1 | 3 | 5 |
| Vidéos du portfolio (cible, parcours désactivé) | 0 | 1 | 3 |
| Vérification documentaire | Non | Non | Après examen humain |

Entreprise reste « Bientôt disponible », avec contact actif. Aucun achat n'est activé par ce lot.

## Comptage
- Une mission réserve une place quand elle est acceptée. Les candidatures/devis et les demandes ne consomment pas de place.
- Annulation avant démarrage : place libérée. Après démarrage : consommation conservée.
- Réactivation d'une mission annulée avant démarrage : nouveau contrôle de capacité, sans contournement du quota.
- Suppression d'une mission : ne remet pas le compteur à zéro. Son identifiant ne peut pas être recyclé.
- Le mois est calendaire en UTC ; remise à zéro à 00:00 UTC le premier du mois. La date fournie par le client n'influence pas le compteur.
- Les missions acceptées avant l'installation des contrôles sont conservées sans reconstitution approximative de leur date d'acceptation. Les nouvelles acceptations sont comptées depuis l'installation, même si leur contrôle n'est pas encore activé.
- Les photos privées et publiques du portfolio comptent toutes. Une modification de légende reste possible après baisse de formule ; aucun fichier n'est supprimé.
- Plusieurs services de la même catégorie ne consomment qu'une catégorie. Les services inactifs ne comptent pas ; leur réactivation est contrôlée. La clé canonique est category_id quand présent, sinon category normalisé.
- Après expiration/révocation : droits Gratuit. Une résiliation en fin de période conserve les droits jusqu'à expires_at.
- Contenus existants conservés après baisse de formule. Nouveaux ajouts limités ; aucun nettoyage destructif.
- Le badge Vérifié dépend toujours du dossier documentaire validé et de sa validité. La diffusion des badges authentifiés sur toutes les surfaces reste un lot distinct.

## Mise en service contrôlée
Migrations **82, 83 et 84** appliquées uniquement à Supabase `tdktfbtqceldlaeqjtow`.
Le blocage général reste **désactivé** : `lyann_entitlement_rollout.enforce_all=false`.
Le back-office permet à un administrateur disposant de `settings.manage` d'activer les limites pendant 24 heures pour un compte sélectionné, ou de retirer ce mode. Cela ne crée ni abonnement ni paiement.
Les changements de mode sont audités avec l'identité administrative côté serveur. Le navigateur ne peut modifier ni les limites, ni le mode de test, ni son abonnement.

- `GET /v1/business/rights` : droits et consommation de la session authentifiée.
- `POST /v1/admin/business/quota-test` : activation de test pour un compte, strictement Staging.
- RPC `lyann_my_entitlements()` : lecture privée des droits de soi-même ; accès anonyme interdit.
- RPC `lyann_sync_profile_skills(uuid,text[])` : remplacement atomique des compétences du propriétaire. Un refus de quota annule tout le changement, y compris les suppressions intermédiaires. Les services tarifés ne sont pas supprimés.
- Les déclencheurs SQL contrôlent aussi les écritures directes Supabase et les RPC existantes : masquer les contrôles du navigateur ne suffit pas à les contourner.
- Vérification préalable avant upload d'une photo, puis contrôle définitif à l'enregistrement. Ce précontrôle n'est pas une réservation : un conflit peut laisser un fichier privé non rattaché, à traiter par la politique de conservation existante, sans suppression automatique ajoutée.

## Validation
- `npm test` : audits d'architecture.
- `node --test tests/business-workflow.test.js tests/payment-quote-type.test.js tests/phase635-milestone-editor.test.js` : 26 tests.
- `node tests/business-browser.cjs` : Chromium 390/1280 px, tarifs, contact, session et compteurs de droits.
- `tests/entitlements-staging.sql` : fixtures dans une transaction intégralement annulée ; missions, annulations, réactivation, suppression, changement de mois, expiration, photos, catégories, contrôle d'accès et sauvegarde atomique.
- `node tests/entitlements-concurrency.cjs` : PostgreSQL local sur 127.0.0.1:55432, rôle rights_test. Crée et supprime une base dédiée. Deux écritures concurrentes pour la dernière place : une seule réussit pour les missions, photos et catégories.
- Le schéma local est une fixture minimale pour ces déclencheurs ; les tests transactionnels sur Staging vérifient également le schéma réel.
- Workflow GitHub `Plan rights on isolated PostgreSQL` : PostgreSQL 18 jetable, aucun secret ni accès Supabase. Le mot de passe local_test_only est un identifiant de test éphémère, pas un secret de déploiement.
- Aucun compte fictif persistant créé sur Staging. L'essai de création persistante a été refusé par la revue automatique ; les tests de concurrence ont été déplacés localement.

## Validation manuelle sur iPhone
1. Depuis le back-office Staging, sélectionner un compte QA et activer ses limites pendant 24 heures. Vérifier sa formule dans l'espace professionnel.
2. Gratuit : accepter deux missions comme prestataire. Faire accepter une troisième par le client : refus explicite, aucun devis partiellement accepté.
3. Annuler avant démarrage, puis vérifier qu'une nouvelle acceptation devient possible. Après démarrage, une annulation ne doit pas libérer de place.
4. Vérifier que les demandes de service comme client restent possibles et que le paiement par étape demeure accessible.
5. Vérifier la sixième photo et la deuxième catégorie : refus, contenus existants conservés. Un changement de compétences refusé doit laisser le profil inchangé.
6. Accorder un accès Plus/Pro de test depuis le back-office et actualiser les droits. Le quota doit venir du serveur, sans achat réel.
7. Tester expiration/révocation dans l'environnement de QA prévu, sans modifier un abonnement réel. Vérifier le retour aux droits Gratuit et la conservation des contenus.
8. Retirer le mode de test à la fin. Les limites générales et les achats restent désactivés.

Les achats Apple/Google, les vidéos du portfolio, les badges sur toutes les surfaces et l'activation commerciale ne sont pas inclus dans ce lot. La facturation reste marquée « document de test ».
