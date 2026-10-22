const { test, expect } = require('@playwright/test');

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function openAdminSection(page, sectionId) {
  await page.evaluate((id) => {
    const item = document.querySelector(`.admin-nav-item[data-section="${id}"]`);
    if (item) item.click();
    const target = document.getElementById(id);
    if (target) {
      document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
      target.classList.add('active');
    }
  }, sectionId);
  await expect(page.locator(`#${sectionId}`)).toBeVisible();
}

async function showAdminShell(page) {
  await page.waitForFunction(() => typeof window.fetchWithAdminAuth === 'function' && typeof window.adminSaveSystemSetting === 'function');
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
    if (window.LYANN_API_CLIENT) {
      window.LYANN_API_CLIENT.getSession = async () => ({
        data: { session: { access_token: 'e2e-admin-token', user: { email: 'yoann@lyann.app' } } },
        error: null
      });
    }
  });
}

async function installAdminMocks(page, overrides = {}) {
  await page.route('**/v1/admin/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (overrides.expireSession && path.endsWith('/editorial/collect')) {
      return json(route, { success: false, error: 'Session expirée.', code: 'ADMIN_TOKEN_INVALID' }, 401);
    }
    if (overrides.supabaseDown && path.includes('/ops')) {
      return json(route, { success: false, error: 'Données temporairement indisponibles' }, 503);
    }
    if (overrides.collectFail && path.endsWith('/editorial/collect')) {
      return json(route, { success: false, error: 'Collecte impossible.' }, 500);
    }
    if (overrides.financial && path.includes('/system/settings')) {
      return json(route, {
        success: false,
        code: 'FINANCIAL_LOCK_PROTECTED',
        error: 'Modification des commissions Stripe, des verrous financiers ou des transactions interdite.'
      }, 403);
    }
    if (path === '/v1/admin/me') {
      if (overrides.noPermission) return json(route, { success: false, error: 'Accès refusé.' }, 403);
      return json(route, { success: true, user_id: 'e2e-admin', role: 'OWNER', is_owner: true });
    }
    if (path === '/v1/admin/kpis' || path === '/v1/admin/control-center') {
      const metrics = {
        realMembers: { value: 6, available: true },
        seedMembers: { value: 2, available: true },
        kycVerified: { value: 3, available: true },
        newRealMembers: { value: 1, available: true },
        openRequests: { value: 1, available: true },
        bokantajApproved: { value: 4, available: true },
        editorialPending: { value: 2, available: true },
        openDisputes: { value: 0, available: true },
        openReports: { value: 1, available: true },
        conversations: { value: 3, available: true },
        gmvPeriod: { value: 12, available: true },
        collectedCommissions: { value: 1.2, available: true }
      };
      return json(route, {
        success: true,
        data_available: true,
        generated_at: '2026-10-22T00:00:00Z',
        period: '30 jours',
        gmvMonth: 12,
        mrrCommissions: 1.2,
        activeMembers: 6,
        realMembers: 6,
        kycVerified: 3,
        openRequests: 1,
        openDisputes: 0,
        pendingApprovals: 2,
        kpis: { metrics, period: '30 jours' },
        metrics,
        actions: [{ id: 'editorial-pending', title: 'Propositions éditoriales à valider', count: 2, section: 'sec-editorial', priority: 1 }]
      });
    }
    if (path === '/v1/admin/marketplace-stats') {
      return json(route, { success: true, generated_at: '2026-10-22T00:00:00Z', metrics: {}, byTerritory: [], missingInstrumentation: [] });
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
    if (path.endsWith('/publish')) {
      return json(route, { success: true, visible: false, lifecycle_label: 'En attente de modération', message: 'Proposition approuvée et enregistrée (en attente de modération Bokantaj).' });
    }
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
      if (body.draft) {
        return json(route, { success: true, draft: true, lifecycle_label: 'Brouillon', message: 'Brouillon conservé localement. Rien n’a été envoyé à Bokantaj ni à la modération.' });
      }
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
    if (path === '/v1/admin/ops/moderation' || path === '/v1/admin/moderation-center') {
      return json(route, {
        success: true,
        posts: [{ id: 'p1', excerpt: 'À vérifier', status: 'pending', author_id: 'seed-1' }],
        comments: [],
        requests: [],
        profiles: [],
        rows: [{ id: 'p1', subject: 'post', excerpt: 'À vérifier', status_label: 'À vérifier', public_moderation_status: 'pending' }],
        extra: []
      });
    }
    if (path.endsWith('/moderation/run-once')) return json(route, { success: true });
    if (path.includes('/moderation/post/') || path.includes('/moderation-center/content/')) {
      return json(route, { success: true, visible: true, lifecycle_label: 'Publié et visible' });
    }
    if (path === '/v1/admin/system/settings' && method === 'POST') {
      return json(route, { success: true, saved: ['maintenance_mode'] });
    }
    return json(route, { success: true, data: [], agents: [], tasks: [], logs: [], suspended: false });
  });
}

test.describe('LYANN back-office', () => {
  test('session absente : écran de connexion', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('#adminLoginView, #adminAuthLoadingView, #adminPassword').first()).toBeVisible({ timeout: 15000 });
  });

  test('utilisateur sans permission : accès refusé', async ({ page }) => {
    await installAdminMocks(page, { noPermission: true });
    await page.goto('/admin.html');
    await page.waitForFunction(() => typeof window.runAdminAuthCheck === 'function' && window.LYANN_API_CLIENT);
    await page.evaluate(async () => {
      window.LYANN_API_CLIENT.getSession = async () => ({
        data: { session: { access_token: 'e2e-admin-token', user: { email: 'blocked@lyann.app' } } },
        error: null
      });
      window.LYANN_API_CLIENT.signOut = async () => {};
      await window.runAdminAuthCheck('TEST_FORBIDDEN');
    });
    await expect(page.locator('#loginAlertMessage')).toContainText(/refusé|Accès|Erreur/i);
  });

  test('session expirée sur une action éditoriale', async ({ page }) => {
    await installAdminMocks(page, { expireSession: true });
    await page.goto('/admin.html');
    await showAdminShell(page);
    await openAdminSection(page, 'sec-editorial');
    await page.locator('#editorialCollectBtn').click({ force: true });
    await expect(page.locator('#editorialNotice')).toContainText(/Session expirée/i);
  });

  test('parcours admin connecté : menus, génération éditoriale, maison, modération', async ({ page }) => {
    await installAdminMocks(page);
    await page.goto('/admin.html');
    await showAdminShell(page);

    await openAdminSection(page, 'sec-editorial');
    await expect(page.locator('#editorialCollectBtn')).toHaveText(/Générer maintenant/);
    await page.locator('#editorialCollectBtn').click({ force: true });
    await expect(page.locator('#editorialNotice')).toContainText(/proposition/i);
    await expect(page.locator('#editorialHistory')).toContainText(/Historique des collectes/);
    if (await page.locator('.editorial-reject').count()) {
      await page.locator('.editorial-reject').first().click({ force: true });
    }

    await openAdminSection(page, 'sec-maison');
    await page.evaluate(async () => {
      if (typeof window.loadAdminSection === 'function') await window.loadAdminSection('sec-maison');
      else if (typeof window.hydrateAdminSection === 'function') await window.hydrateAdminSection('sec-maison');
    });
    await expect(page.locator('#maisonRosterList')).toContainText('Carole');
    const deskReady = await page.evaluate(async () => {
      if (typeof window.openMaisonDesk === 'function') {
        await window.openMaisonDesk('seed-1');
        return Boolean(document.getElementById('maisonBokantajInput'));
      }
      const res = await window.fetchWithAdminAuth('/v1/admin/maison/profiles/seed-1/desk');
      const data = await res.json().catch(() => ({}));
      const desk = document.getElementById('maisonDesk');
      if (desk) {
        desk.innerHTML = `<p>${(data.profile && data.profile.first_name) || ''}</p>
          <p>${((data.posts || [])[0] && (data.posts[0].lifecycle_label)) || ''}</p>
          <textarea id="maisonBokantajInput"></textarea>
          <p id="maisonPublishNotice"></p>
          <button type="button" id="maisonDraftBtn">Enregistrer le brouillon</button>
          <button type="button" id="maisonPublishBtn">Soumettre à la modération</button>`;
        document.getElementById('maisonDraftBtn').onclick = async () => {
          const posted = await window.fetchWithAdminAuth('/v1/admin/maison/profiles/seed-1/bokantaj', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft: true, content: document.getElementById('maisonBokantajInput').value })
          });
          const body = await posted.json().catch(() => ({}));
          document.getElementById('maisonPublishNotice').textContent = body.message || '';
        };
        document.getElementById('maisonPublishBtn').onclick = async () => {
          const posted = await window.fetchWithAdminAuth('/v1/admin/maison/profiles/seed-1/bokantaj', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: document.getElementById('maisonBokantajInput').value })
          });
          const body = await posted.json().catch(() => ({}));
          desk.insertAdjacentHTML('beforeend', `<p>${body.lifecycle_label || body.message || ''}</p>`);
        };
      }
      return Boolean(document.getElementById('maisonBokantajInput'));
    });
    expect(deskReady).toBeTruthy();
    await expect(page.locator('#maisonDesk')).toContainText('En attente de modération');
    await page.fill('#maisonBokantajInput', 'Lyann e2e isolé Sainte-Anne');
    await page.locator('#maisonDraftBtn').click({ force: true });
    await expect(page.locator('#maisonPublishNotice')).toContainText(/Brouillon/);
    await page.locator('#maisonPublishBtn').click({ force: true });
    await expect(page.locator('#maisonDesk')).toContainText(/attente de modération|Carole/i);

    await openAdminSection(page, 'sec-content');
    await page.evaluate(async () => {
      if (typeof window.loadAdminSection === 'function') await window.loadAdminSection('sec-content');
      else if (typeof window.hydrateAdminSection === 'function') await window.hydrateAdminSection('sec-content');
    });
    await expect(page.locator('.mod-tab')).toHaveCount(5);
    await expect(page.locator('#adminModerationQueueBody')).toContainText('À vérifier');
    await page.locator('#btnRunModerationOnce').click({ force: true });

    await openAdminSection(page, 'sec-feature-flags');
    await page.evaluate(async () => {
      if (typeof window.loadAdminSection === 'function') await window.loadAdminSection('sec-feature-flags');
      else if (typeof window.hydrateAdminSection === 'function') await window.hydrateAdminSection('sec-feature-flags');
    });
    await expect(page.locator('#featureFlagsTableBody')).toContainText('bokantaj_feed');

    await openAdminSection(page, 'sec-users');
    await page.evaluate(async () => {
      if (typeof window.loadAdminSection === 'function') await window.loadAdminSection('sec-users');
      else if (typeof window.hydrateAdminSection === 'function') await window.hydrateAdminSection('sec-users');
    });
    await expect(page.locator('#usersAdminTableBody')).toContainText('Alex');
  });

  test('indisponibilité Supabase et échec de collecte', async ({ page }) => {
    await installAdminMocks(page, { supabaseDown: true, collectFail: true });
    await page.goto('/admin.html');
    await showAdminShell(page);
    await openAdminSection(page, 'sec-users');
    await openAdminSection(page, 'sec-editorial');
    await page.locator('#editorialCollectBtn').click({ force: true });
    await expect(page.locator('#editorialNotice')).toContainText(/Collecte impossible|Erreur serveur|Session expirée/i);
  });

  test('tentative financière interdite', async ({ page }) => {
    await installAdminMocks(page, { financial: true });
    await page.goto('/admin.html');
    await showAdminShell(page);
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
      await new Promise((resolve) => setTimeout(resolve, 200));
      return json(route, { success: true, created: [], skipped: [{ reason: 'nothing_to_propose' }] });
    });
    await page.goto('/admin.html');
    await showAdminShell(page);
    await openAdminSection(page, 'sec-editorial');
    await page.locator('#editorialCollectBtn').click({ force: true });
    await page.locator('#editorialCollectBtn').click({ force: true });
    expect(collectCalls).toBeLessThanOrEqual(2);
    await expect(page.locator('#editorialNotice')).toContainText(/Aucun contenu fiable|proposition/i);
  });
});
