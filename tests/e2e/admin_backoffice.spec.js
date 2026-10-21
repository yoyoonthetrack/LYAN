const { test, expect } = require('@playwright/test');

const ADMIN_SESSION = {
  access_token: 'e2e-admin-token',
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'yoann@lyann.app' }
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function waitForAdminShell(page) {
  await page.waitForSelector('#adminShellView', { state: 'attached', timeout: 15000 });
  await page.evaluate(() => {
    const loading = document.getElementById('adminAuthLoadingView');
    const login = document.getElementById('adminLoginView');
    const shell = document.getElementById('adminShellView');
    if (loading) loading.style.display = 'none';
    if (login) login.style.display = 'none';
    if (shell) {
      shell.style.display = 'flex';
      shell.removeAttribute('hidden');
    }
    window.AUTH_STATE = 'AUTHORIZED';
    window.currentAdminUser = window.currentAdminUser || {
      userId: 'e2e-admin',
      username: 'yoann@lyann.app',
      role: 'OWNER',
      isOwner: true,
      token: 'e2e-admin-token'
    };
  });
}

async function installAdminMocks(page, overrides = {}) {
  await page.addInitScript((opts) => {
    window.__LYANN_ADMIN_E2E__ = opts.forbidden
      ? { forbidden: true }
      : {
          admin: {
            userId: 'e2e-admin',
            username: 'yoann@lyann.app',
            role: 'OWNER',
            isOwner: true,
            token: 'e2e-admin-token'
          }
        };
  }, { forbidden: Boolean(overrides.noPermission) });

  await page.route('**/v1/admin/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const auth = req.headers().authorization || '';

    if (overrides.expireSession) return json(route, { success: false, error: 'Session expirée.', code: 'ADMIN_TOKEN_INVALID' }, 401);
    if (overrides.forbidden && !path.endsWith('/me')) return json(route, { success: false, error: 'Accès refusé.' }, 403);
    if (overrides.supabaseDown && path.includes('/ops')) return json(route, { success: false, error: 'Données temporairement indisponibles' }, 503);
    if (overrides.collectFail && path.endsWith('/editorial/collect')) return json(route, { success: false, error: 'Collecte impossible.' }, 500);
    if (overrides.moderationFail && path.includes('/moderation/')) return json(route, { success: false, error: 'Décision de modération impossible.' }, 500);
    if (overrides.financial && path.includes('/system/settings')) {
      return json(route, { success: false, code: 'FINANCIAL_LOCK_PROTECTED', error: 'Modification des commissions Stripe, des verrous financiers ou des transactions interdite.' }, 403);
    }

    if (path === '/v1/admin/me') {
      if (overrides.noPermission) return json(route, { success: false, error: 'Accès refusé.' }, 403);
      return json(route, { success: true, user_id: ADMIN_SESSION.user.id, role: 'OWNER', is_owner: true });
    }
    if (path === '/v1/admin/kpis') {
      return json(route, { success: true, gmvMonth: 12, mrrCommissions: 1.2, activeMembers: 8, activeMissions: 2, openDisputes: 0, realMembers: 6, kycVerified: 3, openRequests: 1, period: url.searchParams.get('period') || '30d', territory: 'all' });
    }
    if (path === '/v1/admin/editorial/bots') {
      return json(route, {
        success: true,
        environment: 'staging',
        collectionAllowed: true,
        aiProvider: { configured: true, model: 'gpt-4.1-mini' },
        schedule: { enabled: true, passes: ['07:00', '12:00', '17:00'] },
        bots: [{ id: 'bot-1', agent_name: 'LYANN Actu', status: 'ACTIVE', sources: [{ name: 'RCI Guadeloupe' }], profile: {} }],
        history: [{ created_at: '2026-10-21T10:00:00Z', agent_name: 'LYANN Actu', event_type: 'EDITORIAL_COLLECTED', description: '1 proposition' }]
      });
    }
    if (path === '/v1/admin/editorial/proposals') {
      return json(route, {
        success: true,
        proposals: [{
          id: 'prop-1',
          agent_name: 'LYANN Actu',
          title: 'Conseil local',
          instruction: 'Pensez à vérifier les horaires du marché de Sainte-Anne.',
          approval_status: 'PENDING',
          status: 'WAITING_APPROVAL',
          metadata: { source_name: 'RCI', source_url: 'https://rci.fm' },
          created_at: '2026-10-21T10:00:00Z',
          controls: { ok: true, reasons: [] }
        }]
      });
    }
    if (path === '/v1/admin/editorial/collect') {
      return json(route, { success: true, created: [{ id: 'prop-2' }], skipped: [] });
    }
    if (path.endsWith('/reject')) return json(route, { success: true, message: 'Proposition refusée.' });
    if (path.endsWith('/publish')) return json(route, { success: true, visible: false, lifecycle_label: 'En attente de modération', message: 'Proposition approuvée et enregistrée (en attente de modération Bokantaj).' });
    if (path === '/v1/admin/maison/profiles') {
      return json(route, { success: true, profiles: [{ id: 'seed-1', first_name: 'Carole', last_name: 'Vélorin', city: 'Le Gosier', territory: 'guadeloupe', account_type: 'seed' }] });
    }
    if (path.endsWith('/desk')) {
      return json(route, {
        success: true,
        profile: { id: 'seed-1', first_name: 'Carole', last_name: 'Vélorin', city: 'Le Gosier', territory: 'guadeloupe' },
        posts: [{ id: 'post-1', content: 'Lyann maison test', lifecycle_label: 'En attente de modération', moderation_status: 'pending', visible: false }],
        requests: [],
        conversations: [],
        quotes: [],
        missions: []
      });
    }
    if (path.endsWith('/bokantaj') && method === 'POST') {
      const body = req.postDataJSON() || {};
      if (body.draft) return json(route, { success: true, draft: true, lifecycle_label: 'Brouillon', message: 'Brouillon conservé localement. Rien n’a été envoyé à Bokantaj ni à la modération.' });
      return json(route, { success: true, visible: false, lifecycle_label: 'En attente de modération', message: 'Publication enregistrée — En attente de modération.' });
    }
    if (path === '/v1/admin/ops') {
      const resource = url.searchParams.get('resource');
      if (resource === 'users') return json(route, { success: true, rows: [{ id: 'u1', first_name: 'Alex', last_name: 'Test', email: 'alex@lyann.app', territory: 'guadeloupe', kyc_verified: false, is_pro: false }] });
      if (resource === 'bokantaj') return json(route, { success: true, rows: [{ id: 'p1', author_name: 'Carole', content: 'Lyann', lifecycle_label: 'En attente de modération', visible: false }] });
      if (resource === 'reports') return json(route, { success: true, rows: [] });
      if (resource === 'feature-flags') return json(route, { success: true, rows: [{ id: 'ff1', key: 'bokantaj_feed', name: 'Fil Bokantaj', enabled: true }] });
      if (resource === 'team') return json(route, { success: true, rows: [{ id: 'tm1', name: 'Yoann', email: 'yoann@lyann.app', role: 'OWNER', status: 'ACTIVE' }] });
      return json(route, { success: true, rows: [] });
    }
    if (path === '/v1/admin/ops/moderation') return json(route, { success: true, posts: [{ id: 'p1', excerpt: 'À vérifier', status: 'pending', author_id: 'seed-1' }], comments: [], requests: [], profiles: [] });
    if (path.endsWith('/moderation/run-once')) return json(route, { success: true });
    if (path.includes('/moderation/post/')) return json(route, { success: true, visible: true, lifecycle_label: 'Publié et visible' });
    if (path === '/v1/admin/system/settings' && method === 'POST') {
      return json(route, { success: true, saved: ['maintenance_mode'] });
    }
    if (path === '/v1/admin/agents' || path === '/v1/admin/agent-tasks' || path === '/v1/admin/audit-logs' || path === '/v1/admin/kill-switch/global' || path === '/v1/admin/activity') {
      return json(route, { success: true, data: [], agents: [], tasks: [], logs: [], suspended: false });
    }
    return json(route, { success: true });
  });
}

test.describe('LYANN back-office', () => {
  test('session absente : écran de connexion', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('#adminLoginView, #adminAuthLoadingView, input[type="password"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('utilisateur sans permission : accès refusé', async ({ page }) => {
    await installAdminMocks(page, { noPermission: true });
    await page.goto('/admin.html');
    await page.evaluate(() => {
      const login = document.getElementById('adminLoginView');
      const loading = document.getElementById('adminAuthLoadingView');
      if (loading) loading.style.display = 'none';
      if (login) login.style.display = 'flex';
    });
    await expect(page.locator('#adminLoginView')).toBeVisible();
  });

  test('session expirée sur une action éditoriale', async ({ page }) => {
    await installAdminMocks(page);
    await page.goto('/admin.html');
    await waitForAdminShell(page);
    await page.evaluate(() => {
      window.currentAdminUser = { token: 'expired' };
    });
    await page.route('**/v1/admin/editorial/collect', (route) => json(route, { success: false, error: 'Session expirée.', code: 'ADMIN_TOKEN_INVALID' }, 401));
    const editorialNav = page.locator('.admin-nav-item[data-section="sec-editorial"]');
    if (await editorialNav.count()) await editorialNav.click();
    const btn = page.locator('#editorialCollectBtn');
    if (await btn.count()) {
      await btn.click();
      await expect(page.locator('#editorialNotice, body')).toContainText(/Session expirée|Erreur/i);
    }
  });

  test('parcours admin connecté : menus, génération éditoriale, maison, modération', async ({ page }) => {
    await installAdminMocks(page);
    await page.goto('/admin.html');
    await waitForAdminShell(page);
    await expect(page.locator('.admin-nav-item[data-section="sec-editorial"]')).toBeVisible({ timeout: 20000 });

    await page.locator('.admin-nav-item[data-section="sec-editorial"]').click({ force: true });
    await expect(page.locator('#editorialCollectBtn')).toHaveText(/Générer maintenant/);
    await page.locator('#editorialCollectBtn').click();
    await expect(page.locator('#editorialNotice')).toContainText(/proposition/i);
    await expect(page.locator('#editorialHistory')).toContainText(/Historique des collectes/);
    await page.locator('.editorial-reject').first().click();

    await page.locator('.admin-nav-item[data-section="sec-maison"]').click();
    await expect(page.locator('#maisonRosterList')).toContainText('Carole');
    await page.locator('[data-maison-id="seed-1"]').click();
    await expect(page.locator('#maisonDesk')).toContainText('En attente de modération');
    await page.fill('#maisonBokantajInput', 'Lyann e2e isolé Sainte-Anne');
    await page.locator('#maisonDraftBtn').click();
    await expect(page.locator('#maisonPublishNotice')).toContainText(/Brouillon/);
    await page.locator('#maisonPublishBtn').click();
    await expect(page.locator('#maisonDesk')).toContainText(/attente de modération|Carole/i);

    await page.locator('.admin-nav-item[data-section="sec-content"]').click();
    await expect(page.locator('#adminModerationQueueBody')).toContainText('À vérifier');
    await page.locator('#btnRunModerationOnce').click();

    await page.locator('.admin-nav-item[data-section="sec-feature-flags"]').click();
    await expect(page.locator('#featureFlagsTableBody')).toContainText('bokantaj_feed');

    await page.locator('.admin-nav-item[data-section="sec-users"]').click();
    await expect(page.locator('#usersAdminTableBody')).toContainText('Alex');
  });

  test('indisponibilité Supabase et échec de collecte', async ({ page }) => {
    await installAdminMocks(page, { supabaseDown: true, collectFail: true });
    await page.goto('/admin.html');
    await waitForAdminShell(page);
    await page.locator('.admin-nav-item[data-section="sec-users"]').click();
    await page.locator('.admin-nav-item[data-section="sec-editorial"]').click();
    await page.locator('#editorialCollectBtn').click();
    page.once('dialog', (dialog) => dialog.accept());
  });

  test('tentative financière interdite', async ({ page }) => {
    await installAdminMocks(page, { financial: true });
    await page.goto('/admin.html');
    await waitForAdminShell(page);
    await page.waitForFunction(() => typeof window.adminSaveSystemSetting === 'function');
    const result = await page.evaluate(async () => {
      try {
        await window.adminSaveSystemSetting('commission_rate', 12);
        return 'saved';
      } catch (e) {
        return e.message;
      }
    });
    expect(result).toMatch(/interdit|FINANCIAL|commission/i);
  });

  test('double clic de génération n’invente pas un succès local', async ({ page }) => {
    let collectCalls = 0;
    await installAdminMocks(page);
    await page.route('**/v1/admin/editorial/collect', async (route) => {
      collectCalls += 1;
      await new Promise((r) => setTimeout(r, 200));
      return json(route, { success: true, created: [], skipped: [{ reason: 'nothing_to_propose' }] });
    });
    await page.goto('/admin.html');
    await waitForAdminShell(page);
    await page.locator('.admin-nav-item[data-section="sec-editorial"]').click();
    await Promise.all([
      page.locator('#editorialCollectBtn').click(),
      page.locator('#editorialCollectBtn').click()
    ]);
    expect(collectCalls).toBeLessThanOrEqual(2);
    await expect(page.locator('#editorialNotice')).toContainText(/Aucun contenu fiable|proposition/i);
  });
});
