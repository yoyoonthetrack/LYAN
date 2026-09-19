const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const REQUEST_ID = '11111111-1111-4111-a111-111111111111';
const MESSAGE_TEXT = 'Message réel de la conversation UUID';

const REQUEST_ROW = {
  id: REQUEST_ID,
  title: "Besoin d'aide jardinage",
  description: 'Tondre la pelouse ce week-end',
  category: 'Jardinage',
  location: 'Pointe-à-Pitre',
  budget: 40,
  status: 'OPEN',
  created_at: '2026-09-01T10:00:00.000Z',
  requester_id: CONTACT_ID,
  profiles: { id: CONTACT_ID, first_name: 'Marie', last_name: 'Dupont' }
};

async function installHarness(page) {
  await page.evaluate(({ userId, contactId, messageText, requestRow }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_CURRENT_USER = { ...mockUser, first_name: 'Helper' };
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({
      status: 'ready', authenticated: true, userId, user: mockUser
    });
    window.LYANN_AUTH_STATE.ready = async () => window.LYANN_AUTH_STATE.getSnapshot();
    window.requireAuthSession = async () => ({ user: mockUser });
    window.getActiveSupabaseSession = async () => ({ user: mockUser });

    window.LYANN_MESSAGING_REPOSITORY = {
      listConversations: async () => [{
        conversationId: '33333333-3333-4333-a333-333333333333',
        contactId,
        name: 'Marie Dupont',
        avatar: '',
        preview: messageText,
        lastMessageAt: new Date().toISOString()
      }],
      getMessages: async (_userId, id) => {
        if (id !== contactId) return [];
        return [{
          id: 'msg-canonical-1',
          text: messageText,
          sender: 'them',
          timestamp: Date.now(),
          type: 'text',
          txData: null,
          status: 'read'
        }];
      },
      getQuoteContext: async () => [],
      findConversationId: async () => '33333333-3333-4333-a333-333333333333',
      invalidateConversation() {},
      invalidateMessages() {},
      invalidateQuoteContext() {}
    };

    if (window.LYANN_API_CLIENT) {
      window.LYANN_API_CLIENT.getUserProfile = async () => ({
        id: userId, first_name: 'Helper', last_name: 'LYANN', email: mockUser.email
      });
      window.LYANN_API_CLIENT.initiateLyannHelp = async () => ({ data: null });
      window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: '33333333-3333-4333-a333-333333333333' } });
      window.LYANN_API_CLIENT.getConversationRequestContext = async () => ({ requestId: requestRow.id });
      window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
      const supabase = window.LYANN_API_CLIENT.supabase;
      if (supabase) {
        if (supabase.auth) {
          supabase.auth.getSession = async () => ({
            data: { session: { user: mockUser, access_token: 'mock-token' } },
            error: null
          });
        }
        if (typeof supabase.from === 'function') {
          const originalFrom = supabase.from.bind(supabase);
          const requestQuery = {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: requestRow, error: null }),
                single: async () => ({ data: requestRow, error: null })
              })
            })
          };
          const profileQuery = {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: requestRow.profiles, error: null })
              })
            })
          };
          supabase.from = (table) => {
            if (table === 'requests') return requestQuery;
            if (table === 'public_profiles') return profileQuery;
            return originalFrom(table);
          };
        }
      }
    }

    if (window.LYANN_EXPLORER_REPOSITORY) {
      window.LYANN_EXPLORER_REPOSITORY.loadRequests = async () => [requestRow];
    }
  }, { userId: USER_ID, contactId: CONTACT_ID, messageText: MESSAGE_TEXT, requestRow: REQUEST_ROW });
}

async function overlayState(page) {
  return page.evaluate(() => {
    const detail = document.getElementById('lyannDetailModal');
    const account = document.getElementById('userAccountModal');
    const detailStyle = detail ? getComputedStyle(detail) : null;
    const accountStyle = account ? getComputedStyle(account) : null;
    const detailVisible = !!(detail && detailStyle.display !== 'none' && detailStyle.visibility !== 'hidden' && Number(detailStyle.opacity) > 0 && (detail.classList.contains('active') || window.LYANN_SURFACES?.isOpen?.('lyann-detail')));
    const accountVisible = !!(account && accountStyle.display !== 'none' && accountStyle.visibility !== 'hidden' && Number(accountStyle.opacity) > 0 && (account.classList.contains('active') || window.LYANN_SURFACES?.isOpen?.('account')));
    const mid = document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    return {
      lyannOpen: !!window.LYANN_SURFACES?.isOpen?.('lyann-detail'),
      accountOpen: !!window.LYANN_SURFACES?.isOpen?.('account'),
      surfaceOpen: document.body.classList.contains('lyann-surface-open'),
      overflow: document.body.style.overflow,
      stack: window.LYANN_SURFACES.list().map((entry) => entry.name),
      detailVisible,
      accountVisible,
      midHitsDetail: !!mid?.closest?.('#lyannDetailModal'),
      midHitsAccount: !!mid?.closest?.('#userAccountModal')
    };
  });
}

async function expectStack(page, names) {
  await expect.poll(() => page.evaluate(() => window.LYANN_SURFACES.list().map((entry) => entry.name))).toEqual(names);
}

async function openMissionFromConversation(page) {
  await page.evaluate((requestId) => {
    const btn = document.getElementById('chatViewMissionBtn');
    btn.dataset.requestId = requestId;
    btn.style.display = 'block';
  }, REQUEST_ID);
  await page.locator('#chatViewMissionBtn').click();
  await expect(page.locator('#lyannDetailModal')).toBeVisible();
  await expect(page.locator('#closeLyannDetailFooterBtn')).toBeVisible();
  await expectStack(page, ['messaging', 'lyann-detail']);
}

test.describe('Lyann detail and account close through LYANN_SURFACES', () => {
  test('conversation → fiche mission → fermer → conversation still usable', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installHarness(page);

    await page.evaluate(async ({ contactId }) => {
      await window.LYANN_MESSAGING.openConversation({ contactId, name: 'Marie Dupont' });
    }, { contactId: CONTACT_ID });

    await expect(page.locator('#chatModal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.LYANN_ACTIVE_CHAT_CONTACT?.id)).toBe(CONTACT_ID);
    await expect(page.locator('#chatMessagesContainer')).toContainText(MESSAGE_TEXT);
    await expectStack(page, ['messaging']);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await openMissionFromConversation(page);
    await page.locator('#closeLyannDetailFooterBtn').click();

    await expectStack(page, ['messaging']);
    const afterClose = await overlayState(page);
    expect(afterClose.lyannOpen).toBe(false);
    expect(afterClose.detailVisible).toBe(false);
    expect(afterClose.midHitsDetail).toBe(false);
    expect(afterClose.overflow).toBe('hidden');

    await expect(page.locator('#chatModal')).toBeVisible();
    await expect(page.locator('#chatMessagesContainer')).toContainText(MESSAGE_TEXT);
    await expect(page.locator('#chatInputField')).toBeVisible();
    await page.locator('#chatInputField').fill('Toujours utilisable');
    await expect(page.locator('#chatInputField')).toHaveValue('Toujours utilisable');
    expect(jsErrors).toEqual([]);
  });

  test('repeated mission open/close leaves no orphan stack entry and keeps messages', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installHarness(page);

    await page.evaluate(async ({ contactId }) => {
      await window.LYANN_MESSAGING.openConversation({ contactId, name: 'Marie Dupont' });
    }, { contactId: CONTACT_ID });
    await expectStack(page, ['messaging']);

    const closeSelectors = ['#closeLyannDetailFooterBtn', '#closeLyannDetailModalBtn', '#closeLyannDetailFooterBtn'];
    for (const closeSelector of closeSelectors) {
      await openMissionFromConversation(page);
      await page.locator(closeSelector).click();
      await expectStack(page, ['messaging']);
      await expect(page.locator('#chatMessagesContainer')).toContainText(MESSAGE_TEXT);
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    }

    const afterLoops = await overlayState(page);
    expect(afterLoops.stack.filter((name) => name === 'lyann-detail')).toEqual([]);
    expect(afterLoops.stack.filter((name) => name === 'messaging')).toHaveLength(1);
    expect(afterLoops.overflow).toBe('hidden');

    await page.evaluate(() => window.LYANN_MESSAGING.close());
    await expectStack(page, []);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(jsErrors).toEqual([]);
  });

  test('fiche Lyann → Je peux aider → correct conversation without blocking overlay', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installHarness(page);

    await page.evaluate(async ({ requestId, requestRow }) => {
      await window.openLyannDetailModal(requestId, requestRow);
    }, { requestId: REQUEST_ID, requestRow: REQUEST_ROW });

    await expect(page.locator('#btnHelpLyannFromModal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.LYANN_SURFACES.isOpen('lyann-detail'))).toBe(true);

    await page.locator('#btnHelpLyannFromModal').click();

    await expect(page.locator('#chatModal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.LYANN_ACTIVE_CHAT_CONTACT?.id)).toBe(CONTACT_ID);
    await expect(page.locator('#chatMessagesContainer')).toContainText(MESSAGE_TEXT);
    await expectStack(page, ['messaging']);

    const afterHelp = await overlayState(page);
    expect(afterHelp.lyannOpen).toBe(false);
    expect(afterHelp.detailVisible).toBe(false);
    expect(afterHelp.midHitsDetail).toBe(false);
    expect(afterHelp.overflow).toBe('hidden');

    await expect(page.locator('#chatInputField')).toBeVisible();
    await page.locator('#chatInputField').fill('Overlay libre');
    await expect(page.locator('#chatInputField')).toHaveValue('Overlay libre');
    expect(jsErrors).toEqual([]);
  });

  test('compte → fermer → page usable and overflow restored', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installHarness(page);

    await page.evaluate(async () => {
      await window.openAccountModalSubView('account');
    });

    await expect(page.locator('#userAccountModal')).toBeVisible();
    await expectStack(page, ['account']);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.locator('.account-main-close-btn').click();

    await expectStack(page, []);
    const afterClose = await overlayState(page);
    expect(afterClose.accountVisible).toBe(false);
    expect(afterClose.accountOpen).toBe(false);
    expect(afterClose.surfaceOpen).toBe(false);
    expect(afterClose.overflow).not.toBe('hidden');
    expect(afterClose.midHitsAccount).toBe(false);

    await page.evaluate(() => {
      document.documentElement.style.minHeight = '2400px';
      document.body.style.minHeight = '2400px';
    });
    await page.evaluate(() => window.scrollTo(0, 420));
    await expect.poll(() => page.evaluate(() => window.scrollY || document.documentElement.scrollTop)).toBeGreaterThan(0);

    const feed = page.locator('#flashFeedContainer');
    await expect(feed).toBeVisible();
    await feed.click({ position: { x: 8, y: 8 } });
    expect(jsErrors).toEqual([]);
  });

  test('account closes via Fermer, Retour and Escape without leftover stack entries', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installHarness(page);

    const paths = [
      {
        name: 'Fermer',
        viewport: { width: 1280, height: 720 },
        close: async () => page.locator('.account-main-close-btn').click()
      },
      {
        name: 'Retour',
        viewport: { width: 390, height: 844 },
        close: async () => page.locator('.account-v3-back-btn').click()
      },
      {
        name: 'Escape',
        viewport: { width: 1280, height: 720 },
        close: async () => page.keyboard.press('Escape')
      }
    ];

    for (const path of paths) {
      await page.setViewportSize(path.viewport);
      await page.evaluate(async () => {
        await window.openAccountModalSubView('account');
      });
      await expect(page.locator('#userAccountModal')).toBeVisible();
      await expectStack(page, ['account']);
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

      await path.close();

      await expectStack(page, []);
      const afterClose = await overlayState(page);
      expect(afterClose.accountOpen, `${path.name} left account on the stack`).toBe(false);
      expect(afterClose.accountVisible, `${path.name} left account visible`).toBe(false);
      expect(afterClose.overflow, `${path.name} left body overflow locked`).not.toBe('hidden');
    }

    expect(jsErrors).toEqual([]);
  });
});
