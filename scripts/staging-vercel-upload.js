'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCTION_PROJECT_ID = 'prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM';
const STAGING_PROJECT_ID = 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q';

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stagingUploadConfig(root, staging) {
    const uploaded = JSON.parse(JSON.stringify(staging));
    const duration = root && root.functions && root.functions['api/index.js'] && root.functions['api/index.js'].maxDuration;
    uploaded.functions = uploaded.functions || {};
    uploaded.functions['api/index.js'] = Object.assign(
        { maxDuration: duration || 60 },
        uploaded.functions['api/index.js'] || {}
    );
    if (!uploaded.functions['api/index.js'].maxDuration) {
        uploaded.functions['api/index.js'].maxDuration = duration || 60;
    }
    return uploaded;
}

function cronProblems(config) {
    const crons = (config && config.crons) || [];
    const problems = [];
    const paths = crons.map((row) => row.path);
    if (new Set(paths).size !== paths.length) problems.push('chemin de cron en double');
    for (const row of crons) {
        if (!row.path || row.path.includes('?')) problems.push('chemin de cron illisible : ' + row.path);
    }
    const required = [
        ['/v1/editorial/collect/scheduled', '0 11,16,21 * * *'],
        ['/v1/internal/moderation/run', '* * * * *'],
        ['/v1/notifications/push-drain', '* * * * *']
    ];
    for (const [cronPath, schedule] of required) {
        if (!crons.some((row) => row.path === cronPath && row.schedule === schedule)) {
            problems.push('cron absent : ' + cronPath);
        }
    }
    const text = JSON.stringify(config);
    if (text.includes(PRODUCTION_PROJECT_ID)) problems.push('projet Production présent');
    if (!text.includes('apple-app-site-association.staging.json')) problems.push('association Apple Staging absente');
    return problems;
}

function loadUploadConfig(repoRoot) {
    const root = readJson(path.join(repoRoot, 'vercel.json'));
    const staging = readJson(path.join(repoRoot, 'vercel.staging.json'));
    return stagingUploadConfig(root, staging);
}

module.exports = {
    PRODUCTION_PROJECT_ID,
    STAGING_PROJECT_ID,
    stagingUploadConfig,
    cronProblems,
    loadUploadConfig
};
