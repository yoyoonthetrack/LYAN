'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stagingUploadConfig, cronProblems } = require('../scripts/staging-vercel-upload');
const root = require('../vercel.json');
const staging = require('../vercel.staging.json');

test('the Staging upload keeps the editorial cron and the Apple association', () => {
    const uploaded = stagingUploadConfig(root, staging);
    assert.deepEqual(cronProblems(uploaded), []);
    assert.equal(uploaded.functions['api/index.js'].maxDuration, 60);
    assert.equal(root.crons.some((row) => row.path.includes('editorial')), false);
    assert.equal(JSON.stringify(root).includes('prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM'), false);
});

test('duplicate or query cron paths are rejected', () => {
    const broken = stagingUploadConfig(root, {
        ...staging,
        crons: [
            { path: '/v1/editorial/collect?scheduled=1', schedule: '0 11 * * *' },
            { path: '/v1/editorial/collect?scheduled=1', schedule: '0 16 * * *' }
        ]
    });
    const problems = cronProblems(broken);
    assert.ok(problems.some((item) => /double|illisible|absent/.test(item)));
});
