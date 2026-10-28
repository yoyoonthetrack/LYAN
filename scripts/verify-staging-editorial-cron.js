'use strict';

const { spawnSync } = require('child_process');

const result = spawnSync('npx', [
    'vercel', 'crons', 'list',
    '--local-config', 'vercel.staging.json',
    '--project', 'lyann-staging-preview',
    '--scope', 'team_Q2iI3QsUHFqSNkD3pjjg5d58',
    '--json'
], { encoding: 'utf8' });

if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
}

let payload;
try {
    payload = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
} catch (error) {
    console.error('Réponse cron illisible.');
    process.exit(1);
}

const crons = payload.crons || [];
const editorial = crons.find((row) => row.path === '/v1/editorial/collect/scheduled');
const moderation = crons.find((row) => row.path === '/v1/internal/moderation/run');
const push = crons.find((row) => row.path === '/v1/notifications/push-drain');
console.log(JSON.stringify({
    editorial: editorial ? editorial.schedule : null,
    moderation: Boolean(moderation),
    push: push ? push.schedule : null,
    undeployed: (payload.undeployed || []).map((row) => row.path)
}, null, 2));
if (!editorial || editorial.schedule !== '0 11,16,21 * * *') {
    console.error('Le cron éditorial Staging n’est pas enregistré.');
    process.exit(1);
}
if (!push || push.schedule !== '* * * * *') {
    console.error('Le cron de notifications Staging n’est pas enregistré.');
    process.exit(1);
}
