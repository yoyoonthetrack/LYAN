# Phase 3.2C-5.2 — Migration 95 appliquée durablement sur Staging

Projet : `tdktfbtqceldlaeqjtow` (`Lyann-staging-v2`, ACTIVE_HEALTHY). Production : aucun appel.
Fichier : `95_internal_helper_rpc_lockdown_staging.sql`, sha256 `c5fe97cf1da4ad321684932ddc55d092447c27472e0e92cf862d6b1cf4c5023c`.
Retour arrière : `95_internal_helper_rpc_lockdown_rollback.sql`, sha256 `776306be14cb4053b9a47442338ab422aaae25b3c160d977b9de518ee6b96f90`.
Commit au moment de l'application : `c56dc22525a42f666012a029b0bca193864a9905` (branche `feature/marketplace-v3-2c-ui`).

## Prérequis vérifiés avant l'écriture

1. Identité : `get_project` renvoie `tdktfbtqceldlaeqjtow`.
2. SHA Git et empreintes SQL : migration et retour arrière identiques à leurs copies de `artifacts/phase-3-2c/backup95/` ; `SHA256SUMS` relu, tout OK.
3. Permissions des trois fonctions : ACL `{postgres, anon, authenticated, service_role}`, corps identiques à la sauvegarde (`4615da64…`, `f3b9ba91…`, `dbffc2ca…`), propriétaire `postgres`, `SECURITY DEFINER`, `search_path=public`.
4. Dépendances internes : huit appelants, tous `SECURITY DEFINER` propriétaires `postgres` (`lyann_notify_bokantaj_post`, `_matching_request`, `_on_message`, `_payment_failed`, `_quote_push`, `_work_to_validate`, `lyann_open_support_conversation`, `lyann_send_welcome_message`). Aucun déclencheur ni vue ne les appelle directement. Ni pg_cron ni pg_net installés.
5. Six empreintes de référence : `col_acl` `b7521379…`, `fn_acl` `21a4ccdb…`, `policies` `7b87e80c…`, `rel_acl` `b73a110e…`, `views` `6144ae1e…` identiques. `data` : la requête de `artifacts/phase-3-2c/rehearsal94/snapshot.sql` donne `a050a78e…`, la valeur de 3.2C-4. L'empreinte étendue « data_v2 » (`50f8507d…`) de 3.2C-5.1 vient d'une requête qui n'avait pas été enregistrée dans un fichier : elle n'a pas pu être rejouée. Elle est remplacée par une empreinte « messaging » enregistrée (conversations, participants, messages, notifications, push_deliveries, user_blocks, requests) : `9fd535ba…`.
6. Sauvegarde : `artifacts/phase-3-2c/backup95/`.
7. Le retour arrière correspond à l'état initial : il rend EXECUTE à anon, authenticated, service_role, ce qui est exactement l'ACL capturée ; l'exactitude avait été prouvée par la répétition (empreinte fn_acl revenue à `21a4ccdb…`).

## Exécution

Une seule transaction `BEGIN … COMMIT` avec les assertions avant (signatures) et après (anon et authenticated sans EXECUTE, service_role avec). Réponse : `[]`, aucune erreur. Les assertions internes font échouer la transaction entière si elles ne sont pas vraies : le COMMIT a donc eu lieu après leur réussite.

## Preuve après COMMIT (connexions MCP distinctes, lecture seule)

| Fonction | ACL avant | ACL après | anon | authenticated | service_role |
|---|---|---|---|---|---|
| `lyann_insert_notification` | postgres, anon, authenticated, service_role | postgres, service_role | non | non | oui |
| `lyann_pair_conversation` | idem | idem | non | non | oui |
| `lyann_ensure_support_welcome` | idem | idem | non | non | oui |

`authenticator` n'a pas EXECUTE non plus. Corps, propriétaire, SECURITY DEFINER et `search_path` inchangés (md5 identiques).

| Empreinte | Avant | Après |
|---|---|---|
| col_acl | `b7521379…` | identique |
| data | `a050a78e…` | identique |
| **fn_acl** | `21a4ccdb…` | **`b81c68fc…`** (valeur prédite par la répétition) |
| policies | `7b87e80c…` | identique |
| rel_acl | `b73a110e…` | identique |
| views | `6144ae1e…` | identique |
| messaging | `9fd535ba…` | identique |

Seule l'ACL des trois fonctions a changé. Compteurs inchangés : 85 conversations, 124 participants, 541 messages, 4017 notifications, 595 push_deliveries.

## Sécurité et non-régression (transaction annulée, aucune notification externe)

`artifacts/phase-3-2c/rehearsal95b/probe_post95.sql`, rapport dans `reports.md`.

- anon et authenticated : refus `42501` sur les trois fonctions. service_role : OK.
- Flux légitimes d'un membre : conversation de support (idempotente), `get_or_create_conversation` (idempotente), `open_direct_conversation`, envoi de message, notification créée pour le destinataire par la chaîne de déclencheurs.
- Écritures directes d'un membre : notification, participant pour autrui, message au nom d'un autre : refusées (`42501`).
- Règle de blocage : un membre bloqué reçoit « Ce membre ne peut pas recevoir vos messages. » (`42501`), comme avant.
- Dans la transaction les compteurs ont monté (messages +2, conversations +7, notifications +3) ; tout a été annulé, les empreintes vivantes sont identiques après.

## Limite

Les tests rejoués sont des sondes SQL par rôle. `visitor_data_lock` (HTTP vers Staging) n'a pas été relancé dans cette phase.
