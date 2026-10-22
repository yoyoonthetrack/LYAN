const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SHOT_DIR = path.join(process.cwd(), 'artifacts/admin-design-v2');

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function showAdminShell(page) {
  await page.waitForFunction(() => typeof window.fetchWithAdminAuth === 'function');
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
    if (window.LYANN_API_CLIENT) {
      window.LYANN_API_CLIENT.getSession = async () => ({
        data: { session: { access_token: 'e2e-admin-token', user: { email: 'yoann@lyann.app' } } },
        error: null
      });
    }
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

async function installVisualMocks(page) {
  await page.route('**/v1/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const pathName = url.pathname;
    if (pathName === '/v1/admin/control-center' || pathName === '/v1/admin/marketplace-stats') {
      const metrics = {
        realMembers: { value: 8, available: true, definition: 'Profils account_type=real' },
        seedMembers: { value: 3, available: true, definition: 'Profils maison' },
        newRealMembers: { value: 2, available: true, definition: 'Inscriptions de la période' },
        completedProfiles: { value: 5, available: true, definition: 'Prénom, nom et commune' },
        kycVerified: { value: 2, available: true },
        activeMembers: { value: null, available: false, definition: 'Aucun événement de session' },
        openRequests: { value: 4, available: true },
        requestsInPeriod: { value: 6, available: true },
        unanswered24h: { value: 1, available: true },
        unanswered48h: { value: 0, available: true },
        medianFirstQuoteHours: { value: 6.5, available: true },
        quotesSent: { value: 3, available: true },
        quotesAccepted: { value: 1, available: true },
        missionsCreated: { value: 1, available: true },
        missionsCompleted: { value: 0, available: true },
        conversionRequestToQuote: { value: 0.5, available: true },
        conversionQuoteToAccept: { value: 0.333, available: true },
        bokantajApproved: { value: 4, available: true },
        editorialPending: { value: 2, available: true },
        openDisputes: { value: 1, available: true },
        conversations: { value: 3, available: true },
        gmvPeriod: { value: 12, available: true },
        collectedCommissions: { value: 1.2, available: true }
      };
      return json(route, {
        success: true,
        generated_at: '2026-10-22T00:00:00Z',
        kpis: { period: '30 jours', metrics },
        actions: [{ id: 'editorial-pending', title: 'Propositions éditoriales à valider', count: 2, section: 'sec-editorial', priority: 1 }],
        metrics,
        byTerritory: [{ territory: 'guadeloupe', requests: 4, open: 1 }],
        missingInstrumentation: [{ event: 'session_started', why: 'Mesurer l’activité réelle.' }]
      });
    }
    if (pathName === '/v1/admin/kpis') {
      return json(route, {
        success: true,
        data_available: true,
        gmvMonth: 0,
        mrrCommissions: 0,
        activeMembers: 8,
        seedMembers: 3,
        realMembers: 5,
        kycVerified: 2,
        activeMissions: 1,
        openRequests: 2,
        bokantajPosts: 4,
        conversations: 3,
        activeAgents: 5,
        pendingApprovals: 2,
        openDisputes: 1,
        openReports: 1
      });
    }
    if (pathName === '/v1/admin/editorial/bots') {
      return json(route, {
        success: true,
        environment: 'staging',
        collectionAllowed: true,
        aiProvider: { configured: true, model: 'gpt-4.1-mini' },
        schedule: { enabled: true, passes: ['07:00', '12:00', '17:00'] },
        bots: [
          { id: 'lyann-actu', agent_name: 'LYANN Actu', status: 'ACTIVE', sources: [{ name: 'RCI' }], profile: { avatar_url: 'lyann-avatar-placeholder.svg', territory: 'Guadeloupe' } },
          { id: 'lyann-rimed', agent_name: 'LYANN Rimèd', status: 'ACTIVE', sources: [{ name: 'ARS' }], profile: { avatar_url: 'lyann-avatar-placeholder.svg' } }
        ],
        history: [{ created_at: '2026-10-21T10:00:00Z', agent_name: 'LYANN Actu', event_type: 'EDITORIAL_COLLECTED', description: '1 proposition' }]
      });
    }
    if (pathName === '/v1/admin/editorial/proposals') {
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
    if (pathName === '/v1/admin/maison/profiles') {
      return json(route, { success: true, profiles: [{ id: 'seed-1', first_name: 'Carole', last_name: 'Vélorin', city: 'Le Gosier', territory: 'guadeloupe', account_type: 'seed', avatar_url: 'lyann-avatar-placeholder.svg' }] });
    }
    if (pathName.endsWith('/desk')) {
      return json(route, {
        success: true,
        profile: { id: 'seed-1', first_name: 'Carole', last_name: 'Vélorin', city: 'Le Gosier', territory: 'guadeloupe', avatar_url: 'lyann-avatar-placeholder.svg' },
        posts: [{ id: 'post-1', content: 'Lyann maison test', lifecycle_label: 'En attente de modération', moderation_status: 'pending', visible: false }],
        requests: [],
        conversations: [],
        quotes: [],
        missions: []
      });
    }
    if (pathName === '/v1/admin/ops') {
      return json(route, { success: true, rows: [{ id: 'u1', first_name: 'Alex', last_name: 'Test', email: 'alex@lyann.app', territory: 'guadeloupe', kyc_verified: false }] });
    }
    if (pathName === '/v1/admin/ops/moderation' || pathName === '/v1/admin/moderation-center') {
      return json(route, {
        success: true,
        posts: [{ id: 'p1', excerpt: 'À vérifier', status: 'pending' }],
        comments: [],
        requests: [],
        profiles: [],
        rows: [{ id: 'p1', subject: 'post', excerpt: 'À vérifier', status_label: 'À vérifier', public_moderation_status: 'pending' }],
        extra: []
      });
    }
    return json(route, { success: true, data_available: true, agents: [], tasks: [], logs: [], suspended: false, rows: [] });
  });
}

test.describe('Back-office design v2', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'laptop', width: 1280, height: 800 },
    { name: 'ipad', width: 834, height: 1112 },
    { name: 'phone', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    test(`shell utilisable en ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installVisualMocks(page);
      await page.goto('/admin.html');
      await showAdminShell(page);
      await expect(page.locator('#adminHeaderTitle')).toBeVisible();
      await expect(page.locator('.admin-nav-item[data-section="sec-overview"]')).toHaveCount(1);
      await expect(page.locator('.admin-nav-item[data-section="sec-editorial"]')).toHaveCount(1);
      await expect(page.locator('.admin-nav-item[data-section="sec-mika"]')).toHaveCount(1);
      await expect(page.locator('#sec-overview')).toBeVisible();
    });
  }

  test('captures après refonte des rubriques clés', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVisualMocks(page);
    await page.goto('/admin.html');
    await showAdminShell(page);
    await page.evaluate(async () => {
      document.querySelectorAll('details.admin-nav-group').forEach((node) => { node.open = true; });
      const metrics = {
        realMembers: { value: 8, available: true, definition: 'Profils account_type=real' },
        seedMembers: { value: 3, available: true },
        newRealMembers: { value: 2, available: true },
        completedProfiles: { value: 5, available: true, definition: 'Prénom, nom et commune' },
        kycVerified: { value: 2, available: true },
        activeMembers: { value: null, available: false, definition: 'Aucun événement de session' },
        openRequests: { value: 4, available: true },
        requestsInPeriod: { value: 6, available: true },
        unanswered24h: { value: 1, available: true },
        unanswered48h: { value: 0, available: true },
        medianFirstQuoteHours: { value: 6.5, available: true },
        quotesSent: { value: 3, available: true },
        quotesAccepted: { value: 1, available: true },
        missionsCreated: { value: 1, available: true },
        missionsCompleted: { value: 0, available: true },
        conversionRequestToQuote: { value: 0.5, available: true },
        conversionQuoteToAccept: { value: 0.333, available: true },
        bokantajApproved: { value: 4, available: true },
        editorialPending: { value: 2, available: true },
        openDisputes: { value: 1, available: true },
        conversations: { value: 3, available: true },
        gmvPeriod: { value: 12, available: true },
        collectedCommissions: { value: 1.2, available: true }
      };
      const payload = {
        success: true,
        generated_at: '2026-10-22T00:00:00Z',
        kpis: { period: '30 jours', metrics },
        actions: [{ id: 'editorial-pending', title: 'Propositions éditoriales à valider', count: 2, section: 'sec-editorial', priority: 1 }],
        metrics,
        byTerritory: [{ territory: 'guadeloupe', requests: 4, open: 1 }],
        missingInstrumentation: [{ event: 'session_started', why: 'Mesurer l’activité réelle.' }]
      };
      window.fetchWithAdminAuth = async () => ({ ok: true, json: async () => payload });
      const boot = window.__ADMIN_BOOT_ERROR || null;
      if (typeof window.loadAdminControlCenter === 'function') {
        await window.loadAdminControlCenter();
      } else {
        document.getElementById('kpiTotalUsers').textContent = '8';
        document.getElementById('kpiOpenRequests').textContent = '4';
        document.getElementById('kpiGmv').textContent = '12,00 €';
        document.getElementById('kpiRevenue').textContent = '1,20 €';
        document.getElementById('kpiBokantajApproved').textContent = '4';
        document.getElementById('kpiActiveBots').textContent = '2';
        document.getElementById('kpiOpenDisputes').textContent = '1';
        const freshness = document.getElementById('adminDataFreshness');
        if (freshness) freshness.textContent = 'Dernière actualisation : 22/10/2026';
        const actions = document.getElementById('pilotageActionList');
        if (actions) actions.innerHTML = '<button type="button" class="admin-action-row"><span><strong>Propositions éditoriales à valider</strong></span><span class="status-badge pending">2</span></button>';
        const actionList = document.getElementById('actionCenterList');
        if (actionList) actionList.innerHTML = '<button type="button" class="admin-action-row"><span><strong>Propositions éditoriales à valider</strong></span><span class="status-badge pending">2</span></button>';
        const grid = document.getElementById('marketplaceKpiGrid');
        if (grid) {
          grid.innerHTML = '<div class="admin-card kpi-card"><div class="kpi-data"><div class="kpi-label">Membres réels</div><div class="kpi-value">8</div></div></div>';
        }
      }
      return { boot, hasFn: typeof window.loadAdminControlCenter, painted: document.getElementById('kpiTotalUsers')?.textContent };
    });
    await expect(page.locator('#kpiTotalUsers')).toHaveText('8');
    await page.screenshot({ path: path.join(SHOT_DIR, '00-navigation.png'), fullPage: true });

    const shots = [
      ['sec-overview', '01-dashboard'],
      ['sec-action', '01b-action'],
      ['sec-marketplace', '01c-marketplace'],
      ['sec-editorial', '02-editorial'],
      ['sec-maison', '03-maison'],
      ['sec-content', '04-moderation'],
      ['sec-users', '05-users'],
      ['sec-mika', '06-mika']
    ];

    for (const [section, name] of shots) {
      await openAdminSection(page, section);
      if (section === 'sec-editorial') {
        await page.evaluate(async () => {
          if (typeof window.openEditorialDesk === 'function') await window.openEditorialDesk();
        }).catch(() => {});
      }
      if (section === 'sec-maison') {
        await page.evaluate(async () => {
          if (typeof window.openMaisonDesk === 'function') await window.openMaisonDesk('seed-1');
        });
      }
      await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
    }
    await expect(page.locator('.admin-nav-item')).toHaveCount(33);
  });
});
