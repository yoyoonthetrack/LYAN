#!/bin/sh
# PREPARED, NOT RUN. Isolated Preview of lyann-staging-preview only (Phase 3.2C-6: reproducible package).
# Never uses --prod / --environment production, never touches an alias or staging.lyann.app, never targets the project lyan.
# A Preview deployment gets its own URL (lyann-staging-preview-<id>-yoyo-d85d.vercel.app), registers no cron and gets only the Preview variables.
# Needs its own explicit authorization: LYANN_AUTHORIZE_STAGING_PREVIEW=1. Dry run: LYANN_STAGING_PREVIEW_DRY_RUN=1 (builds the package, prints the command, deploys nothing).
#
# What is uploaded is NOT the working tree: it is a package exported from ONE commit with git archive
# (scripts/build-staging-package.js), filtered by config/staging-preview-package.json, and re-verified by the Vercel build
# (scripts/build-staging-preview.js: SHA, file hashes, map assets, Staging lock). Uncommitted or ignored files cannot be uploaded.
# Commit to deploy: LYANN_PREVIEW_COMMIT (default HEAD).

set -eu

if [ "${LYANN_AUTHORIZE_STAGING_PREVIEW:-}" != "1" ]; then
  echo "REFUS : Preview Staging non autorisée. Rien n'a été publié."
  exit 1
fi

node scripts/vercel-target-gate.js --check-link
eval "$(node scripts/vercel-target-gate.js --print-env)"
node scripts/vercel-target-gate.js

RELEASE_SHA=$(git rev-parse --verify "${LYANN_PREVIEW_COMMIT:-HEAD}^{commit}")
if [ "$RELEASE_SHA" != "$(git rev-parse HEAD)" ]; then
  echo "AVERTISSEMENT : le commit à déployer (${RELEASE_SHA}) n'est pas HEAD."
fi

PACKAGE_ROOT="${LYANN_PREVIEW_PACKAGE_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/lyann-preview.XXXXXX")}"
SUMMARY=$(node scripts/build-staging-package.js --commit "$RELEASE_SHA" --out "$PACKAGE_ROOT")
PACKAGE_SHA=$(printf '%s' "$SUMMARY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).manifestSha256))')
FILE_COUNT=$(printf '%s' "$SUMMARY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).fileCount))')
PACKAGE_DIR="$PACKAGE_ROOT/package"
mkdir -p "$PACKAGE_DIR/.vercel"
cp .vercel/project.json "$PACKAGE_DIR/.vercel/project.json"
echo "Paquet : ${FILE_COUNT} fichiers, commit ${RELEASE_SHA}, empreinte ${PACKAGE_SHA}"
echo "Dossier : ${PACKAGE_DIR} (preuves : ${PACKAGE_ROOT}/evidence)"

DEPLOY_CMD="npx vercel deploy --local-config vercel.staging-preview.json --project ${VERCEL_PROJECT_ID} --scope ${VERCEL_ORG_ID} --environment preview --yes"
BUILD_FLAGS="--build-env LYANN_VERCEL_CLI_DEPLOY=1 --build-env VERCEL_PROJECT_NAME=lyann-staging-preview --build-env LYANN_RELEASE_SHA=${RELEASE_SHA} --env LYANN_RELEASE_SHA=${RELEASE_SHA} --meta lyannReleaseSha=${RELEASE_SHA} --meta lyannPackageSha256=${PACKAGE_SHA}"

if [ "${LYANN_STAGING_PREVIEW_DRY_RUN:-}" = "1" ]; then
  echo "DRY ${DEPLOY_CMD} ${BUILD_FLAGS}"
  exit 0
fi

export LYANN_RUNTIME=staging
export LYANN_STAGING_PREFLIGHT_STRICT=1
export LYANN_VERCEL_CLI_DEPLOY=1
node -r ./scripts/force-staging-v2-env.js scripts/staging-preflight.js

cd "$PACKAGE_DIR"
# shellcheck disable=SC2086
${DEPLOY_CMD} ${BUILD_FLAGS}

echo "Preview protégée par Vercel (401 sans session). Contrôle : /v1/runtime/identity doit renvoyer commit=${RELEASE_SHA}, vercel_env=preview, isolation=STAGING_ISOLATED."
echo "Empreinte du paquet envoyé : ${PACKAGE_SHA} (${PACKAGE_ROOT}/evidence/package-manifest.sha256)"
echo "Suppression : npx vercel remove <url-de-la-preview> --scope ${VERCEL_ORG_ID}"
