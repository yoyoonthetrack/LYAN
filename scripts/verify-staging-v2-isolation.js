/**
 * Non-destructive isolation checks for Staging V2.
 * Does not start E1–E6 journeys and does not write to Supabase.
 */
'use strict';

require('./force-staging-v2-env');

const { assertStagingIsolation, STAGING_REF, PRODUCTION_REF, hostOf, jwtRef } = require('./staging-v2-guard');

function redact(value) {
  return String(value || '')
    .replace(/sbp_[A-Za-z0-9]+/g, 'sbp_[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_\-\.]+/g, '[JWT_REDACTED]')
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, 'sk_$1_[REDACTED]')
    .replace(/pk_(live|test)_[A-Za-z0-9]+/g, 'pk_$1_[REDACTED]')
    .replace(/whsec_[A-Za-z0-9]+/g, 'whsec_[REDACTED]');
}

(async () => {
  const loaded = assertStagingIsolation(process.env);
  const prodGuard = (() => {
    try {
      assertStagingIsolation({
        SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
        LYANN_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
        LYANN_E2E_WRITE_PROJECT_REF: PRODUCTION_REF,
        STRIPE_SECRET_KEY: 'sk_test_placeholder',
      });
      return { blocked: false };
    } catch (err) {
      return { blocked: true, message: String(err.message || err) };
    }
  })();

  const liveGuard = (() => {
    try {
      assertStagingIsolation({
        SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
        LYANN_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
        LYANN_E2E_WRITE_PROJECT_REF: STAGING_REF,
        STRIPE_SECRET_KEY: 'sk_live_placeholder',
      });
      return { blocked: false };
    } catch (err) {
      return { blocked: true, message: String(err.message || err) };
    }
  })();

  const rest = await fetch(`https://${STAGING_REF}.supabase.co/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
  });
  const auth = await fetch(`https://${STAGING_REF}.supabase.co/auth/v1/health`);

  const prodRestForbidden = !String(process.env.SUPABASE_URL || '').includes(PRODUCTION_REF)
    && hostOf(process.env.SUPABASE_URL) === `${STAGING_REF}.supabase.co`;

  const report = {
    verdict: 'PASS',
    target: STAGING_REF,
    host: loaded.host,
    jwt_refs: {
      anon: jwtRef(process.env.SUPABASE_ANON_KEY),
      service: jwtRef(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    stripe: loaded.stripe,
    rest_http: rest.status,
    auth_health_http: auth.status,
    anti_production_blocks: prodGuard.blocked,
    anti_stripe_live_blocks: liveGuard.blocked,
    production_url_in_process: !prodRestForbidden,
    e2e_started: false,
    supabase_writes: false,
  };

  if (!prodGuard.blocked || !liveGuard.blocked || !prodRestForbidden) report.verdict = 'FAIL';
  if (report.jwt_refs.anon !== STAGING_REF || report.jwt_refs.service !== STAGING_REF) report.verdict = 'FAIL';
  if (loaded.stripe === 'absent') report.verdict = 'FAIL';
  if (auth.status >= 500) report.verdict = 'FAIL';

  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exit(2);
})().catch((err) => {
  console.error(JSON.stringify({ verdict: 'FAIL', error: redact(err && err.message || err) }));
  process.exit(1);
});
