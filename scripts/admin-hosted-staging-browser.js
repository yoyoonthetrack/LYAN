'use strict';

require('./force-staging-v2-env');

const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { resolveAdminAndJwt, STAGING_REF } = require('./admin-staging-real-session-lib');

const BASE = 'http://127.0.0.1:8098';
const MARKER = `[LYANN-QA-BO ${new Date().toISOString().slice(0, 16)}]`;

(async () => {
  const url = process.env.SUPABASE_URL || '';
  if (!url.includes(STAGING_REF)) throw new Error('Refus : projet Staging requis.');
  const health = await fetch(`${BASE}/v1/admin/me`);
  if (health.status === 404) throw new Error('Préprod 8098 injoignable.');
  const { jwt, refresh, emailDomain } = await resolveAdminAndJwt();
  const collectCalls = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('request', (req) => {
    if (req.url().includes('/v1/admin/editorial/collect') && req.method() === 'POST') {
      collectCalls.push(req.url());
    }
  });
  const out = { supabase_ref: STAGING_REF, admin_email_domain: emailDomain, steps: {} };
  try {
    await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    await page.evaluate(async ({ accessToken, refreshToken }) => {
      await window.LYANN_API_CLIENT.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      await window.runAdminAuthCheck('HOSTED_STAGING');
    }, { accessToken: jwt, refreshToken: refresh });
    await page.waitForTimeout(1200);
    out.steps.auth = await page.evaluate(() => ({
      state: window.AUTH_STATE,
      shell: Boolean(document.getElementById('adminShellView') && document.getElementById('adminShellView').style.display !== 'none')
    }));
    if (out.steps.auth.state !== 'AUTHORIZED') throw new Error('Connexion admin échouée.');

    await page.locator('.admin-nav-item[data-section="sec-editorial"]').click();
    await page.waitForTimeout(800);
    page.once('dialog', (d) => d.accept().catch(() => {}));
    if (await page.locator('#editorialCollectBtn').count()) {
      const waitCollect = page.waitForRequest((req) => req.url().includes('/v1/admin/editorial/collect') && req.method() === 'POST', { timeout: 8000 }).catch(() => null);
      await page.locator('#editorialCollectBtn').click();
      await page.locator('#editorialCollectBtn').click({ force: true, timeout: 400 }).catch(() => {});
      await waitCollect;
      await page.waitForTimeout(9000);
    }
    out.steps.generate = {
      collect_requests: collectCalls.length,
      notice: (await page.locator('#editorialNotice').textContent().catch(() => '')) || '',
      bots: await page.locator('#editorialBots article, #editorialBots .admin-card').count().catch(() => 0)
    };

    const pending = page.locator('[data-proposal] textarea.editorial-text:not([readonly])').first();
    if (await pending.count()) {
      const current = await pending.inputValue();
      await pending.fill(`${current}\n\n${MARKER} révision navigateur.`);
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await page.locator('[data-proposal] .editorial-save').first().click();
      await page.waitForTimeout(800);
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await page.locator('[data-proposal] .editorial-publish').first().click();
      await page.waitForTimeout(2500);
      out.steps.editorial_publish = {
        notice: (await page.locator('#editorialNotice').textContent().catch(() => '')) || '',
        cards: await page.locator('[data-proposal]').count()
      };
    } else {
      out.steps.editorial_publish = { pending: 0 };
    }

    await page.locator('.admin-nav-item[data-section="sec-maison"]').click();
    await page.waitForTimeout(1000);
    const firstMaison = page.locator('#maisonRosterList [data-maison-id]').first();
    out.steps.maison_roster = await firstMaison.count();
    if (await firstMaison.count()) {
      await firstMaison.click();
      await page.waitForTimeout(900);
      await page.locator('#maisonBokantajInput').fill(`${MARKER} publication maison navigateur.`);
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await page.locator('#maisonPublishBtn').click();
      await page.waitForTimeout(4000);
      out.steps.maison_publish = {
        notice: (await page.locator('#maisonPublishNotice').textContent().catch(() => '')) || ''
      };
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    await page.evaluate(async ({ accessToken, refreshToken }) => {
      await window.LYANN_API_CLIENT.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      await window.runAdminAuthCheck('HOSTED_RELOAD');
    }, { accessToken: jwt, refreshToken: refresh });
    await page.waitForTimeout(1000);
    out.steps.reload_auth = await page.evaluate(() => window.AUTH_STATE);

    await page.locator('.admin-nav-item[data-section="sec-users"]').click();
    await page.waitForTimeout(700);
    out.steps.users = await page.locator('#usersAdminTableBody tr').count();
    await page.locator('.admin-nav-item[data-section="sec-taxonomy"]').click();
    await page.waitForTimeout(700);
    out.steps.taxonomy = await page.locator('#adminTaxonomyTbody tr').count();
    await page.locator('.admin-nav-item[data-section="sec-chat"]').click();
    await page.waitForTimeout(700);
    out.steps.conversations = await page.locator('#conversationsAdminTableBody tr').count();
    await page.locator('.admin-nav-item[data-section="sec-agents"]').click();
    await page.waitForTimeout(700);
    out.steps.agents = await page.locator('#agentsContainer .admin-card, #agentsContainer > div').count();
    await page.locator('.admin-nav-item[data-section="sec-mika"]').click();
    await page.waitForTimeout(700);
    out.steps.mika = Boolean(await page.locator('#mikaTasksList, #mikaChatInput').count());

    const anon = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: feed } = await anon.from('bokantaj_posts')
      .select('id, content, public_moderation_status')
      .ilike('content', `%${MARKER}%`)
      .order('created_at', { ascending: false })
      .limit(5);
    out.steps.feed = (feed || []).map((row) => ({
      id: row.id,
      moderation: row.public_moderation_status,
      visible: row.public_moderation_status === 'approved'
    }));

    out.ok = out.steps.auth.state === 'AUTHORIZED'
      && collectCalls.length === 1
      && out.steps.reload_auth === 'AUTHORIZED'
      && out.steps.feed.some((row) => row.visible);
    console.log(JSON.stringify(out, null, 2));
    if (!out.ok) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
