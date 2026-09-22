const { test, expect } = require('@playwright/test');

test('Aide LYANN is a canonical route from the hamburger menu', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('[data-lyann-route="support"]').first()).toBeAttached({ timeout: 15000 });
  const hasRoute = await page.evaluate(() => Boolean(window.LYANN_ROUTER?.has?.('support')));
  expect(hasRoute).toBe(true);
});
