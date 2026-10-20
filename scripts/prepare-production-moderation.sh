#!/bin/sh
# One controlled Production cutover. Refuses without both gates.
# Does not change Stripe and does not upload the iOS build.
#
# Forward, after a custom-format backup that pg_restore --list can read:
#   LYANN_AUTHORIZE_PRODUCTION_DEPLOY=1 \
#   LYANN_PRODUCTION_CONFIRM=lyann-production-moderation \
#   LYANN_PRODUCTION_BACKUP=/path/backup.sql \
#   OPENAI_API_KEY=... MODERATION_WORKER_SECRET=... CRON_SECRET=... \
#   SUPABASE_ACCESS_TOKEN=... \
#   sh scripts/prepare-production-moderation.sh
#
# Rollback, unreviewed content stays hidden:
#   LYANN_PRODUCTION_ROLLBACK=1 plus the same two gates.

set -eu
cd "$(dirname "$0")/.."
exec node scripts/production-moderation-cutover.js
