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

# Vercel enregistre les crons du fichier vercel.json envoyé, pas ceux de
# --local-config. On y copie uniquement les crons Staging le temps de l'envoi,
# puis le fichier de Production est restauré. Le projet lyan n'est pas déployé.
CRON_BACKUP=$(mktemp)
cp vercel.json "$CRON_BACKUP"
restore_vercel_json() {
  if [ -n "${CRON_BACKUP:-}" ] && [ -f "$CRON_BACKUP" ]; then
    cp "$CRON_BACKUP" vercel.json
    rm -f "$CRON_BACKUP"
    CRON_BACKUP=""
  fi
}
trap restore_vercel_json EXIT
node << 'JS'
const fs = require('fs');
const root = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const staging = JSON.parse(fs.readFileSync('vercel.staging.json', 'utf8'));
root.crons = staging.crons;
fs.writeFileSync('vercel.json', JSON.stringify(root, null, 2) + '\n');
JS

# --prod promotes the stable domain of lyann-staging-preview, not the project lyan.
RELEASE_SHA=$(git rev-parse HEAD)
npx vercel deploy --local-config vercel.staging.json --project "$VERCEL_PROJECT_ID" --scope "$VERCEL_ORG_ID" --prod --yes \
  --build-env LYANN_VERCEL_CLI_DEPLOY=1 \
  --build-env VERCEL_PROJECT_NAME=lyann-staging-preview \
  --build-env LYANN_RELEASE_SHA="$RELEASE_SHA" \
  --env LYANN_RELEASE_SHA="$RELEASE_SHA"
restore_vercel_json
echo "Contrôle : node scripts/verify-staging-hosted.js"
node scripts/verify-staging-editorial-cron.js
echo "Retour arrière : npx vercel rollback --local-config vercel.staging.json --project ${VERCEL_PROJECT_ID} --scope ${VERCEL_ORG_ID}"
