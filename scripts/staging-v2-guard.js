'use strict';

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const STAGING_HOST = `${STAGING_REF}.supabase.co`;
const PRODUCTION_HOST = `${PRODUCTION_REF}.supabase.co`;

function hostOf(url) {
  try {
    return new URL(String(url || '').replace(/\/$/, '')).hostname;
  } catch (_) {
    return '';
  }
}

function jwtRef(token) {
  if (!token || String(token).split('.').length < 2) return null;
  try {
    const json = Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8');
    return JSON.parse(json).ref || null;
  } catch (_) {
    return null;
  }
}

function collectSupabaseValues(env) {
  return [
    env.SUPABASE_URL,
    env.LYANN_SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    env.LYANN_SUPABASE_ANON_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.LYANN_SUPABASE_SERVICE_ROLE_KEY,
    env.LYANN_E2E_WRITE_PROJECT_REF,
  ].filter(Boolean).map(String);
}

function assertStagingIsolation(env) {
  const src = env || process.env;
  const url = src.LYANN_SUPABASE_URL || src.SUPABASE_URL || '';
  const host = hostOf(url);
  const blob = collectSupabaseValues(src).join('\n');

  if (!host || host !== STAGING_HOST) {
    throw new Error(`staging-v2-guard: refused — Supabase host is not ${STAGING_HOST}`);
  }
  if (host === PRODUCTION_HOST || blob.includes(PRODUCTION_REF) || blob.includes(PRODUCTION_HOST)) {
    throw new Error('staging-v2-guard: refused — production gzispjfoywklpqatjyop detected');
  }
  if (String(src.LYANN_E2E_WRITE_PROJECT_REF || '') !== STAGING_REF) {
    throw new Error('staging-v2-guard: refused — LYANN_E2E_WRITE_PROJECT_REF is not Staging V2');
  }

  for (const name of ['SUPABASE_ANON_KEY', 'LYANN_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'LYANN_SUPABASE_SERVICE_ROLE_KEY']) {
    const ref = jwtRef(src[name]);
    if (ref && ref !== STAGING_REF) {
      throw new Error(`staging-v2-guard: refused — ${name} JWT ref is not Staging V2`);
    }
    if (ref === PRODUCTION_REF) {
      throw new Error(`staging-v2-guard: refused — ${name} is a production key`);
    }
  }

  const stripeSecret = String(src.STRIPE_SECRET_KEY || '');
  const stripePub = String(src.STRIPE_PUBLISHABLE_KEY || '');
  if (stripeSecret.startsWith('sk_live') || stripePub.startsWith('pk_live')) {
    throw new Error('staging-v2-guard: refused — Stripe Live is forbidden');
  }
  if (stripeSecret && !stripeSecret.startsWith('sk_test_')) {
    throw new Error('staging-v2-guard: refused — Stripe secret must be sk_test_');
  }
  if (stripePub && !stripePub.startsWith('pk_test_')) {
    throw new Error('staging-v2-guard: refused — Stripe publishable key must be pk_test_');
  }

  return {
    ok: true,
    target: STAGING_REF,
    host,
    stripe: stripeSecret ? 'sk_test' : 'absent',
  };
}

module.exports = {
  STAGING_REF,
  PRODUCTION_REF,
  STAGING_HOST,
  PRODUCTION_HOST,
  hostOf,
  jwtRef,
  assertStagingIsolation,
};
