const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const CONV_ID = '33333333-3333-4333-a333-333333333333';
const QUOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('timeline migration reserves financial events and does not rewrite history', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../45_chat_timeline.sql'), 'utf8');
  expect(sql).toContain('payment_secured');
  expect(sql).toContain('reserved timeline event');
  expect(sql).toContain('quotes_timeline_event');
  expect(sql).toContain('payments_timeline_event');
  expect(sql).toContain('private.timeline_write_tokens');
  expect(sql).not.toMatch(/DELETE FROM public\.messages/i);
  expect(sql).not.toMatch(/UPDATE public\.messages SET/i);
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS message_type');
});

async function bootChat(page, messages, quotes) {
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(({ userId, contactId, convId, messages, quotes }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.__refreshBuilds = 0;
    const originalRefresh = window.refreshChatUI;
    window.refreshChatUI = async (...args) => {
      window.__refreshBuilds += 1;
      return originalRefresh.apply(window, args);
    };
    window.__realSendMessage = window.LYANN_API_CLIENT.sendMessage.bind(window.LYANN_API_CLIENT);
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
    window.LYANN_API_CLIENT.acceptRequestQuote = async () => ({ id: 'mission-1' });
    window.LYANN_ROUTER = { requireAuthForInteraction: async () => true };
    window.lyannConfirm = async () => true;
    window.lyannAlert = () => {};
    const supabase = window.LYANN_API_CLIENT.supabase;
    if (supabase && typeof supabase.from === 'function') {
      const from = supabase.from.bind(supabase);
      supabase.from = (table) => table === 'requests'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
        : from(table);
    }
    window.dispatchEvent(new Event('lyann:auth-ready'));
  }, { userId: USER_ID, contactId: CONTACT_ID, convId: CONV_ID, messages, quotes });
  await page.evaluate((contactId) => window.LYANN_MESSAGING.openConversation({ contactId, name: 'Marie Dupont' }), CONTACT_ID);
  await expect(page.locator('#chatInputField')).toBeVisible();
}

test('timeline keeps visit and quote events in chronological order', async ({ page }) => {
  const quote = {
    id: QUOTE_ID,
    description: '<img src=x onerror=alert(1)>',
    total_amount: 180,
    status: 'SENT',
    requester_id: USER_ID,
    provider_id: CONTACT_ID,
    milestones: [{ id: 'm1', title: 'Main-d’œuvre', amount: 180, status: 'PENDING' }]
  };
  await bootChat(page, [
    { id: 'm1', text: 'Bonjour', sender: 'them', timestamp: Date.parse('2026-10-14T10:31:00Z'), createdAt: '2026-10-14T10:31:00Z', type: 'text', messageType: 'text' },
    { id: 'm2', text: '📅 Visite proposée', sender: 'them', timestamp: Date.parse('2026-10-14T10:34:00Z'), createdAt: '2026-10-14T10:34:00Z', type: 'visit_proposed', messageType: 'visit_proposed', entityType: 'visit', entityId: 'm2', metadata: { label: 'mardi 14 octobre', slot: '14:30' } },
    { id: 'm3', text: '14h me convient.', sender: 'me', timestamp: Date.parse('2026-10-14T10:36:00Z'), createdAt: '2026-10-14T10:36:00Z', type: 'text', messageType: 'text' },
    { id: 'm4', text: '✓ Visite acceptée', sender: 'me', timestamp: Date.parse('2026-10-14T10:37:00Z'), createdAt: '2026-10-14T10:37:00Z', type: 'visit_accepted', messageType: 'visit_accepted', entityType: 'visit', entityId: 'm2', metadata: { label: 'mardi 14 octobre', slot: '14:30' } },
    { id: 'm5', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-10-14T11:48:00Z'), createdAt: '2026-10-14T11:48:00Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_ID }
  ], [quote]);
  await expect.poll(() => page.locator('#chatMessagesContainer [data-message-id]').count()).toBeGreaterThan(3);
  const order = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer [data-message-id]')].map((node) => node.dataset.messageId));
  expect(order.slice(0, 5)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  await expect(page.locator('.chat-timeline-title').nth(0)).toHaveText('📅 Visite proposée');
  await expect(page.locator('[data-message-id="m5"] .chat-timeline-body')).toContainText("Main-d’œuvre");
  expect(await page.locator('[data-message-id="m5"] img').count()).toBe(0);
  await expect(page.locator('[data-live-quote-id="' + QUOTE_ID + '"]')).toHaveCount(0);
});

test('a legacy quote stays visible until a timeline event exists', async ({ page }) => {
  const quote = { id: QUOTE_ID, description: 'Ancien devis', total_amount: 40, status: 'SENT', requester_id: USER_ID, provider_id: CONTACT_ID, milestones: [] };
  await bootChat(page, [
    { id: 't1', text: 'Bonjour', sender: 'them', timestamp: Date.parse('2026-01-01T00:00:00Z'), createdAt: '2026-01-01T00:00:00Z', type: 'text', messageType: 'text' }
  ], [quote]);
  await expect(page.locator('[data-live-quote-id="' + QUOTE_ID + '"]')).toHaveCount(1);
});

test('accepting a quote once does not rebuild the thread', async ({ page }) => {
  const quote = { id: QUOTE_ID, description: 'Devis', total_amount: 40, status: 'SENT', requester_id: USER_ID, provider_id: CONTACT_ID, milestones: [] };
  await bootChat(page, [
    { id: 'q1', text: '📄 Devis proposé', sender: 'them', timestamp: Date.parse('2026-02-01T00:00:00Z'), createdAt: '2026-02-01T00:00:00Z', type: 'quote_created', messageType: 'quote_created', entityType: 'quote', entityId: QUOTE_ID }
  ], [quote]);
  await expect(page.locator('[data-message-id="q1"] button', { hasText: 'Accepter' })).toBeVisible();
  const before = await page.evaluate(() => window.__refreshBuilds);
  await page.evaluate(() => {
    window.__accepts = 0;
    window.LYANN_API_CLIENT.acceptRequestQuote = async () => { window.__accepts += 1; return { id: 'mission-1' }; };
  });
  await page.locator('[data-message-id="q1"] button', { hasText: 'Accepter' }).click();
  await page.evaluate(() => window.handleAcceptQuote('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  expect(await page.evaluate(() => window.__accepts)).toBe(1);
  expect(await page.evaluate(() => window.__refreshBuilds)).toBe(before);
  await expect(page.locator('[data-message-id="q1"] .chat-timeline-state')).toHaveText('✓ Accepté');
});

test('a repeated realtime quote event does not add a second card', async ({ page }) => {
  await page.addInitScript(() => { window.__lyannRealtimeHandlers = []; });
  await bootChat(page, [], []);
  await page.evaluate(() => {
    const row = {
      id: 'evt-1',
      conversation_id: '33333333-3333-4333-a333-333333333333',
      sender_id: '22222222-2222-4222-a222-222222222222',
      content: '📄 Devis proposé',
      created_at: '2026-03-01T12:00:00Z',
      message_type: 'quote_created',
      entity_type: 'quote',
      entity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metadata: {}
    };
    window.appendLiveChatMessage?.(row);
    if (typeof window.appendLiveChatMessage !== 'function') {
      const container = document.getElementById('chatMessagesContainer');
      container.querySelector('.chat-empty-state')?.remove();
    }
  });
  const count = await page.evaluate(() => {
    const row = {
      id: 'evt-1',
      sender_id: '22222222-2222-4222-a222-222222222222',
      content: '📄 Devis proposé',
      created_at: '2026-03-01T12:00:00Z',
      message_type: 'quote_created',
      entity_type: 'quote',
      entity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metadata: {}
    };
    const fn = window.appendLiveChatMessage;
    return typeof fn;
  });
  expect(count).toBe('function');
  await page.evaluate(() => {
    const row = {
      id: 'evt-1',
      sender_id: '22222222-2222-4222-a222-222222222222',
      content: '📄 Devis proposé',
      created_at: '2026-03-01T11:00:00Z',
      message_type: 'quote_created',
      entity_type: 'quote',
      entity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metadata: {}
    };
    window.appendLiveChatMessage(row);
    window.appendLiveChatMessage(row);
    const older = { ...row, id: 'evt-0', created_at: '2026-03-01T09:00:00Z', content: 'Bonjour', message_type: 'text' };
    window.appendLiveChatMessage(older);
  });
  await expect(page.locator('[data-message-id="evt-1"]')).toHaveCount(1);
  const ids = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer [data-message-id]')].map((node) => node.dataset.messageId));
  expect(ids.indexOf('evt-0')).toBeLessThan(ids.indexOf('evt-1'));
});

test('user message types may be sent and reserved types never reach the network', async ({ page }) => {
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  const result = await page.evaluate(async () => {
    let inserts = 0;
    window.LYANN_API_CLIENT.supabase.from = () => ({
      insert() {
        inserts += 1;
        return { select() { return { single: async () => ({ data: { id: 'row-' + inserts }, error: null }) }; } };
      }
    });
    const send = (messageType, content) => window.LYANN_API_CLIENT.sendMessage(
      '33333333-3333-4333-a333-333333333333',
      '00000000-0000-4000-a000-000000000001',
      content,
      messageType ? { messageType } : {}
    );
    const system = await send('system', 'note');
    const rescheduled = await send('visit_rescheduled', 'autre date');
    const reservedInserts = inserts;
    const visit = await send('visit_proposed', 'visite');
    const text = await send('text', 'bonjour');
    const photo = await send('photo', 'photo');
    const document = await send('document', 'document');
    return {
      system: system.error && system.error.code,
      rescheduled: rescheduled.error && rescheduled.error.code,
      reservedInserts,
      visitError: visit.error || null,
      textError: text.error || null,
      photoError: photo.error || null,
      documentError: document.error || null,
      inserts
    };
  });
  expect(result.system).toBe('42501');
  expect(result.rescheduled).toBe('42501');
  expect(result.reservedInserts).toBe(0);
  expect(result.visitError).toBeNull();
  expect(result.textError).toBeNull();
  expect(result.photoError).toBeNull();
  expect(result.documentError).toBeNull();
  expect(result.inserts).toBe(4);
});

test('the client cannot send a forged payment confirmation', async ({ page }) => {
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  const result = await page.evaluate(async () => {
    let inserts = 0;
    const supabase = window.LYANN_API_CLIENT.supabase;
    supabase.from = () => ({ insert() { inserts += 1; return { select() { return { single: async () => ({ data: null, error: null }) }; } }; } });
    const response = await window.LYANN_API_CLIENT.sendMessage('33333333-3333-4333-a333-333333333333', '00000000-0000-4000-a000-000000000001', 'ok', { messageType: 'payment_secured' });
    return { code: response.error && response.error.code, inserts };
  });
  expect(result.code).toBe('42501');
  expect(result.inserts).toBe(0);
});

test('inbox labels timeline events in plain language', async ({ page }) => {
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  const labels = await page.evaluate(() => {
    const format = window.LYANN_MESSAGING_REPOSITORY.formatMessagePreview;
    return {
      quote: format({ message_type: 'quote_created', content: '{"secret":1}' }),
      paid: format({ message_type: 'payment_secured' }),
      funds: format({ message_type: 'funds_released' }),
      visit: format({ message_type: 'visit_proposed' })
    };
  });
  expect(labels).toEqual({
    quote: '📄 Devis proposé',
    paid: '🔒 Fonds sécurisés',
    funds: '💶 Fonds libérés',
    visit: '📅 Visite proposée'
  });
  expect(labels.quote).not.toContain('{');
});
