const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const CONTACT_ID = '22222222-2222-4222-a222-222222222222';
const CONV_ID = '33333333-3333-4333-a333-333333333333';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function installRealtimeHook(page) {
  return page.addInitScript(() => {
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
    let sdk;
    Object.defineProperty(window, 'supabase', {
      configurable: true,
      enumerable: true,
      get() { return sdk; },
      set(value) {
        if (!value || typeof value !== 'object') { sdk = value; return; }
        sdk = new Proxy(value, {
          get(target, prop, receiver) {
            const current = Reflect.get(target, prop, receiver);
            if (prop !== 'createClient' || typeof current !== 'function' || target.__lyannCreateWrapped) return current;
            const wrapped = function (...args) { return wrapClient(current.apply(target, args)); };
            target.createClient = wrapped;
            target.__lyannCreateWrapped = true;
            return wrapped;
          }
        });
      }
    });
  });
}

async function bootChat(page, extra) {
  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(err.stack || err.message));
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(({ userId, contactId, convId }) => {
    const mockUser = { id: userId, email: 'helper@lyann.app' };
    document.body.classList.remove('user-is-logged-out', 'auth-resolving');
    document.body.classList.add('user-is-logged-in', 'auth-ready');
    window.CURRENT_USER_ID = userId;
    window.LYANN_AUTH_STATE.isAuthenticated = () => true;
    window.LYANN_AUTH_STATE.getSnapshot = () => ({ status: 'ready', authenticated: true, userId, user: mockUser });
    window.__realGetMessages = window.LYANN_MESSAGING_REPOSITORY.getMessages;
    window.LYANN_MESSAGING_REPOSITORY = Object.assign({}, window.LYANN_MESSAGING_REPOSITORY, {
      listConversations: async () => [],
      findConversationId: async () => convId,
      getMessages: async () => [],
      peekMessages: () => null,
      peekConversations: () => window.LYANN_MESSAGING_REPOSITORY.list || [],
      getQuoteContext: async () => [],
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
    window.LYANN_API_CLIENT.sendMessage = async () => ({ data: { id: 'srv-default', created_at: new Date().toISOString() }, error: null });
    window.LYANN_API_CLIENT.uploadChatAttachment = async () => ({ data: { path: convId + '/' + userId + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png' } });
    window.LYANN_API_CLIENT.removeChatAttachment = async () => ({ error: null });
    window.LYANN_API_CLIENT.signedChatAttachmentUrl = async (filePath) => 'https://signed.example/' + filePath;
    window.LYANN_API_CLIENT.clearSignedChatAttachmentUrl = () => {};
    const supabase = window.LYANN_API_CLIENT.supabase;
    if (supabase && typeof supabase.from === 'function') {
      const from = supabase.from.bind(supabase);
      supabase.from = (table) => table === 'requests'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
        : from(table);
    }
    window.dispatchEvent(new Event('lyann:auth-ready'));
  }, { userId: USER_ID, contactId: CONTACT_ID, convId: CONV_ID });
  if (extra) await extra(page);
  await page.evaluate((contactId) => window.LYANN_MESSAGING.openConversation({ contactId, name: 'Marie Dupont' }), CONTACT_ID);
  await expect(page.locator('#chatInputField')).toBeVisible();
  return jsErrors;
}

test('storage policy source keeps the bucket private to participants', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../44_chat_attachments.sql'), 'utf8');
  expect(sql).toContain("'chat-attachments'");
  expect(sql).toContain('public = false');
  expect(sql).toContain('chat_attachment_path_ok');
  expect(sql).toContain('is_current_user_conversation_participant');
  expect(sql).toContain('TO authenticated');
  expect(sql).toContain('never a signed URL');
  expect(sql).not.toMatch(/to\s+anon/i);
  expect(sql).not.toMatch(/service_role/);
});

test('history pages upward without moving the visible message', async ({ page }) => {
  const jsErrors = await bootChat(page, async (openPage) => {
    await openPage.evaluate(() => {
      const start = Date.parse('2026-01-01T00:00:00.000Z');
      window.__history = Array.from({ length: 150 }, (_, index) => ({
        id: 'msg-' + String(index).padStart(4, '0'),
        text: 'message ' + index,
        sender: 'them',
        timestamp: start + index * 1000,
        createdAt: new Date(start + index * 1000).toISOString(),
        type: 'text',
        status: 'sent'
      }));
      window.LYANN_MESSAGING_REPOSITORY.getMessages = async (_userId, _contactId, options = {}) => {
        const limit = options.limit || 50;
        let rows = window.__history.slice();
        const cursor = options.before;
        if (cursor) {
          rows = rows.filter((row) => {
            const ta = Date.parse(row.createdAt);
            const tb = Date.parse(cursor.createdAt);
            if (ta !== tb) return ta < tb;
            return row.id < cursor.id;
          });
        }
        return rows.slice(-limit);
      };
    });
  });

  await page.evaluate(() => {
    const box = document.getElementById('chatMessagesContainer');
    box.style.setProperty('height', '180px', 'important');
    box.style.setProperty('max-height', '180px', 'important');
    box.style.setProperty('overflow', 'auto', 'important');
    box.style.setProperty('display', 'block', 'important');
  });

  await expect.poll(() => page.locator('#chatMessagesContainer .chat-msg-bubble-wrap').count()).toBe(50);
  const metrics = await page.evaluate(() => {
    const box = document.getElementById('chatMessagesContainer');
    box.scrollTop = 0;
    const anchor = box.querySelector('[data-message-id="msg-0100"]');
    const top = anchor.getBoundingClientRect().top;
    box.dispatchEvent(new Event('scroll'));
    return { top, clientHeight: box.clientHeight };
  });
  expect(metrics.clientHeight).toBeGreaterThan(100);
  await expect.poll(() => page.locator('#chatMessagesContainer .chat-msg-bubble-wrap').count()).toBe(100);
  const afterFirst = await page.evaluate(() => {
    const box = document.getElementById('chatMessagesContainer');
    const anchor = box.querySelector('[data-message-id="msg-0100"]');
    return { top: anchor.getBoundingClientRect().top, scrollTop: box.scrollTop, ids: [...box.querySelectorAll('[data-message-id]')].map((node) => node.dataset.messageId) };
  });
  expect(Math.abs(afterFirst.top - metrics.top)).toBeLessThan(3);
  expect(afterFirst.scrollTop).toBeGreaterThan(0);
  expect(new Set(afterFirst.ids).size).toBe(afterFirst.ids.length);

  await page.evaluate(() => {
    const box = document.getElementById('chatMessagesContainer');
    box.scrollTop = 0;
    box.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => page.locator('#chatMessagesContainer .chat-msg-bubble-wrap').count()).toBe(150);
  const ids = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer [data-message-id]')].map((node) => node.dataset.messageId));
  expect(ids[0]).toBe('msg-0000');
  expect(ids[149]).toBe('msg-0149');
  expect(new Set(ids).size).toBe(150);
  expect(jsErrors).toEqual([]);
});

test('messages with the same created_at stay ordered by id', async ({ page }) => {
  await bootChat(page);
  const ordered = await page.evaluate(async ({ userId, contactId, convId }) => {
    const same = '2026-03-01T10:00:00.000Z';
    const rows = [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', created_at: same, content: 'second', sender_id: contactId, conversation_id: convId, is_read: false },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: same, content: 'first', sender_id: contactId, conversation_id: convId, is_read: false }
    ];
    window.LYANN_API_CLIENT.supabase.from = (table) => {
      const orders = [];
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push(['eq', column, value]); return builder; },
        in() { return builder; },
        order(column, options) { orders.push([column, !!(options && options.ascending)]); return builder; },
        limit() { return builder; },
        or(clause) { filters.push(['or', clause]); return builder; },
        lt() { return builder; },
        gt() { return builder; },
        maybeSingle: async () => ({ data: null, error: null }),
        then(resolve, reject) {
          if (table === 'conversation_participants') {
            const user = filters.find((item) => item[0] === 'eq' && item[1] === 'user_id');
            const data = user ? [{ conversation_id: convId, user_id: user[2] }] : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
          const sorted = rows.slice().sort((a, b) => {
            for (const [column, ascending] of orders) {
              if (a[column] === b[column]) continue;
              const diff = a[column] < b[column] ? -1 : 1;
              return ascending ? diff : -diff;
            }
            return 0;
          });
          return Promise.resolve({ data: sorted, error: null }).then(resolve, reject);
        }
      };
      return builder;
    };
    const pageRows = await window.__realGetMessages(userId, contactId, { fresh: true, limit: 50 });
    return pageRows.map((row) => row.id);
  }, { userId: USER_ID, contactId: CONTACT_ID, convId: CONV_ID });
  expect(ordered).toEqual([
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ]);
});

test('five photos and a repeated photo stay distinct', async ({ page }) => {
  await installRealtimeHook(page);
  await bootChat(page, async (openPage) => {
    await openPage.evaluate(() => {
      window.__sendGate = [];
      window.__sentRows = [];
      window.LYANN_API_CLIENT.uploadChatAttachment = async (_path, _file, mime) => {
        const id = crypto.randomUUID();
        return { data: { path: '33333333-3333-4333-a333-333333333333/00000000-0000-4000-a000-000000000001/' + id + (mime === 'image/png' ? '.png' : '.bin') } };
      };
      window.LYANN_API_CLIENT.sendMessage = (_conversationId, senderId, content, extra) => {
        const row = {
          id: 'srv-' + (window.__sentRows.length + 1),
          conversation_id: '33333333-3333-4333-a333-333333333333',
          sender_id: senderId,
          content: content || '',
          created_at: new Date(Date.UTC(2026, 0, 2, 0, 0, window.__sentRows.length + 1)).toISOString(),
          is_read: false,
          attachment_url: extra && extra.path,
          attachment_type: extra && extra.type,
          attachment_name: extra && extra.name,
          client_message_id: extra && extra.clientMessageId
        };
        window.__sentRows.push(row);
        return new Promise((resolve) => window.__sendGate.push(() => resolve({ data: row, error: null })));
      };
    });
  });
  await expect.poll(() => page.evaluate(() => (window.__lyannRealtimeHandlers || []).length)).toBeGreaterThan(0);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#chatAttachBtn').click();
  await page.locator('[onclick*="handleGuardedAttachment(\'photo\')"]').click();
  await (await chooserPromise).setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  for (let index = 1; index < 5; index += 1) {
    const nextChooser = page.waitForEvent('filechooser');
    await page.locator('#chatAttachBtn').click();
    await page.locator('[onclick*="handleGuardedAttachment(\'photo\')"]').click();
    await (await nextChooser).setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  }
  await expect.poll(() => page.evaluate(() => window.__sendGate.length)).toBe(5);
  await page.evaluate(() => {
    [...window.__sentRows].reverse().forEach((row) => window.__lyannRealtimeHandlers.forEach((handler) => handler({ new: row })));
  });
  await expect.poll(() => page.locator('#chatMessagesContainer .chat-msg-bubble-wrap').count()).toBe(5);
  const parked = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer .chat-msg-bubble-wrap')].map((node) => node.dataset.messageId || ''));
  expect(parked.every((id) => id === '')).toBe(true);
  await page.evaluate(() => { [2, 0, 4, 1, 3].forEach((index) => window.__sendGate[index]()); });
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#chatMessagesContainer [data-message-id]').length)).toBe(5);
  await page.evaluate(() => window.__sentRows.forEach((row) => window.__lyannRealtimeHandlers.forEach((handler) => handler({ new: row }))));
  const ids = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer .chat-msg-bubble-wrap')].map((node) => node.dataset.messageId));
  expect(ids).toEqual(['srv-1', 'srv-2', 'srv-3', 'srv-4', 'srv-5']);
});

test('a failed upload stays visible and retry sends it once', async ({ page }) => {
  await bootChat(page, async (openPage) => {
    await openPage.evaluate(() => {
      window.__uploads = 0;
      window.LYANN_API_CLIENT.uploadChatAttachment = async () => {
        window.__uploads += 1;
        if (window.__uploads === 1) return { error: { message: 'storage down' } };
        return { data: { path: '33333333-3333-4333-a333-333333333333/00000000-0000-4000-a000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png' } };
      };
      window.LYANN_API_CLIENT.sendMessage = async (_c, senderId, content, extra) => ({
        data: { id: 'srv-retry', sender_id: senderId, content, created_at: '2026-04-01T00:00:00.000Z', attachment_url: extra.path, attachment_type: extra.type, attachment_name: extra.name },
        error: null
      });
    });
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#chatAttachBtn').click();
  await page.locator('[onclick*="handleGuardedAttachment(\'photo\')"]').click();
  await (await chooserPromise).setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#chatMessagesContainer')).toContainText("Échec de l'envoi");
  await expect(page.locator('#chatMessagesContainer .chat-msg-bubble-wrap')).toHaveCount(1);
  await page.locator('[data-chat-retry]').click();
  await expect.poll(() => page.locator('#chatMessagesContainer [data-message-id="srv-retry"]').count()).toBe(1);
  await expect(page.locator('#chatMessagesContainer .chat-msg-bubble-wrap')).toHaveCount(1);
});

test('a pdf keeps its name, escapes html, and opens through a signed url', async ({ page }) => {
  await bootChat(page);
  await page.evaluate(() => { window.open = (url) => { window.__opened = url; return null; }; });
  const hostile = '<img src=x onerror=alert(1)>.pdf';
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#chatAttachBtn').click();
  await page.locator('[onclick*="handleGuardedAttachment(\'file\')"]').click();
  await (await chooserPromise).setFiles({ name: hostile, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  const name = page.locator('.chat-msg-doc-name');
  await expect(name).toHaveText(hostile);
  expect(await name.locator('img, script').count()).toBe(0);
  await expect(page.locator('#chatMessagesContainer [data-attachment-path]')).toHaveCount(1);
  await page.locator('.chat-msg-doc-open').click();
  await expect.poll(() => page.evaluate(() => window.__opened || '')).toContain('https://signed.example/');
  await expect(page.locator('#chatMessagesContainer .chat-msg-bubble-wrap')).toHaveCount(1);
});

test('offline text stays unsent and coming back online does not duplicate it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get() { return window.__lyannOnline !== false; } });
  });
  await bootChat(page);
  await page.evaluate(() => { window.__lyannOnline = false; window.__sends = 0; window.LYANN_API_CLIENT.sendMessage = async () => { window.__sends += 1; return { data: { id: 'srv-online', created_at: new Date().toISOString() }, error: null }; }; });
  await page.locator('#chatInputField').fill('Ok');
  await page.locator('#chatInputForm').evaluate((form) => form.requestSubmit());
  await expect(page.locator('#chatMessagesContainer')).toContainText('Hors connexion');
  expect(await page.evaluate(() => window.__sends)).toBe(0);
  await page.evaluate(() => { window.__lyannOnline = true; window.dispatchEvent(new Event('online')); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sends)).toBe(0);
  await expect(page.locator('#chatMessagesContainer .chat-msg-bubble-wrap')).toHaveCount(1);
  await page.locator('[data-chat-retry]').click();
  await expect.poll(() => page.locator('#chatMessagesContainer [data-message-id="srv-online"]').count()).toBe(1);
  await expect(page.locator('#chatMessagesContainer .chat-msg-bubble-wrap')).toHaveCount(1);
});

test('foreground catchup pages past the latest fifty', async ({ page }) => {
  await bootChat(page, async (openPage) => {
    await openPage.evaluate(() => {
      const start = Date.parse('2026-05-01T00:00:00.000Z');
      window.__history = Array.from({ length: 70 }, (_, index) => ({
        id: 'gap-' + String(index).padStart(4, '0'),
        text: 'gap ' + index,
        sender: 'them',
        timestamp: start + index * 1000,
        createdAt: new Date(start + index * 1000).toISOString(),
        type: 'text',
        status: 'sent'
      }));
      window.LYANN_MESSAGING_REPOSITORY.getMessages = async (_userId, _contactId, options = {}) => {
        const limit = options.limit || 50;
        if (!options.after) return window.__history.slice(0, 10);
        const cursor = options.after;
        return window.__history.filter((row) => Date.parse(row.createdAt) > Date.parse(cursor.createdAt) || (row.createdAt === cursor.createdAt && row.id > cursor.id)).slice(0, limit);
      };
    });
  });
  await expect.poll(() => page.locator('#chatMessagesContainer .chat-msg-bubble-wrap').count()).toBe(10);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.locator('#chatMessagesContainer .chat-msg-bubble-wrap').count()).toBe(70);
  const ids = await page.evaluate(() => [...document.querySelectorAll('#chatMessagesContainer [data-message-id]')].map((node) => node.dataset.messageId));
  expect(new Set(ids).size).toBe(70);
});

test('a new realtime conversation appears in the inbox without a full reload', async ({ page }) => {
  await installRealtimeHook(page);
  await bootChat(page);
  await expect.poll(() => page.evaluate(() => (window.__lyannRealtimeHandlers || []).length)).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__listCalls = 0;
    const list = document.getElementById('chatContactsList');
    list.innerHTML = '';
    window.LYANN_MESSAGING_REPOSITORY.listConversations = async () => { window.__listCalls += 1; return []; };
    window.LYANN_MESSAGING_REPOSITORY.noteIncomingPreview = () => null;
    window.LYANN_MESSAGING_REPOSITORY.peekConversations = () => [];
    window.LYANN_MESSAGING_REPOSITORY.ensureInboxConversation = async () => ({
      contactId: '44444444-4444-4444-8444-444444444444',
      conversationId: '55555555-5555-4555-8555-555555555555',
      name: 'Paul Martin',
      avatar: '',
      preview: '📷 Photo',
      lastMessageAt: '2026-06-01T12:30:00.000Z',
      unread: true
    });
    window.__lyannRealtimeHandlers.forEach((handler) => handler({
      new: {
        id: '99999999-9999-4999-8999-999999999999',
        conversation_id: '55555555-5555-4555-8555-555555555555',
        sender_id: '44444444-4444-4444-8444-444444444444',
        content: '',
        created_at: '2026-06-01T12:30:00.000Z',
        is_read: false,
        attachment_type: 'photo',
        attachment_name: ''
      }
    }));
  });
  await expect(page.locator('#chatContactsList .chat-contact-name')).toHaveText('Paul Martin');
  await expect(page.locator('#chatContactsList .chat-contact-preview')).toHaveText('📷 Photo');
  await expect(page.locator('#chatContactsList .chat-contact-time')).not.toHaveText('');
  expect(await page.evaluate(() => window.__listCalls)).toBe(0);
});

test('inbox preview hides raw json and labels photos', async ({ page }) => {
  await page.goto('/feed.html');
  await page.waitForLoadState('domcontentloaded');
  const previews = await page.evaluate(() => {
    const format = window.LYANN_MESSAGING_REPOSITORY.formatMessagePreview;
    return {
      photo: format({ attachment_type: 'photo', content: '' }),
      file: format({ attachment_type: 'document', attachment_name: 'devis-plomberie.pdf' }),
      quote: format({ content: '{"type":"quote","amount":40}' }),
      date: format({ content: '📅 Proposition de rendez-vous : mardi' }),
      payment: format({ content: '{"cardType":"PAYMENT_CONFIRMED"}' })
    };
  });
  expect(previews.photo).toBe('📷 Photo');
  expect(previews.file).toBe('📄 devis-plomberie.pdf');
  expect(previews.quote).toBe('📄 Devis proposé');
  expect(previews.date).toBe('📅 Rendez-vous proposé');
  expect(previews.payment).toBe('Paiement effectué');
  expect(previews.quote).not.toContain('{');
  expect(previews.payment).not.toContain('cardType');
});

test('an open thread does not poll messages for 30 seconds', async ({ page }) => {
  await page.clock.install();
  await bootChat(page, async (openPage) => {
    await openPage.evaluate(() => {
      window.__messageReads = 0;
      const original = window.LYANN_MESSAGING_REPOSITORY.getMessages;
      window.LYANN_MESSAGING_REPOSITORY.getMessages = async (...args) => {
        window.__messageReads += 1;
        return original(...args);
      };
    });
  });
  const before = await page.evaluate(() => window.__messageReads);
  await page.clock.fastForward(30000);
  const after = await page.evaluate(() => window.__messageReads);
  expect(after).toBe(before);
});
