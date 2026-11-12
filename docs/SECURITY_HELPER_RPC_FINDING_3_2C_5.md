# Phase 3.2C-5 — audit ciblé de trois fonctions SECURITY DEFINER (Staging)

Statut : **correctif préparé, NON appliqué**. Déploiement Vercel **non effectué** (arrêt de sécurité).
Projet : `tdktfbtqceldlaeqjtow` (Staging). Production : non consultée, non touchée.

## Constat

| Fonction | Paramètres | Contrôle d'identité | Écrit dans | EXECUTE réel |
|---|---|---|---|---|
| `lyann_insert_notification` | `p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id` | aucun | `notifications` (+ `push_deliveries` via `trg_lyann_enqueue_push`) | anon, authenticated, service_role |
| `lyann_pair_conversation` | `p_user_a, p_user_b` | aucun | `conversations`, `conversation_participants` | anon, authenticated, service_role |
| `lyann_ensure_support_welcome` | `p_user_id` | aucun | `conversations`, `conversation_participants`, `messages` (message d'accueil du support) | anon, authenticated, service_role |

Les trois sont `SECURITY DEFINER`, propriétaire `postgres`, `search_path=public` : elles contournent la RLS.
Cause : les migrations 39 et 40 font `REVOKE ALL … FROM PUBLIC` puis `GRANT … TO service_role`, mais les privilèges par défaut de Supabase
donnent déjà EXECUTE à `anon` et `authenticated` sur toute nouvelle fonction du schéma `public`. Le REVOKE FROM PUBLIC ne les retire pas.

## Preuve (transaction annulée, aucun effet persistant ni externe)

Appels en rôle `anon` sur des comptes QA, puis `RAISE EXCEPTION` (rollback) :

- 2 notifications créées, 2 lignes `push_deliveries` mises en file (type `OPPORTUNITY`, titre et corps choisis par l'appelant) ;
- 2 conversations et 4 participants créés entre membres qui n'ont rien demandé ; le contrôle de blocage `refuse_blocked_new_participant` sort tôt quand `auth.uid()` est NULL ;
- l'identifiant d'une conversation existante entre deux membres (`7bd66c95-9fb6-4af9-b754-0c43b5c8dc34`) est renvoyé à un visiteur ;
- création de la conversation de support et du message d'accueil pour un membre quelconque.

Les identifiants de membres sont publics (`public_profiles.id`). Aucun jeton, aucun compte n'est nécessaire.
Pas d'appel réseau dans les triggers concernés (pas de `net.http_*`) : le rollback n'a laissé aucune trace. Les files de push sont vidées par un cron : sans rollback, les notifications auraient été diffusées.

## Appelants légitimes (le correctif ne les casse pas)

- Serveur : `api/server.js`, `api/admin-operations.js` → client `supabaseAdmin` (service_role).
- Base : `lyann_notify_*`, `lyann_open_support_conversation`, `lyann_send_welcome_message` → toutes `SECURITY DEFINER`, propriétaire `postgres`.
- Navigateur : aucun appel.

## Correctif préparé

`95_internal_helper_rpc_lockdown_staging.sql` : `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role` sur les trois fonctions, post-conditions incluses.
Retour arrière : `95_internal_helper_rpc_lockdown_rollback.sql` (rend EXECUTE à anon, authenticated, service_role, ACL d'origine).
Test local isolé (PGlite, sans Supabase) : `tests/internal-helper-rpc-lockdown-sql.test.js` reproduit la dérive des droits, applique le correctif (anon et authenticated refusés, service_role et appelant SECURITY DEFINER intacts) et vérifie le retour arrière exact.
Aucune table, politique, vue ni donnée n'est modifiée.

## À faire avec autorisation distincte

1. Appliquer la migration 95 sur Staging (rien d'autre).
2. Vérifier en lecture seule si Production présente la même dérive (mêmes migrations 39/40) : probable ; **non vérifié, Production interdite**.
3. Traiter ensuite la trentaine d'autres fonctions anon-exécutables portant une garde interne.

## Images dont l'URL reste publique

Buckets publics : `avatars`, `request-photos`, `portfolio_images` (vide), `bokantaj-media` (vide), `editorial-highlights`. Seul le listage a été fermé par la migration 94 ;
une URL d'objet reste lisible par quiconque la connaît (chemin `<uuid utilisateur>/<nom>`, non devinable).
Contenu actuel : avatars, visuels éditoriaux, 8 images PNG de test dans `request-photos` (annonces QA). Aucun document, pièce d'identité, preuve de signalement, pièce jointe de chat ou photo en attente de modération :
ces contenus sont dans des buckets privés (`pro-documents`, `lyann-pro-private`, `report-evidence`, `chat-attachments`, `avatars-hold`, `portfolio-images-hold`, `request-photos-hold`, `bokantaj-media-hold`).
Aucune photo réellement privée n'est diffusée par URL publique. Réserve produit : une photo d'annonce reste accessible à qui possède son URL, même si le détail de l'annonce est réservé aux membres.
