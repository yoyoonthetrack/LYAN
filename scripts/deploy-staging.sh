#!/bin/sh
# Deploys only the allowlisted Staging Vercel project.
# Refuses Production, unknown projects, and any run without the authorization flag.
# Does not create a Vercel project.

set -eu

if [ "${LYANN_AUTHORIZE_STAGING_DEPLOY:-}" != "1" ]; then
  echo "REFUS : déploiement Staging non autorisé. Rien n'a été publié."
  exit 1
fi

node scripts/vercel-target-gate.js

export LYANN_RUNTIME=staging
export LYANN_STAGING_PREFLIGHT_STRICT=1
export LYANN_VERCEL_CLI_DEPLOY=1
node scripts/staging-preflight.js

# --prod ici vise le domaine stable du projet lyann-staging-preview,
# jamais le projet Production lyan.
npx vercel deploy --local-config vercel.staging.json --prod --yes
echo "Contrôle : LYANN_STAGING_PUBLIC_ORIGIN=https://staging.lyann.app node scripts/verify-staging-hosted.js"
echo "Retour arrière : npx vercel rollback --local-config vercel.staging.json"
