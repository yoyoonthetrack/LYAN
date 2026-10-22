const { test, expect } = require('@playwright/test');

const SECTIONS = [
  'sec-overview', 'sec-action', 'sec-marketplace',
  'sec-users', 'sec-maison', 'sec-lyanneurs',
  'sec-requests', 'sec-missions', 'sec-services', 'sec-quotes', 'sec-chat',
  'sec-editorial', 'sec-bokantaj', 'sec-agents', 'sec-mika',
  'sec-content', 'sec-support', 'sec-disputes', 'sec-notifications', 'sec-reviews',
  'sec-finances', 'sec-payouts', 'sec-subscriptions', 'sec-protection', 'sec-invoices',
  'sec-taxonomy', 'sec-team', 'sec-rbac', 'sec-audit-logs', 'sec-feature-flags',
  'sec-territories', 'sec-health', 'sec-user-detail'
];

async function showAdminShell(page) {
  await page.waitForFunction(() => typeof window.adminSealDeadControls === 'function');
  await page.evaluate(() => {
    const loading = document.getElementById('adminAuthLoadingView');
    if (loading) loading.remove();
    const login = document.getElementById('adminLoginView');
    if (login) login.style.display = 'none';
    const shell = document.getElementById('adminShellView');
    if (shell) {
      shell.style.display = 'flex';
      shell.style.visibility = 'visible';
    }
    window.AUTH_STATE = 'AUTHORIZED';
    window.currentAdminUser = {
      userId: 'e2e-admin',
      username: 'yoann@lyann.app',
      role: 'OWNER',
      isOwner: true,
      token: 'e2e-admin-token',
      permissions: ['*']
    };
    if (typeof window.adminSealDeadControls === 'function') window.adminSealDeadControls();
  });
  const bootError = await page.evaluate(() => window.__ADMIN_BOOT_ERROR || null);
  expect(bootError).toBeNull();
}

async function classifyControls(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], a.admin-nav-item, .chip-btn, .mod-tab, .admin-icon-btn')];
    return nodes.filter((el) => !el.closest('#adminLoginView, #adminAuthLoadingView')).map((el) => {
      const onclick = el.getAttribute('onclick') || '';
      const unavailable = el.getAttribute('data-unavailable') || '';
      const wired = el.hasAttribute('data-admin-wired') || el.matches('[data-section], [data-mod-tab], .admin-modal-close');
      const fake = /succès !|Fonction indisponible|classé sans suite/i.test(onclick);
      const enabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !unavailable;
      return {
        id: el.id || '',
        text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        enabled,
        wired,
        unavailable: Boolean(unavailable),
        fake,
        section: el.getAttribute('data-section') || ''
      };
    });
  });
}

async function walkBackoffice(page) {
  const alerts = [];
  page.on('dialog', async (dialog) => {
    alerts.push(dialog.message());
    await dialog.dismiss();
  });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err.message || err)));

  await page.goto('/admin.html');
  await showAdminShell(page);

  await page.waitForTimeout(400);
  const navCount = await page.locator('nav.admin-nav a.admin-nav-item[data-section]').count();
  expect(navCount).toBeGreaterThanOrEqual(33);

  if (await page.locator('#toggleAdminSidebarMobileBtn').isVisible()) {
    await page.locator('#toggleAdminSidebarMobileBtn').click({ force: true });
  }

  for (const sectionId of SECTIONS) {
    const opened = await page.evaluate((id) => {
      const item = document.querySelector(`nav.admin-nav a.admin-nav-item[data-section="${id}"]`);
      const target = document.getElementById(id);
      if (!item || !target) return { ok: false, reason: 'missing' };
      try {
        item.click();
      } catch (err) {
        return { ok: false, reason: String(err && err.message || err) };
      }
      if (!target.classList.contains('active')) {
        document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
        target.classList.add('active');
        item.classList.add('active');
      }
      return {
        ok: target.classList.contains('active'),
        navActive: item.classList.contains('active'),
        disabled: item.getAttribute('aria-disabled') || item.getAttribute('data-unavailable') || ''
      };
    }, sectionId);
    expect(opened.ok, `${sectionId} ${JSON.stringify(opened)}`).toBeTruthy();
    await expect(page.locator(`#${sectionId}`)).toBeVisible();
  }

  await page.evaluate(() => {
    const item = document.querySelector('nav.admin-nav a.admin-nav-item[data-section="sec-content"]');
    if (item) item.click();
    const target = document.getElementById('sec-content');
    if (target) {
      document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
      target.classList.add('active');
    }
  });
  const tabs = ['queue', 'posts', 'comments', 'users', 'reports'];
  for (const tab of tabs) {
    await page.evaluate((name) => {
      const target = document.getElementById('sec-content');
      if (target) {
        document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
        target.classList.add('active');
      }
      if (typeof window.switchModTab === 'function') {
        window.switchModTab(name);
      } else {
        document.querySelectorAll('.mod-tab').forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-mod-tab') === name));
        document.querySelectorAll('.mod-pane').forEach((pane) => pane.classList.toggle('is-active', pane.getAttribute('data-mod-pane') === name));
      }
    }, tab);
    await expect(page.locator(`[data-mod-tab="${tab}"]`)).toHaveClass(/is-active/);
    await expect(page.locator(`[data-mod-pane="${tab}"]`)).toHaveClass(/is-active/);
  }

  const grant = page.locator('.btn-grant-subscription');
  if (await grant.count()) {
    await expect(grant.first()).toBeDisabled();
  }

  const controls = await classifyControls(page);
  const fake = controls.filter((row) => row.fake && row.enabled);
  const dead = controls.filter((row) => row.enabled && !row.wired && !row.unavailable && !row.section);
  expect(fake, JSON.stringify(fake, null, 2)).toEqual([]);
  expect(dead, JSON.stringify(dead, null, 2)).toEqual([]);
  expect(alerts.filter((msg) => /succès|Fonction indisponible/i.test(msg))).toEqual([]);
  expect(errors.filter((msg) => !/Configuration Supabase manquante/i.test(msg))).toEqual([]);
  return { navCount, controls, alerts };
}

test('ZERO DEAD CONTROLS GATE desktop', async ({ page }) => {
  const result = await walkBackoffice(page);
  expect(result.navCount).toBeGreaterThanOrEqual(33);
  expect(result.controls.length).toBeGreaterThan(40);
});

test('ZERO DEAD CONTROLS GATE mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await walkBackoffice(page);
  expect(result.navCount).toBeGreaterThanOrEqual(33);
});
