#!/bin/sh
# Deploys only lyann-staging-preview. Refuses Production, an unknown project,
# and any run without the authorization flag. Does not create a Vercel project.

set -eu

if [ "${LYANN_AUTHORIZE_STAGING_DEPLOY:-}" != "1" ]; then
  echo "REFUS : déploiement Staging non autorisé. Rien n'a été publié."
  exit 1
fi

node scripts/vercel-target-gate.js --check-link
eval "$(node scripts/vercel-target-gate.js --print-env)"
node scripts/vercel-target-gate.js

if [ "${LYANN_STAGING_DEPLOY_DRY_RUN:-}" = "1" ]; then
  echo "DRY npx vercel deploy --local-config vercel.staging.json --project ${VERCEL_PROJECT_ID} --scope ${VERCEL_ORG_ID} --prod --yes"
  exit 0
fi

export LYANN_RUNTIME=staging
export LYANN_STAGING_PREFLIGHT_STRICT=1
export LYANN_VERCEL_CLI_DEPLOY=1
node scripts/staging-preflight.js

# --prod promotes the stable domain of lyann-staging-preview, not the project lyan.
npx vercel deploy --local-config vercel.staging.json --project "$VERCEL_PROJECT_ID" --scope "$VERCEL_ORG_ID" --prod --yes \
  --build-env LYANN_VERCEL_CLI_DEPLOY=1 \
  --build-env VERCEL_PROJECT_NAME=lyann-staging-preview
echo "Contrôle : node scripts/verify-staging-hosted.js"
echo "Retour arrière : npx vercel rollback --local-config vercel.staging.json --project ${VERCEL_PROJECT_ID} --scope ${VERCEL_ORG_ID}"
