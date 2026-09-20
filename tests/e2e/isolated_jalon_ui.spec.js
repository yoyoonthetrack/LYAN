const { test, expect } = require('@playwright/test');
const { requireWriteBackend, login, waitAuthenticated } = require('./helpers/approved-backend');

const ISOLATED_REF = 'pcmvagiuvleeciktligz';

async function dismissAlert(page) {
  const understood = page.locator('#lyannDialogOverlay').getByRole('button', { name: 'Compris', exact: true });
  if (await understood.isVisible({ timeout: 4000 }).catch(() => false)) {
    await understood.click();
  }
}

async function refreshQuoteChat(page) {
  await page.evaluate(async () => {
    const contact = window.LYANN_ACTIVE_CHAT_CONTACT;
    const session = await window.LYANN_API_CLIENT.getSession();
    const userId = session && session.data && session.data.session && session.data.session.user && session.data.session.user.id;
    if (window.LYANN_MESSAGING_REPOSITORY && userId && contact && contact.id) {
      window.LYANN_MESSAGING_REPOSITORY.invalidateQuoteContext(userId, contact.id);
    }
    if (typeof window.refreshChatUI === 'function') await window.refreshChatUI();
  });
}

async function deliverTestWebhook(request, paymentIntentId) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  expect(key.startsWith('sk_test_'), 'Stripe test secret required').toBe(true);
  expect(secret, 'Stripe webhook secret required').toBeTruthy();
  const stripe = require('stripe')(key);
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  expect(pi.livemode, 'Stripe live is forbidden').toBe(false);
  expect(pi.status).toBe('succeeded');
  const event = {
    id: `evt_ui_${Date.now()}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: pi }
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await request.post('/v1/payments/webhook', {
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    data: payload
  });
  expect(res.ok(), `webhook ${res.status()} ${(await res.text()).slice(0, 180)}`).toBe(true);
}

async function fillStripeCard(page) {
  const cardHost = page.locator('#lyannCardPaymentElement iframe').first();
  await expect(cardHost).toBeVisible({ timeout: 20000 });
  const cardFrame = page.frameLocator('#lyannCardPaymentElement iframe').first();
  await expect(cardFrame.locator('input[name="cardnumber"]')).toBeVisible({ timeout: 20000 });
  await cardFrame.locator('input[name="cardnumber"]').fill('4242424242424242');
  await cardFrame.locator('input[name="exp-date"]').fill('12 / 34');
  await cardFrame.locator('input[name="cvc"]').fill('123');
  await expect(page.locator('#lyannCardPaymentElement')).toHaveAttribute('data-complete', 'true', { timeout: 10000 });
}

async function openChatWith(page, contactId) {
  const contact = page.locator(`[data-member-id="${contactId}"] [data-action="contact"]`);
  if (await contact.count()) {
    await contact.click();
    return;
  }
  await page.evaluate(async (id) => {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openConversation === 'function') {
      await window.LYANN_MESSAGING.openConversation({ contactId: id });
      return;
    }
    if (window.LYANN_ROUTER) await window.LYANN_ROUTER.go('messages', { contactId: id });
  }, contactId);
}

test.describe('Isolated QA UI jalon journey', () => {
  test('help → devis → accept → carte test → FUNDED → terminé → validation', async ({ page, browser, request }) => {
    test.setTimeout(120000);
    test.skip(process.env.LYANN_E2E_WRITE_PROJECT_REF !== ISOLATED_REF, 'isolated write ref required');
    test.skip(!String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_'), 'ENVIRONMENT REQUIRED: Stripe test secret');

    await requireWriteBackend(page);
    const requesterId = await login(page, 'REQUESTER');
    const title = `UI jalon ${Date.now()}`;
    const requestRow = await page.evaluate(async ({ requesterId, title }) => {
      const { data, error } = await window.LYANN_API_CLIENT.supabase.from('requests').insert({
        requester_id: requesterId,
        author_id: requesterId,
        title,
        description: 'Taille de haie — parcours UI isolé devis / paiement / jalon',
        category: 'Jardinage',
        location: 'Guadeloupe (971)',
        budget: 50,
        urgency: 'Normale',
        status: 'OPEN',
        visibility: 'PUBLIC',
        classification_status: 'UNCLASSIFIED',
        safety_status: 'SAFE'
      }).select().single();
      if (error) throw new Error(error.message);
      return data;
    }, { requesterId, title });
    expect(requestRow.id).toBeTruthy();

    const helperContext = await browser.newContext({ baseURL: process.env.LYANN_E2E_BASE_URL || 'http://127.0.0.1:8080' });
    try {
      const helperPage = await helperContext.newPage();
      helperPage.setDefaultTimeout(20000);
      page.setDefaultTimeout(20000);
      await requireWriteBackend(helperPage);
      const helperId = await login(helperPage, 'HELPER');
      expect(helperId).not.toBe(requesterId);

      await helperPage.goto('/feed.html');
      await waitAuthenticated(helperPage);
      const help = await helperPage.evaluate(async ({ requestId, requesterId }) => {
        const res = await window.LYANN_API_CLIENT.initiateLyannHelp(requestId);
        if (res && res.error) throw new Error(res.error.message || String(res.error));
        await window.LYANN_MESSAGING.openConversation({
          contactId: requesterId,
          requestId,
          name: 'Demandeur QA',
          initialNeed: { requestId, requesterId }
        });
        return res && res.data;
      }, { requestId: requestRow.id, requesterId });
      expect(help && (help.success || help.conversation_id || help.invitation_id)).toBeTruthy();
      await expect(helperPage.locator('#chatModal')).toBeVisible();
      const propose = helperPage.locator('#btnCtxPropose');
      if (await propose.isVisible().catch(() => false)) {
        await propose.click();
      } else {
        await helperPage.evaluate(async () => {
          if (typeof handleChatAction === 'function') await handleChatAction('MAKE_PROPOSAL');
          else if (window.handleChatAction) await window.handleChatAction('MAKE_PROPOSAL');
        });
      }
      await expect(helperPage.locator('#chatActionChoicesOverlay')).toBeVisible();
      await helperPage.locator('#btnChooseDirectPrice').click();
      await expect(helperPage.locator('#chatDirectPriceForm')).toBeVisible();
      const description = `Devis UI isolé ${Date.now()}`;
      await helperPage.locator('#dpDescription').fill(description);
      await helperPage.locator('#dpAmount').fill('50');
      const quoteResponse = helperPage.waitForResponse((r) => r.url().includes('/rpc/create_request_quote'));
      await helperPage.locator('#directPriceForm button[type="submit"]').click();
      expect((await quoteResponse).ok(), 'create_request_quote must succeed').toBe(true);

      const quote = await helperPage.evaluate(async (description) => {
        const { data, error } = await window.LYANN_API_CLIENT.supabase.from('quotes').select('*').eq('description', description).single();
        if (error) throw new Error(error.message);
        return data;
      }, description);
      expect(quote.request_id).toBe(requestRow.id);

      await page.goto('/feed.html');
      await waitAuthenticated(page);
      await page.evaluate(async (helperId) => {
        await window.LYANN_MESSAGING.openConversation({ contactId: helperId });
      }, helperId);
      await expect(page.locator('#chatModal')).toBeVisible();
      await expect(page.locator('#chatMessagesContainer')).toContainText(description);
      const accept = page.waitForResponse((r) => r.url().includes('/rpc/accept_request_quote'));
      await page.locator('#chatMessagesContainer').getByRole('button', { name: /Accepter le devis/ }).click();
      await expect(page.locator('#lyannDialogOverlay')).toBeVisible({ timeout: 10000 });
      await page.locator('#lyannDialogOverlay').getByRole('button', { name: 'Confirmer', exact: true }).click();
      expect((await accept).ok()).toBe(true);
      await dismissAlert(page);

      await expect(page.getByRole('button', { name: /Payer & Bloquer/ })).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: /Payer & Bloquer/ }).click();
      await expect(page.locator('#chatCheckoutOverlay')).toBeVisible();
      await fillStripeCard(page);
      const confirm = await page.evaluate(async () => window.LYANN_STRIPE.confirmCheckout());
      expect(confirm && confirm.error && confirm.error.message ? confirm.error.message : confirm.error).toBeFalsy();
      expect(confirm.data.status).toBe('succeeded');
      const paymentIntentId = confirm.data.payment_intent_id;
      expect(paymentIntentId).toBeTruthy();
      await dismissAlert(page);
      await expect(page.locator('#chatCheckoutOverlay')).toBeHidden({ timeout: 10000 });

      await deliverTestWebhook(request, paymentIntentId);
      const funded = await page.evaluate(async (quoteId) => {
        const { data, error } = await window.LYANN_API_CLIENT.supabase.from('milestones').select('id,status').eq('quote_id', quoteId);
        if (error) throw new Error(error.message);
        return data;
      }, quote.id);
      expect(funded.some((m) => m.status === 'FUNDED')).toBe(true);

      await refreshQuoteChat(helperPage);
      await expect(helperPage.locator('#chatMessagesContainer').getByRole('button', { name: "✓ J'ai terminé" })).toBeVisible({ timeout: 15000 });
      const complete = helperPage.waitForResponse((r) => r.url().includes('/v1/milestones/submit-completion'));
      await helperPage.locator('#chatMessagesContainer').getByRole('button', { name: "✓ J'ai terminé" }).click();
      expect((await complete).ok()).toBe(true);
      await dismissAlert(helperPage);

      await refreshQuoteChat(page);
      await expect(page.locator('#chatMessagesContainer').getByRole('button', { name: '✓ Tout est bon' })).toBeVisible({ timeout: 15000 });
      const release = page.waitForResponse((r) => r.url().includes('/v1/milestones/release-payment'));
      await page.locator('#chatMessagesContainer').getByRole('button', { name: '✓ Tout est bon' }).click();
      const releaseRes = await release;
      expect(releaseRes.ok()).toBe(true);
      const releaseBody = await releaseRes.json();
      expect(['VERSEMENT_LYANNEUR_EN_ATTENTE', 'RELEASED', 'TRANSFERRED']).toContain(releaseBody.status);
    } finally {
      await helperContext.close();
    }
  });
});
