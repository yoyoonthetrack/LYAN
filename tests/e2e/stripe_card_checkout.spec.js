const { test, expect } = require('@playwright/test');

const MILESTONE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function createTestPaymentIntent() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  test.skip(!key.startsWith('sk_test_'), 'ENVIRONMENT REQUIRED: STRIPE_SECRET_KEY sk_test_ in .env.local');
  const stripe = require('stripe')(key);
  const intent = await stripe.paymentIntents.create({
    amount: 2100,
    currency: 'eur',
    payment_method_types: ['card']
  });
  expect(intent.livemode, 'Stripe test mode only').toBe(false);
  expect(intent.client_secret).toBeTruthy();
  return intent;
}

test.describe('Stripe.js card checkout', () => {
  test('local API refuses payment writes against production Supabase', async ({ request }) => {
    const res = await request.post('/v1/payments/create-milestone-intent', {
      headers: { Authorization: 'Bearer fake-token', 'Content-Type': 'application/json' },
      data: { milestone_id: MILESTONE_ID }
    });
    // Unauthenticated is 401; a syntactically present Bearer still hits auth before the prod-write guard.
    expect([401, 403]).toContain(res.status());
    const body = await res.json();
    if (res.status() === 403) {
      expect(body.code).toBe('PAYMENT_WRITES_BLOCKED_ON_PRODUCTION');
    }
  });

  test('checkout confirms a Stripe test card without writing to Supabase', async ({ page }) => {
    test.setTimeout(90000);
    const intent = await createTestPaymentIntent();
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.route('**/v1/payments/create-milestone-intent', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          payment_intent_id: intent.id,
          client_secret: intent.client_secret,
          amounts: { customer_total_cents: 2100 }
        })
      });
    });

    await page.goto('/feed.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.LYANN_FEATURES === 'object');

    const prepared = await page.evaluate(async (milestoneId) => {
      document.body.classList.remove('user-is-logged-out', 'auth-resolving');
      document.body.classList.add('user-is-logged-in', 'auth-ready');
      window.LYANN_API_CLIENT.getSession = async () => ({
        data: { session: { access_token: 'qa-stripe-test-token', user: { id: milestoneId } } },
        error: null
      });
      const overlay = document.getElementById('chatCheckoutOverlay');
      overlay.dataset.milestoneId = milestoneId;
      let node = overlay;
      while (node && node !== document.body) {
        node.style.setProperty('display', 'block', 'important');
        node.style.setProperty('visibility', 'visible', 'important');
        node.style.setProperty('opacity', '1', 'important');
        node = node.parentElement;
      }
      await window.LYANN_FEATURES.ensure('stripeCheckout');
      return window.LYANN_STRIPE.prepareCheckout(milestoneId);
    }, MILESTONE_ID);
    expect(prepared.error).toBeFalsy();

    const cardHost = page.locator('#lyannCardPaymentElement iframe').first();
    await expect(cardHost).toBeVisible({ timeout: 20000 });
    const cardFrame = page.frameLocator('#lyannCardPaymentElement iframe').first();
    const numberInput = cardFrame.locator('input[name="cardnumber"]');
    await expect(numberInput).toBeVisible({ timeout: 20000 });
    await numberInput.fill('4242424242424242');
    await cardFrame.locator('input[name="exp-date"]').fill('12 / 34');
    await cardFrame.locator('input[name="cvc"]').fill('123');
    await expect(page.locator('#lyannCardPaymentElement')).toHaveAttribute('data-complete', 'true', { timeout: 10000 });

    const confirm = await page.evaluate(async () => window.LYANN_STRIPE.confirmCheckout());
    expect(confirm && confirm.error && confirm.error.message ? confirm.error.message : confirm.error).toBeFalsy();
    expect(confirm.data.status).toBe('succeeded');
    expect(jsErrors).toEqual([]);
  });
});
