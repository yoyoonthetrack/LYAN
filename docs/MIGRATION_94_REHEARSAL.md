# Migration 94 — verrou visiteur : répétition transactionnelle (Staging)

Statut : **NON APPLIQUÉE** (ni Staging, ni Production). Cette note documente la répétition annulée
et la preuve de retour arrière. L'application durable exige une autorisation séparée.

- Projet : Staging `tdktfbtqceldlaeqjtow` uniquement. Production `gzispjfoywklpqatjyop` : jamais.
- Migration : `94_visitor_member_detail_lock_staging.sql` — retour arrière : `94_visitor_member_detail_lock_rollback.sql`.
- Script de répétition : `scripts/rehearse-migration-94.js` (génère `artifacts/phase-3-2c/rehearsal94/{rehearsal,snapshot}.sql`, ignorés par git).

## Ce que fait la migration

| Objet | Avant | Après |
|---|---|---|
| Politiques `reviews`, `user_portfolio_items`, `recommendations` | lecture `anon` + `authenticated` | lecture `authenticated` seulement |
| Politiques storage `portfolio_images`, `request-photos` (listage) | listage `anon` | listage `authenticated` seulement |
| Vue `public_profiles` (SECURITY DEFINER) | `bio` en clair | `CASE WHEN current_user = 'anon' THEN NULL ELSE bio END` (`select('*')` continue de fonctionner) |
| RPC `get_user_trust_and_reputation(p_target_user_id)` | exécutable par `anon`/PUBLIC | `anon` et PUBLIC retirés |
| RPC `get_public_profile_pro_status(p_target_user_id)` | exécutable par `anon`/PUBLIC | `anon` et PUBLIC retirés |

Aucune colonne ni donnée n'est modifiée. Les URL publiques des buckets contournent la RLS storage : seul le listage est fermé.

## Méthode

Un seul `DO $rehearsal$` plpgsql : applique la migration via `EXECUTE`, instantané du catalogue et sondes par rôle
(`SET LOCAL ROLE` + `request.jwt.claims` : anon, membre, admin, service_role), applique le retour arrière, second instantané,
puis `RAISE EXCEPTION 'REHEARSAL_REPORT %'` : toute la transaction est annulée. Aucun `COMMIT`.

## Empreintes (md5 par section) — identiques AVANT et APRÈS la répétition

| Section | Empreinte | Objets |
|---|---|---|
| col_acl | `b75213796e1bbcc6abea7c72256f50a5` | 15 |
| data | `a050a78e19a98c55461498c6c0dc2e48` | — |
| fn_acl | `3c72bb1f565e0cb3c399c65b81179e78` | 185 |
| policies | `6c1775190b1f521c1de5043e913b87fb` | 168 |
| rel_acl | `b73a110ef62de84d7d6111e3907ac95e` | 125 |
| views | `c4cac83f49575ab03f623101beb2ef54` | 2 |

## Retour arrière exact

Dans le rapport : `rollback_equal = true` pour politiques, privilèges relations, privilèges colonnes, privilèges fonctions,
vues, données et sondes ; `rollback_diff` vide partout ; `data_unchanged_by_apply = true`.

## Sondes visiteur (anon), avant → après

| Sonde | Avant | Après |
|---|---|---|
| reviews (toutes) | 110 | 0 |
| reviews d'un membre | 3 | 0 |
| portfolio | 1 | 0 |
| bios non vides via `public_profiles` | 59 | 0 |
| recherche `ilike` sur la bio (oracle) | 59 | 0 |
| RPC confiance/réputation | 108 (longueur bio) | permission denied |
| RPC statut pro | true | permission denied |
| listage `request-photos` | 8 | 0 |

Inchangé pour anon : cartes `public_profiles` (82), colonnes carte (82), `select=*` (200), agrégat de notes (52),
filtre territoire (58), services (208), taxonomie (528), badges, éditorial, avatars (57). `requests`, `request_locations`,
`messages`, `payments` restent refusés. Aucune différence de sonde pour membre, admin et service_role.

## Vérification après application (à jouer seulement après autorisation)

```
LYANN_E2E_EXPECT_MIGRATION_94=1 npx playwright test tests/e2e/visitor_data_lock.spec.js
```

Le groupe B échoue sur exactement 6 fuites tant que la migration n'est pas appliquée (reviews, portfolio, bio, 2 RPC,
listage request-photos) : il prouve que le test détecte la fuite.

## Compatibilité anciens clients (TestFlight 15/16, web ancien)

- Visiteur : perd avis, portfolio et bio sur les fiches (c'est le verrou voulu). `select('*')` sur `public_profiles` reste valide.
- `getMembers` : la recherche par bio ne renvoie rien pour un visiteur ; les membres connectés ne sont pas touchés.
- `get_user_trust_and_reputation` refusé à anon : le client retombe sur son affichage de repli.
- Membres connectés et admin : aucun changement observé.

## Résiduels hors périmètre (à traiter séparément)

`services.description`/prix publics ; défauts de droits larges pour `anon` ; nombreuses fonctions SECURITY DEFINER exécutables
par `anon` ; `bokantaj_likes` lisible publiquement ; URL de buckets publics.
