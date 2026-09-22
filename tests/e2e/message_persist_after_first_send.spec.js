const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const CONV_ID = '33333333-3333-4333-a333-333333333333';
const SENT_TEXT = 'Bonjour, le message doit rester après envoi';

test('A first sent message still appears after the conversation cache is reread', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(({ userId, contactId, convId, sentText }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({
      status: 'ready', authenticated: true, userId, user: mockUser
    });

    let conversationKnown = false;
    window.LYANN_MESSAGING_REPOSITORY = {
      listConversations: async () => [],
      findConversationId: async () => (conversationKnown ? convId : null),
      getMessages: async () => {
        if (!conversationKnown) return [];
        return [{
          id: 'msg-persisted-1',
          text: sentText,
          sender: 'me',
          timestamp: Date.now(),
          type: 'text',
          txData: null,
          status: 'read'
        }];
      },
      getQuoteContext: async () => [],
      invalidateConversation() { conversationKnown = true; },
      invalidateMessages() {},
      invalidateQuoteContext() {}
    };

    window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: convId } });
    window.LYANN_API_CLIENT.sendMessage = async () => ({ data: { id: 'msg-persisted-1' }, error: null });
    window.LYANN_API_CLIENT.getConversationRequestContext = async () => null;
    window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
    window.LYANN_API_CLIENT.getUserProfile = async () => ({
      id: contactId, first_name: 'Marie', last_name: 'Dupont'
    });
    window.LYANN_API_CLIENT.initiateLyannHelp = async () => ({ data: null });
  }, { userId: USER_ID, contactId: CONTACT_ID, convId: CONV_ID, sentText: SENT_TEXT });

  await page.evaluate((contactId) => window.LYANN_MESSAGING.openConversation({
    contactId,
    name: 'Marie Dupont'
  }), CONTACT_ID);

  const input = page.locator('#chatInputField');
  await expect(input).toBeVisible();
  await input.fill(SENT_TEXT);
  await page.locator('#chatInputForm').evaluate((form) => form.requestSubmit());

  await expect(page.locator('#chatMessagesContainer')).toContainText(SENT_TEXT);
  await expect.poll(async () => page.locator('#chatMessagesContainer .chat-empty-state').count()).toBe(0);
  expect(jsErrors).toEqual([]);
});
