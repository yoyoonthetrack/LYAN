'use strict';

/**
 * Staging-only functional pass for RC V1.2.
 * Uses the existing QA accounts and the local API already bound to
 * tdktfbtqceldlaeqjtow. Refuses Production. Deletes only rows this run creates.
 */
require('./force-staging-v2-env');

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const { assertStagingIsolation, STAGING_REF, PRODUCTION_REF } = require('./staging-v2-guard');
const { resolveAdminAndJwt } = require('./admin-staging-real-session-lib');

const API = process.env.LYANN_OPS_API || 'http://127.0.0.1:8098';
const MARKER = `RC12-${Date.now()}`;
const OUT = path.join(__dirname, '..', 'artifacts', 'rc-v12', 'staging-pass.json');

function client(key, token) {
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  });
}

async function signIn(email, password) {
  const anon = client(process.env.SUPABASE_ANON_KEY);
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    throw new Error(signed.error ? signed.error.message : 'Connexion QA impossible.');
  }
  return {
    id: signed.data.user.id,
    token: signed.data.session.access_token,
    db: client(process.env.SUPABASE_ANON_KEY, signed.data.session.access_token)
  };
}

function record(report, id, ok, detail) {
  report.cases.push({ id, ok: !!ok, detail: String(detail || '').slice(0, 240) });
  if (!ok) report.failures.push(id);
}

async function cleanup(admin, ids) {
  if (ids.comment) await admin.from('bokantaj_comments').delete().eq('id', ids.comment);
  if (ids.message) await admin.from('messages').delete().eq('id', ids.message);
  if (ids.post) await admin.from('bokantaj_posts').delete().eq('id', ids.post).like('content', `${MARKER}%`);
}

(async () => {
  const guard = assertStagingIsolation(process.env);
  if (guard.target !== STAGING_REF || String(process.env.SUPABASE_URL).includes(PRODUCTION_REF)) {
    throw new Error('Refus Production.');
  }
  const identity = await fetch(`${API}/v1/runtime/identity`).then((res) => res.json());
  if (identity.supabase_ref !== STAGING_REF || identity.isolation !== 'STAGING_ISOLATED') {
    throw new Error('API locale non isolée.');
  }

  const report = {
    environment: 'staging',
    supabase_ref: STAGING_REF,
    api_isolation: identity.isolation,
    marker: MARKER,
    cases: [],
    failures: [],
    admin_sections: []
  };
  const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
  await admin.from('bokantaj_comments').delete().like('content', 'QA-BOK-HIDE-%');
  await admin.from('bokantaj_posts').delete().like('content', 'QA-BOK-HIDE-%');
  const ids = {};
  const A = await signIn(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
  const B = await signIn(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);
  const C = await signIn(process.env.LYANN_E2E_QA_C_EMAIL, process.env.LYANN_E2E_QA_C_PASSWORD);
  record(report, 'auth A B C', true, 'trois sessions membre');

  const inserted = await A.db.from('bokantaj_posts').insert({
    author_id: A.id,
    type: 'info',
    content: `${MARKER} info de quartier`,
    city: 'Les Abymes',
    territory: 'guadeloupe',
    place_lat: 16.241,
    place_lng: -61.534,
    place_label: 'Les Abymes'
  }).select('id, public_moderation_status, place_lat, place_lng').single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error ? inserted.error.message : 'Publication membre refusée.');
  ids.post = inserted.data.id;
  record(report, 'bokantaj A inserts via RLS', inserted.data.public_moderation_status === 'pending', inserted.data.public_moderation_status);
  record(report, 'bokantaj place stored rounded', inserted.data.place_lat === 16.241 && inserted.data.place_lng === -61.534, `${inserted.data.place_lat},${inserted.data.place_lng}`);

  const seenB = await B.db.from('bokantaj_posts').select('id').eq('id', ids.post).eq('public_moderation_status', 'approved');
  record(report, 'bokantaj B cannot read pending as approved', !(seenB.data || []).length && !seenB.error, seenB.error ? seenB.error.message : 'absent');

  const owner = await resolveAdminAndJwt();
  const decide = async (subject, id, decision) => {
    const res = await fetch(`${API}/v1/admin/moderation-center/content/${subject}/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.jwt}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ decision, reason: MARKER })
    });
    return res.json();
  };
  const approved = await decide('post', ids.post, 'approved');
  const after = await admin.from('bokantaj_posts').select('public_moderation_status').eq('id', ids.post).single();
  record(report, 'admin approves member post', approved.success === true && after.data && after.data.public_moderation_status === 'approved', after.data && after.data.public_moderation_status);
  const publicB = await B.db.from('bokantaj_posts').select('id, place_lat').eq('id', ids.post).eq('public_moderation_status', 'approved');
  record(report, 'B sees approved post', (publicB.data || []).some((row) => row.id === ids.post), `rows=${(publicB.data || []).length}`);

  const hidden = await decide('post', ids.post, 'hide');
  const hiddenRow = await admin.from('bokantaj_posts').select('public_moderation_status').eq('id', ids.post).single();
  const stillB = await B.db.from('bokantaj_posts').select('id').eq('id', ids.post).eq('public_moderation_status', 'approved');
  record(report, 'hide removes post from B', hidden.success === true && hiddenRow.data.public_moderation_status === 'rejected' && !(stillB.data || []).length, hiddenRow.data && hiddenRow.data.public_moderation_status);

  const conversation = await A.db.rpc('get_or_create_conversation', { p_target_user_id: B.id });
  const conversationId = conversation.data || null;
  record(report, 'A opens conversation with B', !!conversationId && !conversation.error, conversation.error ? conversation.error.message : 'uuid');
  if (conversationId) {
    const message = await A.db.from('messages').insert({
      conversation_id: conversationId,
      sender_id: A.id,
      content: `${MARKER} bonjour`
    }).select('id').maybeSingle();
    ids.message = message.data && message.data.id;
    const readB = await B.db.from('messages').select('id').eq('id', ids.message);
    const readC = await C.db.from('messages').select('id').eq('id', ids.message);
    record(report, 'B reads the message', !!(readB.data || []).length && !readB.error, `rows=${(readB.data || []).length}`);
    record(report, 'C cannot read the message', !(readC.data || []).length, `rows=${(readC.data || []).length}`);
    const spoof = await C.db.from('messages').insert({
      conversation_id: conversationId,
      sender_id: A.id,
      content: `${MARKER} spoof`
    }).select('id').maybeSingle();
    record(report, 'C cannot send as A', !spoof.data, spoof.error ? spoof.error.code || 'denied' : 'row');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  try {
    await page.goto(`${API}/feed.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const lock = await page.evaluate(() => window.LYANN_SUPABASE_LOCK || '');
    record(report, 'feed HTML lock is Staging', lock === STAGING_REF, lock || 'absent');
    const login = await page.evaluate(async ({ email, password }) => {
      const res = await window.LYANN_API_CLIENT.login(email, password);
      return { ok: !res.error, message: res.error && res.error.message };
    }, { email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD });
    record(report, 'UI login A', login.ok, login.message || 'session');
    await page.evaluate(() => { document.body.classList.add('user-is-logged-in'); });
    await page.locator('#bokantajComposerOpen').click();
    await page.locator('#flashContentInput').fill(`${MARKER} depuis l interface`);
    await page.locator('#createFlashForm').evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(2500);
    const uiPost = await A.db.from('bokantaj_posts').select('id, public_moderation_status').ilike('content', `${MARKER} depuis l interface`).order('created_at', { ascending: false }).limit(1);
    const uiRow = uiPost.data && uiPost.data[0];
    if (uiRow) ids.uiPost = uiRow.id;
    const status = uiRow && uiRow.public_moderation_status;
    const other = status === 'approved'
      ? await B.db.from('bokantaj_posts').select('id').eq('id', uiRow.id).eq('public_moderation_status', 'approved')
      : { data: [] };
    const visibleToB = (other.data || []).length > 0;
    record(report, 'UI publish persists', !!uiRow && (status === 'pending' || status === 'approved'), uiPost.error ? uiPost.error.message : (status || 'missing'));
    record(report, 'UI publish visibility matches status', status === 'pending' ? !visibleToB : status === 'approved' ? visibleToB : false, status === 'approved' ? 'B sees it' : 'B does not');
  } catch (err) {
    record(report, 'UI publish persists pending', false, err.message);
  }
  await page.close();

  const adminPage = await browser.newPage();
  try {
    await adminPage.goto(`${API}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await adminPage.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    await adminPage.evaluate(async ({ accessToken, refreshToken }) => {
      await window.LYANN_API_CLIENT.supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (typeof window.runAdminAuthCheck === 'function') await window.runAdminAuthCheck('RC12');
    }, { accessToken: owner.jwt, refreshToken: owner.refresh });
    await adminPage.waitForTimeout(1200);
    const authState = await adminPage.evaluate(() => window.AUTH_STATE || '');
    record(report, 'admin UI authorized', authState === 'AUTHORIZED', authState);
    const sections = await adminPage.evaluate(() => [...document.querySelectorAll('a.admin-nav-item[data-section]')].map((node) => node.getAttribute('data-section')));
    record(report, 'admin nav lists 33 sections', sections.length === 33, String(sections.length));
    for (const id of sections) {
      await adminPage.evaluate((sectionId) => {
        const item = document.querySelector(`a.admin-nav-item[data-section="${sectionId}"]`);
        if (item) item.click();
      }, id);
      await adminPage.waitForTimeout(250);
      const state = await adminPage.evaluate((sectionId) => {
        const section = document.getElementById(sectionId);
        const active = section && (section.classList.contains('active') || section.style.display !== 'none');
        return { present: !!section, active: !!active };
      }, id);
      report.admin_sections.push({ id, present: state.present, active: state.active });
    }
    const inactive = report.admin_sections.filter((row) => !row.present || !row.active);
    record(report, 'each admin section opens', inactive.length === 0, inactive.map((row) => row.id).join(',') || '33');

    const outsider = await browser.newPage();
    await outsider.goto(`${API}/admin.html`, { waitUntil: 'domcontentloaded' });
    await outsider.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    const outsiderLogin = await outsider.evaluate(async ({ email, password }) => {
      const res = await window.LYANN_API_CLIENT.login(email, password);
      if (typeof window.runAdminAuthCheck === 'function') await window.runAdminAuthCheck('RC12_OUTSIDER');
      return { ok: !res.error, state: window.AUTH_STATE || '' };
    }, { email: process.env.LYANN_E2E_QA_C_EMAIL, password: process.env.LYANN_E2E_QA_C_PASSWORD });
    record(report, 'QA C is not an admin', outsiderLogin.ok && outsiderLogin.state !== 'AUTHORIZED', outsiderLogin.state);
    await outsider.close();
  } catch (err) {
    record(report, 'admin UI authorized', false, err.message);
  }
  await browser.close();

  if (ids.uiPost) await admin.from('bokantaj_posts').delete().eq('id', ids.uiPost).like('content', `${MARKER}%`);
  await cleanup(admin, ids);
  const left = await admin.from('bokantaj_posts').select('id').eq('id', ids.post).maybeSingle();
  record(report, 'QA rows removed', !left.data, left.data ? 'still present' : 'gone');

  report.ok = report.failures.length === 0;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, cases: report.cases.length, sections: report.admin_sections.length }, null, 2));
  if (!report.ok) process.exit(1);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
