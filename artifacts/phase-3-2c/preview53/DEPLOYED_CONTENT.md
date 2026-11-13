# Preuve du contenu déployé — Preview `lyann-staging-preview`

Déploiement `dpl_E1kjRoA1Qo5CzMx9xxe4pYaZHLrJ`, https://lyann-staging-preview-p3wky5j7d-yoyo-d85d.vercel.app.
Créé le 2026-11-12 22:58:47 UTC (23:58 à Paris), `READY` à 23:03:18 UTC. Source `cli`, environnement preview, `target` vide (pas de production, aucun alias de domaine). Aucune action de déploiement n'a eu lieu depuis.

## Commit source

`0bc6b03ffc86e73e1c912fdd72ebfb440cdde909`, branche `feature/marketplace-v3-2c-ui`. Vercel l'a enregistré lui-même (`meta.gitCommitSha`) avec **`gitDirty = 1`** : l'arbre de travail différait du commit.

## Contenu réellement envoyé

Source : l'arbre de fichiers du déploiement lu en lecture seule avec `vercel api /v6/deployments/<id>/files` (aucun jeton lu), puis comparé octet à octet (SHA-1 du contenu) au commit et à l'arbre de travail.

| Catégorie | Fichiers |
|---|---|
| Identiques au commit | 616 |
| Différents du commit | 3 |
| Absents du commit | 62 |
| **Total envoyé** | **681** |

Les fichiers du déploiement (chemin et SHA-1) sont dans `deployed-files-manifest.tsv`. Métadonnées sans secret : `deployment-metadata.json`.

### Les 3 fichiers différents du commit
Le contenu déployé est identique à l'arbre de travail actuel (SHA-1 vérifié).

- `docs/rc-final-go-no-go.md`
- `docs/staging-deployment-audit.md`
- `scripts/backup-production-database.js`

Leur différence avec le commit est dans `deployed-vs-head.patch`. Une adresse e-mail personnelle a été masquée dans ce patch : il est destiné à la lecture, pas à `git apply`.

### Les 62 fichiers absents du commit
Tous existent encore dans l'arbre de travail avec le même contenu qu'au déploiement.

- **Ignorés par `.gitignore`, mais nécessaires à la Preview (carte)** : `vendor/leaflet/*`, `vendor/maplibre/*`, `assets/maps/glyphs/*` (18 fichiers de polices et le manifeste), `package-lock.json` (3 + 5 + 19 + 1 = 28 fichiers).
  **Conséquence : un déploiement refait depuis le seul commit n'aurait pas la carte.**
- **Non suivis, non ignorés** : `work/*` (maquettes et captures de travail, 25 fichiers) et 9 scripts : 5 `scripts/rc-v16-android-*.js`, `apply-production-migrations-87-88.js`, `prepare-production-rc-cutover.js`, `verify-production-rc-postdeploy.js`, `capture-home-public.js` (25 + 9 = 34 fichiers). Aucun ne s'exécute sur Vercel, mais ils ont été envoyés.

### Fichiers suivis dans le commit qui n'auraient pas dû être publiés
Présents dans le commit et donc dans le déploiement (derrière la protection Vercel) : `.momentic-mcp/` (captures, vidéo, JSON d'environnement : uniquement des URL), `.codex/config.toml`, scripts et fichiers de test à la racine. Non traités ici.

### Contrôle de secrets sur les 681 fichiers texte
- Aucune clé `service_role`, aucune clé Stripe réelle (`sk_live_`, `sk_test_`, `whsec_` : uniquement des valeurs factices dans `.env.example` et `scripts/verify-staging-v2-isolation.js`), aucune clé privée.
- Jetons JWT trouvés : tous de rôle `anon` (clés publiques par conception).
  - Staging (`tdktfbtqceldlaeqjtow`) : `work/discover-preview.html`.
  - **Production (`gzispjfoywklpqatjyop`)** : clé anon par défaut de `lyann-runtime-config.js`, et d'`api-client.js`, `api/server_python.py`, `audit_verification_proof.py`, `scripts/confirm_qa_users.js`, `scripts/execute_phase3c_e2e.js`, `test_invitation_flow_full.py`. Ces fichiers existent déjà dans la version publiée de Production. Sur la Preview, `LYANN_SUPABASE_LOCK=tdktfbtqceldlaeqjtow` refuse cette configuration (`SUPABASE_PRODUCTION_BLOCKED`, `SUPABASE_CONFIG_REQUIRED`) et les appels réseau observés visaient uniquement `tdktfbtqceldlaeqjtow`. La Preview contient donc une référence Production inerte dans son code source, pas dans les pages construites.
