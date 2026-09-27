const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const CONV_ID = '33333333-3333-4333-a333-333333333333';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__lyannRealtimeHandlers = [];
    const wrapClient = (client) => {
      if (!client || client.__lyannChannelWrapped || typeof client.channel !== 'function') return client;
      const originalChannel = client.channel.bind(client);
      client.channel = function (name, ...rest) {
        const channel = originalChannel(name, ...rest);
        if (name !== 'lyann-messages' || !channel || typeof channel.on !== 'function') return channel;
        const originalOn = channel.on.bind(channel);
        channel.on = function (type, filter, callback) {
          if (type === 'postgres_changes' && filter && filter.table === 'messages' && filter.event === 'INSERT' && typeof callback === 'function') {
            window.__lyannRealtimeHandlers.push(callback);
          }
          return originalOn(type, filter, callback);
        };
        return channel;
      };
      client.__lyannChannelWrapped = true;
      return client;
    };
    const wrapSdk = (value) => {
      if (!value || typeof value !== 'object') return value;
      return new Proxy(value, {
        get(target, prop, receiver) {
          const current = Reflect.get(target, prop, receiver);
          if (prop !== 'createClient' || typeof current !== 'function' || target.__lyannCreateWrapped) return current;
          const wrapped = function (...args) {
            return wrapClient(current.apply(target, args));
          };
          target.createClient = wrapped;
          target.__lyannCreateWrapped = true;
          return wrapped;
        }
      });
    };
    let sdk;
    Object.defineProperty(window, 'supabase', {
      configurable: true,
      enumerable: true,
      get() { return sdk; },
      set(value) { sdk = wrapSdk(value); }
    });
  });
});

test('five identical Ok sends stay five bubbles with their own server ids', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(({ userId, contactId, convId }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({
      status: 'ready', authenticated: true, userId, user: mockUser
    });

    window.LYANN_MESSAGING_REPOSITORY = {
      listConversations: async () => [],
      findConversationId: async () => convId,
      getMessages: async () => [],
      peekMessages: () => null,
      getQuoteContext: async () => [],
      invalidateConversation() {},
      invalidateMessages() {},
      invalidateQuoteContext() {},
      markConversationRead: async () => {},
      noteIncomingPreview() { return null; }
    };

    window.__sentRows = [];
    window.__sendGate = [];
    window.LYANN_API_CLIENT.getSupportUserId = async () => null;
    window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: convId } });
    window.LYANN_API_CLIENT.getConversationRequestContext = async () => null;
    window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
    window.LYANN_API_CLIENT.getUserProfile = async () => ({
      id: contactId, first_name: 'Marie', last_name: 'Dupont'
    });
    window.LYANN_API_CLIENT.initiateLyannHelp = async () => ({ data: null });
    window.LYANN_API_CLIENT.sendMessage = (conversationId, senderId, content) => {
      const n = window.__sentRows.length + 1;
      const row = {
        id: 'srv-' + n,
        conversation_id: conversationId,
        sender_id: senderId,
        content: content,
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
        is_read: false
      };
      window.__sentRows.push(row);
      return new Promise((resolve) => {
        window.__sendGate.push(() => resolve({ data: row, error: null }));
      });
    };

    const supabase = window.LYANN_API_CLIENT.supabase;
    if (supabase && typeof supabase.from === 'function') {
      const from = supabase.from.bind(supabase);
      supabase.from = (table) => {
        if (table !== 'requests') return from(table);
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) })
          })
        };
      };
    }

    window.dispatchEvent(new Event('lyann:auth-ready'));
  }, { userId: USER_ID, contactId: CONTACT_ID, convId: CONV_ID });

  await expect.poll(() => page.evaluate(() => window.__lyannRealtimeHandlers.length)).toBeGreaterThan(0);

  await page.evaluate((contactId) => window.LYANN_MESSAGING.openConversation({
    contactId,
    name: 'Marie Dupont'
  }), CONTACT_ID);

  const input = page.locator('#chatInputField');
  await expect(input).toBeVisible();

  await page.evaluate(() => {
    const field = document.getElementById('chatInputField');
    const form = document.getElementById('chatInputForm');
    for (let i = 0; i < 5; i += 1) {
      field.value = 'Ok';
      form.requestSubmit();
    }
  });

  await expect.poll(() => page.evaluate(() => window.__sendGate.length)).toBe(5);
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#chatMessagesContainer [data-optimistic-status="sending"]').length)).toBe(5);

  const beforeRealtime = await page.evaluate(() => {
    return [...document.querySelectorAll('#chatMessagesContainer .chat-msg-bubble-wrap')].map((node) => node.dataset.optimisticMessageId);
  });

  await page.evaluate(() => {
    const handlers = window.__lyannRealtimeHandlers;
    [...window.__sentRows].reverse().forEach((row) => {
      handlers.forEach((handler) => handler({ new: row }));
    });
  });

  const parked = await page.evaluate(() => {
    return [...document.querySelectorAll('#chatMessagesContainer .chat-msg-bubble-wrap')].map((node) => ({
      clientId: node.dataset.optimisticMessageId || '',
      serverId: node.dataset.messageId || '',
      text: node.querySelector('.chat-msg-text') ? node.querySelector('.chat-msg-text').textContent : ''
    }));
  });
  expect(parked).toHaveLength(5);
  expect(parked.map((bubble) => bubble.clientId)).toEqual(beforeRealtime);
  expect(new Set(parked.map((bubble) => bubble.clientId)).size).toBe(5);
  expect(parked.every((bubble) => bubble.serverId === '' && bubble.text === 'Ok')).toBe(true);

  const releaseOrder = [2, 0, 4, 1, 3];
  for (let step = 0; step < releaseOrder.length; step += 1) {
    const index = releaseOrder[step];
    await page.evaluate((gateIndex) => window.__sendGate[gateIndex](), index);
    await expect.poll(() => page.evaluate((gateIndex) => {
      const expectedId = window.__sentRows[gateIndex].id;
      const nodes = [...document.querySelectorAll('#chatMessagesContainer .chat-msg-bubble-wrap')];
      const match = nodes[gateIndex];
      return nodes.length === 5 && match && match.dataset.messageId === expectedId;
    }, index)).toBe(true);
  }

  await page.evaluate(() => {
    const handlers = window.__lyannRealtimeHandlers;
    const rows = window.__sentRows;
    [...rows].reverse().forEach((row) => handlers.forEach((handler) => handler({ new: row })));
    rows.forEach((row) => handlers.forEach((handler) => handler({ new: row })));
  });

  const settled = await page.evaluate(() => {
    return [...document.querySelectorAll('#chatMessagesContainer .chat-msg-bubble-wrap')].map((node) => ({
      clientId: node.dataset.optimisticMessageId || '',
      serverId: node.dataset.messageId || '',
      text: node.querySelector('.chat-msg-text') ? node.querySelector('.chat-msg-text').textContent : ''
    }));
  });
  const sentIds = await page.evaluate(() => window.__sentRows.map((row) => row.id));

  expect(settled).toHaveLength(5);
  expect(settled.map((bubble) => bubble.text)).toEqual(['Ok', 'Ok', 'Ok', 'Ok', 'Ok']);
  expect(settled.map((bubble) => bubble.clientId)).toEqual(beforeRealtime);
  expect(settled.map((bubble) => bubble.serverId)).toEqual(sentIds);
  expect(new Set(settled.map((bubble) => bubble.serverId)).size).toBe(5);
  expect(jsErrors).toEqual([]);
});
