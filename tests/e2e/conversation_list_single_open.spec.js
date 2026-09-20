const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const REQUEST_ID = '11111111-1111-4111-a111-111111111111';
const MESSAGE_TEXT = 'Message réel de la conversation UUID';

async function installMessagingHarness(page) {
  await page.evaluate(({ userId, contactId, messageText }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({
      status: 'ready', authenticated: true, userId, user: mockUser
    });
    window.LYANN_AUTH_STATE.ready = async () => window.LYANN_AUTH_STATE.getSnapshot();

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
        id: contactId, first_name: 'Marie', last_name: 'Dupont'
      });
      window.LYANN_API_CLIENT.initiateLyannHelp = async () => ({ data: null });
      window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: '33333333-3333-4333-a333-333333333333' } });
      window.LYANN_API_CLIENT.getConversationRequestContext = async () => null;
      window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
      const supabase = window.LYANN_API_CLIENT.supabase;
      if (supabase && typeof supabase.from === 'function') {
        const originalFrom = supabase.from.bind(supabase);
        supabase.from = (table) => {
          if (table === 'requests') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null })
                })
              })
            };
          }
          return originalFrom(table);
        };
      }
    }

    window.__lyannHydratorCalls = [];
    const originalHydrator = window.__LYANN_CHAT_CORE_OPEN;
    window.__LYANN_CHAT_CORE_OPEN = async function (name, avatar, contactIdArg, initialNeed) {
      window.__lyannHydratorCalls.push({
        name,
        contactId: contactIdArg,
        initialNeed: initialNeed || null
      });
      return originalHydrator.call(this, name, avatar, contactIdArg, initialNeed);
    };
  }, { userId: USER_ID, contactId: CONTACT_ID, messageText: MESSAGE_TEXT });
}

async function expectSingleCanonicalOpen(page, { forbiddenIds = [] } = {}) {
  await expect(page.locator('#chatModal')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.LYANN_ACTIVE_CHAT_CONTACT?.id)).toBe(CONTACT_ID);
  await expect(page.locator('#chatMessagesContainer')).toContainText(MESSAGE_TEXT);
  const snapshot = await page.evaluate(() => ({
    calls: window.__lyannHydratorCalls,
    activeId: window.LYANN_ACTIVE_CHAT_CONTACT?.id
  }));
  expect(snapshot.calls, 'a second open used to fire with the visible name instead of the UUID').toHaveLength(1);
  expect(snapshot.calls[0].contactId).toBe(CONTACT_ID);
  expect(snapshot.calls[0].name).toBe('Marie Dupont');
  for (const id of forbiddenIds) expect(snapshot.calls[0].contactId).not.toBe(id);
  expect(snapshot.activeId).toBe(CONTACT_ID);
  await expect(page.locator('#chatMessagesContainer')).toContainText(MESSAGE_TEXT);
  await expect(page.locator('#chatMessagesContainer')).not.toContainText('Commencez l’échange');
}

test.describe('Conversation list opens a single canonical conversation', () => {
  test('list click opens once with the contact UUID and its messages, not the display name', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installMessagingHarness(page);

    await page.evaluate(async () => {
      await window.LYANN_MESSAGING.openList();
    });

    const row = page.locator('#chatModal .chat-contact-item').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Marie Dupont');
    await expect(row).not.toHaveAttribute('data-chat-member-id');

    await row.click();

    await expectSingleCanonicalOpen(page, { forbiddenIds: ['Marie Dupont'] });
    await expect(page.locator('#chatHeaderName')).toHaveText(/Marie/);
    expect(jsErrors).toEqual([]);
  });

  test('Je peux aider opens the requester UUID once and shows that conversation', async ({ page }) => {
    test.setTimeout(45000);
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html', { waitUntil: 'domcontentloaded' });
    await installMessagingHarness(page);

    await page.evaluate(({ requestId, contactId }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-help-lyann';
      button.setAttribute('data-request-id', requestId);
      button.setAttribute('data-requester-id', contactId);
      button.setAttribute('data-requester-name', 'Marie Dupont');
      button.setAttribute('data-title', "Besoin d'aide jardinage");
      button.textContent = 'Je peux aider';
      document.body.appendChild(button);
    }, { requestId: REQUEST_ID, contactId: CONTACT_ID });

    await page.locator('body > .btn-help-lyann').click();

    await expectSingleCanonicalOpen(page, { forbiddenIds: [REQUEST_ID, 'Marie Dupont'] });
    expect(jsErrors).toEqual([]);
  });

  test('Contacter opens the member UUID once and shows that conversation', async ({ page }) => {
    test.setTimeout(45000);
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/feed.html', { waitUntil: 'domcontentloaded' });
    await installMessagingHarness(page);

    await page.evaluate((contactId) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-contact-member';
      button.setAttribute('data-member-id', contactId);
      button.setAttribute('data-member-name', 'Marie Dupont');
      button.textContent = 'Contacter';
      document.body.appendChild(button);
    }, CONTACT_ID);

    await page.locator('body > .btn-contact-member').click();

    await expectSingleCanonicalOpen(page, { forbiddenIds: ['Marie Dupont'] });
    expect(jsErrors).toEqual([]);
  });
});
