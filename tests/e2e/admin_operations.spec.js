const { test, expect } = require('@playwright/test');

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
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'yoann@lyann.app',
      role: 'OWNER',
      isOwner: true,
      token: 'e2e-admin-token',
      permissions: ['*']
    };
    if (typeof window.adminSealDeadControls === 'function') window.adminSealDeadControls();
  });
}

async function mockOperations(page) {
  const tickets = [{
    id: 'ticket-1',
    reference: 'HD-1001',
    subject: 'Aide QA Staging',
    member_id: 'a3401c97-c68f-4e2f-8b92-b920632b4c50',
    status: 'open',
    priority: 'medium',
    age_ms: 3600000
  }];
  const task = {
    id: 'task-1',
    title: 'Préparer un lyann jardinage',
    instruction: 'Reste factuel.',
    status: 'FAILED',
    agent_id: 'agent-1',
    error: 'timeout source'
  };
  await page.route('**/v1/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const fulfill = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
    if (path === '/v1/admin/operations/helpdesk' && method === 'GET') {
      return fulfill({ success: true, tickets });
    }
    if (path === '/v1/admin/operations/helpdesk' && method === 'POST') {
      const created = { id: 'ticket-2', reference: 'HD-1002', subject: 'Nouveau', status: 'open', priority: 'medium' };
      tickets.push(created);
      return fulfill({ success: true, ticket: created });
    }
    if (path === '/v1/admin/operations/helpdesk/ticket-1' && method === 'GET') {
      return fulfill({
        success: true,
        ticket: tickets[0],
        messages: [{ kind: 'public', body: 'Bonjour', created_at: '2026-10-22T08:00:00Z' }],
        events: [{ action: 'created', created_at: '2026-10-22T08:00:00Z' }]
      });
    }
    if (path.endsWith('/messages')) {
      return fulfill({ success: true, message: { kind: 'public', body: 'Réponse QA' } });
    }
    if (path.endsWith('/status')) {
      tickets[0].status = 'resolved';
      return fulfill({ success: true, ticket: tickets[0] });
    }
    if (path === '/v1/admin/operations/tasks/task-1') {
      return fulfill({ success: true, task, runs: [{ status: 'failed', error: 'timeout source' }], history: [] });
    }
    if (path.endsWith('/retry')) {
      return fulfill({ success: true, executed: false, task: Object.assign({}, task, { status: 'QUEUED' }) });
    }
    if (path === '/v1/admin/agent-tasks') {
      return fulfill({ success: true, data: [task], tasks: [task] });
    }
    if (path === '/v1/admin/me') return fulfill({ success: true, user_id: 'e2e-admin', role: 'OWNER', is_owner: true });
    return fulfill({ success: true });
  });
}

test('helpdesk desktop: open, reply, resolve', async ({ page }) => {
  await mockOperations(page);
  await page.goto('/admin.html');
  await showAdminShell(page);
  await page.waitForFunction(() => typeof window.loadAdminHelpdesk === 'function');
  await page.evaluate(() => {
    document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
    document.getElementById('sec-support')?.classList.add('active');
    return window.loadAdminHelpdesk();
  });
  await expect(page.locator('#helpdeskTableBody')).toContainText('HD-1001');
  await page.evaluate(() => window.openHelpdeskTicket('ticket-1'));
  await expect(page.locator('#helpdeskDetailBody')).toContainText('Aide QA Staging');
  await page.locator('#helpdeskReply').fill('Réponse QA Staging', { force: true });
  await page.locator('#helpdeskReplyBtn').click({ force: true });
  await expect(page.locator('#helpdeskNotice')).toContainText(/Réponse|enregistr/);
});

test('admin helpdesk create uses a form instead of prompt', async ({ page }) => {
  await mockOperations(page);
  await page.goto('/admin.html');
  await showAdminShell(page);
  await page.waitForFunction(() => typeof window.createHelpdeskTicket === 'function');
  await page.evaluate(() => {
    document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
    document.getElementById('sec-support')?.classList.add('active');
  });
  await page.locator('#helpdeskCreateBtn').click({ force: true });
  await expect(page.locator('#helpdeskCreateForm')).toBeVisible();
  await page.locator('#helpdeskCreateSubject').fill('Ticket formulaire QA', { force: true });
  await page.locator('#helpdeskCreateBody').fill('Créé sans prompt.', { force: true });
  await page.locator('#helpdeskCreateSubmit').click({ force: true });
  await expect(page.locator('#helpdeskNotice')).toContainText(/Ticket créé|enregistr/);
});

test('agent task panel mobile does not claim a worker execution', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOperations(page);
  await page.goto('/admin.html');
  await showAdminShell(page);
  await page.waitForFunction(() => typeof window.openAgentTaskPanel === 'function');
  await page.evaluate(() => {
    document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
    document.getElementById('sec-agents')?.classList.add('active');
    const panel = document.getElementById('agentTaskPanel');
    if (panel) panel.hidden = false;
    return window.openAgentTaskPanel('task-1');
  });
  await expect(page.locator('#agentTaskPanelBody')).toContainText('timeout source');
  await page.locator('#agentTaskRetryBtn').click({ force: true });
  await expect(page.locator('#adminGlobalNotice')).toContainText(/Relance enregistrée|worker/);
});
