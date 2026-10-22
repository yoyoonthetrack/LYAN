'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertHostedIsolation, browserOriginAllowed, runtimeIdentity } = require('../api/runtime-isolation');

function jwt(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

const staging = {
    LYANN_RUNTIME: 'staging',
    SUPABASE_URL: 'https://tdktfbtqceldlaeqjtow.supabase.co',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
    SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: 'tdktfbtqceldlaeqjtow' }),
    LYANN_STAGING_PUBLIC_ORIGIN: 'https://staging.lyann.app'
};

test('staging can publish from its own site, production cannot', () => {
    assert.equal(browserOriginAllowed('https://staging.lyann.app', staging), true);
    assert.equal(browserOriginAllowed('https://lyann.app', staging), true);
    assert.equal(browserOriginAllowed('https://staging.lyann.app', {
        SUPABASE_URL: 'https://gzispjfoywklpqatjyop.supabase.co'
    }), false);
    assert.equal(browserOriginAllowed('https://evil.example', staging), false);
    assert.equal(browserOriginAllowed('capacitor://localhost', staging), true);
    assert.equal(browserOriginAllowed('ionic://localhost', staging), true);
    assert.equal(browserOriginAllowed('https://attacker.lyann.app', staging), false);
});

test('an unscoped local process is not treated as a hosted environment', () => {
    assert.equal(assertHostedIsolation({}).ok, true);
});

test('staging refuses production supabase, live stripe, and lyann.app', () => {
    assert.equal(assertHostedIsolation(staging).code, 'STAGING_ISOLATED');
    assert.equal(assertHostedIsolation(Object.assign({}, staging, {
        SUPABASE_URL: 'https://gzispjfoywklpqatjyop.supabase.co'
    })).code, 'STAGING_POINTS_AT_PRODUCTION');
    assert.equal(assertHostedIsolation(Object.assign({}, staging, {
        STRIPE_SECRET_KEY: 'sk_live_example'
    })).code, 'STAGING_STRIPE_LIVE');
    assert.equal(assertHostedIsolation(Object.assign({}, staging, {
        LYANN_STAGING_PUBLIC_ORIGIN: 'https://lyann.app'
    })).code, 'STAGING_ORIGIN_IS_PRODUCTION');
    assert.equal(assertHostedIsolation(Object.assign({}, staging, {
        SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: 'gzispjfoywklpqatjyop' })
    })).code, 'SERVICE_ROLE_REF_MISMATCH');
});

test('runtime identity reports the staging ref without secrets', () => {
    const previewEnv = Object.assign({}, staging, {
        VERCEL_ENV: 'preview',
        VERCEL_GIT_COMMIT_SHA: '1e4b351deadbeef'
    });
    delete previewEnv.LYANN_RUNTIME;
    const identity = runtimeIdentity(previewEnv);
    assert.equal(identity.success, true);
    assert.equal(identity.vercel_env, 'preview');
    assert.equal(identity.kind, 'preview');
    assert.equal(identity.supabase_ref, 'tdktfbtqceldlaeqjtow');
    assert.equal(identity.staging, true);
    assert.equal(identity.production, false);
    assert.equal(identity.isolation, 'STAGING_ISOLATED');
    assert.equal(identity.commit, '1e4b351deadbeef');
    assert.equal(JSON.stringify(identity).includes('sk_'), false);
    assert.equal(JSON.stringify(identity).includes('service_role'), false);
    const gateway = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
    assert.match(gateway, /path === '\/v1\/runtime\/identity'/);
    assert.match(gateway, /function getExpressApp/);
    assert.doesNotMatch(gateway, /^const app = require\('\.\/server\.js'\);/m);
});

test('production refuses the staging project and a staging public origin', () => {
    const production = {
        VERCEL_ENV: 'production',
        SUPABASE_URL: 'https://gzispjfoywklpqatjyop.supabase.co',
        STRIPE_SECRET_KEY: 'sk_live_example',
        STRIPE_LIVE_ENABLED: 'true',
        STRIPE_PUBLISHABLE_KEY: 'pk_live_example'
    };
    assert.equal(assertHostedIsolation(production).code, 'PRODUCTION_ISOLATED');
    assert.equal(assertHostedIsolation(Object.assign({}, production, {
        SUPABASE_URL: 'https://tdktfbtqceldlaeqjtow.supabase.co'
    })).code, 'PRODUCTION_POINTS_AT_STAGING');
    assert.equal(assertHostedIsolation(Object.assign({}, production, {
        LYANN_STAGING_PUBLIC_ORIGIN: 'https://staging.lyann.app'
    })).code, 'PRODUCTION_HAS_STAGING_ORIGIN');
});
