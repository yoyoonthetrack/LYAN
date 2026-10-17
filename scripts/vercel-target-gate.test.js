'use strict';

const assert = require('assert');
const { decideVercelTarget, loadPolicy } = require('./vercel-target-gate');

const PRODUCTION = 'prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM';
const STAGING = 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q';
const ready = loadPolicy();
const staging = {
    projectId: STAGING,
    orgId: 'team_Q2iI3QsUHFqSNkD3pjjg5d58',
    projectName: 'lyann-staging-preview',
    supabaseUrl: 'https://tdktfbtqceldlaeqjtow.supabase.co',
    stripeSecret: 'sk_test_unit',
    publicOrigin: 'https://staging.lyann.app',
    domains: ['staging.lyann.app']
};

const production = decideVercelTarget({
    ...staging,
    projectId: PRODUCTION,
    projectName: 'lyan',
    domains: ['lyann.app']
}, ready);
assert.strictEqual(production.ok, false);
assert.strictEqual(production.code, 'PRODUCTION');

const unknown = decideVercelTarget({ ...staging, projectId: 'prj_unknown_not_allowlisted' }, ready);
assert.strictEqual(unknown.ok, false);
assert.strictEqual(unknown.code, 'UNKNOWN');

const wrongTeam = decideVercelTarget({ ...staging, orgId: 'team_other' }, ready);
assert.strictEqual(wrongTeam.ok, false);
assert.strictEqual(wrongTeam.code, 'ORG');

const domain = decideVercelTarget({ ...staging, domains: ['www.lyann.app'] }, ready);
assert.strictEqual(domain.ok, false);
assert.strictEqual(domain.code, 'PRODUCTION_DOMAIN');

const live = decideVercelTarget({ ...staging, stripeSecret: 'sk_live_unit' }, ready);
assert.strictEqual(live.ok, false);

const ambiguous = decideVercelTarget({
    ...staging,
    linked: { projectId: 'prj_other_file' }
}, ready);
assert.strictEqual(ambiguous.ok, false);
assert.strictEqual(ambiguous.code, 'AMBIGUOUS');

const accepted = decideVercelTarget(staging, ready);
assert.strictEqual(accepted.ok, true);
assert.strictEqual(accepted.code, 'STAGING');

console.log('vercel-target-gate: REFUS production, REFUS inconnu, ACCEPTÉ staging identifié');
