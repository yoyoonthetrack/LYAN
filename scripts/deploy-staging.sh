#!/bin/sh
# Deploys only the separate Staging Vercel project.
# Refuses to run unless Yoann has set the authorization flag in this shell.
# Does not deploy Production and does not accept --prod.

set -eu

if [ "${LYANN_AUTHORIZE_STAGING_DEPLOY:-}" != "1" ]; then
  echo "Déploiement Staging non autorisé. Rien n'a été publié."
  exit 1
fi

if [ -f .vercel/project.json ]; then
  name=$(node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('.vercel/project.json','utf8')); process.stdout.write(String(j.projectName||j.name||''))")
  case "$name" in
    lyan-app|lyann-app|lyann)
      echo "Le lien Vercel local pointe vers Production ($name). Déploiement arrêté."
      exit 1
      ;;
  esac
fi

export LYANN_RUNTIME=staging
export LYANN_STAGING_PREFLIGHT_STRICT=1
node scripts/staging-preflight.js

# --prod ici vise uniquement le domaine stable du projet lyann-staging,
# jamais le projet Production lyan-app.
npx vercel deploy --local-config vercel.staging.json --prod --yes
echo "Contrôle : LYANN_STAGING_PUBLIC_ORIGIN=https://staging.lyann.app node scripts/verify-staging-hosted.js"
echo "Retour arrière : npx vercel rollback --local-config vercel.staging.json"
