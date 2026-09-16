const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Auth Modal Rapid Toggle & Mode Retention Regression', () => {

  test('Rapidly switching between Login and Signup modes maintains deterministic atomic state', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const loginModal = page.locator('#loginModal');
    const signupModal = page.locator('#onboardingModal');
    const switchToSignupBtn = page.locator('#switchToSignupBtn');
    const loginTrigger = page.locator('.open-login-trigger').first();
    const closeLoginBtn = page.locator('#closeLoginModalBtn');
    const closeSignupBtn = page.locator('#closeOnboardingBtn');

    // 1. Initial State: Modals are closed
    await expect(loginModal).not.toHaveClass(/active/);
    await expect(signupModal).not.toHaveClass(/active/);

    // 2. Open Login Modal
    await loginTrigger.click();
    await expect(loginModal).toHaveClass(/active/);
    await expect(signupModal).not.toHaveClass(/active/);
    await expect(page.locator('#loginForm')).toBeVisible();

    // 3. Perform Rapid Repeated Switching (5 Cycles)
    for (let i = 0; i < 5; i++) {
      // Switch to Signup
      await switchToSignupBtn.click();
      await expect(signupModal).toHaveClass(/active/);
      await expect(loginModal).not.toHaveClass(/active/);
      await expect(page.locator('#obStep2')).toBeVisible();

      // Switch back to Login
      await page.evaluate(() => {
        if (typeof window.setAuthModalMode === 'function') {
          window.setAuthModalMode('login');
        } else if (typeof window.openLoginModal === 'function') {
          window.openLoginModal();
        }
      });
      await expect(loginModal).toHaveClass(/active/);
      await expect(signupModal).not.toHaveClass(/active/);
      await expect(page.locator('#loginForm')).toBeVisible();
    }

    // 4. Test Close Modal
    await closeLoginBtn.click();
    await expect(loginModal).not.toHaveClass(/active/);
    await expect(signupModal).not.toHaveClass(/active/);

    // 5. Test Reopen Modal
    await loginTrigger.click();
    await expect(loginModal).toHaveClass(/active/);
    await expect(signupModal).not.toHaveClass(/active/);

    // Close again
    await closeLoginBtn.click();
    await expect(loginModal).not.toHaveClass(/active/);

    // Zero JS Errors
    expect(jsErrors).toEqual([]);
  });

});
