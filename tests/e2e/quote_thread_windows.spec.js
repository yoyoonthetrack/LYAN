const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const CONV_ID = '33333333-3333-4333-a333-333333333333';
const QUOTE_V0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0';
const QUOTE_V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const QUOTE_V2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

async function bootChat(page, messages, quotes) {
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(({ userId, contactId, convId, messages, quotes }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({ status: 'ready', authenticated: true, userId, user: mockUser });
    window.LYANN_MESSAGING_REPOSITORY = Object.assign({}, window.LYANN_MESSAGING_REPOSITORY, {
      listConversations: async () => [],
      findConversationId: async () => convId,
      getMessages: async () => messages,
      peekMessages: () => null,
      peekConversations: () => [],
      getQuoteContext: async () => quotes,
      invalidateConversation() {},
      invalidateMessages() {},
      invalidateQuoteContext() {},
      markConversationRead: async () => {},
      noteIncomingPreview() { return null; },
      ensureInboxConversation: async () => null,
      formatMessagePreview: window.LYANN_MESSAGING_REPOSITORY.formatMessagePreview
    });
    window.LYANN_API_CLIENT.getSupportUserId = async () => null;
    window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: convId } });
    window.LYANN_API_CLIENT.getConversationRequestContext = async () => null;
    window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
    window.LYANN_API_CLIENT.getUserProfile = async () => ({ id: contactId, first_name: 'Marie', last_name: 'Dupont' });
    window.LYANN_API_CLIENT.initiateLyannHelp = async () => ({ data: null });
    window.LYANN_API_CLIENT.acceptRequestQuote = async () => {
      throw new Error('accept must stay stubbed');
    };
    window.LYANN_ROUTER = { requireAuthForInteraction: async () => true };
    window.lyannAlert = () => {};
    window.dispatchEvent(new Event('lyann:auth-ready'));
  }, { userId: USER_ID, contactId: CONTACT_ID, convId: CONV_ID, messages, quotes });
  await page.evaluate((contactId) => window.LYANN_MESSAGING.openConversation({ contactId, name: 'Marie Dupont' }), CONTACT_ID);
  await expect(page.locator('#chatInputField')).toBeVisible();
  await expect(page.locator('.chat-back-to-contacts-btn')).toHaveCount(1);
}

function quoteRow(id, status, version, validUntil) {
  return {
    id,
    description: 'Prestation ' + version,
    total_amount: 40 + version,
    version,
    valid_until: validUntil,
    status,
    requester_id: USER_ID,
    provider_id: CONTACT_ID,
    request_status: 'OPEN',
    mission_id: null,
    milestones: [{ id: 'ms-' + version, title: 'Étape', description: 'Détail', amount: 40 + version, status: 'PENDING', display_order: 1 }]
  };
}

test('a refused quote and a later acceptance both stay in order', async ({ page }) => {
  const quotes = [
    quoteRow(QUOTE_V0, 'ACCEPTED', 1, '2099-01-01'),
    quoteRow(QUOTE_V1, 'REJECTED', 1, '2099-01-01'),
    quoteRow(QUOTE_V2, 'ACCEPTED', 2, '2099-01-01')
  ];
  const messages = [
    { id: 'c0', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-01T10:00:00Z'), createdAt: '2026-10-01T10:00:00Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_V0 },
    { id: 'a0', text: '✅ Devis accepté', sender: 'me', timestamp: Date.parse('2026-10-01T10:05:00Z'), createdAt: '2026-10-01T10:05:00Z', type: 'quote_accepted', messageType: 'quote_accepted', entityType: 'quote', entityId: QUOTE_V0 },
    { id: 'c1', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-28T17:03:35Z'), createdAt: '2026-10-28T17:03:35Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_V1 },
    { id: 'd1', text: 'Devis refusé', sender: 'me', timestamp: Date.parse('2026-10-28T17:03:48Z'), createdAt: '2026-10-28T17:03:48Z', type: 'quote_declined', messageType: 'quote_declined', entityType: 'quote', entityId: QUOTE_V1 },
    { id: 'c2', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-28T17:06:33Z'), createdAt: '2026-10-28T17:06:33Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_V2 },
    { id: 'a2', text: '✅ Devis accepté', sender: 'me', timestamp: Date.parse('2026-10-28T17:07:01Z'), createdAt: '2026-10-28T17:07:01Z', type: 'quote_accepted', messageType: 'quote_accepted', entityType: 'quote', entityId: QUOTE_V2 },
    { id: 'a2-dup', text: '✅ Devis accepté', sender: 'me', timestamp: Date.parse('2026-10-28T17:07:02Z'), createdAt: '2026-10-28T17:07:02Z', type: 'quote_accepted', messageType: 'quote_accepted', entityType: 'quote', entityId: QUOTE_V2 }
  ];
  await bootChat(page, messages, quotes);
  await expect.poll(() => page.locator('#chatMessagesContainer [data-message-id="a2"]').count()).toBe(1);
  const order = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer [data-message-id]')].map((node) => node.dataset.messageId));
  expect(order.filter((id) => ['c0', 'a0', 'c1', 'd1', 'c2', 'a2', 'a2-dup'].includes(id))).toEqual(['c0', 'a0', 'c1', 'd1', 'c2', 'a2']);
  await expect(page.locator('[data-message-id="d1"]')).toContainText('Devis refusé');
  await expect(page.locator('[data-message-id="a0"]')).toContainText('Devis accepté');
  await expect(page.locator('[data-message-id="a2"]')).toContainText('Devis accepté');
  await expect(page.locator('[data-entity-id="' + QUOTE_V2 + '"][data-message-type="quote_accepted"]')).toHaveCount(1);
  const preview = await page.evaluate(() => window.LYANN_MESSAGING_REPOSITORY.formatMessagePreview({
    message_type: 'quote_accepted',
    entity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    content: '✅ Devis accepté'
  }));
  expect(preview).toBe('✅ Devis accepté');
  await expect(page.locator('.chat-back-to-contacts-btn')).toHaveCount(1);
});

test('confirmation is the only window, and cancel returns to the quote', async ({ page }) => {
  const quote = quoteRow(QUOTE_V2, 'SENT', 2, '2099-11-02');
  await bootChat(page, [
    { id: 'q2', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-28T17:06:33Z'), createdAt: '2026-10-28T17:06:33Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_V2 }
  ], [quote]);
  await page.locator('[data-message-id="q2"] button', { hasText: 'Voir le devis' }).click();
  const review = page.locator('#quoteReviewOverlay');
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Signer et accepter le devis' }).click();
  await expect(review).toBeHidden();
  const dialog = page.locator('#lyannDialogOverlay');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Signer et accepter le devis');
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(review).toBeVisible();
  await expect(review).toContainText('Prestation 2');
  await page.evaluate(() => {
    window.__accepts = 0;
    window.LYANN_API_CLIENT.acceptRequestQuote = async () => {
      window.__accepts += 1;
      throw new Error('Le devis n’a pas pu être accepté. Réessayez.');
    };
  });
  await review.getByRole('button', { name: 'Signer et accepter le devis' }).click();
  await expect(review).toBeHidden();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(review).toBeVisible();
  await expect(page.locator('#lyanToastContainer')).toContainText('Le devis n’a pas pu être accepté');
  expect(await page.evaluate(() => window.__accepts)).toBe(1);
  await expect(page.locator('.chat-back-to-contacts-btn')).toHaveCount(1);
});

test('an expired, refused, accepted or cancelled quote offers no acceptance', async ({ page }) => {
  const expired = quoteRow(QUOTE_V2, 'SENT', 2, '2000-01-01T00:00:00Z');
  await bootChat(page, [
    { id: 'qx', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-28T17:06:33Z'), createdAt: '2026-10-28T17:06:33Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_V2 }
  ], [expired]);
  await page.locator('[data-message-id="qx"] button', { hasText: 'Voir le devis' }).click();
  const review = page.locator('#quoteReviewOverlay');
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Signer et accepter le devis' })).toHaveCount(0);
  await expect(page.locator('#lyannDialogOverlay')).toBeHidden();
  await review.getByRole('button', { name: 'Fermer' }).click();

  for (const status of ['REJECTED', 'ACCEPTED', 'CANCELLED']) {
    await bootChat(page, [
      { id: 'qx', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-28T17:06:33Z'), createdAt: '2026-10-28T17:06:33Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_V2 }
    ], [quoteRow(QUOTE_V2, status, 2, '2099-01-01')]);
    await expect(page.locator('[data-message-id="qx"]')).toBeVisible();
    await page.evaluate((id) => window.openQuoteReview(id), QUOTE_V2);
    await expect(review).toBeVisible();
    await expect(review.getByRole('button', { name: 'Signer et accepter le devis' })).toHaveCount(0);
    await expect(page.locator('#lyannDialogOverlay')).toBeHidden();
    await review.getByRole('button', { name: 'Fermer' }).click();
  }
  await expect(page.locator('.chat-back-to-contacts-btn')).toHaveCount(1);
});
