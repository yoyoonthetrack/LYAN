'use strict';

/**
 * Real Staging admin UI: magic-link JWT, then Playwright against local Staging API.
 * Passwords are never written. Tokens are not printed.
 */
require('./force-staging-v2-env');
process.env.PORT = process.env.LYANN_ADMIN_UI_PORT || '8099';

const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const { resolveAdminAndJwt } = require('./admin-staging-real-session-lib');

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PORT = process.env.PORT;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-r', './scripts/force-staging-v2-env.js', 'api/server.js'], {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, { PORT, LYANN_DOTENV_PATH: path.join(__dirname, '..', '.env.staging-v2') }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let ready = false;
    const onData = (buf) => {
      const text = String(buf);
      if (/écoute|listening|808|809/i.test(text) && !ready) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (!ready) reject(new Error(`Serveur Staging arrêté (${code}).`));
    });
    setTimeout(() => {
      if (!ready) resolve(child);
    }, 4000);
  });
}

(async () => {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL || '';
  if (!url.includes(STAGING_REF)) throw new Error('Staging V2 uniquement.');
  const { emailDomain, jwt, refresh, userId } = await resolveAdminAndJwt();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const result = {
    admin_email_domain: emailDomain,
    ui: {},
    errors: []
  };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    await page.evaluate(async ({ accessToken, refreshToken }) => {
      await window.LYANN_API_CLIENT.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      await window.runAdminAuthCheck('STAGING_UI');
    }, { accessToken: jwt, refreshToken: refresh });
    await page.waitForTimeout(1500);
    result.ui.auth_state = await page.evaluate(() => window.AUTH_STATE);
    result.ui.shell_visible = await page.evaluate(() => {
      const shell = document.getElementById('adminShellView');
      return Boolean(shell && shell.style.display !== 'none');
    });
    if (result.ui.auth_state !== 'AUTHORIZED') {
      result.ui.login_text = await page.locator('#loginAlertMessage').textContent().catch(() => '');
      throw new Error(`Auth UI: ${result.ui.auth_state}`);
    }
    await page.evaluate(() => document.querySelector('.admin-nav-item[data-section="sec-editorial"]')?.click());
    await page.waitForTimeout(800);
    if (await page.locator('#editorialCollectBtn').count()) {
      page.once('dialog', (d) => d.accept());
      await page.locator('#editorialCollectBtn').click({ force: true });
      await page.waitForTimeout(8000);
      result.ui.editorial_notice = (await page.locator('#editorialNotice').textContent().catch(() => '')) || '';
    }
    await page.evaluate(() => document.querySelector('.admin-nav-item[data-section="sec-maison"]')?.click());
    await page.waitForTimeout(800);
    result.ui.maison_roster = ((await page.locator('#maisonRosterList').textContent().catch(() => '')) || '').slice(0, 180);
    result.ok = result.ui.auth_state === 'AUTHORIZED';
  } catch (err) {
    result.errors.push(err.message);
    result.ok = false;
  }
  await browser.close();
  server.kill('SIGTERM');
  process.stdout.write(`${JSON.stringify({
    environment: 'staging',
    admin_user_id_prefix: String(userId || '').slice(0, 8),
    admin_email_domain: emailDomain,
    auth_state: result.ui.auth_state || null,
    shell_visible: result.ui.shell_visible || false,
    editorial_notice: result.ui.editorial_notice || null,
    maison_roster_present: Boolean(result.ui.maison_roster && result.ui.maison_roster.trim()),
    errors: result.errors,
    ok: result.ok
  }, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
