'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const {
  resolveLyannRuntimeConfig,
  PRODUCTION_REF,
  STAGING_V2_REF,
  PRODUCTION_URL,
} = require('../lyann-runtime-config.js');
const { injectIsolatedSupabaseConfig, buildHtml } = require('../shared-html-build');
const { assertStagingIsolation } = require('../scripts/staging-v2-guard');

const STAGING_URL = `https://${STAGING_V2_REF}.supabase.co`;
const STAGING_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRka3RmYnRxY2VsZGxhZXFqdG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjEwMDAwMDAwMH0.stub';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRka3RmYnRxY2VsZGxhZXFqdG93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMTAwMDAwMDAwfQ.stub';

test('deployed lyann.app still uses the production project', () => {
  const resolved = resolveLyannRuntimeConfig({ hostname: 'lyann.app' });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.code, 'DEPLOYED_WEB');
  assert.equal(resolved.url, PRODUCTION_URL);
});

test('localhost without inject fails closed instead of using production', () => {
  const resolved = resolveLyannRuntimeConfig({ hostname: '127.0.0.1' });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, 'SUPABASE_CONFIG_REQUIRED');
  assert.equal(resolved.url, '');
});

test('staging inject is accepted and production is refused while locked', () => {
  const ok = resolveLyannRuntimeConfig({
    injectedUrl: STAGING_URL,
    injectedAnon: STAGING_ANON,
    lock: STAGING_V2_REF,
    hostname: '127.0.0.1',
    backendOrigin: 'http://127.0.0.1:8098',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.url, STAGING_URL);
  assert.equal(ok.backendOrigin, 'http://127.0.0.1:8098');

  const blocked = resolveLyannRuntimeConfig({
    injectedUrl: PRODUCTION_URL,
    injectedAnon: 'anon',
    lock: STAGING_V2_REF,
    hostname: '127.0.0.1',
    isNative: true,
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.code === 'SUPABASE_PRODUCTION_BLOCKED' || blocked.code === 'SUPABASE_LOCK_MISMATCH');
});

test('native without lock keeps the shipped production binding', () => {
  const resolved = resolveLyannRuntimeConfig({ isNative: true, hostname: 'localhost' });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.code, 'SHIPPED_NATIVE');
  assert.equal(resolved.url, PRODUCTION_URL);
});

test('native staging lock without inject cannot fall back to production', () => {
  const resolved = resolveLyannRuntimeConfig({
    isNative: true,
    lock: STAGING_V2_REF,
    hostname: 'localhost',
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, 'SUPABASE_CONFIG_REQUIRED');
});

test('HTML inject writes staging lock and never a service_role key', () => {
  const html = '<html><head></head><body><script src="api-client.js"></script></body></html>';
  const env = process.env;
  process.env.VERCEL_ENV = '';
  process.env.LYANN_E2E_ALLOW_WRITES = '1';
  process.env.LYANN_SUPABASE_URL = STAGING_URL;
  process.env.LYANN_SUPABASE_ANON_KEY = STAGING_ANON;
  process.env.LYANN_E2E_WRITE_PROJECT_REF = STAGING_V2_REF;
  process.env.LYANN_E2E_BASE_URL = 'http://127.0.0.1:8098';
  const out = injectIsolatedSupabaseConfig(html);
  process.env.LYANN_SUPABASE_ANON_KEY = env.LYANN_SUPABASE_ANON_KEY;
  assert.match(out, /LYANN_SUPABASE_URL/);
  assert.match(out, new RegExp(STAGING_V2_REF));
  assert.match(out, /LYANN_SUPABASE_LOCK/);
  assert.match(out, /LYANN_BACKEND_ORIGIN/);
  assert.doesNotMatch(out, /service_role/);
  assert.doesNotMatch(out, /gzispjfoywklpqatjyop/);
  assert.match(out, /lyann-runtime-config\.js/);
});

test('HTML inject refuses production host and Vercel production', () => {
  process.env.LYANN_E2E_ALLOW_WRITES = '1';
  process.env.LYANN_SUPABASE_URL = PRODUCTION_URL;
  process.env.LYANN_SUPABASE_ANON_KEY = STAGING_ANON;
  process.env.VERCEL_ENV = '';
  const local = injectIsolatedSupabaseConfig('<script src="api-client.js"></script>');
  assert.doesNotMatch(local, /LYANN_SUPABASE_URL/);
  process.env.VERCEL_ENV = 'production';
  delete process.env.LYANN_RUNTIME;
  process.env.LYANN_SUPABASE_URL = STAGING_URL;
  const vercel = injectIsolatedSupabaseConfig('<script src="api-client.js"></script>');
  assert.doesNotMatch(vercel, /LYANN_SUPABASE_URL/);
  process.env.LYANN_RUNTIME = 'staging';
  process.env.LYANN_STAGING_PUBLIC_ORIGIN = 'https://staging.lyann.app';
  process.env.LYANN_E2E_BASE_URL = 'http://127.0.0.1:8098';
  const hosted = injectIsolatedSupabaseConfig('<script src="api-client.js"></script>');
  assert.match(hosted, new RegExp(STAGING_V2_REF));
  assert.match(hosted, /https:\/\/staging\.lyann\.app/);
  assert.doesNotMatch(hosted, /127\.0\.0\.1/);
  assert.doesNotMatch(hosted, /gzispjfoywklpqatjyop/);
  process.env.VERCEL_ENV = '';
  delete process.env.LYANN_RUNTIME;
});

test('HTML inject throws if a service_role JWT is offered to the browser', () => {
  process.env.VERCEL_ENV = '';
  process.env.LYANN_E2E_ALLOW_WRITES = '1';
  process.env.LYANN_SUPABASE_URL = STAGING_URL;
  process.env.LYANN_SUPABASE_ANON_KEY = SERVICE_ROLE;
  process.env.LYANN_E2E_WRITE_PROJECT_REF = STAGING_V2_REF;
  assert.throws(
    () => injectIsolatedSupabaseConfig('<script src="api-client.js"></script>'),
    /service_role/
  );
});

test('built product HTML loads the runtime config before api-client', () => {
  const html = buildHtml(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  const runtimeAt = html.indexOf('lyann-runtime-config.js');
  const clientAt = html.indexOf('api-client.js');
  assert.ok(runtimeAt >= 0 && clientAt > runtimeAt);
});

test('staging guard blocks production URL and Stripe live', () => {
  assert.throws(() => assertStagingIsolation({
    SUPABASE_URL: PRODUCTION_URL,
    LYANN_SUPABASE_URL: PRODUCTION_URL,
    LYANN_E2E_WRITE_PROJECT_REF: PRODUCTION_REF,
    STRIPE_SECRET_KEY: 'sk_test_x',
  }));
  assert.throws(() => assertStagingIsolation({
    SUPABASE_URL: STAGING_URL,
    LYANN_SUPABASE_URL: STAGING_URL,
    LYANN_E2E_WRITE_PROJECT_REF: STAGING_V2_REF,
    STRIPE_SECRET_KEY: 'sk_live_x',
  }));
});

test('api-client no longer uses the production constants as a silent default return', () => {
  const client = fs.readFileSync(path.join(root, 'api-client.js'), 'utf8');
  assert.match(client, /function resolveLyannClientBinding/);
  assert.match(client, /SUPABASE_CONFIG_REQUIRED/);
  assert.match(client, /Aucun basculement silencieux vers la production/);
  assert.doesNotMatch(client, /function getLyannSupabaseUrl\(\) \{\s*if \(typeof window !== 'undefined' && window\.LYANN_SUPABASE_URL\) \{\s*return String\(window\.LYANN_SUPABASE_URL\)\.replace\(\/\\\/\$\/, ''\);\s*\}\s*return SUPABASE_URL;/);
});

test('server refuses a missing Supabase URL instead of hardcoding production', () => {
  const server = fs.readFileSync(path.join(root, 'api/server.js'), 'utf8');
  assert.match(server, /function requireConfiguredSupabaseUrl/);
  assert.doesNotMatch(server, /const supabaseUrl = process\.env\.SUPABASE_URL \|\| 'https:\/\/gzispjfoywklpqatjyop\.supabase\.co'/);
  assert.doesNotMatch(server, /placeholder_service_key/);
});

test('guard source and verify script remain fail-closed', () => {
  const guard = fs.readFileSync(path.join(root, 'scripts/staging-v2-guard.js'), 'utf8');
  const verify = fs.readFileSync(path.join(root, 'scripts/verify-staging-v2-isolation.js'), 'utf8');
  assert.match(guard, /refused — production gzispjfoywklpqatjyop/);
  assert.match(guard, /Stripe Live is forbidden/);
  assert.match(verify, /anti_production_blocks/);
});

test('runtime storage bucket names match the Staging V2 SQL', () => {
  const client = fs.readFileSync(path.join(root, 'api-client.js'), 'utf8');
  const sql = fs.readFileSync(path.join(root, '65_bokantaj_media_and_request_photos.sql'), 'utf8');
  assert.match(client, /from\('bokantaj-media'\)/);
  assert.match(client, /bucket = 'request-photos'/);
  assert.match(sql, /'bokantaj-media'/);
  assert.match(sql, /'request-photos'/);
  assert.match(sql, /TO authenticated/);
  assert.match(sql, /foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.doesNotMatch(sql, /TO anon/);
  const executable = sql.replace(/^--.*$/gm, '');
  assert.doesNotMatch(executable, /gzispjfoywklpqatjyop/);
  assert.match(sql, /Do not apply to gzispjfoywklpqatjyop/);
});

test('mobile inject rewrites loopback backend to a LAN origin', () => {
  process.env.VERCEL_ENV = '';
  process.env.LYANN_E2E_ALLOW_WRITES = '1';
  process.env.LYANN_SUPABASE_URL = STAGING_URL;
  process.env.LYANN_SUPABASE_ANON_KEY = STAGING_ANON;
  process.env.LYANN_E2E_WRITE_PROJECT_REF = STAGING_V2_REF;
  process.env.LYANN_E2E_BASE_URL = 'http://127.0.0.1:8098';
  process.env.LYANN_MOBILE_BUILD = '1';
  process.env.LYANN_NATIVE_BACKEND_ORIGIN = 'http://192.168.1.20:8098';
  const out = injectIsolatedSupabaseConfig('<html><head></head><body><script src="api-client.js"></script></body></html>');
  delete process.env.LYANN_MOBILE_BUILD;
  delete process.env.LYANN_NATIVE_BACKEND_ORIGIN;
  assert.match(out, /192\.168\.1\.20:8098/);
  assert.doesNotMatch(out, /127\.0\.0\.1:8098/);
  assert.doesNotMatch(out, /localhost:8098/);
});

test('messaging repository reads missions and milestones with live columns', () => {
  const messaging = fs.readFileSync(path.join(root, 'messaging-repository.js'), 'utf8');
  assert.match(messaging, /select\('id,status,related_request_id,request_invitation_id'\)/);
  assert.doesNotMatch(messaging, /related_request_id,request_id,request_invitation_id/);
  assert.match(messaging, /order\('display_order', \{ ascending: true \}\)/);
  assert.doesNotMatch(messaging, /order\('position'/);
});
