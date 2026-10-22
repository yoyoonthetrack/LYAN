'use strict';

/**
 * Real admin UI on isolated Staging API: five tabs, hide post, hide comment, suspend.
 * No Production. Tokens are never printed.
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

async function publicSees(url, anon, table, id) {
  const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&select=id`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` }
  });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
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
    last_name: 'ModUi',
    city: 'Pointe-à-Pitre',
    territory: 'guadeloupe',
    account_type: 'real',
    restriction_status: 'none'
  });
  const post = await admin.from('bokantaj_posts').insert({
    author_id: userId,
    type: 'info',
    content: `${MARKER} post visible`,
    territory: 'guadeloupe',
    city: 'Pointe-à-Pitre',
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).select('id').single();
  if (post.error) throw new Error(post.error.message);
  await admin.from('bokantaj_posts').update({
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).eq('id', post.data.id);
  const comment = await admin.from('bokantaj_comments').insert({
    author_id: userId,
    post_id: post.data.id,
    content: `${MARKER} comment visible`,
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).select('id').single();
  if (comment.error) throw new Error(comment.error.message);
  await admin.from('bokantaj_comments').update({
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).eq('id', comment.data.id);

  const member = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await member.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  const oldJwt = signed.data && signed.data.session && signed.data.session.access_token;
  if (!oldJwt) throw new Error('JWT membre introuvable.');

  fs.mkdirSync(SHOTS, { recursive: true });
  const report = { target: STAGING_REF, base: BASE, marker: MARKER, postId: post.data.id, commentId: comment.data.id, tabs: {}, steps: [] };
  const note = (id, ok, extra) => report.steps.push({ id, ok: !!ok, ...extra });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err.message || err)));

  await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
  await page.evaluate(async ({ accessToken, refreshToken }) => {
    await window.LYANN_API_CLIENT.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    await window.runAdminAuthCheck('MOD_ADMIN_UI');
  }, { accessToken: adminSession.jwt, refreshToken: adminSession.refresh });
  await page.waitForTimeout(1200);
  const authState = await page.evaluate(() => window.AUTH_STATE);
  note('admin-shell', authState === 'AUTHORIZED', { authState });
  if (authState !== 'AUTHORIZED') throw new Error(`Auth UI: ${authState}`);

  await page.locator('details.admin-nav-group[data-pole="confiance"] summary').click();
  await page.locator('.admin-nav-item[data-section="sec-content"]').click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, '01-queue.png'), fullPage: true });

  const tabIds = ['queue', 'posts', 'comments', 'users', 'reports'];
  for (const tab of tabIds) {
    await page.locator(`.mod-tab[data-mod-tab="${tab}"]`).click();
    await page.waitForTimeout(900);
    const pane = page.locator(`.mod-pane[data-mod-pane="${tab}"]`);
    report.tabs[tab] = {
      active: await page.locator(`.mod-tab[data-mod-tab="${tab}"].is-active`).count() > 0,
      paneVisible: await pane.evaluate((el) => el.classList.contains('is-active')),
      engine: ((await page.locator('#modEngineBar').textContent()) || '').slice(0, 180),
      rows: await pane.locator('tbody tr').count()
    };
    await page.screenshot({ path: path.join(SHOTS, `tab-${tab}.png`), fullPage: true });
    note(`tab-${tab}`, report.tabs[tab].active && report.tabs[tab].paneVisible, report.tabs[tab]);
  }

  await page.locator('.mod-tab[data-mod-tab="posts"]').click();
  await page.fill('#modSearch', MARKER);
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.loadAdminModerationCenter());
  await page.waitForTimeout(800);
  const hideBtn = page.locator('#contentBokantajTableBody button', { hasText: 'Masquer' }).first();
  const hideCount = await hideBtn.count();
  note('hide-button-present', hideCount > 0, { hideCount });
  if (hideCount) {
    await hideBtn.click();
    await page.locator('#modNotice').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => /masqué/i.test(document.querySelector('#contentBokantajTableBody .status-badge')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  }
  const hideNotice = ((await page.locator('#modNotice').textContent()) || '').trim();
  const postBadge = ((await page.locator('#contentBokantajTableBody .status-badge').first().textContent()) || '').trim();
  const postHiddenPublic = !(await publicSees(url, anon, 'bokantaj_posts', post.data.id));
  note('hide-post-ui', /retiré|masqué|invisible/i.test(hideNotice) && postHiddenPublic && /masqué/i.test(postBadge), {
    notice: hideNotice,
    badge: postBadge,
    public: !postHiddenPublic
  });
  await page.screenshot({ path: path.join(SHOTS, '02-post-hidden.png'), fullPage: true });

  await page.locator('.mod-tab[data-mod-tab="comments"]').click();
  await page.fill('#modSearch', MARKER);
  await page.evaluate(() => window.loadAdminModerationCenter());
  await page.waitForTimeout(800);
  const hideCommentBtn = page.locator('#modCommentsBody button', { hasText: 'Masquer' }).first();
  if (await hideCommentBtn.count()) {
    await hideCommentBtn.click();
    await page.waitForTimeout(1200);
  }
  const commentNotice = ((await page.locator('#modNotice').textContent()) || '').trim();
  const commentHiddenPublic = !(await publicSees(url, anon, 'bokantaj_comments', comment.data.id));
  note('hide-comment-ui', commentHiddenPublic, { notice: commentNotice, public: !commentHiddenPublic });
  await page.screenshot({ path: path.join(SHOTS, '03-comment-hidden.png'), fullPage: true });

  await page.locator('.mod-tab[data-mod-tab="users"]').click();
  await page.fill('#modSearch', '');
  await page.locator('#modUsersBody button', { hasText: 'Mesures' }).first().waitFor({ timeout: 15000 });
  await page.fill('#modSearch', 'ModUi');
  await page.evaluate(() => window.loadAdminModerationCenter());
  await page.locator('#modUsersBody button', { hasText: 'Mesures' }).first().waitFor({ timeout: 15000 });
  const mesures = page.locator('#modUsersBody button', { hasText: 'Mesures' }).first();
  note('user-row', await mesures.count() > 0, {
    rows: await page.locator('#modUsersBody tr').count()
  });
  if (await mesures.count()) {
    await mesures.click();
    await page.locator('#modSanctionReason').waitFor({ timeout: 5000 });
    await page.fill('#modSanctionReason', `${MARKER} suspension UI`);
    await page.locator('#modDetail button', { hasText: 'Suspendre' }).click();
    await page.locator('#modNotice.is-ok').waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  const sanctionNotice = ((await page.locator('#modNotice').textContent()) || '').trim();
  const profile = await admin.from('profiles').select('restriction_status').eq('id', userId).maybeSingle();
  const blocked = await restWrite(url, anon, oldJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} write after ui suspend`,
    territory: 'guadeloupe'
  });
  note('suspend-ui', profile.data && profile.data.restriction_status === 'suspended' && blocked.status !== 201, {
    notice: sanctionNotice,
    restriction: profile.data && profile.data.restriction_status,
    writeStatus: blocked.status,
    writeText: blocked.text
  });
  await page.screenshot({ path: path.join(SHOTS, '04-user-suspended.png'), fullPage: true });

  if (await page.locator('#modDetail button', { hasText: 'Lever' }).count()) {
    await page.fill('#modSanctionReason', `${MARKER} levée UI`);
    await page.locator('#modDetail button', { hasText: 'Lever' }).click();
    await page.waitForTimeout(800);
  }
  const { createModerationCenter } = require('../api/admin-moderation-center');
  await createModerationCenter({
    supabaseAdmin: admin,
    verifyAdminPermission: async () => ({ authorized: true, userId: adminSession.userId })
  }).applySanction({
    userId,
    kind: 'lift',
    reason: `${MARKER} cleanup`,
    actorId: adminSession.userId
  });

  report.page_errors = errors;
  report.go = report.steps.every((step) => step.ok);
  await browser.close();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.go ? 0 : 1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
