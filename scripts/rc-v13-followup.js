'use strict';

/**
 * Staging-only follow-up: fund release, refund, invalid session,
 * a disposable QA account deletion, and admin action inventory.
 * Does not touch Production, Stripe live, or the permanent QA A/B/C accounts.
 */
require('./force-staging-v2-env');

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const { assertStagingIsolation, STAGING_REF } = require('./staging-v2-guard');
const { resolveAdminAndJwt } = require('./admin-staging-real-session-lib');

const API = process.env.LYANN_OPS_API || 'http://127.0.0.1:8098';
const OUT = path.join(__dirname, '..', 'artifacts', 'rc-v13', 'followup.json');
const report = { environment: 'staging', supabase_ref: STAGING_REF, cases: [], failures: [], sections: [] };

function record(id, ok, detail) {
  report.cases.push({ id, ok: !!ok, detail: String(detail || '').slice(0, 220) });
  if (!ok) report.failures.push(id);
}

function db(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  });
}

async function signIn(email, password) {
  const anon = db();
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(signed.error ? signed.error.message : 'signin');
  return { id: signed.data.user.id, token: signed.data.session.access_token, client: db(signed.data.session.access_token) };
}

async function api(token, method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

(async () => {
  assertStagingIsolation(process.env);
  const identity = await fetch(API + '/v1/runtime/identity').then((res) => res.json());
  if (identity.supabase_ref !== STAGING_REF || identity.isolation !== 'STAGING_ISOLATED') {
    throw new Error('API non isolée.');
  }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const A = await signIn(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
  const B = await signIn(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);

  const unsigned = await fetch(API + '/v1/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  record('webhook non signé refusé', unsigned.status === 400 || unsigned.status === 401 || unsigned.status === 403, 'status=' + unsigned.status);

  const expired = await api('not-a-jwt', 'POST', '/v1/milestones/release-payment', { milestone_id: '00000000-0000-4000-8000-000000000000' });
  record('jeton invalide refusé sur la libération', expired.status === 401, 'status=' + expired.status);

  const funded = await admin.from('milestones').select('id, status, quote_id').eq('status', 'FUNDED').order('created_at', { ascending: false }).limit(1);
  const milestone = funded.data && funded.data[0];
  if (!milestone) {
    record('jalon FUNDED disponible', false, 'aucun');
  } else {
    const done = await B.client.rpc('mark_milestone_done_secure', {
      p_milestone_id: milestone.id,
      p_comments: 'RC13 réalisation test',
      p_deliverables: []
    });
    const afterDone = await admin.from('milestones').select('status').eq('id', milestone.id).single();
    record('prestataire marque le jalon réalisé', !done.error && afterDone.data && afterDone.data.status === 'COMPLETED', done.error ? done.error.message : (afterDone.data && afterDone.data.status));
    const release = await api(A.token, 'POST', '/v1/milestones/release-payment', {
      milestone_id: milestone.id,
      validation_comment: 'RC13 validation test'
    });
    record('client demande la libération', release.status === 200 && release.payload.status === 'RELEASED', 'status=' + release.status + ' code=' + (release.payload.code || release.payload.error || release.payload.status || ''));
    if (release.payload && (release.payload.status === 'RELEASED' || release.payload.already_transferred)) {
      const again = await api(A.token, 'POST', '/v1/milestones/release-payment', { milestone_id: milestone.id });
      record('seconde libération idempotente', again.payload && (again.payload.idempotent === true || again.payload.already_transferred === true), 'status=' + again.status);
    }
    const outsider = await api(B.token, 'POST', '/v1/milestones/release-payment', { milestone_id: milestone.id });
    record('le prestataire ne libère pas les fonds', outsider.status === 403, 'status=' + outsider.status);
  }

  const pending = await admin.from('milestones').select('id').eq('status', 'PENDING').order('created_at', { ascending: false }).limit(1);
  if (pending.data && pending.data[0]) {
    const refund = await api(A.token, 'POST', '/v1/payments/refund-untransferred', { milestone_id: pending.data[0].id });
    record('remboursement refusé sans paiement réussi', refund.status >= 400 && refund.status < 500, 'status=' + refund.status + ' code=' + (refund.payload.code || ''));
  }

  const stamp = 'rc13-' + Date.now().toString(36);
  const email = stamp + '@lyann.invalid';
  const password = 'Qa13-' + stamp + '!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'RC13' } });
  if (created.error || !created.data.user) {
    record('compte QA jetable créé', false, created.error && created.error.message);
  } else {
    const userId = created.data.user.id;
    const session = await signIn(email, password);
    const renamed = await session.client.from('profiles').update({ first_name: 'RC13-modifie' }).eq('id', userId).select('first_name').maybeSingle();
    record('profil QA jetable modifié', !renamed.error && renamed.data && renamed.data.first_name === 'RC13-modifie', renamed.error ? renamed.error.message : (renamed.data && renamed.data.first_name));
    const removed = await api(session.token, 'POST', '/v1/auth/delete-account', {});
    record('suppression du compte QA jetable', removed.status === 200 && removed.payload.ok === true, 'status=' + removed.status);
    const again = await db().auth.signInWithPassword({ email, password });
    record('connexion impossible après suppression', !!again.error, again.error ? again.error.message : 'session encore ouverte');
    const still = await admin.auth.admin.getUserById(userId);
    if (still.data && still.data.user) {
      await admin.auth.admin.deleteUser(userId);
      record('compte encore présent puis retiré par l’admin Staging', false, 'deleteUser de secours');
    } else {
      record('compte auth absent après suppression', true, 'gone');
    }
  }

  const owner = await resolveAdminAndJwt();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const calls = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/v1/') || url.includes('supabase.co')) calls.push(res.status() + ' ' + url.split('?')[0].slice(0, 140));
  });
  await page.goto(API + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
  await page.evaluate(async ({ accessToken, refreshToken }) => {
    await window.LYANN_API_CLIENT.supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (typeof window.runAdminAuthCheck === 'function') await window.runAdminAuthCheck('RC13');
  }, { accessToken: owner.jwt, refreshToken: owner.refresh });
  await page.waitForTimeout(1000);
  const sections = await page.evaluate(() => [...document.querySelectorAll('a.admin-nav-item[data-section]')].map((node) => node.getAttribute('data-section')));
  for (const id of sections) {
    const before = calls.length;
    await page.evaluate((sectionId) => document.querySelector(`a.admin-nav-item[data-section="${sectionId}"]`)?.click(), id);
    await page.waitForTimeout(400);
    const info = await page.evaluate((sectionId) => {
      const section = document.getElementById(sectionId);
      const buttons = section ? [...section.querySelectorAll('button, a.chip-btn, [role="button"]')].map((node) => (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12) : [];
      const error = section ? ((section.innerText || '').match(/erreur|impossible|indisponible/i) || [])[0] : null;
      return { active: !!(section && section.classList.contains('active')), buttons, error: error || '' };
    }, id);
    const network = calls.slice(before).filter((line) => !/auth\/v1\/token/.test(line)).slice(0, 4);
    report.sections.push({ id, active: info.active, buttons: info.buttons, error: info.error, network });
  }
  const outsider = await browser.newPage();
  await outsider.goto(API + '/admin.html', { waitUntil: 'domcontentloaded' });
  await outsider.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
  const denied = await outsider.evaluate(async ({ email, password }) => {
    await window.LYANN_API_CLIENT.login(email, password);
    if (typeof window.runAdminAuthCheck === 'function') await window.runAdminAuthCheck('RC13_C');
    return window.AUTH_STATE || '';
  }, { email: process.env.LYANN_E2E_QA_C_EMAIL, password: process.env.LYANN_E2E_QA_C_PASSWORD });
  record('QA C reste hors du back-office', denied !== 'AUTHORIZED', denied);
  await browser.close();

  const withActions = report.sections.filter((row) => row.buttons.length > 0).length;
  record('rubriques avec au moins un bouton visible', withActions > 0, withActions + '/' + report.sections.length);
  report.ok = report.failures.length === 0;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, cases: report.cases.length, sections: report.sections.length }, null, 2));
  if (!report.ok) process.exit(1);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
