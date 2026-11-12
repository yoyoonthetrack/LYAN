#!/bin/sh
# PREPARED, NOT RUN (Phase 3.2C-5.2). Isolated Preview of lyann-staging-preview only.
# Never uses --prod / --environment production, never touches an alias or staging.lyann.app, never targets the project lyan.
# A Preview deployment gets its own URL (lyann-staging-preview-<id>-yoyo-d85d.vercel.app), registers no cron and gets only the Preview variables.
# Needs its own explicit authorization: LYANN_AUTHORIZE_STAGING_PREVIEW=1. Dry run: LYANN_STAGING_PREVIEW_DRY_RUN=1 (prints the command, deploys nothing).

set -eu

if [ "${LYANN_AUTHORIZE_STAGING_PREVIEW:-}" != "1" ]; then
  echo "REFUS : Preview Staging non autorisée. Rien n'a été publié."
  exit 1
fi

node scripts/vercel-target-gate.js --check-link
eval "$(node scripts/vercel-target-gate.js --print-env)"
node scripts/vercel-target-gate.js

RELEASE_SHA=$(git rev-parse HEAD)
DEPLOY_CMD="npx vercel deploy --local-config vercel.staging.json --project ${VERCEL_PROJECT_ID} --scope ${VERCEL_ORG_ID} --environment preview --yes"

if [ "${LYANN_STAGING_PREVIEW_DRY_RUN:-}" = "1" ]; then
  echo "DRY ${DEPLOY_CMD} --build-env LYANN_VERCEL_CLI_DEPLOY=1 --build-env VERCEL_PROJECT_NAME=lyann-staging-preview --build-env LYANN_RELEASE_SHA=${RELEASE_SHA} --env LYANN_RELEASE_SHA=${RELEASE_SHA}"
  exit 0
fi

# The upload is the working tree, not the commit. Show what differs so the Preview can be tied to a SHA.
DIRTY=$(git status --short --untracked-files=no | wc -l | tr -d ' ')
if [ "$DIRTY" != "0" ]; then
  echo "AVERTISSEMENT : ${DIRTY} fichier(s) suivi(s) modifié(s) hors du commit ${RELEASE_SHA} (voir git status)."
fi

export LYANN_RUNTIME=staging
export LYANN_STAGING_PREFLIGHT_STRICT=1
export LYANN_VERCEL_CLI_DEPLOY=1
node -r ./scripts/force-staging-v2-env.js scripts/staging-preflight.js

# shellcheck disable=SC2086
${DEPLOY_CMD} \
  --build-env LYANN_VERCEL_CLI_DEPLOY=1 \
  --build-env VERCEL_PROJECT_NAME=lyann-staging-preview \
  --build-env LYANN_RELEASE_SHA="$RELEASE_SHA" \
  --env LYANN_RELEASE_SHA="$RELEASE_SHA"

echo "Preview protégée par Vercel (401 sans session). Contrôle : voir docs/VERCEL_PREVIEW_ISOLATED_PREPARATION.md"
echo "Suppression : npx vercel remove <url-de-la-preview> --scope ${VERCEL_ORG_ID}"
