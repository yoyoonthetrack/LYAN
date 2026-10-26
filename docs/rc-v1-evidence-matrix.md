# LYANN — RC V1 / recette et preuves (26 octobre 2026)

## Règle de décision

**NO-GO** tant qu'un parcours essentiel n'a pas été validé en conditions Staging avec comptes et données réels, qu'un P0 ou un P1 critique reste ouvert, ou que le paquet exact exécuté sur Web/iOS/Android n'est pas traçable.

Aucun merge vers `main`, aucune activation Stripe Live, aucune modification de Production, aucun déploiement Production sans validation explicite du propriétaire. Les tests destructifs sont limités à des comptes et données de test de Staging.

## État vérifié / limites

- Référence source distante de départ : `feature/bokantaj-map-v1` @ `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20`.
- `main` @ `7c7757a6925bceb11ec86436289f5d1c7446f7f9`; branche fonctionnelle 239 commits devant main à cette date.
- Browser regressions : run `40245019023`, trois tests en échec (publication desktop/iPhone et GPS).
- Android touch : run `40245019065`, un test en échec (publication tactile Pixel), APK non compilé dans ce run.
- Les tests Playwright existants sur Bokantaj interceptent les appels réseau et remplacent `LYANN_AUTH_STATE`/`LYANN_API_CLIENT.createPost`. Ils sont des **tests UI simulés**, pas des preuves de persistance Supabase.
- Correction rapportée depuis le worktree local (champ quartier et zoom) **non intégrée** à cette branche distante. Ne pas qualifier ces correctifs de validés par CI.
- Version de bundle réellement installée sur appareils, TestFlight, Play Internal Testing, état du worktree local, migrations Staging et permissions effectives : **NON TESTÉ** depuis ce dépôt.

## Critères de preuve obligatoires pour chaque test end-to-end

1. Action réelle depuis le paquet identifié (SHA Git, hash bundle, ID de build et environnement cible).
2. État précédent et état suivant en base **Staging**, identifié par un ID de test non sensible.
3. Lecture de ce résultat depuis une **autre session utilisateur**, ou preuve d'isolation pour un test d'autorisation.
4. Preuve de permissions : refus pour le rôle interdit, réussite pour le rôle autorisé; vérification RLS et/ou API.
5. Capture, trace, logs corrélés, version et horodatage; données personnelles et tokens masqués.
6. Nettoyage maîtrisé des seuls objets tests sur Staging; ne jamais lancer de nettoyage Production.

Une capture de succès UI ne suffit pas. Un mock, une fixture, un test en mode `demo=true`, un retour HTTP synthétique ou une compilation seule ne remplissent pas ces critères.

## Matrice RC initiale (statuts au 26/10/2026)

| Domaine | Plateforme | Scénario / preuve attendue | État | Blocage |
| --- | --- | --- | --- | --- |
| Provenance | Web/iOS/Android | SHA exécuté, hash JS, backend, distribution, CI | NON TESTÉ | P0 |
| Auth | Web/iOS/Android | Inscription, login, OAuth, logout, expiration session, isolation | NON TESTÉ | P0 |
| Bokantaj publication localisée | Web desktop | Publication, DB, modération, autre membre | KO CI simulée / E2E NON TESTÉ | P1 |
| Bokantaj publication localisée | iOS viewport simulé | Champ quartier + publication | KO CI simulée / appareil NON TESTÉ | P1 |
| Bokantaj publication localisée | Android Pixel simulé | Champ quartier + publication | KO CI simulée / appareil NON TESTÉ | P1 |
| Carte et GPS | Web/iOS/Android | Approximation/exact, visibilité 7j, conservation posts/médias | KO CI GPS / E2E NON TESTÉ | P1 |
| Modération Bokantaj | Web/iOS/Android/Admin | Rejet/masquage et invisibilité carte/fil via autre compte | NON TESTÉ | P0 |
| Vidéo | Web/iOS/Android | 60s, transcodage, miniature, lecture sur demande, nettoyage | NON TESTÉ | P1 |
| Annonces | Web/iOS/Android | Création, réponse, recherche, clôture, autorisations | NON TESTÉ | P0 |
| Lyanneurs | Web/iOS/Android | Profil, recherche, contact, badges et droits | NON TESTÉ | P1 |
| Chat | Web/iOS/Android | Envoi, réception, pièces jointes, offline, reprise | NON TESTÉ | P0 |
| Notifications | Web/iOS/Android | Bell, push, permission, délivrance, ouverture | NON TESTÉ | P0 |
| Devis & jalons | Web/iOS/Android | Édition stable, acceptation, livraison, fonds | NON TESTÉ | P0 |
| Stripe Test | Web/iOS/Android | Paiement, webhook, idempotence, remboursement, échec | NON TESTÉ | P0 |
| Abonnements natifs | iOS/Android | Achat Sandbox, validation serveur, restore, expiration | NON TESTÉ | P0 |
| Profil & compte | Web/iOS/Android | Mise à jour, export et suppression complète | NON TESTÉ | P0 |
| Back-office | Admin 33 rubriques | Action + persistance + rôle + audit log pour chaque rubrique | NON TESTÉ | P0 |
| Sécurité | API/Supabase | RLS, médias privés, JWT, séparation environnements, secrets | NON TESTÉ | P0 |
| Résilience | Web/iOS/Android | Coupure réseau, double clic, reconnexion, relance application | NON TESTÉ | P1 |
| Distribution | iOS/Android physiques | TestFlight / Play Internal, GPS, caméra, push, clavier, rotation | NON TESTÉ | P0 |

### À remplir pour chaque cas réel

`ID | SHA + hash bundle + build | environnement + Supabase project ref | rôles A/B/Admin | étapes | ID en base avant/après | preuve A | preuve B | contrôle RLS | log serveur/webhook | verdict OK/KO/NON TESTÉ | priorité | correction | re-test`

## Plan d'exécution (ordre bloquant)

1. Récupérer `git status --porcelain=v1` et `git rev-parse HEAD` du vrai dossier `lyann-subscriptions`, comparer aux SHA GitHub ; ne rien écraser. Identifier les builds installés (CFBundleVersion/versionCode et empreinte des assets).
2. Reprendre **sans les perdre** les correctifs locaux du champ quartier et du zoom sur une branche RC, déclencher CI et analyser ses traces. Un timeout augmenté sans cause corrigée ne compte pas.
3. Configurer des comptes QA Staging distincts A, B, admin, rôle insuffisant et données préfixées `rcv1_`. Aucun identifiant ni token dans le dépôt.
4. Exécuter les parcours connectés : action UI → DB → lecture B → permissions → nettoyage. Capturer seulement des logs redigés, vérifier projet Supabase Staging `tdktfbtqceldlaeqjtow`.
5. Inventorier et tester les 33 rubriques admin une par une, avec rôle autorisé et interdit; noter toute action simulant un succès sans écriture réelle.
6. Faire passer les vérifications RLS, webhooks et idempotence Stripe **Test**. Les achats Apple/Google doivent être validés avec sandbox natif sur appareil.
7. Construire des versions identifiées de la même source, enregistrer leur hash, distribuer via TestFlight et piste interne Play puis effectuer les contrôles physiques.
8. Ne statuer GO qu'après CI verte, matrice de preuves complète, zéro P0/P1 critique et signature manuelle de la release candidate.

## Tests explicitement manuels

- iOS : TestFlight installé, achats App Store Sandbox/restore, caméra, GPS permission, push APNs, clavier et arrière-plan.
- Android : APK/AAB installé via piste interne, Play Billing sandbox/restore, FCM push, caméra, GPS, retour système, pause/reprise.
- Vérification des réglages des stores, confidentialité, achat/suppression de compte et conformité de fiche de publication.

## Preuves GitHub

- [Browser CI échouée](https://github.com/yoyoonthetrack/LYAN/actions/runs/40245019023)
- [Android CI échouée](https://github.com/yoyoonthetrack/LYAN/actions/runs/40245019065)

Ce rapport est une **matrice de départ**, pas une certification de fonctionnement.
