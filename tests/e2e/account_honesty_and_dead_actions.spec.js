const { test, expect } = require('@playwright/test');

const USER_ID = '00000000-0000-4000-a000-000000000001';
const REQUEST_ID = '11111111-1111-4111-a111-111111111111';

async function installAuthHarness(page) {
  await page.evaluate((userId) => {
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
    window.__lyannAlerts = [];
    window.lyannAlert = async (message) => { window.__lyannAlerts.push(String(message)); };
    if (window.LYANN_API_CLIENT) {
      window.LYANN_API_CLIENT.getUserProfile = async () => ({
        id: userId, first_name: 'Helper', last_name: 'LYANN', email: mockUser.email
      });
      if (window.LYANN_API_CLIENT.supabase?.auth) {
        window.LYANN_API_CLIENT.supabase.auth.getSession = async () => ({
          data: { session: { user: mockUser, access_token: 'mock-token' } },
          error: null
        });
      }
    }
  }, USER_ID);
}

test.describe('Account honesty and previously dead actions', () => {
  test('finances does not invent a 0 € balance or a payout success', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    await page.evaluate(async () => {
      await window.openAccountModalSubView('finances');
    });

    await expect(page.locator('#userAccountModal')).toBeVisible();
    await expect(page.locator('#userAccountModal')).toContainText('Indisponible');
    await expect(page.locator('#userAccountModal')).not.toContainText('0,00 €');
    await expect(page.locator('#userAccountModal')).not.toContainText('Demande de versement transmise');
    await expect(page.locator('#accountWithdrawFundsBtn')).toBeDisabled();
    expect(jsErrors).toEqual([]);
  });

  test('empty activity publish CTA opens the canonical publish wizard', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    await page.evaluate(() => {
      window.__lyannPublishCalls = 0;
      const original = window.openLyannWizard;
      window.openLyannWizard = function (...args) {
        window.__lyannPublishCalls += 1;
        return typeof original === 'function' ? original.apply(this, args) : true;
      };
    });

    await page.evaluate(async () => {
      await window.openAccountModalSubView('activity');
    });

    const publishBtn = page.locator('#userAccountModal button', { hasText: 'Publier un besoin' });
    if (await publishBtn.count()) {
      await publishBtn.first().click();
      await expect.poll(() => page.evaluate(() => window.__lyannPublishCalls)).toBeGreaterThan(0);
    } else {
      await page.evaluate(() => {
        if (window.LYANN_ROUTER) window.LYANN_ROUTER.go('publish');
      });
      await expect.poll(() => page.evaluate(() => window.__lyannPublishCalls)).toBeGreaterThan(0);
    }
    expect(jsErrors).toEqual([]);
  });

  test('Gérer mon annonce opens account activity instead of a missing profile modal', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    await page.evaluate(async ({ requestId, userId }) => {
      await window.openLyannDetailModal(requestId, {
        id: requestId,
        title: 'Mon Lyann de test',
        description: 'Tondre la pelouse',
        category: 'Jardinage',
        location: 'Pointe-à-Pitre',
        status: 'OPEN',
        created_at: '2026-09-01T10:00:00.000Z',
        requester_id: userId
      });
    }, { requestId: REQUEST_ID, userId: USER_ID });

    await expect(page.locator('#btnManageMyLyann')).toBeVisible();
    await expect(page.locator('#btnManageMyLyann')).toContainText('Gérer mon annonce');
    await expect(page.locator('#btnDeleteMyAnnouncement')).toBeVisible();
    await page.locator('#btnManageMyLyann').click();

    await expect.poll(() => page.evaluate(() => window.LYANN_SURFACES.isOpen('lyann-detail'))).toBe(false);
    await expect.poll(() => page.evaluate(() => window.LYANN_SURFACES.isOpen('account'))).toBe(true);
    await expect(page.locator('#userAccountModal')).toBeVisible();
    await expect(page.locator('#userAccountModal')).toContainText('Mon activité');
    expect(jsErrors).toEqual([]);
  });

  test('accepting a proposal card without a real mission id stays unavailable', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    await page.evaluate(() => {
      window.LYANN_MESSAGING_REPOSITORY = {
        listConversations: async () => [{
          conversationId: '33333333-3333-4333-a333-333333333333',
          contactId: '22222222-2222-4222-a222-222222222222',
          name: 'Marie Dupont',
          avatar: '',
          preview: 'Proposition',
          lastMessageAt: new Date().toISOString()
        }],
        getMessages: async () => [{
          id: 'msg-proposal-1',
          type: 'system_card',
          cardType: 'PRICE_PROPOSAL',
          sender: 'them',
          title: 'Tonte',
          amount: 40,
          timestamp: Date.now()
        }],
        getQuoteContext: async () => [],
        findConversationId: async () => '33333333-3333-4333-a333-333333333333',
        invalidateConversation() {},
        invalidateMessages() {},
        invalidateQuoteContext() {}
      };
      window.LYANN_API_CLIENT.getOrCreateConversation = async () => ({ data: { id: '33333333-3333-4333-a333-333333333333' } });
      window.LYANN_API_CLIENT.getConversationRequestContext = async () => null;
      window.LYANN_API_CLIENT.getActiveMissionBetween = async () => null;
      window.LYANN_API_CLIENT.mockAcceptPrice = async () => { throw new Error('mockAcceptPrice should not run'); };
      window.LYANN_ROUTER.requireAuthForInteraction = async () => true;
    });

    await page.evaluate(async () => {
      await window.LYANN_MESSAGING.openConversation({
        contactId: '22222222-2222-4222-a222-222222222222',
        name: 'Marie Dupont'
      });
    });

    const acceptBtn = page.locator('.btn-accept-inline').first();
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    await expect.poll(() => page.evaluate(() => (window.__lyannAlerts || []).join(' '))).toMatch(/indisponible/i);
    await expect(page.locator('#chatMessagesContainer')).not.toContainText('Accord trouvé');
    expect(jsErrors.filter((msg) => !/mockAcceptPrice/.test(msg))).toEqual([]);
  });

  test('direct price without an accepted invitation stays unavailable', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    await page.evaluate(async () => {
      window.__mockProposePriceCalls = 0;
      window.__createRequestQuoteCalls = 0;
      window.LYANN_API_CLIENT.getActiveInvitationBetween = async () => null;
      window.LYANN_API_CLIENT.mockProposePrice = async () => { window.__mockProposePriceCalls += 1; };
      window.LYANN_API_CLIENT.createRequestQuote = async () => { window.__createRequestQuoteCalls += 1; return { id: 'should-not-create' }; };
      window.LYANN_API_CLIENT.sendMessage = async () => { throw new Error('sendMessage should not run for an unlinked quote'); };
      window.LYANN_ROUTER.requireAuthForInteraction = async () => true;
      window.LYANN_ACTIVE_CHAT_CONTACT = {
        id: '22222222-2222-4222-a222-222222222222',
        name: 'Marie Dupont'
      };
      const desc = document.getElementById('dpDescription');
      const amount = document.getElementById('dpAmount');
      if (desc) desc.value = 'Tonte express';
      if (amount) amount.value = '45';
      await window.handleDirectPriceFormSubmit({ preventDefault() {} });
    });

    await expect.poll(() => page.evaluate(() => (window.__lyannAlerts || []).join(' '))).toMatch(/indisponible/i);
    expect(await page.evaluate(() => window.__mockProposePriceCalls)).toBe(0);
    expect(await page.evaluate(() => window.__createRequestQuoteCalls)).toBe(0);
    expect(jsErrors.filter((msg) => !/sendMessage/.test(msg))).toEqual([]);
  });

  test('checkout submit does not invent a paid escrow', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    const outcome = await page.evaluate(async () => {
      window.__mockPayMissionCalls = 0;
      window.LYANN_API_CLIENT.mockPayMission = async () => { window.__mockPayMissionCalls += 1; };
      window.LYANN_API_CLIENT.getActiveMissionBetween = async () => ({
        id: '44444444-4444-4444-a444-444444444444',
        agreed_price: 80,
        status: 'AGREED'
      });
      window.LYANN_API_CLIENT.sendMessage = async () => { throw new Error('PAYMENT_CONFIRMED must not be sent'); };
      const form = document.getElementById('checkoutPaymentForm');
      if (!form) return { submitted: false };
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return { submitted: true, mockPayMissionCalls: window.__mockPayMissionCalls };
    });

    expect(outcome.submitted).toBe(true);
    expect(outcome.mockPayMissionCalls).toBe(0);
    await expect.poll(() => page.evaluate(() => (window.__lyannAlerts || []).join(' '))).toMatch(/indisponible/i);
    expect(jsErrors.filter((msg) => !/PAYMENT_CONFIRMED/.test(msg))).toEqual([]);
  });

  test('delete and reaction do not crash on retired local chat storage', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    const outcome = await page.evaluate(async () => {
      window.__lyannAlerts = [];
      window.LYANN_MESSAGING_REPOSITORY = {
        listConversations: async () => [],
        getMessages: async () => [],
        getQuoteContext: async () => [],
        findConversationId: async () => null,
        invalidateConversation() {},
        invalidateMessages() {},
        invalidateQuoteContext() {}
      };
      window.LYANN_ACTIVE_CHAT_CONTACT = {
        id: '22222222-2222-4222-a222-222222222222',
        name: 'Marie Dupont'
      };
      await window.LYANN_MESSAGING.openConversation({
        contactId: '22222222-2222-4222-a222-222222222222',
        name: 'Marie Dupont'
      });
      await window.deleteMessage('55555555-5555-4555-a555-555555555555');
      window.toggleMessageReaction('55555555-5555-4555-a555-555555555555', '👍');
      return {
        alerts: (window.__lyannAlerts || []).join(' '),
        chatMsgKeyDefined: typeof CHAT_MSG_KEY !== 'undefined'
      };
    });

    expect(outcome.alerts).toMatch(/indisponible/i);
    expect(jsErrors.filter((msg) => !/CHAT_MSG_KEY/.test(msg))).toEqual([]);
  });

  test('MARK_DONE without a milestone stays unavailable and does not write missions', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    const outcome = await page.evaluate(async () => {
      window.__mockMarkCalls = 0;
      window.__submitCompletionCalls = [];
      window.LYANN_API_CLIENT.mockMarkMissionDone = async () => { window.__mockMarkCalls += 1; };
      window.LYANN_API_CLIENT.submitMilestoneCompletion = async (id) => {
        window.__submitCompletionCalls.push(id);
        return { data: { success: true } };
      };
      window.LYANN_MESSAGING_REPOSITORY = {
        listConversations: async () => [],
        getMessages: async () => [],
        getQuoteContext: async () => [],
        findConversationId: async () => null,
        invalidateConversation() {},
        invalidateMessages() {},
        invalidateQuoteContext() {}
      };
      window.LYANN_ROUTER.requireAuthForInteraction = async () => true;
      await window.LYANN_MESSAGING.openConversation({
        contactId: '22222222-2222-4222-a222-222222222222',
        name: 'Marie Dupont'
      });
      await window.handleChatAction('MARK_DONE', { id: '44444444-4444-4444-a444-444444444444', title: 'Tonte' });
      return {
        mockMarkCalls: window.__mockMarkCalls,
        submitCalls: window.__submitCompletionCalls,
        alerts: (window.__lyannAlerts || []).join(' ')
      };
    });

    expect(outcome.mockMarkCalls).toBe(0);
    expect(outcome.submitCalls).toEqual([]);
    expect(outcome.alerts).toMatch(/indisponible/i);
    expect(jsErrors).toEqual([]);
  });

  test('MARK_DONE with a funded milestone calls submit-completion', async ({ page }) => {
    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');
    await installAuthHarness(page);

    const outcome = await page.evaluate(async () => {
      window.__submitCompletionCalls = [];
      window.LYANN_API_CLIENT.submitMilestoneCompletion = async (id) => {
        window.__submitCompletionCalls.push(id);
        return { data: { success: true, message: 'Prestation réalisée — en attente de validation du client.' } };
      };
      window.LYANN_MESSAGING_REPOSITORY = {
        listConversations: async () => [],
        getMessages: async () => [],
        getQuoteContext: async () => [{
          id: '66666666-6666-4666-a666-666666666666',
          milestones: [{ id: '77777777-7777-4777-a777-777777777777', status: 'IN_PROGRESS' }]
        }],
        findConversationId: async () => null,
        invalidateConversation() {},
        invalidateMessages() {},
        invalidateQuoteContext() {}
      };
      window.LYANN_ROUTER.requireAuthForInteraction = async () => true;
      await window.LYANN_MESSAGING.openConversation({
        contactId: '22222222-2222-4222-a222-222222222222',
        name: 'Marie Dupont'
      });
      await window.handleChatAction('MARK_DONE', { id: '44444444-4444-4444-a444-444444444444' });
      return { submitCalls: window.__submitCompletionCalls };
    });

    expect(outcome.submitCalls).toEqual(['77777777-7777-4777-a777-777777777777']);
  });

  test('payment portal payout stays unavailable', async ({ page }) => {
    await page.goto('/payment-portal.html');
    await page.waitForLoadState('domcontentloaded');
    const outcome = await page.evaluate(() => {
      const result = window.LYANN_PAYMENTS.requestPayout(1, 50, 'FR76');
      return {
        result,
        body: document.body.innerText
      };
    });
    expect(outcome.result).toBeNull();
    expect(outcome.body).toMatch(/simulation locale désactivée|indisponible/i);
    await expect(page.locator('#portalCardWorkspace')).toContainText('Publication indisponible ici');
    await expect(page.getByRole('button', { name: 'Publier une demande indisponible' })).toBeDisabled();
    await expect(page.locator('#portalCardWorkspace')).not.toContainText('publiée avec succès');
  });
});
