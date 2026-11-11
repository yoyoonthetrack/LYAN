# LYANN — Phase 3.2A : correction des bugs fonctionnels (favoris, filtres carte, photo de réalisation)

Branche : `feature/v3-2a-functional-fixes` (depuis `feature/results-v3-1c-visual` @ `a880cc1`).
Environnement : Supabase Staging `tdktfbtqceldlaeqjtow` uniquement. Aucune migration, aucun déploiement, aucune modification de RLS, de modération, de Stripe ou de l'authentification.

## Causes racines

### Bug 1 — Favoris Lyanneurs absents de « Mes favoris »
- L'enregistrement fonctionnait (cœur, `user_favorites`, RLS propriétaire : insertion et lecture vérifiées).
- `LyannFavoritesService.getHydratedFavorites()` relisait chaque Lyanneur dans la table `profiles`, dont la lecture est réservée au propriétaire (politique « Users can view own profile or admins view all »). Pour le profil d'un autre membre la requête renvoyait `null`, et la boucle **omettait le favori en silence** (`Inaccessible favorite omitted`). Résultat : base correcte, liste vide, compteur à `(0)`.
- Même défaut, plus discret, pour l'auteur d'une publication Bokantaj favorite (jointure directe sur `profiles`).
- Reproduit dans un vrai navigateur sur l'ancien code (liste vide + compteur 0) puis corrigé.

### Bug 2 — Catégories de la carte qui se (dé)sélectionnent seules
- Le brouillon de sélection était initialisé avec **les 8 familles**, et la puce « Toutes » n'allumait aucune puce individuelle. Un clic sur « Plomberie » retirait donc Plomberie de la liste complète : l'écran affichait alors les **7 autres familles** actives et Plomberie éteinte.
- La bascule capturait en outre `draft` au moment du rendu (fermeture figée) et rattachait un écouteur à chaque puce recréée.
- Reproduit en Chromium et WebKit sur l'ancien code (clic Plomberie → 7 autres actives ; 24 clics rapides → état incohérent ; badge « 6 » au lieu de « 2 »).

### Bug 3 — Photo de réalisation « en cours de vérification » sans fin
Trois causes, toutes démontrées :
1. **Fichier > 5 Mio jamais lu par la modération** (`downloadMedia` renvoie `null` au-delà de 5 Mio). Sur Staging : photo de 5,78 Mio → `retry/media_unreadable` ×2 puis `held/media_unreadable` après 3 tentatives, libération restée `pending` : la passerelle sert indéfiniment l'image « Photo en cours de vérification ». Une petite photo témoin est approuvée en 11 s. Aucun redimensionnement n'existait pour les réalisations (alors qu'il existe pour Bokantaj et les avatars).
2. **Aucun suivi côté interface** : après l'envoi, la `<img>` gardait le visuel d'attente même après l'approbation, sans actualisation.
3. **Cache de profil (30 s) non invalidé** après ajout/suppression : la nouvelle réalisation n'apparaissait pas. De plus, l'erreur d'insertion était ignorée : le toast « en cours de vérification » s'affichait même si la ligne n'existait pas.

## Correctifs

| Bug | Correctif |
|---|---|
| 1 | Hydratation via la vue publique `public_profiles` (colonnes réellement exposées), auteur Bokantaj via la même vue. Un seul système de favoris conservé. |
| 2 | Règle unique : sélection explicite, vide = « Toutes » ; helpers purs `toggleFamilySelection` / `effectiveFamilyFilter` / `canonicalFamilySelection` ; un seul écouteur délégué qui lit l'état au clic ; brouillon vide à l'ouverture ; « Effacer » = vide. |
| 3 | `LYANN_IMAGE_PREPARE` : décodage (rotation EXIF), côté max 2048 px, JPEG ≤ 4 Mio (sous la limite de 5 Mio), retrait des métadonnées (dont position GPS), refus clair du HEIC et des non-images. Insertion vérifiée (message d'erreur / quota). Invalidation du cache de profil. Suivi du statut : attente → publiée (image rechargée) / refusée (message + consigne) / vérification longue (> 5 min, message + suppression et reprise). La modération n'est jamais contournée : le client ne lit que la réponse publique de la passerelle média. |

## Fichiers modifiés
- `api-client.js`, `script.js`, `explorer-ui.js`, `needs-map-category-families.js`
- Tests : `tests/needs-map-category-families.test.js` (étendu), `tests/v32a-functional-fixes.test.js` (nouveau)
- Preuves : `scripts/v32a-favorites-staging.js`, `scripts/v32a-portfolio-staging.js`, `scripts/v32a-browser-staging.js`
- Commit précédent sur la branche : correctif image du back-office « À la une » (`71fa3c4`).

## Résultats de test

Vérifié sur code local (sans réseau) :
- `needs-map-category-families.test.js`, `v32a-functional-fixes.test.js`, `explorer-annonces-ux`, `needs-map`, `results-v3`, `results-v31c`, `ux-corrective`, `approx-zone-v2` : OK.
- Suite complète `tests/*.test.js` : 133 tests, 26 non OK, **tous identiques sur les sources d'origine** (échecs préexistants dépendants de l'environnement : post-transfer / admin / chat / staging-v2-blockers, aucun ne référence les fichiers modifiés).

Vérifié contre Staging (comptes QA, navigateur simulé, pas un appareil) :
- Favoris, RLS et isolation A/B : `v32a-favorites-staging.js` 9/9.
- Cycle de vie réel d'une photo (avant correctif) : petite → `done/approved` en 11 s ; 5,78 Mio → `held/media_unreadable`.
- Navigateur, ancien code (`--baseline`) : favoris 5/10, carte 7/16 (cas initiaux reproduits), réalisation « grosse » en échec.
- Navigateur, code corrigé : Chromium profil Android 390×844 **38/38** ; WebKit profil iPhone 390×844 **45/45** (favoris, carte, réalisation petite et grosse 5,78 → 1,9–2,8 Mio, cas limites HEIC/PDF/refus/lenteur) ; WebKit 430×932 favoris + carte **25/25**.
- `npm run staging-v2:verify` : PASS (isolation Staging, Stripe `sk_test`, aucune écriture).
- Playwright `explorer_*` et `annonce_card_structure` contre l'API locale branchée sur Staging : 7 passés, 0 échec, 5 ignorés (conditions d'environnement des specs).

Vérifié sur un véritable appareil : **non réalisé**. Aucun test physique n'a été fait dans cette phase ; le build iOS 16 embarque l'ancien code.

Captures : `artifacts/phase-3-2a/` (`baseline-*` avant, `fixed-*` après ; `portfolio-etats-refus-et-lenteur.png` est un harnais synthétique des états de carte, pas une capture réelle).

## Sécurité
- Aucune écriture sur Production ; Staging uniquement (`mustStaging`, `force-staging-v2-env`).
- RLS inchangée ; isolation vérifiée : un second compte ne lit, n'écrit ni ne supprime les favoris d'autrui.
- Modération inchangée côté serveur ; pas de publication automatique ; une photo non vérifiée reste derrière le visuel d'attente.
- Données QA créées puis supprimées : 1 favori `PROFILE`, 6 réalisations « QA 3.2A » (+ objets Storage, jobs, libérations). Contrôle final SQL : 2 favoris `PROFILE`, 1 réalisation, 1 objet, 1 job, 1 libération (état initial).

## Points d'attention (hors périmètre, non modifiés)
1. **Déploiement requis** pour que les corrections soient visibles : déploiement Web Staging (navigateur) **et** nouveau build iOS (le bundle embarqué contient `api-client.js` et `script.js`). Non fait (interdit pendant la phase).
2. Les objets du bucket `portfolio-images-hold` ne peuvent pas être supprimés par leur propriétaire (aucune politique DELETE) : une réalisation supprimée ou refusée laisse un fichier orphelin. Correctif possible par migration (politique DELETE propriétaire ou nettoyage serveur) : à décider.
3. La photo de réalisation déjà présente sur Staging (compte du propriétaire) a été envoyée brute, avec ses métadonnées GPS ; elle n'a pas été touchée.
4. L'état « retenue par l'équipe » (job `held`) n'est pas lisible par le client (aucune politique sur `moderation_jobs`) : l'interface s'appuie donc sur un délai (5 min) pour proposer la reprise. Une RPC de statut serait plus précise (migration à préparer si souhaité).
5. Les photos de demandes (`request-photos-hold`) n'ont pas été auditées pour la même limite de 5 Mio.
