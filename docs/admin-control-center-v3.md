# LYANN — Centre de pilotage V3

Branche : `feature/admin-control-center-v3`  
Style : conserve le design V2. Aucune règle de modération, Stripe, iOS ou Android n’est modifiée.

## Arborescence

1. **Pilotage** — Vue d’ensemble, À traiter, Analytics marketplace  
2. **Communauté** — Utilisateurs, Profils maison, Lyanneurs, fiche utilisateur  
3. **Marketplace** — Demandes, Missions, Prestations, Devis, Messagerie  
4. **Bokantaj & rédaction** — Comptes éditoriaux, Fil Bokantaj, Agents LYANN, Mika  
5. **Confiance & support** — Modération (KYC dans la fiche utilisateur), Support, Litiges, Notifications, Avis  
6. **Business & finances** — Paiements, Versements, Abonnements, Assurance, Facturation (lecture seule, masqués sans droit finance / owner)  
7. **Administration** — Configuration, Équipe, RBAC, Journaux, Feature flags, Territoires, Santé  

Les sous-rubriques secondaires restent dans le DOM (tests et recherche) et apparaissent via les onglets contextuels et le groupe courant.

## Définitions fiables

| Indicateur | Définition | Ancien défaut corrigé |
|---|---|---|
| Membres réels | `profiles.account_type = real` | `activeMembers` comptait tous les profils |
| Membres actifs | Indisponible | Ne plus déduire une activité de l’existence d’un profil |
| GMV période | Somme `customer_total_cents` des paiements `SUCCEEDED` **dans la période** | `gmvMonth` n’était pas borné au mois |
| Commissions collectées | Somme `lyann_revenue_cents` des mêmes paiements | `mrrCommissions` n’était pas un MRR |
| File éditoriale | `lyann_agent_tasks.approval_status = PENDING` hors `CANCELLED` | Distinct de `WAITING_APPROVAL` |
| Modération | Posts `public_moderation_status = pending` | Plus confondu avec les signalements ouverts |
| Signalements | `user_reports.status = OPEN` | Compteur séparé |
| Sans devis 24 h / 48 h | Annonces `OPEN` sans devis `SENT`/`ACCEPTED` | Nouveau |
| Délai 1er devis | Médiane `quote.created_at - request.created_at` | Sans lire le contenu des messages |

Une requête en erreur rend l’indicateur **indisponible**, jamais `0`.

## Données manquantes à instrumenter

- `session_started` — seul moyen honnête de compter un membre actif  
- `request_first_viewed` — délai avant première lecture  
- `quote_accepted_at` — conversion à la date d’acceptation  
- Connexions par jour, sans analyse du texte privé des conversations  

## Fonctionnalités intelligentes (préparées, non branchées)

| Id | Besoin | Déjà là | Manque | Complexité | Coût | Risques | Priorité |
|---|---|---|---|---|---|---|---|
| A Briefing quotidien | Résumé déterministe des files et de la croissance | KPIs + file d’action | Session, historique long | Faible | Faible | Ton trop alarmiste | P1 |
| B Radar métiers | Offre vs demande par territoire | Annonces, catégories, territoires | Volume trop faible, pas de série | Moyenne | Faible | Fausse pénurie | P2 |
| C Conversions / abandons | Entonnoir annonce → devis → mission | Compteurs période | Dates d’acceptation, vues | Moyenne | Faible | Attribution | P2 |
| D Sujets éditoriaux | Suggestions de rubriques | Sources RSS existantes | Validation humaine obligatoire | Moyenne | IA optionnelle | Invention | P3 |
| E Alertes sans réponse | File déjà calculée | 24 h / 48 h | Seuil métier | Faible | Faible | Spam d’alertes | P1 |
| F Mika lecteur | Expliquer un chiffre | APIs admin | RBAC strict, aucun ordre finance | Haute | LLM | Contournement, PII | P3, garde-fous |

Règle : calculs déterministes d’abord. Toute suggestion IA est traçable et soumise à validation humaine. Mika n’exécute aucune opération financière.

## Volontairement non implémenté

- LLM génératif sur le dashboard  
- Tracking de nouvelles sessions  
- Graphiques de tendance simulés  
- Migration Production  
- Levée des verrous Stripe  
- Merge vers `release/admin-backoffice` ou Production  
