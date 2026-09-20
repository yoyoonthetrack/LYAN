/**
 * Bootstrap the isolated QA Supabase project only.
 * Never targets production (gzispjfoywklpqatjyop).
 *
 * Applies forward SQL (schema + numbered migrations, skip audits/rollbacks/prod cleanup),
 * then creates confirmed QA auth users A/B/C.
 *
 * SQL apply needs one of:
 *   LYANN_SUPABASE_DB_PASSWORD  (Database settings → password)
 *   DATABASE_URL                (postgres://…@db.<ref>.supabase.co:5432/postgres)
 *   SUPABASE_ACCESS_TOKEN       (account access token — Management API)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config();

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const ROOT = path.join(__dirname, '..');

const SKIP = new Set([
  '01_preflight_audit.sql',
  // schema.sql already created public.payments; v1 CREATE TABLE IF NOT EXISTS
  // then assumes milestone_id. v2+ ALTER the legacy table instead.
  '07_payment_core_migration.sql',
  '07_payment_core_migration_v261_rollback.sql',
  '07_payment_core_migration_v262_rollback.sql',
  '31_safe_final_test_data_cleanup.sql',
  '31_safe_final_test_data_cleanup_rehearsal.sql',
  // Isolated schema never created rls_auto_enable(); 36 restores public_profiles.
  '34_supabase_security_surface_hardening.sql',
  'supabase_security_setup.sql'
]);

function jwtRef(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString()).ref || '';
  } catch (e) {
    return '';
  }
}

function hostRef(url) {
  try {
    const host = new URL(url).hostname;
    return host.replace('.supabase.co', '');
  } catch (e) {
    return '';
  }
}

function migrationFiles() {
  const files = ['schema.sql'];
  const numbered = fs.readdirSync(ROOT).filter((name) => {
    if (!name.endsWith('.sql')) return false;
    if (name === 'schema.sql' || SKIP.has(name)) return false;
    return /^\d+/.test(name);
  });
  numbered.sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (na !== nb) return na - nb;
    const version = (name) => {
      const match = name.match(/_v(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    const va = version(a);
    const vb = version(b);
    if (va !== vb) return va - vb;
    const letter = (name) => (/^\d+[a-z]_/.test(name) ? 1 : 0);
    if (letter(a) !== letter(b)) return letter(a) - letter(b);
    return a.localeCompare(b);
  });
  return files.concat(numbered).map((name) => path.join(ROOT, name));
}

function bootstrapFiles() {
  const files = migrationFiles();
  const schemaIdx = files.findIndex((file) => path.basename(file) === 'schema.sql');
  const requestBridge = path.join(__dirname, 'isolated-qa-requests-bridge.sql');
  const disputesBridge = path.join(__dirname, 'isolated-qa-disputes-bridge.sql');
  if (schemaIdx === -1) {
    files.unshift(requestBridge);
  } else {
    files.splice(schemaIdx + 1, 0, requestBridge);
  }
  const eleven = files.findIndex((file) => path.basename(file) === '11_disputes_and_refunds_migration.sql');
  if (eleven === -1) files.push(disputesBridge);
  else files.splice(eleven, 0, disputesBridge);
  const adminBridge = path.join(__dirname, 'isolated-qa-admin-bridge.sql');
  const twelve = files.findIndex((file) => path.basename(file) === '12_admin_and_agents_migration.sql');
  if (twelve === -1) files.push(adminBridge);
  else files.splice(twelve, 0, adminBridge);
  return files;
}

function loadConfig() {
  const url = (process.env.LYANN_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.LYANN_SUPABASE_ANON_KEY || '';
  const service =
    process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const writeRef = process.env.LYANN_E2E_WRITE_PROJECT_REF || '';
  const ref = hostRef(url);
  if (!url || !ref) {
    throw new Error('LYANN_SUPABASE_URL is required');
  }
  if (ref === PRODUCTION_REF || jwtRef(anon) === PRODUCTION_REF || jwtRef(service) === PRODUCTION_REF) {
    throw new Error('Refusing to bootstrap production Supabase');
  }
  if (writeRef !== ref) {
    throw new Error(`Write ref mismatch: ${writeRef} vs ${ref}`);
  }
  if (jwtRef(anon) !== ref || jwtRef(service) !== ref) {
    throw new Error('Anon/service role JWT ref does not match LYANN_SUPABASE_URL');
  }
  return { url, anon, service, ref };
}

async function tableExists(url, service, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` }
  });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`schema probe ${table} HTTP ${res.status}: ${body.slice(0, 160)}`);
}

function prepareSql(raw) {
  let sql = String(raw || '').replace(/\r\n/g, '\n');
  const fence = sql.indexOf('\n```');
  if (fence !== -1) sql = sql.slice(0, fence);
  return sql.trim();
}

async function applyViaManagementApi(ref, files) {
  const token = process.env.SUPABASE_ACCESS_TOKEN || '';
  if (!token) return { attempted: false, applied: [] };
  const applied = [];
  for (const file of files) {
    const query = prepareSql(fs.readFileSync(file, 'utf8'));
    if (!query) continue;
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${path.basename(file)} management SQL HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    applied.push(path.basename(file));
    console.log('SQL OK', path.basename(file));
  }
  return { attempted: true, applied };
}

async function applyViaPostgres(ref, files) {
  const password = process.env.LYANN_SUPABASE_DB_PASSWORD || '';
  const databaseUrl = process.env.DATABASE_URL || process.env.LYANN_DATABASE_URL || '';
  if (!password && !databaseUrl) return { attempted: false, applied: [] };

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch (e) {
    throw new Error('Install pg to apply SQL with a database password: npm install pg');
  }

  const client = databaseUrl
    ? new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
    : new Client({
      host: `db.${ref}.supabase.co`,
      port: 5432,
      user: 'postgres',
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });

  await client.connect();
  const applied = [];
  try {
    for (const file of files) {
      const sql = prepareSql(fs.readFileSync(file, 'utf8'));
      if (!sql) continue;
      await client.query(sql);
      applied.push(path.basename(file));
      console.log('SQL OK', path.basename(file));
    }
  } finally {
    await client.end();
  }
  return { attempted: true, applied };
}

async function ensureQaUsers(url, service, anon) {
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const password = process.env.LYANN_E2E_QA_A_PASSWORD || 'Password123!';
  const users = [
    { email: process.env.LYANN_E2E_QA_A_EMAIL || 'req_user_a@lyann.app', first_name: 'QA', last_name: 'Alpha' },
    { email: process.env.LYANN_E2E_QA_B_EMAIL || 'req_user_b@lyann.app', first_name: 'QA', last_name: 'Bravo' },
    { email: 'req_user_c@lyann.app', first_name: 'QA', last_name: 'Charlie' }
  ];

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = new Map((listed.users || []).map((u) => [u.email, u]));

  for (const spec of users) {
    const found = existing.get(spec.email);
    if (found) {
      const { error } = await admin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
        user_metadata: { first_name: spec.first_name, last_name: spec.last_name }
      });
      if (error) throw error;
      console.log('USER UPDATED', spec.email.replace(/@.*$/, '@…'));
      continue;
    }
    const { error } = await admin.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { first_name: spec.first_name, last_name: spec.last_name }
    });
    if (error) throw error;
    console.log('USER CREATED', spec.email.replace(/@.*$/, '@…'));
  }

  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const spec of users) {
    const { data, error } = await client.auth.signInWithPassword({ email: spec.email, password });
    if (error || !data.user) {
      throw new Error(`sign-in failed for ${spec.email.replace(/@.*$/, '@…')}: ${error && error.message}`);
    }
    await client.auth.signOut();
    console.log('SIGNIN OK', spec.email.replace(/@.*$/, '@…'));
  }
}

function enableIsolatedWrites() {
  const envPath = path.join(ROOT, '.env.local');
  let text = fs.readFileSync(envPath, 'utf8');
  if (/^LYANN_E2E_ALLOW_WRITES=/m.test(text)) {
    text = text.replace(/^LYANN_E2E_ALLOW_WRITES=.*/m, 'LYANN_E2E_ALLOW_WRITES=1');
  } else {
    text += '\nLYANN_E2E_ALLOW_WRITES=1\n';
  }
  fs.writeFileSync(envPath, text);
  console.log('WRITES enabled for isolated project only (LYANN_E2E_ALLOW_WRITES=1)');
}

async function main() {
  const cfg = loadConfig();
  console.log(JSON.stringify({
    target: cfg.ref,
    production: false,
    files: bootstrapFiles().map((f) => path.basename(f))
  }));

  let files = bootstrapFiles();
  const hasProfilesAlready = await tableExists(cfg.url, cfg.service, 'profiles');
  if (hasProfilesAlready) {
    files = files.filter((file) => path.basename(file) !== 'schema.sql');
    console.log('skip schema.sql (profiles already exist)');
  }
  let sql = await applyViaManagementApi(cfg.ref, files);
  if (!sql.attempted) sql = await applyViaPostgres(cfg.ref, files);

  const hasProfiles = await tableExists(cfg.url, cfg.service, 'profiles');
  if (!hasProfiles) {
    console.log('STATUS=environment_required schema_sql_not_applied');
    console.log('Need LYANN_SUPABASE_DB_PASSWORD or SUPABASE_ACCESS_TOKEN to apply schema on pcmvagiuvleeciktligz.');
    console.log('SQL editor: https://supabase.com/dashboard/project/pcmvagiuvleeciktligz/sql/new');
    process.exit(3);
  }

  if (sql.attempted) {
    console.log('SQL applied', sql.applied.length, 'files');
  } else {
    console.log('SQL already present (profiles exists); skipped apply');
  }

  await ensureQaUsers(cfg.url, cfg.service, cfg.anon);
  enableIsolatedWrites();
  console.log('STATUS=ready isolated_qa', cfg.ref);
}

main().catch((err) => {
  console.error('BOOTSTRAP FAIL', err.message);
  process.exit(1);
});
