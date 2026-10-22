'use strict';

/**
 * Chromium admin console: hide content, then sanction the exact QA user id.
 * Staging only. Tokens are never printed.
 */
require('./force-staging-v2-env');

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const { resolveAdminAndJwt, mustStaging, STAGING_REF } = require('./admin-staging-real-session-lib');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const BASE = process.env.LYANN_ADMIN_UI_BASE || 'http://127.0.0.1:8098';
const MARKER = `[QA-MOD-UI ${Date.now()}]`;
const SHOTS = path.join(__dirname, '..', 'artifacts', 'moderation-staging', 'admin-ui');

function env() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) throw new Error('Staging only');
  return {
    url,
    anon,
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

async function restWrite(url, anonKey, jwt, table, payload) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  return { status: res.status, text: (await res.text()).slice(0, 180) };
}

(async () => {
  mustStaging();
  const { url, anon, admin } = env();
  const health = await fetch(`${BASE}/v1/admin/moderation-center`);
  if (health.status === 404) throw new Error(`API ${BASE} injoignable.`);

  const adminSession = await resolveAdminAndJwt();
  const qaPassword = `QaModUi${Date.now()}!aA1`;
  const qaEmail = `qa.modui.${Date.now()}@lyann.test`;
  const created = await admin.auth.admin.createUser({ email: qaEmail, password: qaPassword, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error && created.error.message || 'QA user');
  const userId = created.data.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    first_name: 'QA',
    last_name: 'ModUiExact',
    city: 'Pointe-à-Pitre',
    territory: 'guadeloupe',
    account_type: 'real',
    restriction_status: 'none'
  });

  const member = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await member.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  const oldJwt = signed.data && signed.data.session && signed.data.session.access_token;
  if (!oldJwt) throw new Error('JWT membre introuvable.');

  fs.mkdirSync(SHOTS, { recursive: true });
  const report = { target: STAGING_REF, base: BASE, userId, steps: [] };
  const note = (id, ok, extra) => report.steps.push({ id, ok: !!ok, ...extra });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err.message || err)));

  async function signInAdmin() {
    await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    await page.evaluate(async ({ accessToken, refreshToken }) => {
      await window.LYANN_API_CLIENT.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      await window.runAdminAuthCheck('MOD_ADMIN_UI');
    }, { accessToken: adminSession.jwt, refreshToken: adminSession.refresh });
    await page.waitForFunction(() => window.AUTH_STATE === 'AUTHORIZED', null, { timeout: 15000 });
  }

  async function openExactUser() {
    await page.locator('details.admin-nav-group[data-pole="confiance"] summary').click().catch(() => {});
    await page.locator('.admin-nav-item[data-section="sec-content"]').click({ force: true });
    await page.locator('.mod-tab[data-mod-tab="users"]').click();
    await page.fill('#modSearch', userId);
    await page.waitForSelector(`#modUsersBody tr[data-user-id="${userId}"]`, { timeout: 15000 });
  }

  async function rowBadge() {
    return ((await page.locator(`#modUsersBody tr[data-user-id="${userId}"] [data-restriction]`).textContent()) || '').trim();
  }

  async function detailStatus() {
    return page.locator(`#modDetail [data-user-id="${userId}"]`).first().getAttribute('data-user-status');
  }

  async function applyKind(kind) {
    const btn = page.locator(`#modDetail [data-user-id="${userId}"][data-sanction="${kind}"]`);
    await btn.waitFor({ state: 'visible', timeout: 15000 });
    let captured = null;
    const onRes = async (res) => {
      if (res.request().method() === 'POST' && res.url().includes(`/users/${userId}/sanction`)) {
        captured = { status: res.status(), payload: await res.json().catch(() => ({})) };
      }
    };
    page.on('response', onRes);
    await btn.click();
    const started = Date.now();
    while (!captured && Date.now() - started < 20000) {
      await page.waitForTimeout(200);
    }
    page.off('response', onRes);
    await page.waitForFunction(({ id, kind }) => {
      const badge = document.querySelector(`#modUsersBody tr[data-user-id="${id}"] [data-restriction]`);
      const wanted = { warning: 'Averti', suspend: 'Suspendu', ban: 'Banni', lift: 'Normal' }[kind];
      return badge && wanted && badge.textContent.includes(wanted);
    }, { id: userId, kind }, { timeout: 15000 }).catch(() => {});
    return captured || { status: 0, payload: {} };
  }

  await signInAdmin();
  note('admin-shell', true, { authState: 'AUTHORIZED', userId });

  await openExactUser();
  const initialBadge = await rowBadge();
  note('user-initial-normal', /normal/i.test(initialBadge), { badge: initialBadge, userId });
  await page.locator(`#modUsersBody button[data-user-id="${userId}"][data-open-user]`).click();
  await page.waitForSelector(`#modDetail [data-user-id="${userId}"]`, { timeout: 8000 });
  note('user-detail-identity', true, { userId });

  await page.fill('#modSanctionReason', `${MARKER} avertir`);
  const warned = await applyKind('warning', `${MARKER} avertir`);
  const warnBadge = await rowBadge();
  note('warn-ui', warned.payload.success && /averti/i.test(warnBadge) && warned.payload.user && warned.payload.user.id === userId, {
    http: warned.status,
    badge: warnBadge,
    complete: warned.payload.complete,
    notice: ((await page.locator('#modNotice').textContent()) || '').trim()
  });

  await page.fill('#modSanctionReason', `${MARKER} lever warn`);
  await applyKind('lift');

  await page.fill('#modSanctionReason', `${MARKER} suspension UI`);
  const suspended = await applyKind('suspend');
  const suspendBadge = await rowBadge();
  const suspendDetail = await detailStatus();
  const untilText = ((await page.locator('#modUserUntil').textContent()) || '').trim();
  const reasonText = ((await page.locator('#modUserReason').textContent()) || '').trim();
  const blocked = await restWrite(url, anon, oldJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} write after ui suspend`,
    territory: 'guadeloupe'
  });
  note('suspend-ui', suspended.payload.success && /suspendu/i.test(suspendBadge) && suspendDetail === 'suspended' && /échéance/i.test(untilText) && reasonText.includes('suspension UI') && blocked.status !== 201, {
    http: suspended.status,
    complete: suspended.payload.complete,
    partial: suspended.payload.partial,
    badge: suspendBadge,
    detail: suspendDetail,
    until: untilText,
    reason: reasonText,
    writeStatus: blocked.status
  });
  await page.screenshot({ path: path.join(SHOTS, '04-user-suspended.png'), fullPage: true });

  await signInAdmin();
  await openExactUser();
  const afterReload = await rowBadge();
  note('suspend-persists-reload', /suspendu/i.test(afterReload), { badge: afterReload, userId });

  await page.locator(`#modUsersBody button[data-user-id="${userId}"][data-open-user]`).click();
  await page.fill('#modSanctionReason', `${MARKER} levée UI`);
  const lifted = await applyKind('lift');
  const liftBadge = await rowBadge();
  note('lift-ui', lifted.payload.success && /normal/i.test(liftBadge) && lifted.payload.user && lifted.payload.user.id === userId, {
    http: lifted.status,
    badge: liftBadge,
    history: ((await page.locator('#modUserHistory').textContent()) || '').includes('suspend')
  });

  await signInAdmin();
  await openExactUser();
  const liftReload = await rowBadge();
  await page.locator(`#modUsersBody button[data-user-id="${userId}"][data-open-user]`).click();
  await page.waitForSelector('#modUserHistory', { timeout: 8000 });
  const history = ((await page.locator('#modUserHistory').textContent()) || '');
  note('lift-persists-reload', /normal/i.test(liftReload) && /suspend/i.test(history), { badge: liftReload, history: history.slice(0, 180) });

  await page.fill('#modSanctionReason', `${MARKER} bannir`);
  const banned = await applyKind('ban');
  const banBadge = await rowBadge();
  const banWrite = await restWrite(url, anon, oldJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} write after ui ban`,
    territory: 'guadeloupe'
  });
  note('ban-ui', banned.payload.success && /banni/i.test(banBadge) && banned.payload.user && banned.payload.user.id === userId && banWrite.status !== 201, {
    http: banned.status,
    badge: banBadge,
    writeStatus: banWrite.status
  });

  await page.fill('#modSanctionReason', `${MARKER} cleanup`);
  await applyKind('lift');

  report.page_errors = errors;
  report.go = report.steps.every((step) => step.ok);
  await browser.close();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.go ? 0 : 1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
