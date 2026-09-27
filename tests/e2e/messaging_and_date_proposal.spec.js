const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const REQUEST_ID = '11111111-1111-4111-a111-111111111111';
const CONVERSATION_ID = '33333333-3333-4333-a333-333333333333';
const SERVER_VISIT_ID = '77777777-7777-4777-8777-777777777777';

test.describe('LYANN V1 — Messaging & Date Proposal Regression', () => {

  test('Clicking "Je peux aider" opens chat modal with contact and submitting Date Proposal sends message without error', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(({ userId, contactId, conversationId, requestId, serverVisitId }) => {
      const mockUser = { id: userId, email: 'helper@lyann.app' };
      document.body.classList.remove('user-is-logged-out', 'auth-resolving');
      document.body.classList.add('user-is-logged-in', 'auth-ready');
      window.CURRENT_USER_ID = userId;
      window.LYANN_AUTH_STATE.isAuthenticated = () => true;
      window.LYANN_AUTH_STATE.getSnapshot = () => ({ status: 'ready', authenticated: true, userId, user: mockUser });
      window.LYANN_AUTH_STATE.ready = async () => window.LYANN_AUTH_STATE.getSnapshot();
      window.LYANN_ROUTER = { requireAuthForInteraction: async () => true };
      window.LYANN_MESSAGING_REPOSITORY = Object.assign({}, window.LYANN_MESSAGING_REPOSITORY, {
        listConversations: async () => [],
        findConversationId: async () => conversationId,
        getMessages: async () => [],
        peekMessages: () => null,
        peekConversations: () => [],
        getQuoteContext: async () => [],
        invalidateConversation() {},
        invalidateMessages() {},
        invalidateQuoteContext() {},
        markConversationRead: async () => {},
        noteIncomingPreview() { return null; },
        ensureInboxConversation: async () => null
      });
      window.LYANN_API_CLIENT.getSupportUserId = async () => null;
      window.LYANN_API_CLIENT.getUserProfile = async () => ({ id: contactId, first_name: 'Marie', last_name: 'Dupont' });
      window.LYANN_API_CLIENT.initiateLyannHelp = async () => ({ data: null });
      window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: conversationId } });
      window.LYANN_API_CLIENT.getConversationRequestContext = async () => null;
      window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
      window.__visitInserts = [];
      window.LYANN_API_CLIENT.sendMessage = async (conversation, sender, content, extra) => {
        window.__visitInserts.push({ conversation, sender, content, extra });
        return {
          data: {
            id: serverVisitId,
            conversation_id: conversation,
            sender_id: sender,
            content,
            message_type: extra && extra.messageType,
            metadata: extra && extra.metadata,
            created_at: '2026-10-15T08:00:00.000Z',
            client_message_id: extra && extra.clientMessageId
          },
          error: null
        };
      };

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-help-lyann';
      button.setAttribute('data-request-id', requestId);
      button.setAttribute('data-requester-id', contactId);
      button.setAttribute('data-requester-name', 'Marie Dupont');
      button.setAttribute('data-requester-avatar', '/default-avatar.svg');
      button.setAttribute('data-title', "Besoin d'aide jardinage");
      button.textContent = 'Je peux aider';
      document.body.appendChild(button);
    }, { userId: USER_ID, contactId: CONTACT_ID, conversationId: CONVERSATION_ID, requestId: REQUEST_ID, serverVisitId: SERVER_VISIT_ID });

    await page.locator('body > .btn-help-lyann').click();
    await expect(page.locator('#chatHeaderName')).toHaveText('Marie Dupont');
    await expect.poll(() => page.evaluate(() => window.LYANN_ACTIVE_CHAT_CONTACT?.id)).toBe(CONTACT_ID);
    await expect(page.locator('#chatInputField')).toBeVisible();

    await page.evaluate(() => {
      window.LYANN_MESSAGING.openChildSurface('chatProposeDateForm');
    });
    const proposeDateForm = page.locator('#proposeDateForm');
    await expect(proposeDateForm).toBeVisible();
    await page.fill('#pdDate', '2026-10-15');
    await page.selectOption('#pdTimeSlot', 'Matin (8h - 12h)');
    await page.fill('#pdNote', 'Disponible dès 8h');
    await page.locator('#proposeDateForm button[type="submit"]').click();

    const card = page.locator('#chatMessagesContainer [data-message-type="visit_proposed"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('📅 Visite proposée');
    await expect(card).toContainText('15 octobre');
    await expect(card).toContainText('Matin (8h - 12h)');
    await expect.poll(() => page.evaluate(() => window.__visitInserts.length)).toBe(1);
    const sent = await page.evaluate(() => window.__visitInserts[0]);
    expect(sent.extra.messageType).toBe('visit_proposed');
    expect(sent.extra.metadata.slot).toBe('Matin (8h - 12h)');
    expect(sent.extra.metadata.label).toContain('15 octobre');
    await expect(card).toHaveAttribute('data-message-id', SERVER_VISIT_ID);

    await page.evaluate(({ serverVisitId, conversationId, userId }) => {
      const sentRow = window.__visitInserts[0];
      const row = {
        id: serverVisitId,
        conversation_id: conversationId,
        sender_id: userId,
        content: sentRow.content,
        created_at: '2026-10-15T08:00:00.000Z',
        message_type: 'visit_proposed',
        metadata: sentRow.extra.metadata
      };
      window.appendLiveChatMessage(row);
      window.appendLiveChatMessage(row);
    }, { serverVisitId: SERVER_VISIT_ID, conversationId: CONVERSATION_ID, userId: USER_ID });

    await expect(card).toHaveCount(1);
    await expect(page.locator('#chatMessagesContainer [data-message-id="' + SERVER_VISIT_ID + '"]')).toHaveCount(1);
    expect(jsErrors).toEqual([]);
  });

});
