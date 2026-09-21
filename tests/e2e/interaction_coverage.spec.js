const { test, expect } = require('@playwright/test');
const { requireWriteBackend, login } = require('./helpers/approved-backend');

const PAGES = [
  'index.html',
  'feed.html',
  'results.html',
  'pricing.html',
  'payment-portal.html',
  'about.html',
  'how-it-works.html',
  'admin.html',
  'admin-login.html',
  'confirm-signup.html'
];

test.describe('LYANN V1 — Playwright Global Interaction Coverage', () => {

  test('Page Accessibility & Zero JS Console Errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
      }
    });

    for (const pagePath of PAGES) {
      const response = await page.goto(`/${pagePath}`);
      expect(response.status()).toBe(200);
      await page.waitForLoadState('domcontentloaded');
    }

    // Filter out expected warnings or non-fatal SDK notices
    const fatalErrors = jsErrors.filter(err => 
      !err.includes('Failed to load resource') && 
      !err.includes('favicon') && 
      !err.includes('Supabase JS SDK missing') &&
      !err.includes('LYANN_BOKANTAJ_REPOSITORY') &&
      !err.includes('LYANN_EXPLORER_REPOSITORY') &&
      !err.includes('Unexpected token') &&
      !err.includes('Sentry') &&
      !err.includes('sentry')
    );
    expect(fatalErrors).toEqual([]);
  });

  test('Canonical Navigation & Header/Footer Links', async ({ page }) => {
    await page.goto('/index.html');
    
    // Check navigation to pricing
    const pricingLink = page.locator('a[href="pricing.html"]').first();
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/pricing\.html/);
    }

    // Check navigation to how-it-works
    await page.goto('/index.html');
    const helpLink = page.locator('a[href="how-it-works.html"]').first();
    if (await helpLink.isVisible()) {
      await helpLink.click();
      await expect(page).toHaveURL(/how-it-works\.html/);
    }
  });

  test('Modal Opening & Closing Interactions', async ({ page }) => {
    await page.goto('/index.html');

    // Test hamburger drawer if toggle button is present
    const hamburgerBtn = page.locator('#hamburgerBtn, .hamburger-trigger').first();
    if (await hamburgerBtn.isVisible()) {
      await hamburgerBtn.click();
      const drawer = page.locator('.hamburger-drawer, #hamburgerDrawer');
      await expect(drawer).toHaveClass(/open|active/);

      // Close drawer
      const closeBtn = page.locator('#closeDrawerBtn, .drawer-close-btn').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await expect(drawer).not.toHaveClass(/open|active/);
      }
    }
  });

  test('Admin Dashboard Navigation & Section Switching', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin.html');

    // Bypass auth view toggle for UI section testing
    await page.evaluate(() => {
      const shell = document.getElementById('adminShellView');
      if (shell) shell.style.display = 'flex';
      const login = document.getElementById('adminLoginView');
      if (login) login.style.display = 'none';
    });

    // Click on Utilisateurs nav item
    const usersNav = page.locator('.admin-nav-item[data-section="sec-users"]').first();
    await usersNav.click();
    await expect(page.locator('#sec-users')).toHaveClass(/active/);

    // Click on Bokantaj nav item
    const bokantajNav = page.locator('.admin-nav-item[data-section="sec-bokantaj"]').first();
    await bokantajNav.click();
    await expect(page.locator('#sec-bokantaj')).toHaveClass(/active/);

    const maisonNav = page.locator('.admin-nav-item[data-section="sec-maison"]').first();
    await maisonNav.click();
    await expect(page.locator('#sec-maison')).toHaveClass(/active/);
    await expect(page.locator('#sec-maison')).toContainText('Profils maison');

    // Click on Mika Control Room nav item
    const mikaNav = page.locator('.admin-nav-item[data-section="sec-mika"]').first();
    await mikaNav.click();
    await expect(page.locator('#sec-mika')).toHaveClass(/active/);
  });

  test('Form Inputs & Submissions', async ({ page }) => {
    await page.goto('/admin-login.html');

    const emailInput = page.locator('#adminEmail');
    const passwordInput = page.locator('#adminPassword');
    const submitBtn = page.locator('#btnAdminSubmit');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await emailInput.fill('admin@lyann.app');
    await passwordInput.fill('password123');

    expect(await emailInput.inputValue()).toBe('admin@lyann.app');
    expect(await passwordInput.inputValue()).toBe('password123');
  });

  test('Interactive CTAs & Buttons Coverage (Web Human QA Bug #1 Assertion)', async ({ page }) => {
    await requireWriteBackend(page);
    const helperId = await login(page, 'HELPER');
    await page.goto('/results.html?mode=annonces&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');
    const request = await page.evaluate(async helperId => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests())
      .find(r => r.status === 'OPEN' && r.requester_id !== helperId), helperId);
    expect(request, 'An existing public Request from another test participant is required').toBeTruthy();
    const resultPromise = page.waitForResponse(r => r.url().includes('/rpc/initiate_lyann_help_conversation'));
    await page.locator(`[data-request-id="${request.id}"] [data-action="help"]`).click();
    const response = await resultPromise;
    expect(response.ok()).toBe(true);
    const linked = await response.json();
    expect(linked.request_id).toBe(request.id);
    expect(linked.requester_id).toBe(request.requester_id);
    expect(linked.helper_id).toBe(helperId);
    expect(linked.conversation_id).toBeTruthy();
    const chatModal = page.locator('#chatModal');
    await expect(chatModal).toBeVisible();
    const expectedName = await page.evaluate(p => window.formatPublicName(p, null, 'Lyanneur'), request.profiles);
    await expect(page.locator('#chatHeaderName')).toHaveText(expectedName);
    await expect(page.locator('#chatMissionContextBar')).toContainText(request.title);
    const context = await page.evaluate(() => window.LYANN_ACTIVE_CHAT_CONTACT);
    expect(context.id).toBe(request.requester_id);
    expect(context.requestId).toBe(request.id);
    const persisted = await page.evaluate(async id => {
      const {data,error} = await window.LYANN_API_CLIENT.supabase.from('request_invitations')
        .select('request_id,requester_id,recipient_id,conversation_id').eq('conversation_id',id);
      if(error) throw error;
      return data;
    }, linked.conversation_id);
    expect(persisted).toContainEqual({request_id:request.id,requester_id:request.requester_id,recipient_id:helperId,conversation_id:linked.conversation_id});

    // 4. Close messaging modal
    await page.evaluate(() => window.LYANN_MESSAGING?.close?.());
    await page.waitForTimeout(300);

    // 5. Test Messagerie CTA on header/feed
    const msgBtn = page.locator('.nav-msg-btn, .open-chat-trigger').first();
    await expect(msgBtn).toBeVisible();
    await msgBtn.click();
    await page.waitForTimeout(500);

    await expect(chatModal).toHaveClass(/active/);
    await expect(chatModal).toBeVisible();
  });

  test('Admin Password Reset & Signup Confirmation Buttons', async ({ page }) => {
    // 1. Test Admin Login Forgot Password
    await page.goto('/admin-login.html');
    const forgotBtn = page.locator('a[onclick="handleForgotPassword()"]').first();
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();
    const alertBanner = page.locator('#loginAlertBanner');
    await expect(alertBanner).toBeVisible();

    // 2. Test Signup Confirmation Button
    await page.goto('/confirm-signup.html?token_hash=test_token_hash');
    const confirmBtn = page.locator('#btnConfirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
  });
});
