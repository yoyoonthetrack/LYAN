# LYANN — Centre de pilotage V3.1

Branche : `feature/admin-control-center-v3`  
Style : design V2 conservé. Aucune règle de modération, Stripe, iOS ou Android n’est modifiée.

## Fenêtres de temps

| Clé | Sens |
|---|---|
| `7d` / `30d` / `90d` | Fenêtre glissante |
| `month` | **Mois civil UTC** en cours (du 1er 00:00 à maintenant) |
| `all` | Sans borne inférieure |

## Types d’indicateurs

- **Instantané** : état actuel, indépendant de la fenêtre sauf mention contraire.
- **Période** : événement dont la date pertinente tombe dans la fenêtre.
- **Cohorte** : ensemble créé dans la fenêtre, observé ensuite (statut actuel, premier devis…).

## Définitions définitives

| Indicateur | Type | Définition |
|---|---|---|
| Membres réels | Instantané | `account_type=real`. Pas une activité. |
| Profils maison | Instantané | `account_type=seed`. Jamais additionné à l’organique. |
| Agents éditoriaux | Instantané | Lignes `lyann_agents`. |
| Nouveaux membres | Période | Réels créés dans la fenêtre. |
| Profils complétés | Instantané | Réels avec prénom, nom et commune non vides. Comptage exact. |
| Membres actifs | Indisponible | Pas d’événement de session. |
| Annonces ouvertes | Instantané | `status=OPEN`. |
| Annonces (période) | Période | `created_at` dans la fenêtre. |
| Sans devis 24 h / 48 h | Instantané | OPEN assez anciennes **sans aucun devis admissible**. Indisponible si le jeu est tronqué. |
| Sans premier contact | Indisponible | Pas d’événement vérifiable sans lire les messages. |
| Sans mission confirmée | Instantané | OPEN sans `missions.related_request_id`. |
| Devis émis | Période | Devis créés dans la fenêtre hors `DRAFT`. Un devis ensuite accepté reste émis. |
| Acceptations datées | Indisponible | Pas de `accepted_at`. |
| Conversion annonce → devis | Cohorte | Part des annonces **créées dans la période** ayant ≥ 1 devis admissible. Plusieurs devis = une conversion. |
| Conversion devis → accepté | Cohorte | Devis **créés dans la période**, y compris sur des annonces plus anciennes. Statut actuel, pas `accepted_at`. |
| Missions créées | Période | `created_at` dans la fenêtre. |
| Missions terminées | Période | `completed_at` dans la fenêtre. Jamais un proxy sur `created_at`. |
| Délai 1er devis | Cohorte | Médiane sur **toutes** les annonces de la période qui ont un devis. Indisponible si pagination incomplète. |
| GMV / commissions | Période | Sommes paginées jusqu’à épuisement. Lecture seule. Masquées sans droit finance. Indisponibles si filtre territoire (paiements non territorialisés) ou jeu tronqué. |
| Bokantaj organique / maison / agents / inconnu | Instantané | Auteur réel hors agent, seed hors agent, `lyann_agents.linked_profile_id`, sinon inconnu. Un auteur inconnu n’est jamais organique. |
| Lecture finance | RBAC | OWNER / SUPER_ADMIN seulement. `finance.refund` n’ouvre pas les agrégats. |

Devis admissible : `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`.

Une donnée tronquée, absente ou en erreur s’affiche **Indisponible**, jamais comme un total exact.

## File d’action

Une erreur de lecture n’est jamais « Rien à traiter ».  
`available=false` ou `partial=true` est renvoyé au client.

## Données encore absentes

- `session_started`
- `request_first_viewed`
- `quote_accepted_at`
