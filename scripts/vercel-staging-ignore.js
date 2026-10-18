'use strict';

// Vercel skips the build when this process exits 0, and builds when it exits 1.
// A git push never sets LYANN_VERCEL_CLI_DEPLOY, so it cannot publish Staging or Production.
const { decideVercelTarget, loadPolicy, inputFromEnv } = require('./vercel-target-gate');

if (process.env.LYANN_VERCEL_CLI_DEPLOY !== '1') {
    console.log('Build ignoré : publication uniquement par scripts/deploy-staging.sh.');
    process.exit(0);
}
const decision = decideVercelTarget(inputFromEnv(), loadPolicy());
if (!decision.ok) {
    console.log(`Build ignoré : ${decision.code} ${decision.detail}`);
    process.exit(0);
}
process.exit(1);
