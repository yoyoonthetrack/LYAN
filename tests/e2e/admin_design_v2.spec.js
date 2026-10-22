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
    if (pathName === '/v1/admin/ops/moderation') {
      return json(route, { success: true, posts: [{ id: 'p1', excerpt: 'À vérifier', status: 'pending' }], comments: [], requests: [], profiles: [] });
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

    const shots = [
      ['sec-overview', '01-dashboard'],
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
    await page.screenshot({ path: path.join(SHOT_DIR, '00-navigation.png') });
    await expect(page.locator('.admin-nav-item')).toHaveCount(25);
  });
});
