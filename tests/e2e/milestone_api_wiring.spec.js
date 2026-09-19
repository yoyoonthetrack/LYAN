const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const MILESTONE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MILESTONE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSION_ID = '11111111-1111-4111-a111-111111111111';

async function installQuoteContext(page, quotes) {
  await page.evaluate(({ userId, contactId, quotes }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({
      status: 'ready', authenticated: true, userId, user: mockUser
    });
    window.LYANN_ACTIVE_CHAT_CONTACT = { id: contactId, name: 'Marie Dupont', avatar: '' };
    window.LYANN_MESSAGING_REPOSITORY = {
      getQuoteContext: async () => quotes
    };
  }, { userId: USER_ID, contactId: CONTACT_ID, quotes });
}

test.describe('Milestone API origin and id provenance', () => {
  test('Web stays same-origin; Capacitor uses https://lyann.app', async ({ page }) => {
    await page.goto('/feed.html');
    await page.waitForFunction(() => typeof window.getLyannBackendOrigin === 'function');

    const webOrigin = await page.evaluate(() => window.getLyannBackendOrigin());
    expect(webOrigin).toBe('');

    const nativeOrigin = await page.evaluate(() => {
      window.Capacitor = { isNativePlatform: () => true };
      return window.getLyannBackendOrigin();
    });
    expect(nativeOrigin).toBe('https://lyann.app');

    const overrideOrigin = await page.evaluate(() => {
      window.Capacitor = { isNativePlatform: () => true };
      window.LYANN_BACKEND_ORIGIN = 'http://127.0.0.1:8080';
      return window.getLyannBackendOrigin();
    });
    expect(overrideOrigin).toBe('http://127.0.0.1:8080');

    const nativeUrl = await page.evaluate(() => {
      delete window.LYANN_BACKEND_ORIGIN;
      window.Capacitor = { isNativePlatform: () => true };
      let captured = null;
      const originalFetch = window.fetch;
      window.fetch = (url) => {
        captured = String(url);
        return Promise.resolve(new Response('{}', { status: 401 }));
      };
      try {
        window.lyannBackendFetch('/v1/milestones/submit-completion', { method: 'POST' });
        return captured;
      } finally {
        window.fetch = originalFetch;
      }
    });
    expect(nativeUrl).toBe('https://lyann.app/v1/milestones/submit-completion');
  });

  test('explicit milestoneId is used only when it belongs to quote-context milestones', async ({ page }) => {
    await page.goto('/feed.html');
    await page.waitForFunction(() => typeof window.resolveChatMilestoneId === 'function');
    await installQuoteContext(page, [{
      id: 'quote-accepted',
      status: 'ACCEPTED',
      milestones: [{ id: MILESTONE_A, status: 'IN_PROGRESS', title: 'Travaux' }]
    }]);

    const accepted = await page.evaluate((id) => window.resolveChatMilestoneId(id, ['FUNDED', 'IN_PROGRESS']), MILESTONE_A);
    expect(accepted).toBe(MILESTONE_A);

    const rejectedMissionId = await page.evaluate((id) => window.resolveChatMilestoneId(id, ['FUNDED', 'IN_PROGRESS']), MISSION_ID);
    expect(rejectedMissionId).toBeNull();
  });

  test('two IN_PROGRESS milestones without a single ACCEPTED quote match are refused', async ({ page }) => {
    await page.goto('/feed.html');
    await page.waitForFunction(() => typeof window.resolveChatMilestoneId === 'function');
    await installQuoteContext(page, [
      {
        id: 'quote-a',
        status: 'ACCEPTED',
        milestones: [{ id: MILESTONE_A, status: 'IN_PROGRESS', title: 'Partie A' }]
      },
      {
        id: 'quote-b',
        status: 'ACCEPTED',
        milestones: [{ id: MILESTONE_B, status: 'IN_PROGRESS', title: 'Partie B' }]
      }
    ]);

    const ambiguous = await page.evaluate(() => window.resolveChatMilestoneId(null, ['FUNDED', 'IN_PROGRESS']));
    expect(ambiguous).toBeNull();
  });

  test('a unique ACCEPTED quote milestone is selected when no explicit id is given', async ({ page }) => {
    await page.goto('/feed.html');
    await page.waitForFunction(() => typeof window.resolveChatMilestoneId === 'function');
    await installQuoteContext(page, [
      {
        id: 'quote-draft',
        status: 'SENT',
        milestones: [{ id: MILESTONE_B, status: 'IN_PROGRESS', title: 'Brouillon' }]
      },
      {
        id: 'quote-accepted',
        status: 'ACCEPTED',
        milestones: [{ id: MILESTONE_A, status: 'IN_PROGRESS', title: 'Accepté' }]
      }
    ]);

    const resolved = await page.evaluate(() => window.resolveChatMilestoneId(null, ['FUNDED', 'IN_PROGRESS']));
    expect(resolved).toBe(MILESTONE_A);
  });
});
