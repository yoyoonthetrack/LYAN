/**
 * Preload for local Staging V2 isolation.
 * Re-applies .env.staging-v2 AFTER api/server.js dotenv(.env.local override).
 * Does not modify product source or .env.local.
 *
 * Usage:
 *   node -r ./scripts/force-staging-v2-env.js api/server.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { assertStagingIsolation, STAGING_REF } = require('./staging-v2-guard');

const ENV_FILE = path.join(__dirname, '..', '.env.staging-v2');

function parseEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const k = trimmed.slice(0, i);
    let v = trimmed.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function applyStaging() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error('force-staging-v2-env: missing .env.staging-v2 — run node scripts/write-staging-v2-env.js');
  }
  const cfg = parseEnvFile(ENV_FILE);
  const keys = [
    'SUPABASE_URL',
    'LYANN_SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'LYANN_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'LYANN_SUPABASE_SERVICE_ROLE_KEY',
    'LYANN_E2E_ALLOW_WRITES',
    'LYANN_E2E_WRITE_PROJECT_REF',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PUBLISHABLE_KEY',
    'PORT',
    'LYANN_E2E_BASE_URL',
    'LYANN_E2E_QA_A_EMAIL',
    'LYANN_E2E_QA_A_PASSWORD',
    'LYANN_E2E_QA_B_EMAIL',
    'LYANN_E2E_QA_B_PASSWORD',
    'LYANN_E2E_QA_C_EMAIL',
    'LYANN_E2E_QA_C_PASSWORD',
    'OPENAI_API_KEY',
    'MODERATION_WORKER_SECRET',
  ];
  for (const k of keys) {
    if (cfg[k] != null && cfg[k] !== '') process.env[k] = cfg[k];
  }
  process.env.LYANN_E2E_ALLOW_WRITES = '1';
  process.env.LYANN_E2E_WRITE_PROJECT_REF = STAGING_REF;
  if (!process.env.LYANN_API_BIND) process.env.LYANN_API_BIND = '0.0.0.0';
  delete process.env.VERCEL_ENV;
  const pushFile = path.join(__dirname, '..', '.env.push.local');
  if (fs.existsSync(pushFile)) {
    const push = parseEnvFile(pushFile);
    const pushKeys = [
      'PUSH_AUTOMATIC_ENABLED',
      'PUSH_CUSTOM_SOUND',
      'PUSH_QA_ONLY',
      'PUSH_QA_USER_IDS',
      'PUSH_CRON_SECRET',
      'APNS_KEY_ID',
      'APNS_TEAM_ID',
      'APNS_BUNDLE_ID',
      'APNS_PRIVATE_KEY',
      'FCM_PROJECT_ID',
      'FCM_CLIENT_EMAIL',
      'FCM_PRIVATE_KEY'
    ];
    for (const key of pushKeys) {
      if (push[key]) process.env[key] = push[key];
    }
  }
  assertStagingIsolation(process.env);
}

applyStaging();

try {
  const dotenv = require('dotenv');
  if (dotenv && typeof dotenv.config === 'function' && !dotenv.config.__lyannStagingV2Wrapped) {
    const orig = dotenv.config.bind(dotenv);
    function wrapped(opts) {
      const result = orig(opts);
      applyStaging();
      return result;
    }
    wrapped.__lyannStagingV2Wrapped = true;
    dotenv.config = wrapped;
  }
} catch (_) {}

module.exports = { applyStaging };
