const { test, expect } = require('@playwright/test');

async function installMemberHelpdeskMock(page) {
  await page.evaluate(() => {
    const tickets = [];
    window.LYANN_API_CLIENT = window.LYANN_API_CLIENT || {};
    window.LYANN_API_CLIENT.memberHelpdeskRequest = async (path, options = {}) => {
      const method = options.method || 'GET';
      if (path === '/v1/me/helpdesk' && method === 'GET') {
        return { json: async () => ({ success: true, subjects: ['Compte', 'Paiement'], tickets }) };
      }
      if (path === '/v1/me/helpdesk' && method === 'POST') {
        const created = {
          id: 'ticket-member-1',
          reference: 'HD-2001',
          subject: options.body.subject,
          status: 'open',
          can_reply: true
        };
        tickets.push(created);
        return { json: async () => ({ success: true, ticket: created }) };
      }
      if (String(path).includes('/messages')) {
        return { json: async () => ({ success: true, message: { body: options.body.body }, notified: false }) };
      }
      if (String(path).startsWith('/v1/me/helpdesk/')) {
        return {
          json: async () => ({
            success: true,
            ticket: tickets[0] || { id: 'ticket-member-1', subject: 'Compte', status: 'open', can_reply: true, reference: 'HD-2001' },
            messages: [{ body: 'Mon accès pose problème.', from_team: false }]
          })
        };
      }
      return { json: async () => ({ success: false, error: 'inattendu' }) };
    };
  });
}

test('member helpdesk desktop create and open ticket', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.LYANN_MEMBER_HELPDESK?.open === 'function');
  await installMemberHelpdeskMock(page);
  await page.evaluate(() => window.LYANN_MEMBER_HELPDESK.open());
  await expect(page.locator('#lyannHelpdeskTitle')).toContainText('On est là');
  await page.fill('#lyannHelpdeskForm textarea[name="body"]', 'Mon accès pose problème.');
  await page.locator('#lyannHelpdeskSend').click();
  await expect(page.locator('#lyannHelpdeskTitle')).toContainText('Compte');
});

test('member helpdesk mobile stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.LYANN_MEMBER_HELPDESK?.open === 'function');
  await installMemberHelpdeskMock(page);
  await page.evaluate(() => window.LYANN_MEMBER_HELPDESK.open());
  await expect(page.locator('.lyann-helpdesk-sheet')).toBeVisible();
  await expect(page.locator('#lyannHelpdeskSend')).toBeVisible();
});
