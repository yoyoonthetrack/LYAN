'use strict';

// The isolated Preview script is prepared, not run. These checks keep it from ever becoming a production deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'deploy-staging-preview.sh');
const text = fs.readFileSync(script, 'utf8');
const code = text.replace(/^\s*#.*$/gm, '');

test('preview script cannot deploy to production or touch aliases', () => {
    assert.doesNotMatch(code, /--prod\b/);
    assert.doesNotMatch(code, /--environment\s+production/);
    assert.doesNotMatch(code, /\bvercel\s+(alias|promote|rollback|domains|env\s+(add|rm|remove))\b/);
    assert.doesNotMatch(code, /gzispjfoywklpqatjyop|\blyan\b(?!n)/);
    assert.match(code, /--environment preview\b/);
    assert.match(code, /vercel-target-gate\.js --check-link/);
    assert.match(code, /LYANN_AUTHORIZE_STAGING_PREVIEW/);
});

test('preview script refuses without its own authorization flag', () => {
    const run = spawnSync('sh', [script], { cwd: root, env: { PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /non autorisée/);
});

test('preview dry run prints a preview command for lyann-staging-preview only', { skip: !fs.existsSync(path.join(root, '.vercel', 'project.json')) && 'no local Vercel link' }, () => {
    const run = spawnSync('sh', [script], {
        cwd: root,
        env: { PATH: process.env.PATH, LYANN_AUTHORIZE_STAGING_PREVIEW: '1', LYANN_STAGING_PREVIEW_DRY_RUN: '1' },
        encoding: 'utf8'
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^DRY npx vercel deploy .*--environment preview --yes/m);
    assert.doesNotMatch(run.stdout, /--prod/);
    assert.match(run.stdout, /prj_FHIKUKYa8IwpiitigUma4gTtTF6q/);
});
