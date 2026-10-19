'use strict';

const { assertHostedIsolation } = require('../api/runtime-isolation');

const env = Object.assign({}, process.env, { LYANN_RUNTIME: 'staging' });
const result = assertHostedIsolation(env);
if (!result.ok) {
    console.error(result.code + ' ' + result.message);
    process.exit(1);
}
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const missing = required.filter((key) => !String(env[key] || '').trim());
if (missing.length && process.env.LYANN_STAGING_PREFLIGHT_STRICT === '1') {
    console.error('Secrets manquants : ' + missing.join(', '));
    process.exit(1);
}
console.log(result.code);
if (missing.length) console.log('Secrets encore absents de cet environnement : ' + missing.join(', '));
