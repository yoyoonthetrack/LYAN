# 14 — Application persistante sur Staging (P4/P5) : runbook

> **Statut : NON AUTORISÉ — préparé et testé sur le banc, jamais exécuté.** Cible unique : Supabase Staging `tdktfbtqceldlaeqjtow`. Production (`gzispjfoywklpqatjyop`) est exclue : l'exécuteur refuse tout chemin d'API qui ne vise pas Staging.
>
> Ce document ne remet pas en cause les audits de 11, 12 et 13 ni la répétition P3 (deux passages, rollback complet, catalogue `fc36d9446b02ef7fad0dc706337b26b4` / 2381 objets identique avant et après). Il décrit **comment appliquer ce que P3 a prouvé, et comment revenir en arrière**.

## 1. Ce qui est appliqué, dans quel ordre

| Étape | Contenu | Fichiers | Transaction | Pourquoi cet ordre |
|---|---|---|---|---|
| **P4** | Schéma v2, colonnes additives, recherche et RPC v2, amorçage du référentiel | `01` → `04` | 1 | Tout est additif ; aucune ligne historique n'est écrite. |
| **P5** | Correspondance héritée, **rétro-remplissage en contexte service explicite**, double écriture, projection héritée | `05` (variante service) → `06` → `08` | 1 | Le rétro-remplissage a besoin du référentiel (P4) ; l'ordre 05 → 06 → 08 est celui rejoué et mesuré par P3. |
| **S10** | RPC `lyann_resolve_legacy_skill` (précision d'une compétence par son membre) | `post-migration-draft/10_resolve_legacy_skill.sql` | 1 | Ne sert à rien avant P5 ; indépendante de P4/P5. |
| **S100** | `REVOKE TRUNCATE, TRIGGER, REFERENCES` sur `services` | `security-draft/100_services_dangerous_privileges_staging.sql` | 1 | Fermeture d'une surface sans lien avec la taxonomie, donc en dernier : en cas d'anomalie, on sait que ce n'est pas elle qui a cassé P4/P5. |

`07` (vérifications) n'est jamais « appliqué » : ses contrôles V01–V23 sont exécutés dans les transactions P4/P5 (assertions avant `COMMIT`) **et** relus depuis une nouvelle connexion après chaque étape. `09` est le retour arrière, jamais lancé automatiquement.

P4 et P5 sont **générés** par `scripts/taxonomy-v2/p45-staging.js` à partir des fichiers 01–08 validés (empreintes ci-dessous) ; seul le cadre change : verrou, instantanés, assertions, `COMMIT` final.

### Empreintes SHA-256 (identiques à celles du 2ᵉ passage P3)

| Fichier | SHA-256 (début) |
|---|---|
| `01_schema_taxonomy_v2.sql` | `185c5ee25db52588` |
| `02_additive_columns.sql` | `24d8a5d9b02c0a60` |
| `03_search_and_skills_rpc.sql` | `f59de5eebdb68f85` |
| `04_seed_taxonomy_v2.sql` | `e31b62236997539e` |
| `05_legacy_map_and_backfill.sql` | `2a1bb0d7fb3b6098` |
| `06_dual_write_derivation.sql` | `b66134796522e401` |
| `07_verify_taxonomy_v2.sql` | `76749eab237ffdad` |
| `08_legacy_projection.sql` | `2f34aeef7ffe6876` |
| `09_rollback_taxonomy_v2.sql` | `7e465124bd842c0b` |

Les empreintes complètes (y compris celles de 10, de 100 et des SQL générés) s'obtiennent avec `node scripts/taxonomy-v2/p45-staging.js --fingerprints`. **Si l'un de 01–09 change, P3 doit être rejoué** (un test le garantit).

## 2. Avant de commencer (rien de tout cela n'est une écriture)

1. **Autorisation écrite** spécifique de l'utilisateur pour P4/P5 (l'exécuteur exige `LYANN_P45_AUTHORIZED=I-AUTHORIZE-P4-P5-ON-tdktfbtqceldlaeqjtow`). L'autorisation de P3 n'ouvre rien.
2. **Jeton.** Le jeton utilisé pour P3 doit être **révoqué dans le tableau de bord Supabase** (Account → Access Tokens), puis un jeton **neuf** créé et placé dans un fichier local hors dépôt (`SUPABASE_ACCESS_TOKEN=…`, droits 0600), passé via `LYANN_P45_TOKEN_FILE`. L'exécuteur refuse un jeton dont l'empreinte figure dans `artifacts/p3-staging/revoked-token-hashes.txt` (liste locale non versionnée, contenant déjà l'empreinte du jeton de P3). Le jeton n'est jamais affiché, jamais écrit dans un rapport ni dans une sauvegarde. La révocation elle-même ne peut être faite que dans le tableau de bord : c'est une action humaine.
3. **Commit figé.** Le SHA final du rapport, arbre propre pour les fichiers listés au §9 ; les empreintes de `--fingerprints` relevées et comparées à celles de l'autorisation.
4. **Fenêtre calme** (voir §8, verrous) : aucune session ouverte, aucune recette en cours sur Staging.
5. **Dossier de sauvegarde** : `~/Developer/lyann-releases/backups/staging-p45-<horodatage>` (0700). Il contient des données de recette : il n'est jamais commité ni copié ailleurs.

## 3. Déroulé exact (une commande, arrêt au premier écart)

```
LYANN_P45_AUTHORIZED=I-AUTHORIZE-P4-P5-ON-tdktfbtqceldlaeqjtow \
LYANN_P45_TOKEN_FILE=<fichier du jeton neuf> \
node scripts/taxonomy-v2/p45-staging.js --execute [--steps P4,P5,S10,S100]
```

**Exécution en deux temps (facultative).** `--steps P4` s'arrête après P4 et sa vérification, et écrit dans le rapport (`artifacts/p45-staging/run-*.json`, `report.P4.catalog`) l'empreinte du catalogue obtenue. La suite se lance alors avec `--steps P5,S10,S100 --resume-catalog <md5>:<objets>` : le pré-vol exige que P4 soit appliquée **et** que le catalogue soit exactement celui relevé (sinon arrêt), et refuse une reprise contenant P4. Sans `--resume-catalog`, tout nouveau lancement est refusé tant que des objets v2 existent. Conserver les **deux** dossiers de sauvegarde : seul le premier (avant P4) permet la restauration complète.

`--preflight-only` s'arrête après le pré-vol (recommandé juste avant l'autorisation finale : lecture seule). `--plan` affiche ce déroulé, `--print P4|P5|S10|S100|PREFLIGHT|VERIFY` imprime le SQL exact.

| # | Action | Arrêt immédiat si… |
|---|---|---|
| 0 | **Identité** : `GET /v1/projects/tdktfbtqceldlaeqjtow` → `ref` exact, statut `ACTIVE_HEALTHY`. Tout chemin autre que Staging est refusé par le programme. | autre `ref`, autre statut |
| 0b | **Pré-vol** (une seule instruction `SELECT`, lecture seule) | voir ci-dessous |
| 0c | Empreinte « hors schéma public » (extensions, déclencheurs d'événement, ACL des schémas et `default_acl`, relations/fonctions/déclencheurs/politiques hors `public`, buckets de stockage) | — (mesure) |
| 1 | **Sauvegarde logique** locale : lignes de `requests`, `services`, `lyann_taxonomy` (JSON, par pages), catalogue (clé/valeur), définitions et ACL de toutes les fonctions publiques, pré-vol, **manifeste SHA-256** ; nombre de lignes comparé au pré-vol | écart de volumétrie (activité concurrente) |
| 2 | **P4** (01→04) | toute exception SQL : la transaction est annulée en bloc |
| 3 | **Vérification P4**, nouvelle connexion | voir « Vérification » |
| 4 | **P5** (05 service → 06 → 08) ; l'empreinte du catalogue est **re-mesurée juste avant** et vérifiée en tête de transaction | toute exception SQL : annulation en bloc |
| 5 | **Vérification P5** | idem |
| 6 | **S10**, vérification | idem |
| 7 | **S100**, vérification finale ; privilèges structurels de `services` retirés | idem |

**Aucune relance automatique, aucune étape suivante après un arrêt.** Un échec SQL est suivi d'un `ROLLBACK;` défensif et d'une relecture du catalogue : l'exécuteur indique si l'état est « annulation propre, rien appliqué » ou « ÉTAT À EXAMINER ».

### Pré-vol : conditions d'arrêt

Base ≠ `postgres` ; PostgreSQL < 15 ; objets v2 déjà présents (tables, colonnes, fonctions : **P4 ne se rejoue pas**) ; `lyann_sync_profile_skills` (83) absente ; `requests` > 20 000 lignes (hors volumétrie prouvée) ; tables de modération introuvables ; **demande `PROHIBITED` non annulée** (un `UPDATE` de rétro-remplissage forcerait `status = CANCELLED`) ; **déclencheur `UPDATE` non examiné** sur `requests`/`services`/`lyann_taxonomy` (seuls les six de P3 sont admis) ; session `idle in transaction`, transaction préparée, verrou consultatif ou verrou d'une autre session sur les trois tables ; **catalogue public ≠ celui prouvé par P3** (empreinte `fc36d944…`, 2381 objets) : dans ce cas **rejouer P3** avant tout.

### Dans les transactions P4/P5 (avant `COMMIT`)

`LOCK TABLE requests, services, lyann_taxonomy IN ACCESS EXCLUSIVE MODE` en premier (avec `lock_timeout 5s`, `statement_timeout 300s`) ; instantané des lignes et du catalogue ; vérification de l'empreinte du catalogue ; les contrôles V (P4 : V01–V06, V12 ; P5 : V01–V23) ; **aucun objet préexistant modifié** (seul `lyann_sync_profile_skills(uuid,text[])` peut l'être, et seulement par P5) ; **aucune colonne historique modifiée** ni ligne perdue ou ajoutée ; **aucune ligne ni tâche de modération ajoutée**. Un seul écart lève `P45_ABORT` : tout est annulé.

### Vérification après chaque étape (nouvelle connexion, lecture seule)

V01–V23 (P4 : V01–V06 et V12 — les autres lisent des objets créés par P5) ; **toutes les tables v2 ont la RLS** ; aucun privilège `TRUNCATE`/`TRIGGER`/`REFERENCES` ni écriture pour `anon`/`authenticated` sur les tables v2 ; **aucune fonction `SECURITY DEFINER` v2 sans `search_path`** ; aucune fonction v2 exécutable par `anon` hors recherche publique ; **file et tâches de modération inchangées** par rapport au pré-vol ; aucune session ou verrou résiduel ; **diff de catalogue** par rapport à la sauvegarde : aucun objet préexistant retiré, seuls modifiés ceux attendus ; empreinte hors schéma public identique.

## 4. Comportement attendu pour les anciennes applications

Inchangé tant que rien n'est activé : les colonnes et tables historiques ne sont ni modifiées ni supprimées (assertion « aucune colonne historique modifiée »), les anciennes catégories restent la source de lecture des anciens builds, la projection héritée (08) fournit aux anciens builds des valeurs de catégorie compatibles (doc 12 §4), et l'ancienne RPC de synchronisation des compétences (83) continue de fonctionner (testée avec le choix des membres conservé). **Stratégie T1** retenue, sans les 32 catégories artificielles T2. Détail et matrice : doc 12 §4.

### Mise à jour obligatoire des applications natives

Les applications natives embarquent leur JavaScript (Capacitor `webDir: www`, sans URL distante) : **un build déjà installé ne peut être ni corrigé ni informé côté serveur.** Le mécanisme préparé ne peut donc concerner que les builds qui l'intégreront.

- `GET /v1/app/version-policy?platform=ios|android&build=<n>` (`api/app-version-policy.js`, monté dans `api/server.js`) répond `{ update_required, update_recommended, store_url, … }`. **Inerte par défaut** : `update_required` n'est vrai que si `LYANN_APP_VERSION_POLICY_ENFORCE` vaut exactement `true`, qu'un plancher est défini pour la plateforme (`LYANN_MIN_APP_BUILD_IOS`/`_ANDROID`) et que `build < plancher`. Plateforme ou build inconnus, web : jamais bloquant. URL de store limitée à `apps.apple.com`, `itunes.apple.com`, `play.google.com` (https).
- Côté client, `app-version-policy.js` n'est référencé par aucun écran ni aucun bundle et ne s'active que si `LYANN_FEATURES.appVersionPolicy === true`. Échec réseau = jamais bloquant (délai 3 s).
- **Aucune mise à jour forcée n'est activée** par cette préparation, et aucune variable d'environnement n'est posée. Le premier build qui embarquera le client est celui qui pourra informer ses propres successeurs ; les builds 1.0 (15–17) déjà distribués ne le pourront jamais.

## 5. Les 52 compétences sans métier

Reproduction exacte du pré-vol : 208 services, 156 rattachés, **52 non rattachés** (23 intitulés). Analyse déterministe : `node scripts/taxonomy-v2/unattached-skills.js` (`--write` régénère `docs/taxonomy/generated/unattached-skills.{json,csv}`, sans donnée personnelle).

| Groupe | Lignes | Intitulés | Traitement |
|---|---|---|---|
| Récupérables sans ambiguïté | **0** | 0 | Aucune : par construction, `lyann_legacy_certain_node` rattache déjà tout ce qui n'a qu'un métier possible (théorème vérifié par test). On **n'infère rien** du propriétaire, de la description ou de la catégorie. |
| Précision du membre nécessaire | **48** | 21 | Candidats issus de la carte éditoriale (≤ 4 : choix direct ; plus : recherche). Exemples : « courses » ×10 (courses ou colis ?), « accompagnement » ×6, « cuisine » ×6, « transport » ×3. |
| Hors référentiel | **4** | 2 | « dépannage » ×3 (aucun métier unique) et un intitulé libre contenant plusieurs activités séparées par des virgules : jamais rattachés ; conservés tels quels. |

**Garanties** : aucune donnée historique modifiée ; aucun métier attribué automatiquement ; le titre de la compétence n'est jamais réécrit ; le quota d'un membre ne bouge pas (clé de quota inchangée).

**Après migration** — affichage (`taxonomy-ux.js`, `describeSkill`, derrière l'indicateur `taxonomySkills`, désactivé) : `classified` (métier connu), `classified_parent` (rattaché au métier parent seulement : précision proposée), `unclassified` (« Compétence à préciser » + choix parmi les candidats ou recherche) ; les titres techniques ou vides retombent sur « Compétence à préciser ». Édition : `lyann_resolve_legacy_skill(p_service, p_node)` (S10) — le membre est le seul à pouvoir préciser, propriétaire vérifié, même erreur pour un service d'autrui ou inexistant, refus d'un nœud famille, `autres`, restreint ou inactif, refus d'une compétence déjà classée ; elle n'écrit que `taxonomy_node_code`/`taxonomy_node_source = 'user'` et la ligne de profil v2.

## 6. Retour arrière et restauration

Principe : **la sauvegarde ne remplace pas le retour arrière validé, elle le complète pour les lignes.** Rien n'est lancé automatiquement : le plan s'affiche d'abord.

```
node scripts/taxonomy-v2/p45-staging.js --restore-plan <dossier> [--revert-100] [--data-only]   # imprime le SQL, ne l'exécute pas
```

| Situation | Procédure |
|---|---|
| **Échec SQL pendant P4 ou P5** | La transaction est annulée par Postgres ; l'exécuteur le confirme (catalogue identique) et s'arrête. **Rien à restaurer.** |
| Anomalie constatée **après** `COMMIT` (vérification en échec) | Arrêt. Lire le rapport (`artifacts/p45-staging/run-*.json`). Si les anciennes applications ou les données sont en cause : exécuter le plan de restauration complet. |
| Restauration complète (`--revert-100` si S100 a été appliquée) | UNE transaction : verrou exclusif ; retrait de `lyann_resolve_legacy_skill` (**le rollback 10 avant 09**, sinon la fonction dépendrait de tables supprimées) ; **09** (retire tout le v2, colonnes comprises) ; rollback de 100 (rend les trois privilèges exactement tels qu'ils étaient) ; puis, **en contexte service** (pour ne rien remettre en modération), **réinsertion des lignes supprimées et réécriture des seules lignes qui diffèrent** de la sauvegarde. |
| Seules des données sont à rétablir, le v2 reste (`--data-only`) | Même mécanique sans 09 ; les colonnes v2 (rattachements) ne sont jamais écrasées. |

**Prouvé sur le banc** : après un déroulé complet et un sinistre simulé (demande réécrite, service supprimé, ligne de taxonomie altérée), la restauration redonne des tables identiques à la sauvegarde, **le même nombre de lignes et de tâches de modération**, aucun objet v2, aucune colonne v2, un catalogue identique (aucun objet ajouté ni retiré, ensemble de privilèges de `services` identique).

**Limites honnêtes** : (1) la restauration ne recrée pas ce qui a été **créé par des utilisateurs depuis la sauvegarde** (ces lignes ne sont jamais supprimées non plus) ; (2) la réinsertion d'une ligne supprimée repasse par les déclencheurs d'insertion : le contrôle de modération de l'exécuteur le montrerait ; (3) un retour arrière **après** une activité réelle significative demande une relecture humaine ; (4) les tâches de modération créées pendant la fenêtre ne sont pas rejouées. La restauration est une procédure d'urgence, pas un geste courant.

## 7. Sécurité et modération

- **Modération** : le rétro-remplissage s'exécute en **contexte service explicite** (`set_config('request.jwt.claim.role','service_role',true)`, décision X6, mesurée sur Staging par P3 : +0 file / +0 tâche contre +78 / +22 en contexte normal) ; l'exécuteur compare file et tâches avant/après dans la transaction **et** depuis une nouvelle connexion.
- **Surface** : nouvelles tables avec RLS, aucune écriture pour `anon`, `SECURITY DEFINER` avec `search_path` fixé, `REVOKE` explicite, pas d'effet externe (`NOTIFY`, `COPY`, `nextval`), pas de `TRUNCATE` ni de désactivation de déclencheur ou de RLS : le linter de l'exécuteur le refuse et des tests l'établissent.
- **S100** : refuse de s'appliquer si une routine `SECURITY INVOKER` s'appuie sur `TRUNCATE`/`CREATE TRIGGER`/`REFERENCES … services` ; instantané des dépendances (clés étrangères, déclencheurs, règles, RLS), des politiques et des autres privilèges, comparé après ; `service_role` et `postgres` conservent leurs droits (contrôle `has_table_privilege`) ; refus atomique en cas de privilèges dépendants (`GRANT OPTION`). À contrôler sur Staging seulement : `authenticator` (le script le recontrôle) et `supabase_admin`.
- **Aucun secret** dans les scripts, rapports ou sauvegardes ; `Bearer` jamais journalisé.

## 8. Risques résiduels et décisions

1. **Verrou exclusif** sur `requests`, `services`, `lyann_taxonomy` pendant P4 puis P5 : les écritures de ces tables attendent (jamais plus de 5 s pour obtenir le verrou, sinon arrêt propre). La durée réelle de chaque étape est relevée par l'exécuteur (en ms, dans le rapport d'exécution) ; la volumétrie est celle de la recette (80/208/89 lignes) et Staging ne sert que la recette.
2. **Comportement du `COMMIT` via l'API de gestion** (`POST …/database/query`) : non vérifié par un `COMMIT` réel avant ce jour. Atténuation : la réussite est jugée sur le **résultat** (relecture depuis une nouvelle connexion), pas sur le code de retour.
3. **Dérive entre le pré-vol et l'exécution** : seule une dérive du catalogue est un arrêt ; une dérive de lignes n'est qu'une note (à relire).
4. **Anciennes applications natives** : jamais informables (§4). La stratégie T1 les laisse fonctionner ; seul un futur build pourra annoncer une mise à jour.
5. **Quotas** : politique C et garde 82 inchangées et testées ; S10 ne modifie aucune clé de quota.

### Décisions réellement nécessaires (une seule autorisation les couvre)

- **Autoriser P4/P5 sur Staging** dans la fenêtre décrite ci-dessus, avec jeton neuf (le jeton de P3 révoqué par vous).
- **Inclure S10 et S100 dans la même autorisation** (recommandé : ils sont séparés en transactions distinctes, vérifiés à part, avec leurs rollbacks) **ou les exclure** (`--steps P4,P5`).

Tout le reste (ordre, vérifications, arrêts, restauration) est tranché.

## 9. Fichiers de cette étape

| Fichier | Rôle |
|---|---|
| `scripts/taxonomy-v2/p45-staging.js` | exécuteur verrouillé, pré-vol, vérification, sauvegarde, restauration (`--plan`, `--print`, `--fingerprints`, `--restore-plan`, `--execute`) |
| `tests/taxonomy-p45.test.js` | déroulé complet sur PGlite avec une API factice : arrêts, annulations, restauration, jeton, Production |
| `docs/taxonomy/security-draft/100_*` | S100 durci (garde de dépendances, instantanés) et son rollback |
| `tests/taxonomy-security-100.test.js` | 100 : privilèges effectifs, héritage, données, idempotence, `GRANT OPTION`, rollback |
| `docs/taxonomy/post-migration-draft/10_resolve_legacy_skill*.sql` | S10 et son rollback |
| `scripts/taxonomy-v2/unattached-skills.js`, `docs/taxonomy/generated/unattached-skills.{json,csv}` | analyse des 52 compétences |
| `tests/taxonomy-p45-skills.test.js` | analyse, RPC 10 sur le banc, hygiène des fichiers |
| `taxonomy-ux.js` (`describeSkill`, `resolveSkillArgs`) | affichage et édition des compétences après migration (indicateur désactivé) |
| `api/app-version-policy.js`, `app-version-policy.js`, `api/server.js` | politique de version minimale (inerte) |
| `tests/app-version-policy.test.js` | politique de version : inertie, route réelle, client |
